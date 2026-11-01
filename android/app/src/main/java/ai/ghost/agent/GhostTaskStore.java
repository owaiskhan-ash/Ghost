package ai.ghost.agent;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GhostTaskStore {
    private static final String PREFS_NAME = "ghost_agent_store_v1";
    private static final String PHONE_CACHE_PREFS = "ghost_phone_cache_v1";
    private static final String PHONE_CACHE_TASKS_KEY = "ghost_cache_v5_tasks";

    private static final String KEY_TASKS = "scheduled_tasks";
    private static final String KEY_RECEIPTS = "morning_receipts";
    private static final String KEY_PENDING_RUN = "pending_active_run";
    private static final String KEY_RUN_QUEUE = "pending_run_queue";

    private static final Pattern TOKEN_NAME = Pattern.compile("\\{\\s*name\\s*\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOKEN_FIRST_NAME = Pattern.compile("\\{\\s*first_name\\s*\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOKEN_DATE = Pattern.compile("\\{\\s*date\\s*\\}", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOKEN_DAY = Pattern.compile("\\{\\s*day\\s*\\}", Pattern.CASE_INSENSITIVE);

    private GhostTaskStore() {}

    private static Context safeStorageContext(Context ctx) {
        Context app = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.os.UserManager um = (android.os.UserManager) app.getSystemService(Context.USER_SERVICE);
            if (um != null && !um.isUserUnlocked()) {
                return app.createDeviceProtectedStorageContext();
            }
        }
        return app;
    }

    private static SharedPreferences prefs(Context ctx) {
        return safeStorageContext(ctx).getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
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

    /**
     * Updates both the native alarm store AND the WebView phone cache so background
     * execution when Ghost is closed stays 100% reflected next time Ghost opens.
     */
    public static synchronized void upsertTaskAndSyncCache(Context ctx, JSONObject task) {
        upsertTask(ctx, task);
        try {
            SharedPreferences cache = safeStorageContext(ctx)
                    .getSharedPreferences(PHONE_CACHE_PREFS, Context.MODE_PRIVATE);
            String rawCache = cache.getString(PHONE_CACHE_TASKS_KEY, null);
            if (rawCache != null && !rawCache.isEmpty()) {
                String id = task.optString("id", "");
                JSONArray cachedArr = new JSONArray(rawCache);
                for (int i = 0; i < cachedArr.length(); i++) {
                    JSONObject item = cachedArr.optJSONObject(i);
                    if (item != null && id.equals(item.optString("id"))) {
                        item.put("enabled", task.optBoolean("enabled", true));
                        if (task.has("triggerAtMillis")) {
                            item.put("triggerAtMillis", task.optLong("triggerAtMillis"));
                        }
                        if (task.has("scheduledDate")) {
                            item.put("scheduledDate", task.optString("scheduledDate"));
                        }
                    }
                }
                cache.edit().putString(PHONE_CACHE_TASKS_KEY, cachedArr.toString()).apply();
            }
        } catch (Throwable ignored) {
        }
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

    public static synchronized void pauseTask(Context ctx, String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        JSONArray arr = getTasks(ctx);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject obj = arr.optJSONObject(i);
            if (obj != null && taskId.equals(obj.optString("id"))) {
                try {
                    obj.put("enabled", false);
                } catch (JSONException ignored) {
                }
            }
        }
        prefs(ctx).edit().putString(KEY_TASKS, arr.toString()).apply();
    }

    public static synchronized void clearAllStoreData(Context ctx) {
        prefs(ctx).edit().clear().apply();
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

    /**
     * Resolves {name}, {date}, and {day} dynamically at execution time (even when
     * Ghost app is closed for days/weeks on a recurring schedule).
     */
    public static String resolveDynamicVariables(String template, String contactName) {
        if (template == null || template.isEmpty()) return "";
        String safeName = (contactName == null || contactName.trim().isEmpty())
                ? "Friend"
                : contactName.trim();
        String firstName = safeName.split("\\s+")[0];

        Date now = new Date();
        String formattedDate = new SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(now);
        String formattedDay = new SimpleDateFormat("EEEE", Locale.getDefault()).format(now);

        String out = TOKEN_NAME.matcher(template).replaceAll(Matcher.quoteReplacement(safeName));
        out = TOKEN_FIRST_NAME.matcher(out).replaceAll(Matcher.quoteReplacement(firstName));
        out = TOKEN_DATE.matcher(out).replaceAll(Matcher.quoteReplacement(formattedDate));
        out = TOKEN_DAY.matcher(out).replaceAll(Matcher.quoteReplacement(formattedDay));
        return out;
    }

    public static JSONArray expandTaskIntoSteps(JSONObject task) {
        JSONArray steps = new JSONArray();
        if (task == null) return steps;

        String taskId = task.optString("id", "task");
        String pkg = task.optString("whatsappPackage", "com.whatsapp");
        String fallbackMsg = task.optString("messageBody", "");
        JSONArray recipients = task.optJSONArray("recipients");

        try {
            if (recipients != null && recipients.length() > 0) {
                int total = recipients.length();
                for (int i = 0; i < total; i++) {
                    JSONObject r = recipients.optJSONObject(i);
                    if (r == null) continue;
                    String phone = r.optString("contactPhone", "");
                    if (phone.isEmpty()) continue;

                    String cName = r.optString("contactName", "Contact");
                    String rawMsg = r.optString("messageBody", fallbackMsg);

                    JSONObject step = new JSONObject();
                    step.put("id", taskId);
                    step.put("contactName", cName);
                    step.put("contactPhone", phone);
                    step.put("messageBody", resolveDynamicVariables(rawMsg, cName));
                    step.put("whatsappPackage", pkg);
                    step.put("_stepIndex", i + 1);
                    step.put("_stepTotal", total);
                    steps.put(step);
                }
            } else {
                String rawName = task.optString("contactName", "Contact");
                // Strip optional "GroupName (Person)" wrapper for {name} substitution
                String cleanPersonName = rawName;
                int openIdx = rawName.lastIndexOf('(');
                int closeIdx = rawName.lastIndexOf(')');
                if (openIdx >= 0 && closeIdx > openIdx + 1) {
                    cleanPersonName = rawName.substring(openIdx + 1, closeIdx).trim();
                }

                JSONObject step = new JSONObject();
                step.put("id", taskId);
                step.put("contactName", rawName);
                step.put("contactPhone", task.optString("contactPhone", ""));
                step.put("messageBody", resolveDynamicVariables(fallbackMsg, cleanPersonName));
                step.put("whatsappPackage", pkg);
                step.put("_stepIndex", 1);
                step.put("_stepTotal", 1);
                steps.put(step);
            }
        } catch (JSONException ignored) {
        }
        return steps;
    }

    public static synchronized JSONArray getRunQueue(Context ctx) {
        String raw = prefs(ctx).getString(KEY_RUN_QUEUE, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static synchronized void enqueueRunSteps(Context ctx, JSONArray newSteps) {
        if (newSteps == null || newSteps.length() == 0) return;
        JSONArray current = getRunQueue(ctx);
        for (int i = 0; i < newSteps.length(); i++) {
            JSONObject step = newSteps.optJSONObject(i);
            if (step != null) {
                current.put(step);
            }
        }
        prefs(ctx).edit().putString(KEY_RUN_QUEUE, current.toString()).apply();
    }

    public static synchronized JSONObject popNextRunStep(Context ctx) {
        JSONArray current = getRunQueue(ctx);
        if (current.length() == 0) return null;

        JSONObject head = current.optJSONObject(0);
        JSONArray rest = new JSONArray();
        for (int i = 1; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null) {
                rest.put(item);
            }
        }
        prefs(ctx).edit().putString(KEY_RUN_QUEUE, rest.toString()).apply();
        return head;
    }

    public static synchronized int getRemainingQueueCount(Context ctx) {
        return getRunQueue(ctx).length();
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

    public static synchronized void clearAllActiveAndQueuedRuns(Context ctx) {
        prefs(ctx).edit()
                .remove(KEY_PENDING_RUN)
                .remove(KEY_RUN_QUEUE)
                .apply();
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
