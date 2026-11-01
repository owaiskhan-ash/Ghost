package ai.ghost.agent;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class GhostTaskStore {
    private static final String PREFS_NAME = "ghost_agent_store_v1";
    private static final String KEY_TASKS = "scheduled_tasks";
    private static final String KEY_RECEIPTS = "morning_receipts";
    private static final String KEY_PENDING_RUN = "pending_active_run";

    private GhostTaskStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized JSONArray getTasks(Context ctx) {
        String raw = prefs(ctx).getString(KEY_TASKS, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static synchronized void upsertTask(Context ctx, JSONObject task) {
        String id = task.optString("id", "");
        if (id.isEmpty()) return;

        JSONArray current = getTasks(ctx);
        JSONArray updated = new JSONArray();
        boolean replaced = false;

        for (int i = 0; i < current.length(); i++) {
            JSONObject existing = current.optJSONObject(i);
            if (existing != null && id.equals(existing.optString("id"))) {
                updated.put(task);
                replaced = true;
            } else if (existing != null) {
                updated.put(existing);
            }
        }
        if (!replaced) {
            JSONArray headFirst = new JSONArray();
            headFirst.put(task);
            for (int i = 0; i < updated.length(); i++) {
                headFirst.put(updated.opt(i));
            }
            updated = headFirst;
        }
        prefs(ctx).edit().putString(KEY_TASKS, updated.toString()).apply();
    }

    public static synchronized JSONObject getTaskById(Context ctx, String taskId) {
        JSONArray arr = getTasks(ctx);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject obj = arr.optJSONObject(i);
            if (obj != null && taskId.equals(obj.optString("id"))) {
                return obj;
            }
        }
        return null;
    }

    public static synchronized void removeTask(Context ctx, String taskId) {
        JSONArray arr = getTasks(ctx);
        JSONArray updated = new JSONArray();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject obj = arr.optJSONObject(i);
            if (obj != null && !taskId.equals(obj.optString("id"))) {
                updated.put(obj);
            }
        }
        prefs(ctx).edit().putString(KEY_TASKS, updated.toString()).apply();
    }

    public static synchronized void setPendingActiveRun(Context ctx, JSONObject task) {
        if (task == null) {
            prefs(ctx).edit().remove(KEY_PENDING_RUN).apply();
        } else {
            prefs(ctx).edit().putString(KEY_PENDING_RUN, task.toString()).apply();
        }
    }

    public static synchronized JSONObject getPendingActiveRun(Context ctx) {
        String raw = prefs(ctx).getString(KEY_PENDING_RUN, null);
        if (raw == null || raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public static synchronized void appendReceipt(
            Context ctx,
            String taskId,
            String contactName,
            String outcome,
            String messageText,
            String detail
    ) {
        try {
            JSONObject rcpt = new JSONObject();
            rcpt.put("id", "rcpt-" + System.currentTimeMillis());
            rcpt.put("taskId", taskId);
            rcpt.put("contactName", contactName);
            rcpt.put("targetApp", "WhatsApp");
            rcpt.put("executedAt", String.valueOf(System.currentTimeMillis()));
            rcpt.put("outcome", outcome);
            rcpt.put("messageText", messageText);
            rcpt.put("reasonDetail", detail);

            JSONArray existing = getReceipts(ctx);
            JSONArray next = new JSONArray();
            next.put(rcpt);
            for (int i = 0; i < Math.min(existing.length(), 49); i++) {
                next.put(existing.opt(i));
            }
            prefs(ctx).edit().putString(KEY_RECEIPTS, next.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    public static synchronized JSONArray getReceipts(Context ctx) {
        String raw = prefs(ctx).getString(KEY_RECEIPTS, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
