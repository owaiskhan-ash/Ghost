package ai.ghost.agent;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.List;

public class GhostAccessibilityService extends AccessibilityService {

    private static volatile GhostAccessibilityService activeInstance;
    private static final long ACTIVE_WINDOW_TIMEOUT_MS = 25_000L;

    public static GhostAccessibilityService getActiveInstance() {
        return activeInstance;
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
            if (active != null) {
                GhostTaskStore.setPendingActiveRun(this, null);
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
        String pkg = event.getPackageName().toString();

        JSONObject activeTask = GhostTaskStore.getPendingActiveRun(this);
        if (activeTask == null) return;

        long activatedAt = activeTask.optLong("_activatedAtMs", 0L);
        if (activatedAt > 0L && (System.currentTimeMillis() - activatedAt) > ACTIVE_WINDOW_TIMEOUT_MS) {
            GhostTaskStore.setPendingActiveRun(this, null);
            stopService(new Intent(this, GhostForegroundService.class));
            return;
        }

        if (!"com.whatsapp".equals(pkg) && !"com.whatsapp.w4b".equals(pkg)) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        String desiredMessage = activeTask.optString("messageBody", "");
        AccessibilityNodeInfo entryNode = findFirstById(root, pkg + ":id/entry");
        if (entryNode != null && !desiredMessage.isEmpty()) {
            CharSequence existing = entryNode.getText();
            if (existing == null || existing.length() == 0) {
                Bundle args = new Bundle();
                args.putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        desiredMessage
                );
                entryNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
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
                stopService(new Intent(this, GhostForegroundService.class));
                GhostTaskStore.appendReceipt(
                        this,
                        activeTask.optString("id", "task"),
                        activeTask.optString("contactName", "Contact"),
                        "SENT",
                        desiredMessage,
                        "Sent via WhatsApp"
                );
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
        GhostTaskStore.setPendingActiveRun(this, null);
    }

    @Override
    public boolean onUnbind(Intent intent) {
        activeInstance = null;
        return super.onUnbind(intent);
    }
}
