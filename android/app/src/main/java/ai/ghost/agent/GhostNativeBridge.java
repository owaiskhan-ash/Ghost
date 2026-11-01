package ai.ghost.agent;

import android.Manifest;
import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
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

            PowerManager powerMgr = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
            boolean batteryUnrestricted = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && powerMgr != null) {
                batteryUnrestricted = powerMgr.isIgnoringBatteryOptimizations(activity.getPackageName());
            }
            obj.put("batteryUnrestricted", batteryUnrestricted);

            boolean overlayOk = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                overlayOk = Settings.canDrawOverlays(activity);
            }
            obj.put("overlayAllowed", overlayOk);

            KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
            boolean screenLockSecure = km != null && km.isDeviceSecure();
            obj.put("screenLockSecure", screenLockSecure);

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
        ComponentName service = new ComponentName(activity, GhostAccessibilityService.class);
        String expectedFull = service.flattenToString();
        String expectedShort = service.flattenToShortString();
        String enabled = Settings.Secure.getString(
                activity.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (enabled == null || enabled.trim().isEmpty()) return false;

        String[] components = enabled.split(":");
        for (String component : components) {
            String normalized = component.trim();
            if (normalized.equalsIgnoreCase(expectedFull)
                    || normalized.equalsIgnoreCase(expectedShort)) {
                return true;
            }
        }
        return false;
    }

    @JavascriptInterface
    public void pickPhoneContact() {
        activity.launchSystemContactPicker();
    }

    @JavascriptInterface
    public void requestBulkPhoneContacts() {
        activity.requestBulkContactsFromPhone();
    }

    @JavascriptInterface
    public String scheduleTask(String taskJson) {
        try {
            JSONObject task = new JSONObject(taskJson);
            GhostTaskStore.upsertTask(activity, task);
            activity.ensureLockedSendNotificationPermission();
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
    public String getNativeTasksJson() {
        return GhostTaskStore.getTasks(activity).toString();
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
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + activity.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void openBatteryOptimizationSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent direct = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                direct.setData(Uri.parse("package:" + activity.getPackageName()));
                direct.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(direct);
                return;
            } catch (Exception ignored) {
            }
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(fallback);
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void openOverlaySettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + activity.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void openSecurityLockSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public String getDeviceContactsJson() {
        if (activity.checkSelfPermission(Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            return "[]";
        }
        return activity.queryAllPhoneContactsJson().toString();
    }
}
