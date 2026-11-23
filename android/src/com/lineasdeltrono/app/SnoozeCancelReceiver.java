package com.lineasdeltrono.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Cancela una alarma pospuesta desde su notificación. */
public class SnoozeCancelReceiver extends BroadcastReceiver {
    static final int NOTIF_ID = 4243;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        AlarmScheduler.cancelSnooze(ctx);
        ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_ID);
    }
}
