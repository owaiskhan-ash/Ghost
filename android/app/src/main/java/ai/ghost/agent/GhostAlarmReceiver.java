package ai.ghost.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class GhostAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String taskId = intent.getStringExtra(GhostTaskScheduler.EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) return;

        JSONObject task = GhostTaskStore.getTaskById(context, taskId);
        if (task == null || !task.optBoolean("enabled", true)) {
            return;
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
        }
    }
}
