package com.lineasdeltrono.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.ref.WeakReference;

/** Pantalla que aparece cuando suena la alarma, también sobre la pantalla de bloqueo. */
public class RingActivity extends Activity {
    private static WeakReference<RingActivity> current = new WeakReference<>(null);

    static void closeIfOpen() {
        RingActivity a = current.get();
        if (a != null) a.runOnUiThread(a::finish);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (!AlarmService.ringing) { finish(); return; }
        float dp = getResources().getDisplayMetrics().density;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(0, 128, 128));
        int pad = (int) (20 * dp);
        root.setPadding(pad, pad, pad, pad);

        LinearLayout win = new LinearLayout(this);
        win.setOrientation(LinearLayout.VERTICAL);
        win.setBackground(bevel(Color.rgb(192, 192, 192), dp));
        win.setPadding((int) (3 * dp), (int) (3 * dp), (int) (3 * dp), (int) (16 * dp));

        TextView title = new TextView(this);
        title.setText("⏰ Alarma");
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding((int) (6 * dp), (int) (4 * dp), 0, (int) (4 * dp));
        GradientDrawable tb = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.rgb(0, 0, 128), Color.rgb(16, 132, 208)});
        title.setBackground(tb);
        win.addView(title);

        TextView time = new TextView(this);
        time.setText(AlarmService.currentTime);
        time.setTextSize(64);
        time.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        time.setTextColor(Color.RED);
        time.setBackgroundColor(Color.BLACK);
        time.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(-1, -2);
        tlp.setMargins((int) (16 * dp), (int) (16 * dp), (int) (16 * dp), (int) (8 * dp));
        win.addView(time, tlp);

        TextView label = new TextView(this);
        label.setText(AlarmService.currentLabel);
        label.setTextSize(20);
        label.setTextColor(Color.BLACK);
        label.setGravity(Gravity.CENTER);
        win.addView(label, new LinearLayout.LayoutParams(-1, -2));

        Button snooze = button("Posponer " + AlarmService.currentSnooze + " min", dp);
        snooze.setOnClickListener(v -> send(AlarmService.ACTION_SNOOZE));
        Button stop = button("Detener", dp);
        stop.setTypeface(Typeface.DEFAULT_BOLD);
        stop.setOnClickListener(v -> send(AlarmService.ACTION_STOP));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, (int) (64 * dp));
        blp.setMargins((int) (16 * dp), (int) (16 * dp), (int) (16 * dp), 0);
        win.addView(snooze, blp);
        win.addView(stop, blp);

        root.addView(win, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
    }

    private Button button(String text, float dp) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(20);
        b.setTextColor(Color.BLACK);
        b.setBackground(bevel(Color.rgb(192, 192, 192), dp));
        return b;
    }

    private static GradientDrawable bevel(int color, float dp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setStroke((int) (2 * dp), Color.rgb(64, 64, 64));
        return g;
    }

    private void send(String action) {
        startService(new Intent(this, AlarmService.class).setAction(action));
        finish();
    }

    @Override
    public void onBackPressed() {
        // no cerrar con Atrás: hay que elegir Posponer o Detener
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) current.clear();
        super.onDestroy();
    }
}
