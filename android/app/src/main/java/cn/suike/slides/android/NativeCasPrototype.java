package cn.suike.slides.android;

import java.io.Closeable;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/** One-shot native protocol. Credentials and cookies remain inside trusted native callers.
 * Only trusted native callers may provide transport, durable reservation and publication.
 * A fake transport can exercise it offline; no claim that actual success redirects match.
 * Strings in Java cannot be reliably zeroed; do not log, persist or retain this object.
 */
final class NativeCasPrototype implements Closeable {
    interface Transport extends Closeable {
        NativeCasHttps.Response get(URI uri) throws IOException;
        NativeCasHttps.Response post(URI uri, byte[] body) throws IOException;
        /** Positive guarantee: a newly created private session, no inherited credentials. */
        boolean fresh();
        /** Opaque, stable proof from the private session, including a mutation generation.
         * A transport without an established, verified policy must refuse. Test fakes may
         * model a policy but cannot establish the real CAS server's semantics. */
        default Object sessionBinding() throws IOException { throw new IOException("CAS session continuity unproven"); }
        default NativeCasCookies officialCookies() throws IOException { throw new IOException("official session unavailable"); }
        default void diagnostics(NativeCasDiagnostics.Context context) {}
        default boolean tracksPostState() { return false; }
    }
    /** Caller must serialize against logout and durably spend one attempt before return. */
    interface Reserve { void reserve() throws Exception; }
    /** Synchronous publication under the shared gate, never enqueue an asynchronous effect. */
    interface Publish { void publish() throws Exception; }
    private final Transport transport; private final NativeVerificationGate gate;
    private final NativeCasDiagnostics.Context diagnostics;
    private final AtomicBoolean used = new AtomicBoolean(), cancelled = new AtomicBoolean();
    private Object binding; private boolean guardSession;
    private static final URI INFO = URI.create("https://classroom.zju.edu.cn/userapi/v1/infosimple");
    NativeCasPrototype(Transport transport, NativeVerificationGate gate) {
        this(transport,gate,new NativeCasDiagnostics().begin(NativeCasDiagnostics.Kind.ENROLLMENT));
    }
    NativeCasPrototype(Transport transport, NativeVerificationGate gate,NativeCasDiagnostics.Context diagnostics) {
        this.transport=transport; this.gate=gate; this.diagnostics=diagnostics;
        if(gate!=null) gate.diagnostics(diagnostics);
        if(transport!=null) transport.diagnostics(diagnostics);
    }

