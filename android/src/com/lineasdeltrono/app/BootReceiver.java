package com.lineasdeltrono.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Vuelve a programar las alarmas tras reiniciar, cambiar la hora o actualizar la app. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        AlarmScheduler.rescheduleAll(ctx);
    }
}
