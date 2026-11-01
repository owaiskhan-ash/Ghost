package ai.ghost.agent;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    private static final String VIRTUAL_HOST = "appassets.ghost.local";
    private static final String APP_ENTRY_URL = "https://" + VIRTUAL_HOST + "/index.html";
    private static final int REQ_PICK_CONTACT = 2001;

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(Color.parseColor("#ECEEF1"));
            window.setNavigationBarColor(Color.parseColor("#F7F8FA"));
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#ECEEF1"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
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
