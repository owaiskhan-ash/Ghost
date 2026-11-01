package ai.ghost.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class GhostAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        final String taskId = intent.getStringExtra(GhostTaskScheduler.EXTRA_TASK_ID);
        if (taskId == null || taskId.isEmpty()) return;

        final Context appCtx = context.getApplicationContext();
        final PendingResult pendingResult = goAsync();

        try {
            JSONObject task = GhostTaskStore.getTaskById(appCtx, taskId);
            if (task == null || !task.optBoolean("enabled", true)) {
                pendingResult.finish();
                return;
            }

            // Acquire wake locks & launch WhatsApp even when Ghost MainActivity is closed
            GhostTaskScheduler.launchWhatsAppTaskNow(appCtx, task);

            if (GhostTaskScheduler.isRecurringTask(task)) {
                long nextTrigger = GhostTaskScheduler.scheduleAlarmForTask(appCtx, task);
                if (nextTrigger > 0L) {
                    task.put("triggerAtMillis", nextTrigger);
                    task.put("scheduledDate", GhostTaskScheduler.formatDateYmd(nextTrigger));
                }
                GhostTaskStore.upsertTaskAndSyncCache(appCtx, task);
            } else {
                task.put("enabled", false);
                GhostTaskStore.upsertTaskAndSyncCache(appCtx, task);
            }
        } catch (Throwable ignored) {
        } finally {
            try {
                pendingResult.finish();
            } catch (Throwable ignored) {
            }
        }
    }
}
