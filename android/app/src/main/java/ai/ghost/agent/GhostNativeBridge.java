package ai.ghost.agent;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

public class GhostNativeBridge {
    private static final String PHONE_CACHE_PREFS = "ghost_phone_cache_v1";
    private final MainActivity activity;

    public GhostNativeBridge(MainActivity activity) {
        this.activity = activity;
    }

    private SharedPreferences cachePrefs() {
        return activity.getSharedPreferences(PHONE_CACHE_PREFS, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void saveCacheValue(String key, String value) {
        if (key == null) return;
        if (value == null) {
            cachePrefs().edit().remove(key).apply();
        } else {
            cachePrefs().edit().putString(key, value).apply();
        }
    }

    @JavascriptInterface
    public String loadCacheValue(String key) {
        if (key == null) return "";
        String val = cachePrefs().getString(key, null);
        return val != null ? val : "";
    }

    @JavascriptInterface
    public void clearPhoneCache() {
        JSONArray existingTasks = GhostTaskStore.getTasks(activity);
        for (int i = 0; i < existingTasks.length(); i++) {
            JSONObject t = existingTasks.optJSONObject(i);
            if (t != null) {
                GhostTaskScheduler.cancelAlarmForTask(activity, t.optString("id", ""));
            }
        }
        GhostTaskScheduler.cancelScheduledCallbacks();
        GhostTaskStore.clearAllStoreData(activity);
        cachePrefs().edit().clear().apply();
    }

    @JavascriptInterface
    public String getDeviceStatusJson() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("isNativeApk", true);
            obj.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            obj.put("androidVersion", "Android " + Build.VERSION.RELEASE);
            obj.put("accessibilityEnabled", isAccessibilityServiceEnabled());

            AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            boolean alarmOk = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am != null) {
                alarmOk = am.canScheduleExactAlarms();
            }
            obj.put("exactAlarmAllowed", alarmOk);

            PackageManager pm = activity.getPackageManager();
            boolean waMain = GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp");
            boolean waBiz = GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp.w4b");
            obj.put("whatsappInstalled", waMain);
            obj.put("whatsappBusinessInstalled", waBiz);
            return obj.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void setDarkMode(boolean dark) {
        activity.setDarkModeFromJs(dark);
    }

    private boolean isAccessibilityServiceEnabled() {
        String expected = activity.getPackageName() + "/" + GhostAccessibilityService.class.getName();
        String enabled = Settings.Secure.getString(
                activity.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        return enabled != null && enabled.contains(expected);
    }

    @JavascriptInterface
    public void pickPhoneContact() {
        activity.launchSystemContactPicker();
    }

    @JavascriptInterface
    public String scheduleTask(String taskJson) {
        try {
            JSONObject task = new JSONObject(taskJson);
            GhostTaskStore.upsertTask(activity, task);
            if (task.optBoolean("enabled", true)) {
                long triggerAt = GhostTaskScheduler.scheduleAlarmForTask(activity, task);
                JSONObject res = new JSONObject();
                res.put("ok", true);
                res.put("triggerAtMillis", triggerAt);
                return res.toString();
            } else {
                GhostTaskScheduler.cancelAlarmForTask(activity, task.optString("id", ""));
                return "{\"ok\":true,\"paused\":true}";
            }
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    @JavascriptInterface
    public void pauseTask(String taskId) {
        if (taskId == null) return;
        GhostTaskScheduler.cancelAlarmForTask(activity, taskId);
        GhostTaskStore.pauseTask(activity, taskId);
    }

    @JavascriptInterface
    public void cancelTask(String taskId) {
        if (taskId == null) return;
        GhostTaskScheduler.cancelAlarmForTask(activity, taskId);
        GhostTaskStore.removeTask(activity, taskId);
    }

    @JavascriptInterface
    public String getNativeReceiptsJson() {
        return GhostTaskStore.getReceipts(activity).toString();
    }

    @JavascriptInterface
    public String executeTaskNow(String taskJson) {
        try {
            JSONObject task = new JSONObject(taskJson);
            GhostTaskScheduler.launchWhatsAppTaskNow(activity, task);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    @JavascriptInterface
    public void emergencyStop() {
        GhostTaskStore.clearAllActiveAndQueuedRuns(activity);
        GhostTaskScheduler.cancelScheduledCallbacks();
        activity.stopService(new Intent(activity, GhostForegroundService.class));
    }

    @JavascriptInterface
    public void openAccessibilitySettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
    }

    @JavascriptInterface
    public void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        }
    }

    @JavascriptInterface
    public String getDeviceContactsJson() {
        JSONArray arr = new JSONArray();
        if (activity.checkSelfPermission(Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            return arr.toString();
        }

        Cursor cursor = null;
        try {
            cursor = activity.getContentResolver().query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[]{
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER
                    },
                    null,
                    null,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < 100) {
                    String name = cursor.getString(0);
                    String num = cursor.getString(1);
                    if (name != null && num != null) {
                        JSONObject item = new JSONObject();
                        item.put("name", name);
                        item.put("phone", num.replaceAll("\\s+", ""));
                        arr.put(item);
                        count++;
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return arr.toString();
    }
}