    /** Native consent capability; actual dispatch still requires this gate's reservation. */
    static Transport newExplicitlyAuthorizedTransport(boolean explicitConsent, NativeVerificationGate gate) throws IOException {
        return transport(NativeCasHttps.authorizedForOnePost(explicitConsent, gate));
    }
    /** Identical production raw TLS/parser/session jar, but without ANY POST capability. */
    static Transport newAnonymousTransport() { return newAnonymousTransport(null); }
    static Transport newAnonymousTransport(NativeCasHttps.Wire wire) { return transport(NativeCasHttps.anonymous(wire)); }
    private static Transport transport(NativeCasHttps https) {
        return new Transport() {
            public NativeCasHttps.Response get(URI u) throws IOException { return https.request(u, "GET", null); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return https.request(u, "POST", b); }
            public boolean fresh() { return true; }
            public Object sessionBinding() throws IOException { return https.sessionBinding(); }
            public NativeCasCookies officialCookies() throws IOException { return https.officialCookies(); }
            public void diagnostics(NativeCasDiagnostics.Context context) { https.diagnostics(context); }
            public boolean tracksPostState() { return true; }
            public void close() { https.close(); }
        };
    }
    boolean preflight() throws IOException {
        if(!used.compareAndSet(false,true)) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.AUTHORIZATION);
        try {
            prepare();
            NativeCasPreflight.requireCaptchaClear(this::get,diagnostics);
            verifyBinding(); check();
            diagnostics.success(); return true;
        } catch(Exception error) {
            NativeCasDiagnostics.Failure safe=NativeCasDiagnostics.typed(error,diagnostics.currentStage());
            diagnostics.fail(safe); throw safe;
        } finally { close(); }
    }
    private NativeCasPreflight.Prepared prepare() throws IOException {
        diagnostics.stage(NativeCasDiagnostics.Stage.SESSION);
        check(); if(!transport.fresh()) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.NOT_FRESH);
        return NativeCasDiscovery.fetch(this::get,diagnostics);
    }
    boolean run(boolean consent, String username, String password, String expectedId, Reserve reserve, Publish publish) throws IOException {
        if (!used.compareAndSet(false, true)) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.CONSENT,NativeCasDiagnostics.Category.AUTHORIZATION);
        if (!consent || transport == null || gate == null || reserve == null || publish == null || !valid(username, 128) || !valid(expectedId, 256) || password == null || password.isEmpty() || password.length() > 1024) {
            NativeCasDiagnostics.Failure refused=NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.CONSENT,
                !consent?NativeCasDiagnostics.Category.CONSENT_REQUIRED:NativeCasDiagnostics.Category.INVALID_ARGUMENT);
            diagnostics.fail(refused); close(); throw refused;
        }
        try {
            NativeCasPreflight.Prepared p = prepare();
            diagnostics.stage(NativeCasDiagnostics.Stage.KEY);
            check(); String encrypted = NativeCasRsa.encrypt(password, p.modulus, p.exponent);
            String form = field("username", username) + "&" + field("password", encrypted) + "&" + field("authcode", "") + "&" + field("execution", p.execution) + "&" + field("_eventId", "submit") + (p.ys == null ? "" : "&" + field("ys", p.ys));
            byte[] body = form.getBytes(StandardCharsets.UTF_8);
            try {
                diagnostics.stage(NativeCasDiagnostics.Stage.RESERVE);
                if (!gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, reserve::reserve))
                    throw gate.failure(NativeCasDiagnostics.Stage.RESERVE,NativeCasDiagnostics.Category.RESERVATION_UNAVAILABLE);
                check(); NativeCasPreflight.requireCaptchaClear(this::get,diagnostics); check();
                final NativeCasHttps.Response[] sent = new NativeCasHttps.Response[1];
                diagnostics.stage(NativeCasDiagnostics.Stage.POST);
                if (!gate.submit(() -> {
                    check(); verifyBinding();
                    if(!transport.tracksPostState()) diagnostics.postStarted();
                    sent[0] = transport.post(NativeCasDiscovery.CAS_LOGIN, body);
                    if(sent[0]!=null) diagnostics.postResponded(sent[0].status);
                })) throw gate.failure(NativeCasDiagnostics.Stage.POST,NativeCasDiagnostics.Category.AUTHORIZATION);
                guardSession = false; binding = null;
                // Reject the POST response before entering callback validation. A server
                // error is a POST-stage failure, not evidence that any callback was visited.
                check();
                if(sent[0]==null || (sent[0].status!=302 && sent[0].status!=303))
                    throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.POST,
                        NativeCasDiagnostics.Category.HTTP_STATUS,sent[0]==null?0:sent[0].status);
                diagnostics.stage(NativeCasDiagnostics.Stage.CALLBACK); if(sent[0]!=null) diagnostics.http(sent[0].status);
                check(); URI callback = redirect(sent[0], NativeCasDiscovery.CAS_LOGIN); requireCallback(callback);
                NativeCasHttps.Response callbackResponse=get(callback);
                requireRedirectStatus(callbackResponse);
                diagnostics.stage(NativeCasDiagnostics.Stage.OAUTH); diagnostics.http(callbackResponse.status);
                URI oauth = redirect(callbackResponse, callback);
                requireExchange(oauth);
                NativeCasHttps.Response oauthResponse=get(oauth);
                requireRedirectStatus(oauthResponse);
                diagnostics.stage(NativeCasDiagnostics.Stage.LANDING); diagnostics.http(oauthResponse.status);
                URI home = redirect(oauthResponse, oauth);
                NativeCasRedirects.requireLanding(home);
                NativeCasHttps.Response landing = get(home); if (landing.status != 200) throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.LANDING,NativeCasDiagnostics.Category.HTTP_STATUS,landing.status);
                diagnostics.stage(NativeCasDiagnostics.Stage.IDENTITY);
                NativeCasHttps.Response identity = get(INFO);
                if(identity.status!=200) throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.IDENTITY,NativeCasDiagnostics.Category.HTTP_STATUS,identity.status);
                try {
                    if(!NativeCasIdentity.matches(identity.body,expectedId,username)) throw new IOException("identity mismatch");
                } catch(IOException rejected) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.IDENTITY,NativeCasDiagnostics.Category.IDENTITY_MISMATCH); }
                check(); if (!gate.publish(true, () -> { check(); publish.publish(); }))
                    throw gate.failure(NativeCasDiagnostics.Stage.COMMIT,NativeCasDiagnostics.Category.AUTHORIZATION);
                return true;
            } finally { Arrays.fill(body, (byte)0); }
        } catch (Exception e) {
            NativeCasDiagnostics.Failure safe=NativeCasDiagnostics.typed(e,diagnostics.currentStage());
            diagnostics.fail(safe); throw safe;
        }
        finally { close(); }
    }
    private static boolean valid(String s, int max) { return s != null && !s.isEmpty() && s.length() <= max && s.equals(s.trim()) && s.indexOf('\0') < 0; }
    private static String field(String key, String value) throws IOException { return key + "=" + URLEncoder.encode(value, "UTF-8"); }
    private NativeCasHttps.Response get(URI uri) throws IOException {
        check(); diagnostics.http(0); NativeCasHttps.checked(uri);
        // Capture before requesting the form: a cookie created only by that response
        // cannot prove which server session generated the form.
        if (NativeCasDiscovery.CAS_LOGIN.equals(uri)) {
            try { binding = transport.sessionBinding(); }
            catch(IOException unavailable) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.SESSION_UNAVAILABLE); }
            if (binding == null) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.SESSION_UNAVAILABLE);
            guardSession = true;
        }
        if (guardSession) verifyBinding();
        NativeCasHttps.Response r = transport.get(uri);
        if(r!=null) diagnostics.http(r.status);
        check(); if (guardSession) verifyBinding();
        if (r == null || r.body == null || r.body.length > 512 * 1024) throw new IOException("invalid response"); return r;
    }
    private void verifyBinding() throws IOException {
        Object current;
        try { current = transport.sessionBinding(); }
        catch(IOException unavailable) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.SESSION_UNAVAILABLE); }
        if (binding == null || current == null || !binding.equals(current)) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.SESSION_CHANGED);
    }
    private void check() throws IOException { if (cancelled.get()) throw NativeCasDiagnostics.failure(diagnostics.currentStage(),NativeCasDiagnostics.Category.CANCELLED); }
    private void requireRedirectStatus(NativeCasHttps.Response r) throws IOException {
        if (r == null || (r.status != 302 && r.status != 303))
            throw new NativeCasDiagnostics.Failure(diagnostics.currentStage(),NativeCasDiagnostics.Category.HTTP_STATUS,r==null?0:r.status);
    }
    private URI redirect(NativeCasHttps.Response r, URI from) throws IOException {
        requireRedirectStatus(r);
        final String location;
        try { location=r.one("location"); }
        catch(IOException rejected) { throw NativeCasDiagnostics.failure(diagnostics.currentStage(),NativeCasDiagnostics.Category.REDIRECT_LOCATION); }
        return NativeCasRedirects.resolve(from,location,diagnostics.currentStage());
    }
    private static void requireCallback(URI u) throws IOException {
        NativeCasRedirects.requireCallback(u);
    }
    private static void requireExchange(URI u) throws IOException {
        NativeCasRedirects.requireExchange(u);
    }
    @Override public void close() { cancelled.set(true); if (transport != null) try { transport.close(); } catch (Exception error) { diagnostics.cleanup(error); } if (gate != null) gate.cancel(); binding = null; guardSession = false; }
}
