package ai.ghost.agent;

import android.app.ActivityOptions;
import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public final class GhostTaskScheduler {
    public static final String EXTRA_TASK_ID = "extra_task_id";
    public static final String PKG_WHATSAPP = "com.whatsapp";
    public static final String PKG_WHATSAPP_BUSINESS = "com.whatsapp.w4b";
    private static final long CHAT_SETTLE_DELAY_MS = 1450L;

    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static PowerManager.WakeLock cpuWakeLock;
    private static PowerManager.WakeLock screenWakeLock;

    private GhostTaskScheduler() {}

    public static String normalizeTargetPackage(String rawPkg) {
        if (PKG_WHATSAPP_BUSINESS.equals(rawPkg)) {
            return PKG_WHATSAPP_BUSINESS;
        }
        return PKG_WHATSAPP;
    }

    public static boolean isRecurringTask(JSONObject task) {
        if (task == null) return false;
        String mode = task.optString("repeatMode", "once");
        return "daily".equalsIgnoreCase(mode)
                || "weekly".equalsIgnoreCase(mode)
                || "monthly".equalsIgnoreCase(mode)
                || "interval".equalsIgnoreCase(mode);
    }

    public static String formatDateYmd(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(millis));
    }

    /**
     * Computes the next future trigger timestamp for:
     * - once: scheduledDate + scheduledTime24
     * - daily: every day at scheduledTime24
     * - weekly: next matching weekday in repeatDays [0=Sun..6=Sat] at scheduledTime24
     * - monthly: repeatMonthDay (1..31, clamped to month length) at scheduledTime24
     * - interval: every repeatIntervalDays (>= 1) days from scheduledDate at scheduledTime24
     */
    public static long computeNextTriggerMillis(JSONObject task) {
        long nowWithBuffer = System.currentTimeMillis() + 3_000L;

        String time24 = task.optString("scheduledTime24", "09:00");
        String dateStr = task.optString("scheduledDate", "");
        String repeatMode = task.optString("repeatMode", "once");

        int hour = 9;
        int minute = 0;
        String[] tParts = time24.split(":");
        if (tParts.length == 2) {
            try {
                hour = Integer.parseInt(tParts[0]);
                minute = Integer.parseInt(tParts[1]);
            } catch (NumberFormatException ignored) {
            }
        }

        if ("daily".equalsIgnoreCase(repeatMode)) {
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, hour);
            cal.set(Calendar.MINUTE, minute);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            if (cal.getTimeInMillis() <= nowWithBuffer) {
                cal.add(Calendar.DAY_OF_YEAR, 1);
            }
            return cal.getTimeInMillis();
        }

        if ("weekly".equalsIgnoreCase(repeatMode)) {
            boolean[] allowed = new boolean[7]; // 0=Sun .. 6=Sat
            boolean anySelected = false;
            JSONArray daysArr = task.optJSONArray("repeatDays");
            if (daysArr != null) {
                for (int i = 0; i < daysArr.length(); i++) {
                    int d = daysArr.optInt(i, -1);
                    if (d >= 0 && d <= 6) {
                        allowed[d] = true;
                        anySelected = true;
                    }
                }
            }
            Calendar probe = Calendar.getInstance();
            if (!anySelected) {
                int todayIdx = probe.get(Calendar.DAY_OF_WEEK) - 1;
                allowed[todayIdx] = true;
            }
            probe.set(Calendar.HOUR_OF_DAY, hour);
            probe.set(Calendar.MINUTE, minute);
            probe.set(Calendar.SECOND, 0);
            probe.set(Calendar.MILLISECOND, 0);

            for (int offset = 0; offset <= 8; offset++) {
                int dowIdx = probe.get(Calendar.DAY_OF_WEEK) - 1; // Calendar.SUNDAY == 1 -> 0
                if (allowed[dowIdx] && probe.getTimeInMillis() > nowWithBuffer) {
                    return probe.getTimeInMillis();
                }
                probe.add(Calendar.DAY_OF_YEAR, 1);
            }
            return probe.getTimeInMillis();
        }

        if ("monthly".equalsIgnoreCase(repeatMode)) {
            int desiredDay = task.optInt("repeatMonthDay", 0);
            if (desiredDay < 1 || desiredDay > 31) {
                Calendar nowCal = Calendar.getInstance();
                desiredDay = nowCal.get(Calendar.DAY_OF_MONTH);
            }
            Calendar base = Calendar.getInstance();
            int baseYear = base.get(Calendar.YEAR);
            int baseMonth = base.get(Calendar.MONTH);

            for (int mOffset = 0; mOffset <= 14; mOffset++) {
                Calendar candidate = Calendar.getInstance();
                candidate.clear();
                candidate.set(Calendar.YEAR, baseYear);
                candidate.set(Calendar.MONTH, baseMonth);
                candidate.add(Calendar.MONTH, mOffset);
                int maxDay = candidate.getActualMaximum(Calendar.DAY_OF_MONTH);
                candidate.set(Calendar.DAY_OF_MONTH, Math.min(desiredDay, maxDay));
                candidate.set(Calendar.HOUR_OF_DAY, hour);
                candidate.set(Calendar.MINUTE, minute);
                candidate.set(Calendar.SECOND, 0);
                candidate.set(Calendar.MILLISECOND, 0);
                if (candidate.getTimeInMillis() > nowWithBuffer) {
                    return candidate.getTimeInMillis();
                }
            }
        }

        if ("interval".equalsIgnoreCase(repeatMode)) {
            int intervalDays = Math.max(1, task.optInt("repeatIntervalDays", 2));
            Calendar anchor = parseDateTimeCalendar(dateStr, hour, minute);
            while (anchor.getTimeInMillis() <= nowWithBuffer) {
                anchor.add(Calendar.DAY_OF_YEAR, intervalDays);
            }
            return anchor.getTimeInMillis();
        }

        // Default: 'once'
        Calendar cal = parseDateTimeCalendar(dateStr, hour, minute);
        if (cal.getTimeInMillis() <= nowWithBuffer) {
            Calendar tomorrow = Calendar.getInstance();
            tomorrow.set(Calendar.HOUR_OF_DAY, hour);
            tomorrow.set(Calendar.MINUTE, minute);
            tomorrow.set(Calendar.SECOND, 0);
            tomorrow.set(Calendar.MILLISECOND, 0);
            if (tomorrow.getTimeInMillis() <= nowWithBuffer) {
                tomorrow.add(Calendar.DAY_OF_YEAR, 1);
            }
            return tomorrow.getTimeInMillis();
        }
        return cal.getTimeInMillis();
    }

    private static Calendar parseDateTimeCalendar(String dateStr, int hour, int minute) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (dateStr != null && dateStr.contains("-")) {
            String[] dParts = dateStr.split("-");
            if (dParts.length == 3) {
                try {
                    int yyyy = Integer.parseInt(dParts[0]);
                    int mm = Integer.parseInt(dParts[1]) - 1;
                    int dd = Integer.parseInt(dParts[2]);
                    cal.set(yyyy, mm, dd, hour, minute, 0);
                    return cal;
                } catch (NumberFormatException ignored) {
                }
            }
        }
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        return cal;
    }

    public static long scheduleAlarmForTask(Context ctx, JSONObject task) {
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return -1L;

        String taskId = task.optString("id", "default");
        long triggerAt = computeNextTriggerMillis(task);

        Intent alarmIntent = new Intent(ctx, GhostAlarmReceiver.class);
        alarmIntent.putExtra(EXTRA_TASK_ID, taskId);
        alarmIntent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, taskId.hashCode(), alarmIntent, flags);

        Intent showIntent = new Intent(ctx, MainActivity.class);
        PendingIntent showPi = buildActivityPendingIntentWithBal(ctx, 0, showIntent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            // setAlarmClock wakes Doze mode even when Ghost app is swiped away / closed
            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAt, showPi);
            alarmManager.setAlarmClock(clockInfo, pi);
        }
        return triggerAt;
    }

    private static PendingIntent buildActivityPendingIntentWithBal(
            Context ctx,
            int requestCode,
            Intent intent,
            int flags
    ) {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                ActivityOptions opts = ActivityOptions.makeBasic();
                opts.setPendingIntentCreatorBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                Bundle b = opts.toBundle();
                return PendingIntent.getActivity(ctx, requestCode, intent, flags, b);
            } catch (Throwable ignored) {
            }
        }
        return PendingIntent.getActivity(ctx, requestCode, intent, flags);
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
                long safeMs = Math.max(durationMs, 35_000L);

                cpuWakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "ghost:BackgroundCpuWakeLock"
                );
                cpuWakeLock.setReferenceCounted(false);
                cpuWakeLock.acquire(safeMs);

                screenWakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "ghost:ScreenWakeLock"
                );
                screenWakeLock.setReferenceCounted(false);
                screenWakeLock.acquire(safeMs);
            }
        } catch (Throwable ignored) {
        }
    }

    public static synchronized void releaseBatchWakeLock() {
        try {
            if (screenWakeLock != null && screenWakeLock.isHeld()) {
                screenWakeLock.release();
            }
        } catch (Throwable ignored) {
        }
        screenWakeLock = null;

        try {
            if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
                cpuWakeLock.release();
            }
        } catch (Throwable ignored) {
        }
        cpuWakeLock = null;
    }

    public static void cancelScheduledCallbacks() {
        MAIN_HANDLER.removeCallbacksAndMessages(null);
        releaseBatchWakeLock();
    }

    public static void launchWhatsAppTaskNow(Context ctx, JSONObject task) {
        final Context appCtx = ctx.getApplicationContext();
        JSONArray steps = GhostTaskStore.expandTaskIntoSteps(task);
        if (steps.length() == 0) return;

        GhostAccessibilityService activeService = GhostAccessibilityService.getActiveInstance();
        if (activeService != null) {
            activeService.prepareForAutomationRun();
        }

        GhostTaskStore.enqueueRunSteps(appCtx, steps);
        int totalPending = GhostTaskStore.getRemainingQueueCount(appCtx) + 1;
        acquireBatchWakeLock(appCtx, totalPending * 18_000L + 20_000L);

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
            GhostAccessibilityService activeService = GhostAccessibilityService.getActiveInstance();
            if (activeService != null) {
                activeService.finishQueueUiAndSleep();
            } else {
                try {
                    appCtx.stopService(new Intent(appCtx, GhostForegroundService.class));
                } catch (Throwable ignored) {
                }
                releaseBatchWakeLock();
            }
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

        String schemeUrl = "whatsapp://send?phone=" + rawPhone + "&text=" + Uri.encode(msg);
        Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(schemeUrl));
        waIntent.setPackage(targetPkg);
        waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        String resolvedUri = schemeUrl;
        if (waIntent.resolveActivity(pm) == null) {
            resolvedUri = "https://api.whatsapp.com/send?phone=" + rawPhone + "&text=" + Uri.encode(msg);
            waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUri));
            waIntent.setPackage(targetPkg);
            waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }

        PowerManager powerMgr = (PowerManager) appCtx.getSystemService(Context.POWER_SERVICE);
        KeyguardManager keyguardMgr = (KeyguardManager) appCtx.getSystemService(Context.KEYGUARD_SERVICE);
        boolean screenAsleep = powerMgr != null && !powerMgr.isInteractive();
        boolean keyguardShowing = keyguardMgr != null && keyguardMgr.isKeyguardLocked();

        long settleMs = (screenAsleep || keyguardShowing)
                ? (CHAT_SETTLE_DELAY_MS + 900L)
                : CHAT_SETTLE_DELAY_MS;

        long now = System.currentTimeMillis();
        try {
            step.put("whatsappPackage", targetPkg);
            step.put("_waUri", resolvedUri);
            step.put("_activatedAtMs", now);
            step.put("_readyAfterMs", now + settleMs);
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

        // Best-effort kill-switch banner (never allowed to block WhatsApp launch on Android 12-14)
        try {
            Intent fg = new Intent(appCtx, GhostForegroundService.class);
            fg.putExtra("contactName", contactLabel + " · " + appDisplayName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appCtx.startForegroundService(fg);
            } else {
                appCtx.startService(fg);
            }
        } catch (Throwable ignored) {
        }

        try {
            GhostAccessibilityService svc = GhostAccessibilityService.getActiveInstance();

            if (screenAsleep || keyguardShowing) {
                // Screen is OFF or on non-password Swipe Lock Screen:
                // Wake display & dismiss non-secure keyguard via GhostWakeAndUnlockActivity first
                Intent wakeIntent = new Intent(appCtx, GhostWakeAndUnlockActivity.class);
                wakeIntent.putExtra(GhostWakeAndUnlockActivity.EXTRA_TARGET_URI, resolvedUri);
                wakeIntent.putExtra(GhostWakeAndUnlockActivity.EXTRA_TARGET_PKG, targetPkg);
                wakeIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                | Intent.FLAG_ACTIVITY_NO_ANIMATION
                );
                if (svc != null) {
                    svc.startActivity(wakeIntent);
                    svc.scheduleWatchdogTick(settleMs + 150L);
                } else {
                    appCtx.startActivity(wakeIntent);
                }
            } else {
                // Screen already interactive & unlocked: launch WhatsApp directly
                if (svc != null) {
                    svc.startActivity(waIntent);
                    svc.scheduleWatchdogTick(CHAT_SETTLE_DELAY_MS + 100L);
                } else {
                    appCtx.startActivity(waIntent);
                }
            }
        } catch (Throwable e) {
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
