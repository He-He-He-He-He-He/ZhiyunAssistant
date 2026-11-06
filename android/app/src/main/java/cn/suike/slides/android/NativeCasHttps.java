package cn.suike.slides.android;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** Private HTTPS transport. No global CookieHandler, HTTP cache, WebView,
 * redirect following, proxy, authenticator, or logging.
 * Redirects are returned to the caller and MUST be checked using allowedRedirect. */
final class NativeCasHttps implements Closeable {
    private static final int BODY_LIMIT = 512 * 1024, HEADER_LIMIT = 32 * 1024;
    /** Stable app identity only: no device, platform build, account, or browser impersonation. */
    static final String USER_AGENT = "ZhiyunAssistant/0.1 (Android; NativeCAS)";
    private final NativeCasCookies jar;
    private final NativeVerificationGate postGate;
    interface Wire {
        Response exchange(NativeCasHttps owner,URI uri,String method,byte[] body) throws IOException;
        default void close() {}
    }
    private final Wire wire;
    private boolean postSpent;
    private volatile boolean cancelled;
    private volatile Socket socket;
    private NativeCasDiagnostics.Context diagnostics;
    synchronized void diagnostics(NativeCasDiagnostics.Context context) { diagnostics=context; }
    private void responseStatus(int code,boolean post) {
        if(diagnostics!=null) { diagnostics.http(code); if(post) diagnostics.postResponded(code); }
    }

