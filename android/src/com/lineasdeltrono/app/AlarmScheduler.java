package com.lineasdeltrono.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;

/** Programa en AlarmManager la próxima vez que debe sonar cada alarma activa. */
final class AlarmScheduler {
    static final String ACTION_FIRE = "com.lineasdeltrono.app.FIRE";
    static final String EXTRA_ID = "id";
    static final String EXTRA_SNOOZE = "snooze";
    private static final String PREFS = "programadas";
    private static final int SNOOZE_CODE = 999_999_999;

    static long nextTrigger(int hour, int minute, int days, long now) {
        Calendar c = Calendar.getInstance();
        for (int d = 0; d < 8; d++) {
            c.setTimeInMillis(now);
            c.add(Calendar.DAY_OF_YEAR, d);
            c.set(Calendar.HOUR_OF_DAY, hour);
            c.set(Calendar.MINUTE, minute);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= now) continue;
            int idx = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7; // lunes = 0 … domingo = 6
            if (days == 0 || (days & (1 << idx)) != 0) return c.getTimeInMillis();
        }
        return -1;
    }

    static void rescheduleAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        android.content.SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // cancelar las programadas anteriormente
        for (String k : sp.getAll().keySet()) {
            try { am.cancel(firePending(ctx, Integer.parseInt(k), false)); } catch (Exception ignored) { }
        }
        android.content.SharedPreferences.Editor ed = sp.edit().clear();
        JSONArray a = AlarmStore.getAll(ctx);
        long now = System.currentTimeMillis();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || !o.optBoolean("on", true)) continue;
            int id = o.optInt("id");
            long t = nextTrigger(o.optInt("h"), o.optInt("m"), o.optInt("days"), now);
            if (t < 0) continue;
            setExact(ctx, am, t, firePending(ctx, id, false));
            ed.putLong(String.valueOf(id), t);
        }
        ed.apply();
    }

    static void snooze(Context ctx, int id, int minutes) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        long t = System.currentTimeMillis() + minutes * 60_000L;
        setExact(ctx, am, t, firePending(ctx, id, true));
    }

    static void cancelSnooze(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(firePending(ctx, 0, true));
    }

    static void testIn(Context ctx, int seconds) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_FIRE).putExtra(EXTRA_ID, -1);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, SNOOZE_CODE - 1, i, flags());
        setExact(ctx, am, System.currentTimeMillis() + seconds * 1000L, pi);
    }

    static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am.canScheduleExactAlarms();
    }

    private static void setExact(Context ctx, AlarmManager am, long t, PendingIntent pi) {
        try {
            if (canExact(ctx)) {
                Intent show = new Intent(ctx, MainActivity.class).putExtra("pagina", "alarma.html");
                PendingIntent showPi = PendingIntent.getActivity(ctx, 1, show, flags());
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(t, showPi), pi);
                return;
            }
        } catch (SecurityException ignored) { }
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        else am.set(AlarmManager.RTC_WAKEUP, t, pi);
    }

    private static PendingIntent firePending(Context ctx, int id, boolean snooze) {
        Intent i = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_FIRE)
                .putExtra(EXTRA_ID, id).putExtra(EXTRA_SNOOZE, snooze);
        int code = snooze ? SNOOZE_CODE : id;
        return PendingIntent.getBroadcast(ctx, code, i, flags());
    }

    static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }
}
