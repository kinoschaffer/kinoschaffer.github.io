package com.lineasdeltrono.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.database.Cursor;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int REQ_TONO = 21;
    private static final int REQ_ARCHIVO = 22;
    private WebView web;
    private MediaPlayer preview;
    private int previewOldVol = -1;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopPreviewTask = new Runnable() { public void run() { stopPreviewNow(); } };

    private void stopPreviewNow() {
        handler.removeCallbacks(stopPreviewTask);
        if (preview != null) { try { preview.stop(); preview.release(); } catch (Exception ignored) { } preview = null; }
        AlarmService.restoreAlarmVolume(this, previewOldVol);
        previewOldVol = -1;
    }

    private void sendSound(String uri, String name) {
        final String js = "window.onSonidoElegido&&window.onSonidoElegido(" + JSONObject.quote(uri) + "," + JSONObject.quote(name) + ")";
        web.post(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null) return;
        if (req == REQ_TONO) {
            Uri u = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (u == null) return;
            String name = "Tono del teléfono";
            try { Ringtone r = RingtoneManager.getRingtone(this, u); if (r != null) name = r.getTitle(this); } catch (Exception ignored) { }
            sendSound(u.toString(), name);
        } else if (req == REQ_ARCHIVO) {
            Uri u = data.getData();
            if (u == null) return;
            try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
            String name = "Archivo de audio";
            try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) { }
            sendSound(u.toString(), name);
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(0, 0, 128));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0, 128, 128));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AlarmaNativa");
        setContentView(web);
        AlarmScheduler.rescheduleAll(this);
        if (state != null) web.restoreState(state);
        else load(getIntent());
    }

    private void load(Intent i) {
        String page = i != null ? i.getStringExtra("pagina") : null;
        web.loadUrl("file:///android_asset/" + ("alarma.html".equals(page) ? "alarma.html" : "index.html"));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getStringExtra("pagina") != null) load(intent);
    }

    /** Puente que usa alarma.html. */
    class Bridge {
        @JavascriptInterface
        public String getAlarms() { return AlarmStore.getJson(MainActivity.this); }

        @JavascriptInterface
        public void saveAlarms(String json) {
            AlarmStore.setJson(MainActivity.this, json);
            AlarmScheduler.rescheduleAll(MainActivity.this);
        }

        @JavascriptInterface
        public void test() { AlarmScheduler.testIn(MainActivity.this, 5); }

        /** kind: "tono" abre el selector de tonos del sistema, "archivo" abre los archivos del teléfono. */
        @JavascriptInterface
        public void pickSound(final String kind, final String current) {
            runOnUiThread(new Runnable() { public void run() {
                stopPreviewNow();
                try {
                    if ("archivo".equals(kind)) {
                        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                .setType("audio/*")
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        startActivityForResult(i, REQ_ARCHIVO);
                    } else {
                        Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALL)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Sonido de la alarma")
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,
                                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
                        if (current != null && current.startsWith("content:"))
                            i.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(current));
                        startActivityForResult(i, REQ_TONO);
                    }
                } catch (Exception ignored) { }
            }});
        }

        @JavascriptInterface
        public void preview(final String sound, final int vol) {
            runOnUiThread(new Runnable() { public void run() {
                stopPreviewNow();
                previewOldVol = AlarmService.applyAlarmVolume(MainActivity.this, vol);
                preview = AlarmService.createPlayer(MainActivity.this, sound, true);
                if (preview != null) preview.start();
                handler.postDelayed(stopPreviewTask, 6000);
            }});
        }

        @JavascriptInterface
        public void stopPreview() {
            runOnUiThread(new Runnable() { public void run() { stopPreviewNow(); } });
        }

        @JavascriptInterface
        public String rawSound(String name) { return AlarmService.rawUri(MainActivity.this, name).toString(); }

        @JavascriptInterface
        public void requestPermissions() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                    != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(new Runnable() { public void run() {
                    MainActivity.this.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
                }});
            }
        }

        @JavascriptInterface
        public String status() {
            JSONObject o = new JSONObject();
            Context c = MainActivity.this;
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                if (Build.VERSION.SDK_INT >= 24) o.put("notif", nm.areNotificationsEnabled());
                o.put("exact", AlarmScheduler.canExact(c));
                if (Build.VERSION.SDK_INT >= 34) o.put("fullscreen", nm.canUseFullScreenIntent());
                if (Build.VERSION.SDK_INT >= 23) {
                    PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                    o.put("battery", pm.isIgnoringBatteryOptimizations(getPackageName()));
                }
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public void fix(final String what) {
            runOnUiThread(new Runnable() { public void run() {
                Uri pkg = Uri.parse("package:" + getPackageName());
                Intent i;
                if ("exact".equals(what)) {
                    i = new Intent(Build.VERSION.SDK_INT >= 31
                            ? Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM : Settings.ACTION_SETTINGS, pkg);
                } else if ("fullscreen".equals(what)) {
                    i = new Intent(Build.VERSION.SDK_INT >= 34
                            ? Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT : Settings.ACTION_SETTINGS, pkg);
                } else if ("battery".equals(what)) {
                    i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg);
                } else if (Build.VERSION.SDK_INT >= 26) {
                    i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                } else {
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
                }
                try { startActivity(i); }
                catch (Exception e) { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); }
            }});
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { super.onPause(); stopPreviewNow(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
