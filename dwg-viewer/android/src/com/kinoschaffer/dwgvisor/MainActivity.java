package com.kinoschaffer.dwgvisor;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Visor DWG/DXF. La interfaz y el motor de dibujo vectorial están en
 * assets/www (HTML + JavaScript + WebAssembly) y se sirven desde un origen
 * HTTPS virtual para que funcionen los Web Workers y WebAssembly.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE = "https://" + HOST + "/";
    private static final int REQ_OPEN = 42;

    private WebView web;
    private volatile byte[] fileBytes;
    private boolean pageReady = false;
    private Uri pendingUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#14161c"));
        w.setNavigationBarColor(Color.parseColor("#14161c"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0f1115"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serve(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost());
            }
        });
        setContentView(web);

        handleIntent(getIntent());
        web.loadUrl(BASE + "index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri data = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) data = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) data = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (data == null) return;
        if (pageReady) loadUri(data, false);
        else pendingUri = data;
    }

    // ------------------------------------------------------------ servidor local
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("wasm", "application/wasm");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("json", "application/json");
        MIME.put("dwg", "application/octet-stream");
        MIME.put("dxf", "application/octet-stream");
    }

    private WebResourceResponse serve(String path) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        if (path == null || path.equals("/")) path = "/index.html";
        if (path.startsWith("/__file__/")) {
            byte[] b = fileBytes;
            if (b == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
            return new WebResourceResponse("application/octet-stream", null, 200, "OK", headers, new ByteArrayInputStream(b));
        }
        String rel = "www" + path;
        if (rel.contains("..")) return null;
        String ext = rel.substring(rel.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open(rel, AssetManager.ACCESS_STREAMING);
            String enc = mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null;
            return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
        }
    }

    // ------------------------------------------------------------ archivos
    private void openPicker() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(i, REQ_OPEN);
        } catch (Exception e) {
            js("window.onNativeError(" + q("No hay un selector de archivos disponible") + ")");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_OPEN) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            js("window.onNativeCancel && window.onNativeCancel()");
            return;
        }
        Uri uri = data.getData();
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
        }
        loadUri(uri, true);
    }

    private void loadUri(final Uri uri, final boolean remember) {
        js("(function(){var l=document.getElementById('loading');if(l){l.classList.remove('hidden');}})()");
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String name = displayName(uri);
                    byte[] b = readAll(uri);
                    fileBytes = b;
                    final String call = "window.onNativeFile(" + q(name) + "," + (remember ? q(uri.toString()) : "null") + ")";
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { js(call); }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            js("window.onNativeError(" + q("No se pudo abrir el archivo: " + e.getMessage()) + ")");
                        }
                    });
                }
            }
        }).start();
    }

    private byte[] readAll(Uri uri) throws IOException {
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new IOException("sin datos");
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(1 << 20);
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
        }
        if (name == null) {
            String p = uri.getLastPathSegment();
            name = p != null ? p.substring(p.lastIndexOf('/') + 1) : "plano.dwg";
        }
        return name;
    }

    // ------------------------------------------------------------ JS
    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    private static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '<': b.append("\\u003c"); break;
                case ' ': b.append("\\u2028"); break;
                case ' ': b.append("\\u2029"); break;
                default:
                    if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
                    else b.append(ch);
            }
        }
        return b.append('"').toString();
    }

    class Bridge {
        @JavascriptInterface
        public void openPicker() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { MainActivity.this.openPicker(); }
            });
        }

        @JavascriptInterface
        public void openUri(final String uri) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { loadUri(Uri.parse(uri), true); }
            });
        }

        @JavascriptInterface
        public void ready() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pageReady = true;
                    if (pendingUri != null) {
                        Uri u = pendingUri;
                        pendingUri = null;
                        loadUri(u, false);
                    }
                }
            });
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("window.onBack ? window.onBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (!"true".equals(v)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
