package ai.ghost.agent;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {

    private static final String VIRTUAL_HOST = "appassets.ghost.local";
    private static final String APP_ENTRY_URL = "https://" + VIRTUAL_HOST + "/index.html";
    private static final String UI_PREFS = "ghost_ui_prefs_v2";
    private static final String KEY_DARK_MODE = "dark_mode";

    private static final int REQ_PICK_CONTACT = 2001;
    private static final int REQ_READ_CONTACTS_BULK = 2002;
    private static final int REQ_POST_NOTIFICATIONS = 2003;

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE);
        boolean initialDark = prefs.getBoolean(KEY_DARK_MODE, true);

        webView = new WebView(this);
        applyThemeColors(initialDark);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new GhostNativeBridge(this), "GhostNativeBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return null;
                Uri uri = request.getUrl();
                if (!VIRTUAL_HOST.equalsIgnoreCase(uri.getHost())) {
                    return super.shouldInterceptRequest(view, request);
                }

                String path = uri.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    path = "/index.html";
                }
                String assetPath = "www" + path;
                try {
                    InputStream stream = getAssets().open(assetPath);
                    String mime = guessMimeType(assetPath);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "https://" + VIRTUAL_HOST);
                    headers.put("Cache-Control", "no-cache");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream);
                } catch (IOException e) {
                    return null;
                }
            }
        });

        setContentView(webView);
        webView.loadUrl(APP_ENTRY_URL);
        GhostLockedNotification.ensureChannel(this);

        // Ensure all active alarms are armed in AlarmManager whenever app starts
        GhostTaskScheduler.rescheduleAllEnabledTasks(getApplicationContext());
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView == null) return;

        // Android permission screens live outside the WebView. Notify React after
        // returning so each permission toggle immediately reflects the real state.
        webView.postDelayed(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('ghost:device-status-changed'));",
                        null
                );
            }
        }, 250);
    }

    public void setDarkModeFromJs(final boolean dark) {
        getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_DARK_MODE, dark)
                .apply();
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                applyThemeColors(dark);
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void applyThemeColors(boolean dark) {
        int canvasColor = Color.parseColor(dark ? "#252A30" : "#E0E5EC");

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(canvasColor);
            window.setNavigationBarColor(canvasColor);
            View decor = window.getDecorView();
            if (decor != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                int flags = decor.getSystemUiVisibility();
                if (dark) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                } else {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                decor.setSystemUiVisibility(flags);
            }
        }
        if (webView != null) {
            webView.setBackgroundColor(canvasColor);
        }
    }

    public void launchSystemContactPicker() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent pickIntent = new Intent(
                            Intent.ACTION_PICK,
                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI
                    );
                    startActivityForResult(pickIntent, REQ_PICK_CONTACT);
                } catch (Exception ignored) {
                }
            }
        });
    }

    public void requestBulkContactsFromPhone() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.READ_CONTACTS)
                        != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(
                            new String[]{Manifest.permission.READ_CONTACTS},
                            REQ_READ_CONTACTS_BULK
                    );
                } else {
                    dispatchBulkContactsToWebView();
                }
            }
        });
    }

    /** Ask only after the user creates a schedule, where the permission has context. */
    public void ensureLockedSendNotificationPermission() {
        GhostLockedNotification.ensureChannel(this);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            REQ_POST_NOTIFICATIONS
                    );
                }
            }
        });
    }

    private void dispatchBulkContactsToWebView() {
        if (webView == null) return;
        final JSONArray contacts = queryAllPhoneContactsJson();
        final String js = "window.onGhostBulkContactsLoaded && window.onGhostBulkContactsLoaded("
                + contacts.toString() + ");";
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    public JSONArray queryAllPhoneContactsJson() {
        JSONArray arr = new JSONArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            return arr;
        }

        Set<String> seenNormalizedPhones = new HashSet<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[]{
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER
                    },
                    null,
                    null,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC"
            );
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < 2000) {
                    String name = cursor.getString(0);
                    String rawNum = cursor.getString(1);
                    if (name == null || rawNum == null) continue;
                    String cleaned = rawNum.replaceAll("[^0-9+]", "");
                    String digitsOnly = cleaned.replaceAll("[^0-9]", "");
                    if (digitsOnly.length() < 5) continue;

                    String dedupKey = digitsOnly.length() > 10
                            ? digitsOnly.substring(digitsOnly.length() - 10)
                            : digitsOnly;
                    if (seenNormalizedPhones.contains(dedupKey)) continue;
                    seenNormalizedPhones.add(dedupKey);

                    JSONObject item = new JSONObject();
                    item.put("name", name.trim());
                    item.put("phone", cleaned);
                    arr.put(item);
                    count++;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return arr;
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_READ_CONTACTS_BULK) {
            if (grantResults != null
                    && grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                dispatchBulkContactsToWebView();
            } else if (webView != null) {
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript(
                                "window.onGhostBulkContactsDenied && window.onGhostBulkContactsDenied();",
                                null
                        );
                    }
                });
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_CONTACT && resultCode == RESULT_OK && data != null) {
            Uri contactUri = data.getData();
            if (contactUri == null || webView == null) return;
            Cursor cursor = null;
            try {
                cursor = getContentResolver().query(
                        contactUri,
                        new String[]{
                                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                                ContactsContract.CommonDataKinds.Phone.NUMBER
                        },
                        null,
                        null,
                        null
                );
                if (cursor != null && cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    String phone = cursor.getString(1);
                    JSONObject payload = new JSONObject();
                    payload.put("name", name != null ? name : "");
                    payload.put("phone", phone != null ? phone : "");
                    final String js = "window.onGhostContactPicked && window.onGhostContactPicked("
                            + payload.toString() + ");";
                    webView.post(new Runnable() {
                        @Override
                        public void run() {
                            webView.evaluateJavascript(js, null);
                        }
                    });
                }
            } catch (Exception ignored) {
            } finally {
                if (cursor != null) cursor.close();
            }
        }
    }

    private static String guessMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
