package ai.ghost.agent;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

public class GhostAccessibilityService extends AccessibilityService {

    private static volatile boolean skillRecordingActive = false;
    private static final JSONArray recordedSteps = new JSONArray();

    private static final String[] RED_ZONE_PACKAGES = new String[]{
            "com.google.android.apps.nbu.paisa.user",
            "com.phonepe.app",
            "net.one97.paytm",
            "in.org.npci.upiapp"
    };

    private static final String[] RED_ZONE_NODE_TOKENS = new String[]{
            "voice_call",
            "video_call",
            "menuitem_conversations_call",
            "voip",
            "payment",
            "upi",
            "delete_chat"
    };

    private static final String[] URGENT_CONTEXT_KEYWORDS = new String[]{
            "emergency",
            "hospital",
            "don't text",
            "dont text",
            "don’t text",
            "sleeping in",
            "sleeping late"
    };

    public static void startRecordingSkill() {
        synchronized (recordedSteps) {
            while (recordedSteps.length() > 0) {
                recordedSteps.remove(0);
            }
            skillRecordingActive = true;
        }
    }

    public static String stopRecordingSkill() {
        synchronized (recordedSteps) {
            skillRecordingActive = false;
            return recordedSteps.toString();
        }
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
                GhostTaskStore.appendReceipt(
                        this,
                        active.optString("id", "vol-kill"),
                        active.optString("contactName", "Unknown"),
                        "ABORTED_KILLSWITCH",
                        active.optString("messageBody", ""),
                        "Hardware Volume-Down Kill-Switch pressed. Control yielded in <15ms."
                );
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

        // 1. Capture Teach-Me-Once skill steps when recording
        if (skillRecordingActive && event.getEventType() == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            AccessibilityNodeInfo src = event.getSource();
            if (src != null) {
                String resId = src.getViewIdResourceName() != null
                        ? src.getViewIdResourceName()
                        : src.getClassName().toString();
                synchronized (recordedSteps) {
                    if (recordedSteps.length() < 20) {
                        recordedSteps.put("Click " + resId + " (" + pkg + ")");
                    }
                }
            }
        }

        // 2. Check if there is an active scheduled/live automation task
        JSONObject activeTask = GhostTaskStore.getPendingActiveRun(this);
        if (activeTask == null) return;

        // 3. Hard Red-Zone Package Block (never operate inside UPI / Banking apps)
        for (String blockedPkg : RED_ZONE_PACKAGES) {
            if (blockedPkg.equals(pkg)) {
                GhostTaskStore.setPendingActiveRun(this, null);
                stopService(new Intent(this, GhostForegroundService.class));
                return;
            }
        }

        if (!"com.whatsapp".equals(pkg) && !"com.whatsapp.w4b".equals(pkg)) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        // 4. Read-Before-Sending Context Guard
        if (activeTask.optBoolean("contextGuardEnabled", true)) {
            if (containsUrgentOvernightMessage(root, pkg)) {
                GhostTaskStore.setPendingActiveRun(this, null);
                stopService(new Intent(this, GhostForegroundService.class));
                GhostTaskStore.appendReceipt(
                        this,
                        activeTask.optString("id", "task"),
                        activeTask.optString("contactName", "Contact"),
                        "PAUSED_CONTEXT_GUARD",
                        activeTask.optString("messageBody", ""),
                        "Context Guard detected urgent/sleep-in keyword in recent WhatsApp messages. Auto-paused sending."
                );
                return;
            }
        }

        // 5. Ensure message entry has text if needed, then safely click Send
        String desiredMessage = activeTask.optString("messageBody", "Good morning");
        AccessibilityNodeInfo entryNode = findFirstById(root, pkg + ":id/entry");
        if (entryNode != null) {
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
            sendNode = findSafeSendButtonByDescription(root);
        }

        if (sendNode != null && sendNode.isClickable() && !isRedZoneNode(sendNode)) {
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
                        "Delivered via WhatsApp Deep Link + Accessibility UI Tree Send click."
                );
            }
        }
    }

    private boolean containsUrgentOvernightMessage(AccessibilityNodeInfo root, String pkg) {
        List<AccessibilityNodeInfo> msgNodes =
                root.findAccessibilityNodeInfosByViewId(pkg + ":id/message_text");
        if (msgNodes == null || msgNodes.isEmpty()) return false;

        int start = Math.max(0, msgNodes.size() - 5);
        for (int i = start; i < msgNodes.size(); i++) {
            AccessibilityNodeInfo node = msgNodes.get(i);
            if (node != null && node.getText() != null) {
                String lower = node.getText().toString().toLowerCase(Locale.US);
                for (String kw : URGENT_CONTEXT_KEYWORDS) {
                    if (lower.contains(kw)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private AccessibilityNodeInfo findFirstById(AccessibilityNodeInfo root, String viewId) {
        List<AccessibilityNodeInfo> list = root.findAccessibilityNodeInfosByViewId(viewId);
        if (list != null && !list.isEmpty()) {
            return list.get(0);
        }
        return null;
    }

    private AccessibilityNodeInfo findSafeSendButtonByDescription(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (!isRedZoneNode(node) && node.getContentDescription() != null) {
            String desc = node.getContentDescription().toString();
            if ("Send".equalsIgnoreCase(desc) && node.isClickable()) {
                return node;
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findSafeSendButtonByDescription(node.getChild(i));
            if (found != null) return found;
        }
        return null;
    }

    private boolean isRedZoneNode(AccessibilityNodeInfo node) {
        String id = node.getViewIdResourceName();
        if (id != null) {
            String lower = id.toLowerCase(Locale.US);
            for (String token : RED_ZONE_NODE_TOKENS) {
                if (lower.contains(token)) return true;
            }
        }
        if (node.getContentDescription() != null) {
            String d = node.getContentDescription().toString().toLowerCase(Locale.US);
            if (d.contains("voice call") || d.contains("video call") || d.contains("pay")) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void onInterrupt() {
        GhostTaskStore.setPendingActiveRun(this, null);
    }
}
