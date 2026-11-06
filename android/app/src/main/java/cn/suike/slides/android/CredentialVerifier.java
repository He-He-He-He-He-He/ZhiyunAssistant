package cn.suike.slides.android;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** One explicitly authorized password submission in a fresh, isolated WebView profile. */
final class CredentialVerifier {
    private static final String ROOT = "https://classroom.zju.edu.cn", PREFIX = "zhiyun-verify-";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Consumer<String> done;
    private final String profileName, username, password, accountId;
    private final android.content.Context context;
    private final String proofToken = UUID.randomUUID().toString();
    private WebView view;
    private CookieManager cookies;
    private boolean submitted, evaluating, checking, finished;
    private volatile boolean armed, postObserved;

    static boolean supported() { return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE); }
    static boolean ownedProfile(String name) {
        if (!name.startsWith(PREFIX)) return false;
        String suffix = name.substring(PREFIX.length());
        try { return UUID.fromString(suffix).toString().equals(suffix); }
        catch (IllegalArgumentException error) { return false; }
    }
    interface ProfileDeletion { boolean contains(String name); boolean delete(String name); }
    static void deleteOwned(ProfileDeletion store, String name) {
        if (name == null || !ownedProfile(name)) throw new IllegalStateException("未知隔离配置名称，拒绝删除");
        if (!store.contains(name)) throw new IllegalStateException("无法确认隔离登录数据是否已清理");
        if (!store.delete(name)) throw new IllegalStateException("无法删除隔离登录数据");
        if (store.contains(name)) throw new IllegalStateException("隔离登录数据仍未删除");
    }
    private static void deleteOwned(ProfileStore store, String name) {
        deleteOwned(new ProfileDeletion() {
            public boolean contains(String value) { return store.getAllProfileNames().contains(value); }
            public boolean delete(String value) { return store.deleteProfile(value); }
        }, name);
    }
    private static java.util.Set<String> pendingNames(android.content.SharedPreferences marker) {
        return new java.util.HashSet<>(marker.getStringSet("names", java.util.Collections.emptySet()));
    }
    private static boolean pendingWriteFailed;
    private static void writePending(android.content.SharedPreferences marker, java.util.Set<String> names) {
        if (pendingWriteFailed) throw new IllegalStateException("隔离登录记录写入失败，请重启后重试");
        java.util.Set<String> before = pendingNames(marker);
        android.content.SharedPreferences.Editor edit = marker.edit();
        if (names.isEmpty()) edit.remove("names").remove("pending");
        else edit.putStringSet("names", new java.util.HashSet<>(names)).putBoolean("pending", true);
        if (!edit.commit()) {
            pendingWriteFailed = true;
            before.addAll(names);
            // SharedPreferences changes its memory cache even when commit fails.
            // Restore the conservative union, and fail closed even if restoration fails.
            marker.edit().putStringSet("names", before).putBoolean("pending", true).commit();
            throw new IllegalStateException("无法记录隔离登录数据清理状态");
        }
    }
    static void assertNoPendingNames(boolean pending, java.util.Set<String> names) throws java.io.IOException {
        if (pending || !names.isEmpty()) throw new java.io.IOException("隔离登录残留未确认清理");
    }
    static void assertNoUnrecordedProfiles(Iterable<String> profiles) throws java.io.IOException {
        for (String name : profiles) if (name != null && name.startsWith(PREFIX)) throw new java.io.IOException("隔离登录残留未确认清理");
    }
    /** Logout checks only: do not alter markers or profiles while verification is disabled. */
    static void assertNoPendingProfiles(android.content.Context context) throws java.io.IOException {
        if (pendingWriteFailed) throw new java.io.IOException("隔离登录残留未确认清理");
        try {
            android.content.SharedPreferences marker = context.getSharedPreferences("zhiyun-isolated-login", 0);
            assertNoPendingNames(marker.getBoolean("pending", false), pendingNames(marker));
            if (supported()) assertNoUnrecordedProfiles(ProfileStore.getInstance().getAllProfileNames());
        } catch (java.io.IOException error) { throw error; }
        catch (Exception error) { throw new java.io.IOException("隔离登录残留未确认清理", error); }
    }
    static void cleanupPrevious(android.content.Context context) {
        if (pendingWriteFailed) throw new IllegalStateException("隔离登录记录写入失败，请重启后重试");
        android.content.SharedPreferences marker = context.getSharedPreferences("zhiyun-isolated-login", 0);
        java.util.Set<String> names = pendingNames(marker);
        if (!supported()) { if (marker.getBoolean("pending", false) || !names.isEmpty()) throw new IllegalStateException("系统不支持清理残留隔离登录数据"); return; }
        ProfileStore store = ProfileStore.getInstance();
        for (String name : store.getAllProfileNames()) if (name.startsWith(PREFIX) && !names.contains(name))
            throw new IllegalStateException("发现无法确认归属的旧隔离配置，未删除");
        if (marker.getBoolean("pending", false) && names.isEmpty())
            throw new IllegalStateException("旧版隔离配置记录缺少名称，无法安全清理");
        for (String name : new java.util.HashSet<>(names)) {
            deleteOwned(store, name);
            names.remove(name);
            writePending(marker, names);
        }
    }
    private void cleanupOwn() {
        if (!supported()) throw new IllegalStateException("系统不支持清理隔离登录数据");
        android.content.SharedPreferences marker = context.getSharedPreferences("zhiyun-isolated-login", 0);
        java.util.Set<String> names = pendingNames(marker);
        if (!names.contains(profileName)) throw new IllegalStateException("隔离配置缺少待清理记录");
        ProfileStore store = ProfileStore.getInstance();
        deleteOwned(store, profileName);
        names.remove(profileName);
        writePending(marker, names);
    }
    private static void requireProvenIsolation() throws java.io.IOException {
        throw new java.io.IOException("隔离验证清理尚未证明安全");
    }
    CredentialVerifier(Activity activity, String username, String password, String accountId, Consumer<String> done) throws java.io.IOException {
        requireProvenIsolation(); // Fail before journaling, WebView creation, or network access.
        this.username = username; this.password = password; this.accountId = accountId; this.done = done; this.context = activity.getApplicationContext();
        profileName = PREFIX + UUID.randomUUID();
        try {
            android.content.SharedPreferences marker = context.getSharedPreferences("zhiyun-isolated-login", 0);
            java.util.Set<String> names = pendingNames(marker);
            if (marker.getBoolean("pending", false) && names.isEmpty()) throw new IllegalStateException("旧版隔离配置记录缺少名称");
            names.add(profileName);
            writePending(marker, names);
            view = new WebView(activity);
            WebViewCompat.setProfile(view, profileName);
            Profile profile = WebViewCompat.getProfile(view);
            cookies = profile.getCookieManager();
            WebViewCompat.addWebMessageListener(view, "zhiyunVerification", Collections.singleton("https://zjuam.zju.edu.cn"), (v, message, origin, mainFrame, reply) -> {
                if (armed && mainFrame && "https://zjuam.zju.edu.cn".equals(String.valueOf(origin).replaceAll("/$", "")) && proofToken.equals(message.getData())) postObserved = true;
            });
            WebSettings settings = view.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSaveFormData(false);
            cookies.setAcceptCookie(true); cookies.setAcceptThirdPartyCookies(view, false);
            view.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { return !campus(request.getUrl()); }
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (armed && request.isForMainFrame() && "POST".equalsIgnoreCase(request.getMethod()) && "https".equals(uri.getScheme()) && "zjuam.zju.edu.cn".equals(uri.getHost()) && "/cas/login".equals(uri.getPath())) postObserved = true;
                    return null;
                }
                @Override public void onPageFinished(WebView v, String url) { step(url); }
            });
            view.setAlpha(0f); view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            ViewGroup root = activity.findViewById(android.R.id.content);
            if (root == null) throw new IllegalStateException("无法创建验证页面");
            root.addView(view, new FrameLayout.LayoutParams(1, 1));
            ui.postDelayed(() -> finish("验证超时，未保存密码"), 30000);
            view.loadUrl(ROOT + "/");
        } catch (Exception error) { ui.post(() -> finish("无法创建隔离验证环境，未保存密码")); }
    }
    private static boolean campus(Uri uri) { String host = uri.getHost(); return "https".equals(uri.getScheme()) && host != null && (host.equals("zju.edu.cn") || host.endsWith(".zju.edu.cn")); }
    private void step(String url) {
        if (finished || url == null) return;
        Uri uri = Uri.parse(url);
        if ("https".equals(uri.getScheme()) && "zjuam.zju.edu.cn".equals(uri.getHost()) && "/cas/login".equals(uri.getPath())) {
            // No captcha state is proof of submission. No password is injected or submitted
            // until the native-only one-shot verifier and its cleanup have been proven.
            finish("自动登录安全验证尚未完成，未保存密码");
        } else if ("https".equals(uri.getScheme()) && "classroom.zju.edu.cn".equals(uri.getHost())) {
            if (submitted) verifyAccount();
        }
    }
    private void verifyAccount() {
        if (checking || finished) return;
        if (!postObserved) { ui.postDelayed(this::verifyAccount, 300); return; }
        String cookie = cookies.getCookie(ROOT); if (cookie == null || cookie.isEmpty()) { ui.postDelayed(this::verifyAccount, 500); return; }
        checking = true;
        worker.execute(() -> {
            HttpURLConnection connection = null; String result = "无法验证登录身份，未保存密码";
            try {
                connection = (HttpURLConnection)new URL(ROOT + "/userapi/v1/infosimple").openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(12000);
                connection.setRequestProperty("Cookie", cookie); connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Referer", ROOT + "/");
                Matcher tokenCookie = Pattern.compile("(?:^|;\\s*)_token=([^;]*)").matcher(cookie);
                if (tokenCookie.find()) { String decoded = URLDecoder.decode(tokenCookie.group(1), StandardCharsets.UTF_8.name()); Matcher token = Pattern.compile("\\{i:\\d+;s:\\d+:\"_token\";i:\\d+;s:\\d+:\"(.+?)\";\\}").matcher(decoded); if (token.find()) connection.setRequestProperty("Authorization", "Bearer " + token.group(1)); }
                if (connection.getResponseCode() == 200) {
                    ByteArrayOutputStream data = new ByteArrayOutputStream();
                    try (InputStream stream = connection.getInputStream()) { byte[] buffer = new byte[4096]; int n; while ((n = stream.read(buffer)) != -1) { if (data.size() + n > 512 * 1024) throw new IllegalStateException(); data.write(buffer, 0, n); } }
                    JSONObject value = new JSONObject(data.toString(StandardCharsets.UTF_8.name())).optJSONObject("params");
                    if (value != null && accountId.equals(value.optString("id")) && username.equals(value.optString("account").trim())) result = "verified";
                    else result = "验证账号与当前账号不一致，未保存密码";
                }
            } catch (Exception ignored) { }
            finally { if (connection != null) connection.disconnect(); }
            String outcome = result; ui.post(() -> finish(outcome));
        });
    }
    void cancel() { finish("验证已取消，未保存密码"); }
    private void finish(String outcome) {
        if (finished) return; finished = true; ui.removeCallbacksAndMessages(null); worker.shutdownNow();
        try { if (view != null) { view.stopLoading(); ViewGroup parent = (ViewGroup)view.getParent(); if (parent != null) parent.removeView(view); view.destroy(); view = null; } }
        catch (Exception error) { outcome = "无法清理验证页面，未保存密码"; }
        cookies = null;
        String finalOutcome = outcome;
        // WebView destruction does not necessarily release its profile synchronously.
        // Never report a verified credential until removal has been confirmed.
        ui.post(() -> finishCleanup(finalOutcome));
    }
    private void finishCleanup(String outcome) {
        try { cleanupOwn(); done.accept(outcome); }
        catch (Exception error) {
            // Loaded profiles may remain in use for the lifetime of this process.
            // Keep the durable pending name; never claim verification or retry blindly.
            done.accept("无法清理隔离验证数据，未保存密码；请重启应用后重试");
        }
    }
}
