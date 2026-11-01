package ai.ghost.agent;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.List;

public class GhostAccessibilityService extends AccessibilityService {

    private static volatile GhostAccessibilityService activeInstance;
    private static final long ACTIVE_WINDOW_TIMEOUT_MS = 25_000L;
    private static final long NEXT_CONTACT_GAP_MS = 1650L;

    private final Handler handler = new Handler(Looper.getMainLooper());
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
                stopService(new Intent(this, GhostForegroundService.class));
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
        JSONObject activeTask = GhostTaskStore.getPendingActiveRun(this);
        if (activeTask == null) return;

        long now = System.currentTimeMillis();
        long activatedAt = activeTask.optLong("_activatedAtMs", 0L);
        if (activatedAt > 0L && (now - activatedAt) > ACTIVE_WINDOW_TIMEOUT_MS) {
            GhostTaskStore.setPendingActiveRun(this, null);
            GhostTaskStore.appendReceipt(
                    this,
                    activeTask.optString("id", "task"),
                    activeTask.optString("contactName", "Contact"),
                    "TIMEOUT",
                    activeTask.optString("messageBody", ""),
                    "Timed out waiting for WhatsApp Send button; continuing queue."
            );
            advanceQueueOrFinish();
            return;
        }

        // Wait for Android to finish opening/switching into the target contact's chat window
        long readyAfter = activeTask.optLong("_readyAfterMs", 0L);
        if (readyAfter > 0L && now < readyAfter) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;

        String pkg = root.getPackageName().toString();
        if (!"com.whatsapp".equals(pkg) && !"com.whatsapp.w4b".equals(pkg)) {
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
                GhostTaskStore.appendReceipt(
                        this,
                        activeTask.optString("id", "task"),
                        activeTask.optString("contactName", "Contact"),
                        "SENT",
                        desiredMessage,
                        "Sent via WhatsApp"
                );
                advanceQueueOrFinish();
            }
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
            stopService(new Intent(this, GhostForegroundService.class));
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
