package ai.ghost.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Path;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.List;

public class GhostAccessibilityService extends AccessibilityService {

    private static volatile GhostAccessibilityService activeInstance;
    private static final long ACTIVE_WINDOW_TIMEOUT_MS = 28_000L;
    private static final long NEXT_CONTACT_GAP_MS = 1650L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastSwipeUnlockAttemptMs = 0L;

    private final Runnable watchdogRunnable = new Runnable() {
        @Override
        public void run() {
            processActiveStep();
            if (GhostTaskStore.getPendingActiveRun(GhostAccessibilityService.this) != null) {
                handler.postDelayed(this, 700L);
            }
        }
    };

    public static GhostAccessibilityService getActiveInstance() {
        return activeInstance;
    }

    public void scheduleWatchdogTick(long delayMs) {
        handler.removeCallbacks(watchdogRunnable);
        handler.postDelayed(watchdogRunnable, delayMs);
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        activeInstance = this;
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        if (event != null
                && event.getAction() == KeyEvent.ACTION_DOWN
                && event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN) {
            JSONObject active = GhostTaskStore.getPendingActiveRun(this);
            int queued = GhostTaskStore.getRemainingQueueCount(this);
            if (active != null || queued > 0) {
                handler.removeCallbacks(watchdogRunnable);
                GhostTaskStore.clearAllActiveAndQueuedRuns(this);
                GhostTaskScheduler.cancelScheduledCallbacks();
                try {
                    stopService(new Intent(this, GhostForegroundService.class));
                } catch (Throwable ignored) {
                }
                performGlobalAction(GLOBAL_ACTION_HOME);
                return true;
            }
        }
        return super.onKeyEvent(event);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        processActiveStep();
    }

    private synchronized void processActiveStep() {
        final JSONObject activeTask = GhostTaskStore.getPendingActiveRun(this);
        if (activeTask == null) return;

        long now = System.currentTimeMillis();
        long activatedAt = activeTask.optLong("_activatedAtMs", 0L);

        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean keyguardLocked = km != null && km.isKeyguardLocked();
        boolean deviceHasPassword = km != null && km.isDeviceSecure();

        if (activatedAt > 0L && (now - activatedAt) > ACTIVE_WINDOW_TIMEOUT_MS) {
            GhostTaskStore.setPendingActiveRun(this, null);
            String reason = (keyguardLocked && deviceHasPassword)
                    ? "Screen locked with PIN/Password — set Lock Screen to None or Swipe for unattended sends."
                    : "Timed out waiting for WhatsApp Send button; continuing queue.";
            String outcome = (keyguardLocked && deviceHasPassword)
                    ? "LOCKED_BY_PASSWORD"
                    : "TIMEOUT";
            GhostTaskStore.appendReceipt(
                    this,
                    activeTask.optString("id", "task"),
                    activeTask.optString("contactName", "Contact"),
                    outcome,
                    activeTask.optString("messageBody", ""),
                    reason
            );
            advanceQueueOrFinish();
            return;
        }

        long readyAfter = activeTask.optLong("_readyAfterMs", 0L);
        if (readyAfter > 0L && now < readyAfter) {
            return;
        }

        // If screen is locked WITHOUT password (Swipe-only lock screen still lingering on OEM ROM),
        // perform upward swipe gesture to dismiss the Swipe screen and re-fire WhatsApp intent!
        if (keyguardLocked && !deviceHasPassword) {
            if (now - lastSwipeUnlockAttemptMs > 2400L) {
                lastSwipeUnlockAttemptMs = now;
                performSwipeUpToDismissNonPasswordLock(activeTask);
            }
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;

        String expectedPkg = GhostTaskScheduler.normalizeTargetPackage(
                activeTask.optString("whatsappPackage", GhostTaskScheduler.PKG_WHATSAPP)
        );
        String pkg = root.getPackageName().toString();
        if (!expectedPkg.equals(pkg)) {
            // If keyguard just cleared and we're on Home launcher, re-fire WhatsApp URI once
            if (!keyguardLocked && !activeTask.optBoolean("_reopenedAfterUnlock", false)) {
                String waUri = activeTask.optString("_waUri", "");
                if (!waUri.isEmpty() && (now - activatedAt) > 2200L) {
                    try {
                        activeTask.put("_reopenedAfterUnlock", true);
                        activeTask.put("_readyAfterMs", now + 1100L);
                        GhostTaskStore.setPendingActiveRun(this, activeTask);

                        Intent reopen = new Intent(Intent.ACTION_VIEW, Uri.parse(waUri));
                        reopen.setPackage(expectedPkg);
                        reopen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(reopen);
                    } catch (Throwable ignored) {
                    }
                }
            }
            return;
        }

        String desiredMessage = activeTask.optString("messageBody", "");
        AccessibilityNodeInfo entryNode = findFirstById(root, pkg + ":id/entry");
        if (entryNode != null && !desiredMessage.isEmpty()) {
            boolean isHint = entryNode.isShowingHintText();
            CharSequence existing = entryNode.getText();
            String currentText = (existing == null || isHint) ? "" : existing.toString();

            if (!desiredMessage.equals(currentText)) {
                Bundle args = new Bundle();
                args.putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        desiredMessage
                );
                entryNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                try {
                    activeTask.put("_readyAfterMs", now + 350L);
                    GhostTaskStore.setPendingActiveRun(this, activeTask);
                } catch (Exception ignored) {
                }
                scheduleWatchdogTick(400L);
                return;
            }
        }

        AccessibilityNodeInfo sendNode = findFirstById(root, pkg + ":id/send");
        if (sendNode == null) {
            sendNode = findSendButtonByDescription(root);
        }

        if (sendNode != null && sendNode.isClickable()) {
            boolean clicked = sendNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            if (clicked) {
                GhostTaskStore.setPendingActiveRun(this, null);
                String appUsed = GhostTaskScheduler.PKG_WHATSAPP_BUSINESS.equals(expectedPkg)
                        ? "Sent via WhatsApp Business"
                        : "Sent via WhatsApp";
                GhostTaskStore.appendReceipt(
                        this,
                        activeTask.optString("id", "task"),
                        activeTask.optString("contactName", "Contact"),
                        "SENT",
                        desiredMessage,
                        appUsed
                );
                advanceQueueOrFinish();
            }
        }
    }

