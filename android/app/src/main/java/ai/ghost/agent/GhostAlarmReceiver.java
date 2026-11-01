package ai.ghost.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import org.json.JSONObject;

public class GhostAlarmReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String taskId = intent.getStringExtra(GhostTaskScheduler.EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) return;

        JSONObject task = GhostTaskStore.getTaskById(context, taskId);
        if (task == null || !task.optBoolean("enabled", true)) {
            return;
        }

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "ghost:ScheduledSendWakeLock"
            );
            wakeLock.acquire(20_000L);
        }

        try {
            GhostTaskScheduler.launchWhatsAppTaskNow(context, task);

            String repeatMode = task.optString("repeatMode", "once");
            if ("daily".equalsIgnoreCase(repeatMode)) {
                GhostTaskScheduler.scheduleAlarmForTask(context, task);
            } else {
                task.put("enabled", false);
                GhostTaskStore.upsertTask(context, task);
            }
        } catch (Exception ignored) {
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }
}
