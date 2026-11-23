package com.lineasdeltrono.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
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
    private WebView web;

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
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
