package ai.ghost.agent;

import android.Manifest;
import android.app.AlarmManager;
import android.app.KeyguardManager;
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
    private final Context context;

    public GhostNativeBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String getDeviceStatusJson() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("isNativeApk", true);
            obj.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            obj.put("androidVersion", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            obj.put("accessibilityEnabled", isAccessibilityServiceEnabled());

            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            boolean alarmOk = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am != null) {
                alarmOk = am.canScheduleExactAlarms();
            }
            obj.put("exactAlarmAllowed", alarmOk);
            obj.put("overlayAllowed", Settings.canDrawOverlays(context));

            KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            obj.put("devicePinLocked", km != null && km.isDeviceSecure());

            PackageManager pm = context.getPackageManager();
            boolean wa = GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp")
                    || GhostTaskScheduler.isPackageInstalled(pm, "com.whatsapp.w4b");
            obj.put("whatsappInstalled", wa);
            return obj.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private boolean isAccessibilityServiceEnabled() {
        String expected = context.getPackageName() + "/" + GhostAccessibilityService.class.getName();
        String enabled = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        return enabled != null && enabled.contains(expected);
    }

    @JavascriptInterface
    public String scheduleTask(String taskJson) {
        try {
            JSONObject task = new JSONObject(taskJson);
            GhostTaskStore.upsertTask(context, task);
            long triggerAt = GhostTaskScheduler.scheduleAlarmForTask(context, task);
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
        GhostTaskScheduler.cancelAlarmForTask(context, taskId);
        GhostTaskStore.removeTask(context, taskId);
    }

    @JavascriptInterface
    public String executeTaskNow(String taskJson) {
        try {
            JSONObject task = new JSONObject(taskJson);
            GhostTaskScheduler.launchWhatsAppTaskNow(context, task);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    @JavascriptInterface
    public void emergencyStop() {
        GhostTaskStore.setPendingActiveRun(context, null);
        context.stopService(new Intent(context, GhostForegroundService.class));
    }

    @JavascriptInterface
    public void openAccessibilitySettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }

    @JavascriptInterface
    public void openOverlaySettings() {
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + context.getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public void startSkillRecording(String skillName) {
        GhostAccessibilityService.startRecordingSkill();
    }

    @JavascriptInterface
    public String stopSkillRecording() {
        return GhostAccessibilityService.stopRecordingSkill();
    }

    @JavascriptInterface
    public String getDeviceContactsJson() {
        JSONArray arr = new JSONArray();
        if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            return arr.toString();
        }

        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
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
