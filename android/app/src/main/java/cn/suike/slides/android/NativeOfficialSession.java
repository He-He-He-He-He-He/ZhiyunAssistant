package cn.suike.slides.android;

import java.io.IOException;
import java.net.URI;

/** Official API session adapter. CAS SSO cookies never enter WebView/global cookies.
 * A staged memory-only jar is rechecked at infosimple before atomic adoption. Ordinary
 * NativeIO API/media requests and cookies.get use this jar once adopted. No queued
 * CookieManager writes can outlive logout or contaminate a subsequent manual account. */
final class NativeOfficialSession implements NativeCasLogin.Sessions {
    static final URI ROOT=URI.create("https://classroom.zju.edu.cn/");
    static final URI INFO=ROOT.resolve("userapi/v1/infosimple");
    interface Validator { NativeCasHttps open(NativeCasCookies candidate); }
    private final Validator validators;
    NativeOfficialSession() { this(NativeCasHttps::officialValidation); }
    NativeOfficialSession(Validator validators) { this.validators=validators; }
    private NativeCasCookies jar;
    private long version;
    private final java.util.concurrent.atomic.AtomicReference<NativeCasHttps> validating=new java.util.concurrent.atomic.AtomicReference<>();
    @Override public NativeCasCookies verify(NativeCasCookies candidate, String id, String user,NativeCasPrototype.Reserve current) throws IOException {
        return verify(candidate,id,user,current,null);
    }
    @Override public NativeCasCookies verify(NativeCasCookies candidate, String id, String user,NativeCasPrototype.Reserve current,NativeCasDiagnostics.Context report) throws IOException {
        try(NativeCasHttps validator=validators.open(candidate)) {
            validator.diagnostics(report);
            validating.set(validator);
            try {
                try { current.reserve(); } catch(Exception cancelled) { throw NativeCasDiagnostics.typed(cancelled,NativeCasDiagnostics.Stage.OFFICIAL_VERIFY); }
                NativeCasHttps.Response response=validator.request(INFO,"GET",null);
                if(response.status!=200)
                    throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY,NativeCasDiagnostics.Category.HTTP_STATUS,response.status);
                try {
                    if(!NativeCasIdentity.matches(response.body,id,user)) throw new IOException("identity mismatch");
                } catch(IOException rejected) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY,NativeCasDiagnostics.Category.IDENTITY_MISMATCH); }
                return validator.officialCookies();
            } finally { validating.compareAndSet(validator,null); }
        }
    }
    @Override public void cancelVerification() { NativeCasHttps current=validating.getAndSet(null); if(current!=null) current.close(); }
    @Override public synchronized void commit(NativeCasCookies verified) {
        if(jar!=null) jar.clear();
        jar=verified.officialCopy(); version++;
    }
    @Override public synchronized void clear() { if(jar!=null) jar.clear(); jar=null; version++; }
    synchronized long clearIfVersion(long expected) throws IOException {
        if(expected!=version) throw new IOException("session cleanup invalidated");
        clear(); return version;
    }
    synchronized boolean active() { return jar!=null; }
    synchronized long version() { return version; }
    synchronized boolean owns(URI uri) { return jar!=null && NativeCasCookies.officialHost(uri); }
    synchronized String header(URI uri) throws IOException { return owns(uri)?jar.header(uri):null; }
    synchronized String bearer(URI uri) throws IOException { return owns(uri)?NativeCasHttps.identityBearer(jar.header(ROOT)):null; }
    synchronized boolean receiveIfVersion(URI uri,String cookie,long expected) throws IOException {
        if(expected!=version) throw new IOException("late session response");
        if(!owns(uri)) return false;
        jar.receive(uri,cookie); return true;
    }
}
