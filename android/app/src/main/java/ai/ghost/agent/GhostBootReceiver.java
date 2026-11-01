package ai.ghost.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class GhostBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) return;
        try {
            GhostTaskScheduler.rescheduleAllEnabledTasks(context.getApplicationContext());
        } catch (Throwable ignored) {
        }
    }
}