    private void performSwipeUpToDismissNonPasswordLock(final JSONObject step) {
        try {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            float centerX = dm.widthPixels * 0.5f;
            float startY = dm.heightPixels * 0.82f;
            float endY = dm.heightPixels * 0.18f;

            Path swipePath = new Path();
            swipePath.moveTo(centerX, startY);
            swipePath.lineTo(centerX, endY);

            GestureDescription.StrokeDescription stroke =
                    new GestureDescription.StrokeDescription(swipePath, 0L, 260L);
            GestureDescription gesture = new GestureDescription.Builder()
                    .addStroke(stroke)
                    .build();

            dispatchGesture(gesture, new GestureResultCallback() {
                @Override
                public void onCompleted(GestureDescription gestureDescription) {
                    super.onCompleted(gestureDescription);
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            String waUri = step.optString("_waUri", "");
                            String targetPkg = GhostTaskScheduler.normalizeTargetPackage(
                                    step.optString("whatsappPackage", GhostTaskScheduler.PKG_WHATSAPP)
                            );
                            if (!waUri.isEmpty()) {
                                try {
                                    Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(waUri));
                                    waIntent.setPackage(targetPkg);
                                    waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                                    startActivity(waIntent);
                                } catch (Throwable ignored) {
                                }
                            }
                            scheduleWatchdogTick(900L);
                        }
                    }, 500L);
                }
            }, null);
        } catch (Throwable ignored) {
        }
    }

    private void advanceQueueOrFinish() {
        int remaining = GhostTaskStore.getRemainingQueueCount(this);
        if (remaining > 0) {
            GhostTaskScheduler.scheduleNextQueuedStepAfterDelay(
                    getApplicationContext(),
                    NEXT_CONTACT_GAP_MS
            );
        } else {
            handler.removeCallbacks(watchdogRunnable);
            GhostTaskScheduler.releaseBatchWakeLock();
            try {
                stopService(new Intent(this, GhostForegroundService.class));
            } catch (Throwable ignored) {
            }
        }
    }

    private AccessibilityNodeInfo findFirstById(AccessibilityNodeInfo root, String viewId) {
        List<AccessibilityNodeInfo> list = root.findAccessibilityNodeInfosByViewId(viewId);
        if (list != null && !list.isEmpty()) {
            return list.get(0);
        }
        return null;
    }

    private AccessibilityNodeInfo findSendButtonByDescription(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.getContentDescription() != null) {
            String desc = node.getContentDescription().toString();
            if ("Send".equalsIgnoreCase(desc) && node.isClickable()) {
                return node;
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findSendButtonByDescription(node.getChild(i));
            if (found != null) return found;
        }
        return null;
    }

    @Override
    public void onInterrupt() {
        handler.removeCallbacks(watchdogRunnable);
        GhostTaskStore.clearAllActiveAndQueuedRuns(this);
        GhostTaskScheduler.cancelScheduledCallbacks();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        handler.removeCallbacks(watchdogRunnable);
        activeInstance = null;
        return super.onUnbind(intent);
    }
}
