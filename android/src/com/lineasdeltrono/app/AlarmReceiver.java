package com.lineasdeltrono.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Recibe el disparo de AlarmManager y arranca el servicio que hace sonar la alarma. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!AlarmScheduler.ACTION_FIRE.equals(intent.getAction())) return;
        int id = intent.getIntExtra(AlarmScheduler.EXTRA_ID, 0);
        if (!intent.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZE, false) && id != -1) {
            AlarmStore.disableOnce(ctx, id);
        }
        AlarmScheduler.rescheduleAll(ctx);
        Intent s = new Intent(ctx, AlarmService.class).setAction(AlarmService.ACTION_RING)
                .putExtra(AlarmScheduler.EXTRA_ID, id);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s);
        else ctx.startService(s);
    }
}
