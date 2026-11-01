package ai.ghost.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class GhostForegroundService extends Service {
    public static final String CHANNEL_ID = "ghost_active_control_channel";
    public static final int NOTIFICATION_ID = 5001;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String contact = intent != null ? intent.getStringExtra("contactName") : "WhatsApp";
        if (contact == null) contact = "WhatsApp";

        Intent stopIntent = new Intent(this, GhostKillSwitchReceiver.class);
        stopIntent.setAction(GhostKillSwitchReceiver.ACTION_EMERGENCY_STOP);
        PendingIntent stopPi = PendingIntent.getBroadcast(
                this,
                99,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent openAppIntent = new Intent(this, MainActivity.class);
        PendingIntent openPi = PendingIntent.getActivity(
                this,
                100,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Action stopAction = new Notification.Action.Builder(
                android.R.drawable.ic_media_pause,
                "STOP GHOST NOW",
                stopPi
        ).build();

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        Notification notification = builder
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Ghost Controlling Screen · " + contact)
                .setContentText("Tap STOP or press Volume-Down to abort immediately.")
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(stopAction)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Throwable ignored) {
            // Never crash background WhatsApp send if OEM restricts FGS banner
        }
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Ghost Active Kill-Switch",
                    NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription("Displayed whenever Ghost is actively automating the screen.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
