package ai.ghost.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class GhostKillSwitchReceiver extends BroadcastReceiver {
    public static final String ACTION_EMERGENCY_STOP = "ai.ghost.agent.ACTION_EMERGENCY_STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        JSONObject active = GhostTaskStore.getPendingActiveRun(context);
        GhostTaskStore.setPendingActiveRun(context, null);
        context.stopService(new Intent(context, GhostForegroundService.class));

        if (active != null) {
            GhostTaskStore.appendReceipt(
                    context,
                    active.optString("id", "manual"),
                    active.optString("contactName", "Unknown"),
                    "ABORTED_KILLSWITCH",
                    active.optString("messageBody", ""),
                    "Emergency Kill-Switch tapped via notification. Screen control yielded immediately."
            );
        }
    }
}
