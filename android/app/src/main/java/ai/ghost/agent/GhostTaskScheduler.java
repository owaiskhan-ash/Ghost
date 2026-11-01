package ai.ghost.agent;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

public final class GhostTaskScheduler {
    public static final String EXTRA_TASK_ID = "extra_task_id";
    public static final String PKG_WHATSAPP = "com.whatsapp";
    public static final String PKG_WHATSAPP_BUSINESS = "com.whatsapp.w4b";
    private static final long CHAT_SETTLE_DELAY_MS = 1450L;

    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static PowerManager.WakeLock batchWakeLock;

    private GhostTaskScheduler() {}

    public static String normalizeTargetPackage(String rawPkg) {
        if (PKG_WHATSAPP_BUSINESS.equals(rawPkg)) {
            return PKG_WHATSAPP_BUSINESS;
        }
        return PKG_WHATSAPP;
    }

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

    @SuppressWarnings("deprecation")
    public static synchronized void acquireBatchWakeLock(Context ctx, long durationMs) {
        try {
            releaseBatchWakeLock();
            PowerManager pm = (PowerManager) ctx.getApplicationContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                batchWakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "ghost:MultiSendWakeLock"
                );
                batchWakeLock.acquire(Math.max(durationMs, 30_000L));
            }
        } catch (Exception ignored) {
        }
    }

    public static synchronized void releaseBatchWakeLock() {
        try {
            if (batchWakeLock != null && batchWakeLock.isHeld()) {
                batchWakeLock.release();
            }
        } catch (Exception ignored) {
        }
        batchWakeLock = null;
    }

    public static void cancelScheduledCallbacks() {
        MAIN_HANDLER.removeCallbacksAndMessages(null);
        releaseBatchWakeLock();
    }

    public static void launchWhatsAppTaskNow(Context ctx, JSONObject task) {
        final Context appCtx = ctx.getApplicationContext();
        JSONArray steps = GhostTaskStore.expandTaskIntoSteps(task);
        if (steps.length() == 0) return;

        GhostTaskStore.enqueueRunSteps(appCtx, steps);
        int totalPending = GhostTaskStore.getRemainingQueueCount(appCtx) + 1;
        acquireBatchWakeLock(appCtx, totalPending * 15_000L + 15_000L);

        if (GhostTaskStore.getPendingActiveRun(appCtx) == null) {
            launchNextQueuedStep(appCtx);
        }
    }

    public static void scheduleNextQueuedStepAfterDelay(final Context ctx, long delayMs) {
        final Context appCtx = ctx.getApplicationContext();
        MAIN_HANDLER.postDelayed(new Runnable() {
            @Override
            public void run() {
                launchNextQueuedStep(appCtx);
            }
        }, delayMs);
    }

    public static void launchNextQueuedStep(Context ctx) {
        final Context appCtx = ctx.getApplicationContext();
        if (GhostTaskStore.getPendingActiveRun(appCtx) != null) {
            return;
        }

        JSONObject step = GhostTaskStore.popNextRunStep(appCtx);
        if (step == null) {
            appCtx.stopService(new Intent(appCtx, GhostForegroundService.class));
            releaseBatchWakeLock();
            return;
        }

        String rawPhone = step.optString("contactPhone", "").replaceAll("[^0-9]", "");
        String msg = step.optString("messageBody", "");
        final String targetPkg = normalizeTargetPackage(
                step.optString("whatsappPackage", PKG_WHATSAPP)
        );
        final String appDisplayName = PKG_WHATSAPP_BUSINESS.equals(targetPkg)
                ? "WhatsApp Business"
                : "WhatsApp";

        PackageManager pm = appCtx.getPackageManager();
        // Strictly open ONLY the app selected by the user (WhatsApp -> com.whatsapp, WA Business -> com.whatsapp.w4b)
        if (!isPackageInstalled(pm, targetPkg)) {
            MAIN_HANDLER.post(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(
                            appCtx,
                            appDisplayName + " is not installed on this device",
                            Toast.LENGTH_LONG
                    ).show();
                }
            });
            GhostTaskStore.appendReceipt(
                    appCtx,
                    step.optString("id", "task"),
                    step.optString("contactName", "Contact"),
                    "APP_NOT_INSTALLED",
                    msg,
                    appDisplayName + " (" + targetPkg + ") is not installed"
            );
            scheduleNextQueuedStepAfterDelay(appCtx, 600L);
            return;
        }

        long now = System.currentTimeMillis();
        try {
            step.put("whatsappPackage", targetPkg);
            step.put("_activatedAtMs", now);
            step.put("_readyAfterMs", now + CHAT_SETTLE_DELAY_MS);
        } catch (Exception ignored) {
        }
        GhostTaskStore.setPendingActiveRun(appCtx, step);

        int remainingAfterThis = GhostTaskStore.getRemainingQueueCount(appCtx);
        String contactLabel = step.optString("contactName", "Contact");
        int stepIdx = step.optInt("_stepIndex", 1);
        int stepTotal = step.optInt("_stepTotal", 1);
        if (stepTotal > 1) {
            contactLabel = contactLabel + " (" + stepIdx + "/" + stepTotal + ")";
        } else if (remainingAfterThis > 0) {
            contactLabel = contactLabel + " (+" + remainingAfterThis + " queued)";
        }

        Intent fg = new Intent(appCtx, GhostForegroundService.class);
        fg.putExtra("contactName", contactLabel + " · " + appDisplayName);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appCtx.startForegroundService(fg);
        } else {
            appCtx.startService(fg);
        }

        // Use native whatsapp:// scheme explicitly bound to targetPkg so Android App Links
        // can never redirect WA Business -> WhatsApp or vice versa
        String schemeUrl = "whatsapp://send?phone=" + rawPhone + "&text=" + Uri.encode(msg);
        Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(schemeUrl));
        waIntent.setPackage(targetPkg);
        waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        if (waIntent.resolveActivity(pm) == null) {
            String httpsUrl = "https://api.whatsapp.com/send?phone=" + rawPhone + "&text=" + Uri.encode(msg);
            waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(httpsUrl));
            waIntent.setPackage(targetPkg);
            waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }

        try {
            GhostAccessibilityService svc = GhostAccessibilityService.getActiveInstance();
            if (svc != null) {
                svc.startActivity(waIntent);
                svc.scheduleWatchdogTick(CHAT_SETTLE_DELAY_MS + 100L);
            } else {
                appCtx.startActivity(waIntent);
            }
        } catch (Exception e) {
            GhostTaskStore.setPendingActiveRun(appCtx, null);
            scheduleNextQueuedStepAfterDelay(appCtx, 1000L);
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
