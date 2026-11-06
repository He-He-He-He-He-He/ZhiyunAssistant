package cn.suike.slides.android;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Manual official login; automatic credential capture and verification remain disabled. */
public final class OfficialLoginActivity extends ComponentActivity {
    private static java.lang.ref.WeakReference<OfficialLoginActivity> active = new java.lang.ref.WeakReference<>(null);
    private static boolean cancelBeforeCreate;
    static void prepareLogin() { cancelBeforeCreate = false; }
    static void cancelPending() { OfficialLoginActivity current = active.get(); if (current != null && !current.isFinishing()) current.cancelForLogout(); else cancelBeforeCreate = true; }
    private void cancelForLogout() {
        closed = true; typedPassword = ""; ui.removeCallbacks(loginProbe); verifier.shutdownNow();
        if (credentialVerifier != null) { credentialVerifier.cancel(); credentialVerifier = null; }
        if (login != null) { login.stopLoading(); android.view.ViewParent parent = login.getParent(); if (parent instanceof android.view.ViewGroup) ((android.view.ViewGroup)parent).removeView(login); login.destroy(); login = null; }
        setResult(RESULT_CANCELED); finish();
    }
    private WebView login;
    private final ExecutorService verifier = Executors.newSingleThreadExecutor();
    private volatile boolean checking, closed;
    private long lastCheck;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean visible, remember, verifying;
    private String typedUser = "", typedPassword = "";
    private CredentialVerifier credentialVerifier;
    private android.app.AlertDialog progress;
    private final Runnable loginProbe = new Runnable() { @Override public void run() {
        if (!visible || closed) return;
        if (login != null && "classroom.zju.edu.cn".equals(Uri.parse(login.getUrl() == null ? "" : login.getUrl()).getHost())) verifySession();
        ui.postDelayed(this,1500);
    }};
    private static final String CLASSROOM = "https://classroom.zju.edu.cn";
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        active = new java.lang.ref.WeakReference<>(this);
        if (cancelBeforeCreate) { cancelBeforeCreate = false; finish(); return; }
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(243,246,250));
        Button back = new Button(this); back.setText("返回智云助手"); back.setAllCaps(false); back.setOnClickListener(v -> finish());
        root.addView(back,new LinearLayout.LayoutParams(-1,(int)(48*getResources().getDisplayMetrics().density)));
        login = new WebView(this);
        WebSettings settings = login.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSaveFormData(false);
        settings.setTextZoom(100); settings.setBuiltInZoomControls(false); settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(login,false);
        login.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri = request.getUrl(); String host = uri.getHost();
                return !("https".equals(uri.getScheme()) && host != null && (host.equals("zju.edu.cn") || host.endsWith(".zju.edu.cn")));
            }
            @Override public void onPageFinished(WebView view,String url) {
                Uri uri = Uri.parse(url);
                // Navigating to a login page is not proof of an authenticated classroom session.
                if ("classroom.zju.edu.cn".equals(uri.getHost())) verifySession();
            }
        });
        root.addView(login,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
        root.setOnApplyWindowInsetsListener((v,insets) -> {
            if (Build.VERSION.SDK_INT >= 30) { android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime()); v.setPadding(safe.left,safe.top,safe.right,safe.bottom); }
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { if (login.canGoBack()) login.goBack(); else finish(); } });
        new android.app.AlertDialog.Builder(this).setTitle("官方手动登录")
            .setMessage("本官方页面不捕获或保存密码，也不会自动提交。原生账号验收需返回应用后，在「隐私与数据」内由你本人另行明确开启；每次启动默认关闭。")
            .setPositiveButton("继续", (d, w) -> login.loadUrl(CLASSROOM + "/")).setCancelable(false).show();
    }
    private void verifySession() {
        if (closed || checking || System.currentTimeMillis()-lastCheck < 700) return;
        String cookie = CookieManager.getInstance().getCookie(CLASSROOM);
        if (cookie == null || cookie.isEmpty()) return;
        checking = true; lastCheck = System.currentTimeMillis();
        verifier.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection)new URL(CLASSROOM+"/userapi/v1/infosimple").openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
                connection.setRequestProperty("Cookie",cookie); connection.setRequestProperty("Accept","application/json"); connection.setRequestProperty("Referer",CLASSROOM+"/");
                Matcher tokenCookie = Pattern.compile("(?:^|;\\s*)_token=([^;]*)").matcher(cookie);
                if (tokenCookie.find()) { String decoded = URLDecoder.decode(tokenCookie.group(1),StandardCharsets.UTF_8.name()); Matcher token = Pattern.compile("\\{i:\\d+;s:\\d+:\"_token\";i:\\d+;s:\\d+:\"(.+?)\";\\}").matcher(decoded); if (token.find()) connection.setRequestProperty("Authorization","Bearer "+token.group(1)); }
                if (connection.getResponseCode() != 200) return;
                ByteArrayOutputStream data = new ByteArrayOutputStream();
                try (InputStream stream = connection.getInputStream()) { byte[] buffer = new byte[4096]; int n; while ((n=stream.read(buffer)) != -1) { if (data.size()+n > 512*1024) return; data.write(buffer,0,n); } }
                JSONObject value = new JSONObject(data.toString(StandardCharsets.UTF_8.name())).optJSONObject("params");
                if (value == null || value.optString("id","").isEmpty() || "0".equals(value.optString("id"))) return;
                String accountId = value.optString("id"), accountName = value.optString("account", "").trim();
                runOnUiThread(() -> { if (!closed && !verifying) { CookieManager.getInstance().flush(); finishLogin(); } });
            } catch (Exception ignored) { /* A failed probe never discards a saved session or credentials. */ }
            finally { checking = false; if (connection != null) connection.disconnect(); }
        });
    }
    private void finishLogin() {
        closed = true; setResult(RESULT_OK); finish();
    }
    @Override protected void onResume() { super.onResume(); visible = true; ui.postDelayed(loginProbe,750); }
    @Override protected void onPause() { visible = false; ui.removeCallbacks(loginProbe); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { if (active.get() == this) active.clear(); closed = true; typedPassword = ""; if (credentialVerifier != null) credentialVerifier.cancel(); if (progress != null) progress.dismiss(); ui.removeCallbacks(loginProbe); verifier.shutdownNow(); if (login != null) { login.stopLoading(); android.view.ViewParent parent = login.getParent(); if (parent instanceof android.view.ViewGroup) ((android.view.ViewGroup)parent).removeView(login); login.destroy(); } super.onDestroy(); }
}
