package com.lineasdeltrono.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.Locale;

/** Servicio en primer plano: suena, vibra y muestra la notificación con Posponer / Detener. */
public class AlarmService extends Service {
    static final String ACTION_RING = "com.lineasdeltrono.app.RING";
    static final String ACTION_STOP = "com.lineasdeltrono.app.STOP";
    static final String ACTION_SNOOZE = "com.lineasdeltrono.app.SNOOZE";
    static final String CHANNEL = "alarma_sonando";
    static final int NOTIF_ID = 4242;
    private static final long MAX_RING_MS = 10 * 60_000L;

    static volatile boolean ringing = false;
    static volatile String currentLabel = "Alarma";
    static volatile String currentTime = "";
    static volatile int currentSnooze = 10;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private int currentId;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable autoStop = () -> stopRinging(true);

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_SNOOZE.equals(action)) {
            AlarmScheduler.snooze(this, currentId, currentSnooze);
            showSnoozedNotice();
            stopRinging(false);
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action) || action == null) {
            stopRinging(true);
            return START_NOT_STICKY;
        }
        // ACTION_RING
        currentId = intent.getIntExtra(AlarmScheduler.EXTRA_ID, 0);
        JSONObject a = AlarmStore.find(this, currentId);
        String label = a != null ? a.optString("label", "") : "";
        currentLabel = label.isEmpty() ? (currentId == -1 ? "Prueba de alarma" : "Alarma") : label;
        currentSnooze = a != null ? a.optInt("snooze", 10) : 5;
        boolean vib = a == null || a.optBoolean("vib", true);
        Calendar c = Calendar.getInstance();
        currentTime = String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));

        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(SnoozeCancelReceiver.NOTIF_ID);
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        if (!ringing) {
            ringing = true;
            acquireWakeLock();
            startSound();
            if (vib) startVibration();
        }
        handler.removeCallbacks(autoStop);
        handler.postDelayed(autoStop, MAX_RING_MS);
        // abrir la pantalla de alarma si es posible (en pantalla bloqueada lo hace el full-screen intent)
        try {
            startActivity(new Intent(this, RingActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
        return START_NOT_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarma sonando", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Avisa cuando suena una alarma");
            ch.setSound(null, null); // el sonido lo reproduce el servicio
            ch.enableVibration(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        }
        PendingIntent full = PendingIntent.getActivity(this, 10,
                new Intent(this, RingActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), AlarmScheduler.flags());
        PendingIntent stop = PendingIntent.getService(this, 11,
                new Intent(this, AlarmService.class).setAction(ACTION_STOP), AlarmScheduler.flags());
        PendingIntent snooze = PendingIntent.getService(this, 12,
                new Intent(this, AlarmService.class).setAction(ACTION_SNOOZE), AlarmScheduler.flags());

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("⏰ " + currentTime + "  " + currentLabel)
                .setContentText("Toca para abrir · Posponer " + currentSnooze + " min")
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .setDeleteIntent(stop)
                .addAction(new Notification.Action.Builder(0, "Posponer " + currentSnooze + " min", snooze).build())
                .addAction(new Notification.Action.Builder(0, "Detener", stop).build());
        return b.build();
    }

    private void showSnoozedNotice() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        String ch = "alarma_info";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(ch, "Avisos de alarma", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(c);
        }
        Calendar c = Calendar.getInstance();
        c.add(Calendar.MINUTE, currentSnooze);
        String t = String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        PendingIntent cancel = PendingIntent.getBroadcast(this, 13,
                new Intent(this, SnoozeCancelReceiver.class), AlarmScheduler.flags());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ch) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Alarma pospuesta")
                .setContentText(currentLabel + " volverá a sonar a las " + t)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(0, "Cancelar", cancel).build());
        nm.notify(SnoozeCancelReceiver.NOTIF_ID, b.build());
    }

    private void startSound() {
        Uri uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            player = null;
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null) return;
        long[] pattern = {0, 800, 600};
        if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "trono:alarma");
        wakeLock.acquire(MAX_RING_MS + 5000);
    }

    private void stopRinging(boolean clearSnoozeNotice) {
        handler.removeCallbacks(autoStop);
        ringing = false;
        if (player != null) { try { player.stop(); player.release(); } catch (Exception ignored) { } player = null; }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        RingActivity.closeIfOpen();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (ringing) stopRinging(false);
        super.onDestroy();
    }
}
