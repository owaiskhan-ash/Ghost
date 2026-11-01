package ai.ghost.agent;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONObject;

/**
 * Posts a privacy-conscious reminder when Android's secure keyguard prevents
 * an unattended scheduled send. Ghost never attempts to bypass a PIN,
 * pattern, password, or biometric lock.
 */
public final class GhostLockedNotification {
    public static final String CHANNEL_ID = "ghost_locked_send_channel";
    private static final int NOTIFICATION_ID_BASE = 6100;

    private GhostLockedNotification() {}

    public static void ensureChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Locked scheduled sends",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(
                "Alerts when a scheduled message cannot send because the phone is securely locked."
        );
        channel.enableVibration(true);

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    public static void show(Context context, JSONObject task) {
        if (context == null) return;
        Context appCtx = context.getApplicationContext() != null
                ? context.getApplicationContext()
                : context;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && appCtx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureChannel(appCtx);

        String taskId = task != null ? task.optString("id", "locked-task") : "locked-task";
        String contactName = task != null ? task.optString("contactName", "your contact") : "your contact";
        if (contactName == null || contactName.trim().isEmpty()) {
            contactName = "your contact";
        }

        Intent openGhost = new Intent(appCtx, MainActivity.class);
        openGhost.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openGhostPi = PendingIntent.getActivity(
                appCtx,
                taskId.hashCode(),
                openGhost,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String detail = "Message to " + contactName
                + " was not sent because your phone is password locked. Unlock it and open Ghost.";

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(appCtx, CHANNEL_ID)
                : new Notification.Builder(appCtx);

        Notification notification = builder
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Unlock phone to send")
                .setContentText(detail)
                .setStyle(new Notification.BigTextStyle().bigText(detail))
                .setContentIntent(openGhostPi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setWhen(System.currentTimeMillis())
                .build();

        NotificationManager manager =
                (NotificationManager) appCtx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID_BASE + Math.abs(taskId.hashCode() % 100000), notification);
        }
    }
}
