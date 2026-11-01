package ai.ghost.agent;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

public final class GhostTaskScheduler {
    public static final String EXTRA_TASK_ID = "extra_task_id";

    private GhostTaskScheduler() {}

    public static long computeNextTriggerMillis(JSONObject task) {
        String time24 = task.optString("scheduledTime24", "05:00");
        String dateStr = task.optString("scheduledDate", "");
        String repeatMode = task.optString("repeatMode", "once");

        int hour = 5;
        int minute = 0;
        String[] tParts = time24.split(":");
        if (tParts.length == 2) {
            try {
                hour = Integer.parseInt(tParts[0]);
                minute = Integer.parseInt(tParts[1]);
            } catch (NumberFormatException ignored) {
            }
        }

        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        if (!"daily".equalsIgnoreCase(repeatMode) && dateStr != null && dateStr.contains("-")) {
            String[] dParts = dateStr.split("-");
            if (dParts.length == 3) {
                try {
                    int yyyy = Integer.parseInt(dParts[0]);
                    int mm = Integer.parseInt(dParts[1]) - 1;
                    int dd = Integer.parseInt(dParts[2]);
                    cal.set(yyyy, mm, dd, hour, minute, 0);
                } catch (NumberFormatException ignored) {
                    cal.set(Calendar.HOUR_OF_DAY, hour);
                    cal.set(Calendar.MINUTE, minute);
                }
            }
        } else {
            cal.set(Calendar.HOUR_OF_DAY, hour);
            cal.set(Calendar.MINUTE, minute);
        }

        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        return cal.getTimeInMillis();
    }

    public static long scheduleAlarmForTask(Context ctx, JSONObject task) {
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return -1L;

        String taskId = task.optString("id", "default");
        long triggerAt = computeNextTriggerMillis(task);

        Intent alarmIntent = new Intent(ctx, GhostAlarmReceiver.class);
        alarmIntent.putExtra(EXTRA_TASK_ID, taskId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, taskId.hashCode(), alarmIntent, flags);

        Intent showIntent = new Intent(ctx, MainActivity.class);
        PendingIntent showPi = PendingIntent.getActivity(ctx, 0, showIntent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAt, showPi);
            alarmManager.setAlarmClock(clockInfo, pi);
        }
        return triggerAt;
    }

    public static void cancelAlarmForTask(Context ctx, String taskId) {
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        Intent alarmIntent = new Intent(ctx, GhostAlarmReceiver.class);
        int flags = PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, taskId.hashCode(), alarmIntent, flags);
        if (pi != null) {
            alarmManager.cancel(pi);
            pi.cancel();
        }
    }

    public static void rescheduleAllEnabledTasks(Context ctx) {
        JSONArray tasks = GhostTaskStore.getTasks(ctx);
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t != null && t.optBoolean("enabled", true)) {
                scheduleAlarmForTask(ctx, t);
            }
        }
    }

    public static void launchWhatsAppTaskNow(Context ctx, JSONObject task) {
        try {
            task.put("_activatedAtMs", System.currentTimeMillis());
        } catch (Exception ignored) {
        }
        GhostTaskStore.setPendingActiveRun(ctx, task);

        Intent fg = new Intent(ctx, GhostForegroundService.class);
        fg.putExtra("contactName", task.optString("contactName", "Contact"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(fg);
        } else {
            ctx.startService(fg);
        }

        String rawPhone = task.optString("contactPhone", "").replaceAll("[^0-9]", "");
        String msg = task.optString("messageBody", "");
        String preferredPkg = task.optString("whatsappPackage", "com.whatsapp");
        String url = "https://api.whatsapp.com/send?phone=" + rawPhone + "&text=" + Uri.encode(msg);

        Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PackageManager pm = ctx.getPackageManager();
        if (isPackageInstalled(pm, preferredPkg)) {
            waIntent.setPackage(preferredPkg);
        } else if (isPackageInstalled(pm, "com.whatsapp")) {
            waIntent.setPackage("com.whatsapp");
        } else if (isPackageInstalled(pm, "com.whatsapp.w4b")) {
            waIntent.setPackage("com.whatsapp.w4b");
        }

        try {
            GhostAccessibilityService svc = GhostAccessibilityService.getActiveInstance();
            if (svc != null) {
                svc.startActivity(waIntent);
            } else {
                ctx.startActivity(waIntent);
            }
        } catch (Exception e) {
            GhostTaskStore.setPendingActiveRun(ctx, null);
        }
    }

    public static boolean isPackageInstalled(PackageManager pm, String pkg) {
        try {
            pm.getPackageInfo(pkg, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
