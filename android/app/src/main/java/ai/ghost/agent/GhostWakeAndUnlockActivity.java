package ai.ghost.agent;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.view.WindowManager;

public class GhostWakeAndUnlockActivity extends Activity {
    public static final String EXTRA_TARGET_URI = "extra_target_uri";
    public static final String EXTRA_TARGET_PKG = "extra_target_pkg";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean launchedTarget = false;

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        if (win != null) {
            win.addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        handleWakeIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        launchedTarget = false;
        handleWakeIntent(intent);
    }

    private void handleWakeIntent(Intent intent) {
        final String targetUri = intent != null ? intent.getStringExtra(EXTRA_TARGET_URI) : null;
        final String targetPkg = intent != null ? intent.getStringExtra(EXTRA_TARGET_PKG) : null;

        if (targetUri == null || targetUri.isEmpty()) {
            finish();
            return;
        }

        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (km != null && km.isKeyguardLocked()) {
            // When Lock Screen is None or Swipe (no password/PIN), requestDismissKeyguard
            // automatically dismisses the Swipe keyguard without requiring user touch.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                    @Override
                    public void onDismissSucceeded() {
                        dispatchWhatsAppAndClose(targetUri, targetPkg);
                    }

                    @Override
                    public void onDismissCancelled() {
                        dispatchWhatsAppAndClose(targetUri, targetPkg);
                    }

                    @Override
                    public void onDismissError() {
                        dispatchWhatsAppAndClose(targetUri, targetPkg);
                    }
                });
            }

            // Safety fallback for custom OEM Swipe screens (MIUI / ColorOS / OneUI)
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    dispatchWhatsAppAndClose(targetUri, targetPkg);
                }
            }, 950L);
        } else {
            // Screen was merely off with Lock = "None" — launch immediately once woken
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    dispatchWhatsAppAndClose(targetUri, targetPkg);
                }
            }, 180L);
        }
    }

    private void dispatchWhatsAppAndClose(String targetUri, String targetPkg) {
        if (launchedTarget) return;
        launchedTarget = true;
        handler.removeCallbacksAndMessages(null);

        try {
            Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(targetUri));
            if (targetPkg != null && !targetPkg.isEmpty()) {
                waIntent.setPackage(targetPkg);
            }
            waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(waIntent);

            GhostAccessibilityService svc = GhostAccessibilityService.getActiveInstance();
            if (svc != null) {
                svc.scheduleWatchdogTick(1400L);
            }
        } catch (Exception ignored) {
        } finally {
            finish();
            overridePendingTransition(0, 0);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