    NativeCasHttps() { this(new NativeCasCookies(), null); }
    static NativeCasHttps anonymous(Wire wire) { return new NativeCasHttps(new NativeCasCookies(),null,wire); }
    private NativeCasHttps(NativeCasCookies jar, NativeVerificationGate gate) { this(jar,gate,null); }
    private NativeCasHttps(NativeCasCookies jar, NativeVerificationGate gate,Wire wire) { this.jar=jar; this.postGate=gate; this.wire=wire; }
    /** Native-only consent creates a capability, not permission to send immediately.
     * Only its gate's durable-reservation dispatch can consume the one POST. */
    static NativeCasHttps authorizedForOnePost(boolean explicitNativeAuthorization, NativeVerificationGate gate) throws IOException {
        return authorizedForOnePost(explicitNativeAuthorization,gate,null);
    }
    /** Offline injection point; all authorization and one-shot checks still run before it. */
    static NativeCasHttps authorizedForOnePost(boolean explicitNativeAuthorization,NativeVerificationGate gate,Wire wire) throws IOException {
        if(!explicitNativeAuthorization || gate==null) throw new IOException("native authorization required");
        return new NativeCasHttps(new NativeCasCookies(),gate,wire);
    }
    static NativeCasHttps officialValidation(NativeCasCookies candidate) { return new NativeCasHttps(candidate.officialCopy(),null); }
    static NativeCasHttps officialValidation(NativeCasCookies candidate,Wire wire) { return new NativeCasHttps(candidate.officialCopy(),null,wire); }
    synchronized NativeCasCookies officialCookies() throws IOException {
        if(cancelled) throw new IOException("session closed"); return jar.officialCopy();
    }
    static final class Response {
        final int status; final Map<String, List<String>> headers; final byte[] body;
        Response(int status, Map<String, List<String>> headers, byte[] body) { this.status = status; this.headers = headers; this.body = body; }
        String one(String name) throws IOException {
            List<String> v = headers.get(name.toLowerCase(Locale.ROOT));
            if (v == null || v.size() != 1) throw new IOException("missing or ambiguous header");
            return v.get(0);
        }
    }
    static URI checked(URI uri) throws IOException {
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)
            || !("zjuam.zju.edu.cn".equals(uri.getHost()) || "classroom.zju.edu.cn".equals(uri.getHost())
                || ("tgmedia.cmc.zju.edu.cn".equals(uri.getHost()) && "/index.php".equals(uri.getRawPath())))
            || uri.getRawPath() == null || !uri.getRawPath().startsWith("/") || uri.getRawPath().contains("\\") || uri.toASCIIString().length() > 8192)
            throw new IOException("untrusted destination");
        return uri;
    }
    static URI allowedRedirect(URI source, String location) throws IOException {
        if (location == null || location.length() > 8192) throw new IOException("invalid redirect");
        try { return checked(checked(source).resolve(location)); }
        catch (IllegalArgumentException bad) { throw new IOException("invalid redirect"); }
    }
    synchronized void receiveCookie(URI source, String header) throws IOException {
        synchronized(jar) {
            if (cancelled) throw new IOException("session closed");
            jar.receive(source, header);
        }
    }
    synchronized String cookieHeader(URI uri) throws IOException {
        if (cancelled) throw new IOException("session closed");
        return jar.header(uri);
    }
    /** Local request binding only. A second captcha check is still required; upstream
     * may demand a captcha/change its policy at POST time, in which case stop for manual login. */
    synchronized Object sessionBinding() throws IOException {
        if(cancelled) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.CANCELLED);
        try { return jar.casSessionBinding(); }
        catch(IOException unavailable) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.SESSION_UNAVAILABLE); }
    }
    /** Redirects are never followed automatically; CAS POST is a one-shot capability. */
    synchronized Response request(URI uri, String method, byte[] body) throws IOException {
        checked(uri);
        if (cancelled || !("GET".equals(method) || "POST".equals(method)) || ("GET".equals(method) && body != null)
                || ("POST".equals(method) && (!uri.getHost().equals("zjuam.zju.edu.cn") || !uri.getRawPath().equals("/cas/login") || body == null || body.length > 32768))) throw new IOException("request refused");
        if ("POST".equals(method)) {
            if(postGate==null || !postGate.isSubmittingHere() || postSpent || !NativeCasDiscovery.CAS_LOGIN.equals(uri))
                throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.POST,NativeCasDiagnostics.Category.AUTHORIZATION);
            sessionBinding(); postSpent=true; // Spent before socket creation, even on uncertain failure.
        }
        if(wire!=null) {
            if(diagnostics!=null && "POST".equals(method)) diagnostics.postStarted();
            Response response=wire.exchange(this,uri,method,body);
            if(response!=null) responseStatus(response.status,"POST".equals(method));
            return response;
        }
        Socket raw = new Socket(); socket = raw;
        try {
            if (cancelled) throw new IOException("cancelled");
            raw.connect(new InetSocketAddress(uri.getHost(), 443), 8000); raw.setSoTimeout(10000);
            SSLSocket tls = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, uri.getHost(), 443, true); socket = tls;
            SSLParameters p = tls.getSSLParameters(); p.setEndpointIdentificationAlgorithm("HTTPS"); tls.setSSLParameters(p); tls.startHandshake();
            if (cancelled) throw new IOException("cancelled");
            OutputStream out = tls.getOutputStream();
            writeRequest(out,uri,method,body);
            final long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
            InputStream in = new java.io.FilterInputStream(tls.getInputStream()) {
                private void timeout() throws IOException {
                    long remaining = deadline - System.nanoTime();
                    if (remaining <= 0) throw new java.net.SocketTimeoutException("response deadline exceeded");
                    tls.setSoTimeout((int)Math.max(1, Math.min(10000, java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(remaining))));
                }
                @Override public int read() throws IOException { timeout(); return in.read(); }
                @Override public int read(byte[] b, int off, int len) throws IOException { timeout(); return in.read(b, off, len); }
            };
            int[] budget = {HEADER_LIMIT}; String status = line(in, budget);
            if (!status.matches("HTTP/1\\.[01] [1-5][0-9][0-9]( .*)?")) throw new java.net.ProtocolException("invalid response");
            int code = Integer.parseInt(status.substring(9, 12)); responseStatus(code,"POST".equals(method));
            Map<String, List<String>> headers = new LinkedHashMap<>();
            while (true) { String l = line(in, budget); if (l.isEmpty()) break; int at = l.indexOf(':'); if (at <= 0 || !l.substring(0, at).matches("[A-Za-z0-9-]+")) throw new java.net.ProtocolException("invalid header"); headers.computeIfAbsent(l.substring(0, at).toLowerCase(Locale.ROOT), x -> new ArrayList<>()).add(l.substring(at + 1).trim()); }
            List<String> enc = headers.get("content-encoding"); if (enc != null && (enc.size() != 1 || !enc.get(0).equalsIgnoreCase("identity"))) throw new java.net.ProtocolException("compressed response refused");
            List<String> transfer = headers.get("transfer-encoding"), lengths = headers.get("content-length");
            if (transfer != null && lengths != null) throw new java.net.ProtocolException("ambiguous framing");
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            if (transfer != null) {
                if (transfer.size() != 1 || !transfer.get(0).equalsIgnoreCase("chunked")) throw new java.net.ProtocolException("unsupported framing");
                while (true) { String chunk = line(in, budget); if (!chunk.matches("[0-9A-Fa-f]{1,8}")) throw new java.net.ProtocolException("invalid chunk"); long size = Long.parseLong(chunk, 16); if (size > BODY_LIMIT - data.size()) throw new java.net.ProtocolException("response too large"); if (size == 0) { if (!line(in, budget).isEmpty()) throw new java.net.ProtocolException("trailers refused"); break; } copy(in, data, (int)size); if (!line(in, budget).isEmpty()) throw new java.net.ProtocolException("invalid chunk end"); }
            } else if (lengths != null) {
                if (lengths.size() != 1 || !lengths.get(0).matches("[0-9]{1,9}")) throw new java.net.ProtocolException("invalid length"); int length = Integer.parseInt(lengths.get(0)); if (length > BODY_LIMIT) throw new java.net.ProtocolException("response too large"); copy(in, data, length);
            } else { int b; while ((b = in.read()) != -1) { if (data.size() >= BODY_LIMIT) throw new java.net.ProtocolException("response too large"); data.write(b); } }
            List<String> cookies = headers.get("set-cookie"); if (cookies != null) for (String c : cookies) receiveCookie(uri, c);
            if (cancelled) throw new IOException("cancelled"); return new Response(code, headers, data.toByteArray());
        } finally { socket = null; try { raw.close(); } catch (IOException ignored) {} }
    }
    /** The actual production byte serializer, also exercised offline with an OutputStream.
     * This writes bytes only; request() remains the sole network/one-POST dispatch entry. */
    void writeRequest(OutputStream out, URI uri, String method, byte[] body) throws IOException {
        String target = uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
        String cookie = cookieHeader(uri);
        String bearer = "classroom.zju.edu.cn".equals(uri.getHost()) && "/userapi/v1/infosimple".equals(uri.getRawPath()) ? identityBearer(cookie) : "";
        String head = method + " " + target + " HTTP/1.1\r\nHost: " + uri.getHost() +
            "\r\nUser-Agent: " + USER_AGENT +
            "\r\nConnection: close\r\nCache-Control: no-store\r\nAccept-Encoding: identity\r\nAccept: */*\r\n" +
            (cookie.isEmpty() ? "" : "Cookie: " + cookie + "\r\n") +
            (bearer.isEmpty() ? "" : "Authorization: Bearer " + bearer + "\r\n") +
            (body == null ? "" : "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: " + body.length + "\r\n") + "\r\n";
        if(diagnostics!=null && "POST".equals(method)) diagnostics.postStarted();
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        if (body != null) out.write(body);
        out.flush();
    }
    /** Match only the existing classroom _token cookie format; never log its contents. */
    static String identityBearer(String cookie) throws IOException {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?:^|;\\s*)_token=([^;]*)").matcher(cookie);
        if (!m.find()) return "";
        final String raw = m.group(1);
        if (m.find()) throw new IOException("ambiguous identity cookie");
        final String decoded;
        try { decoded = java.net.URLDecoder.decode(raw, "UTF-8"); } catch (IllegalArgumentException bad) { throw new IOException("invalid identity token"); }
        java.util.regex.Matcher token = java.util.regex.Pattern.compile("\\{i:\\d+;s:\\d+:\"_token\";i:\\d+;s:(\\d+):\"([A-Za-z0-9._~+/=-]{1,4096})\";\\}").matcher(decoded);
        if (!token.find()) throw new IOException("invalid identity token");
        final String result = token.group(2);
        try { if (Integer.parseInt(token.group(1)) != result.length()) throw new IOException("invalid identity token"); }
        catch (NumberFormatException e) { throw new IOException("invalid identity token"); }
        if (token.find()) throw new IOException("ambiguous identity token");
        return result;
    }
    private static void copy(InputStream in, ByteArrayOutputStream out, int size) throws IOException { byte[] b = new byte[4096]; while (size > 0) { int n = in.read(b, 0, Math.min(size, b.length)); if (n < 0) throw new java.net.ProtocolException("truncated response"); if (n == 0) continue; out.write(b, 0, n); size -= n; } }
    private static String line(InputStream in, int[] budget) throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); while (true) { int c = in.read(); if (c < 0 || --budget[0] < 0) throw new java.net.ProtocolException("invalid headers"); if (c == '\r') { if (in.read() != '\n' || --budget[0] < 0) throw new java.net.ProtocolException("invalid line"); return b.toString(StandardCharsets.ISO_8859_1.name()); } if (c == '\n' || c == 0 || c < 0x20 && c != '\t') throw new java.net.ProtocolException("invalid line"); b.write(c); } }
    @Override public void close() {
        cancelled=true; Socket s=socket;
        if(s!=null) try { s.close(); } catch(IOException error) { if(diagnostics!=null) diagnostics.cleanup(error); }
        try { if(wire!=null) wire.close(); }
        catch(RuntimeException error) { if(diagnostics!=null) diagnostics.cleanup(error); }
        finally { jar.clear(); }
    }
}
