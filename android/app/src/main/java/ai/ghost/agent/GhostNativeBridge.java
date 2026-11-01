package ai.ghost.agent;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
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
    private final MainActivity activity;

    public GhostNativeBridge(MainActivity activity) {
        this.activity = activity;
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
            boolean wa = GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp")
                    || GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp.w4b");
            obj.put("whatsappInstalled", wa);
            return obj.toString();
        } catch (Exception e) {
            return "{}";
        }
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
            long triggerAt = GhostTaskScheduler.scheduleAlarmForTask(activity, task);
            JSONObject res = new JSONObject();
            res.put("ok", true);
            res.put("triggerAtMillis", triggerAt);
            return res.toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    @JavascriptInterface
    public void cancelTask(String taskId) {
        if (taskId == null) return;
        GhostTaskScheduler.cancelAlarmForTask(activity, taskId);
        GhostTaskStore.removeTask(activity, taskId);
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
