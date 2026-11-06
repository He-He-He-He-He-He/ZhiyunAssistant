package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Offline capability checks. No test opens a socket or submits real credentials. */
public class NativeCasDiagnosticReadinessTest {
    @Test public void anonymousTransportStaysGetOnlyEvenInsideAnotherGate() throws Exception {
        NativeVerificationGate gate = new NativeVerificationGate();
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        NativeCasHttps transport = new NativeCasHttps();
        try {
            assertTrue(gate.submit(() -> {
                try(NativeCasHttps authorized=NativeCasHttps.authorizedForOnePost(true,gate)) {
                    assertNotNull(authorized); // Constructing a native consent capability sends nothing.
                }
                assertThrows(IOException.class, () -> transport.request(NativeCasDiscovery.CAS_LOGIN, "POST", new byte[0]));
            }));
        } finally { transport.close(); }
    }

    @Test public void httpCallbackStopsAfterSingleSyntheticPost() throws Exception {
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake();
        fake.afterPost = "http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic";
        NativeCasPrototype prototype = new NativeCasPrototype(fake, new NativeVerificationGate());
        AtomicInteger published = new AtomicInteger();
        assertThrows(IOException.class, () -> prototype.run(true, "synthetic-user", "synthetic-secret", "synthetic-id", () -> fake.reserved = true, published::incrementAndGet));
        assertEquals(1, fake.posts.get()); assertEquals(0, published.get()); assertTrue(fake.closed);
        assertThrows(IOException.class, () -> prototype.run(true, "synthetic-user", "synthetic-secret", "synthetic-id", () -> fail(), () -> fail()));
        assertEquals(1, fake.posts.get());
    }

    @Test public void offlineMockRejectsChangedCaptchaSessionBinding() throws Exception {
        // Both statuses are false, but the second arrives under a different session.
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake();
        AtomicInteger captchaChecks = new AtomicInteger();
        AtomicInteger sessionGeneration = new AtomicInteger(1);
        NativeCasPrototype.Transport changing = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; }
            public Object sessionBinding() { return sessionGeneration.get(); }
            public void close() { fake.close(); }
            public NativeCasHttps.Response post(URI uri, byte[] body) throws IOException { return fake.post(uri, body); }
            public NativeCasHttps.Response get(URI uri) throws IOException {
                if (uri.getPath().endsWith("getKaptchaStatus") && captchaChecks.incrementAndGet() == 2) sessionGeneration.set(2);
                return fake.get(uri);
            }
        };
        AtomicInteger published = new AtomicInteger();
        assertThrows(IOException.class, () -> new NativeCasPrototype(changing, new NativeVerificationGate()).run(true, "synthetic-user", "synthetic-secret", "synthetic-id", () -> fake.reserved = true, published::incrementAndGet));
        assertEquals(2, sessionGeneration.get()); assertEquals(0, fake.posts.get()); assertEquals(0, published.get()); assertTrue(fake.closed);
    }

    @Test public void sessionCookieSnapshotsFailClosedOnMutationsAndScope() throws Exception {
        URI source = URI.create("https://zjuam.zju.edu.cn/cas/login");
        java.util.concurrent.atomic.AtomicLong clock = new java.util.concurrent.atomic.AtomicLong(1000);
        NativeCasCookies jar = new NativeCasCookies(clock::get);
        assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        jar.receive(source,"SESSION=synthetic; Path=/cas; Secure; Max-Age=3");
        Object original = jar.sessionSnapshot("SESSION"); assertEquals(original, jar.sessionSnapshot("SESSION"));
        jar.receive(source,"SESSION=other; Path=/cas; Secure"); assertNotEquals(original,jar.sessionSnapshot("SESSION"));
        Object changed=jar.sessionSnapshot("SESSION"); jar.clear();
        assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        jar.receive(source,"SESSION=other; Path=/cas; Secure"); assertNotEquals(changed, jar.sessionSnapshot("SESSION"));
        jar.receive(source,"SESSION=shadow; Domain=zju.edu.cn; Path=/cas; Secure");
        assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        jar.clear(); jar.receive(source,"SESSION=synthetic; Path=/cas/login; Secure");
        assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        jar.clear(); jar.receive(source,"SESSION=synthetic; Path=/cas");
        assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        jar.clear(); jar.receive(source,"SESSION=synthetic; Path=/cas; Secure; Max-Age=1");
        clock.addAndGet(1000); assertThrows(IOException.class, () -> jar.sessionSnapshot("SESSION"));
        NativeCasCookies other=new NativeCasCookies(); other.receive(source,"SESSION=synthetic; Path=/cas; Secure");
        assertNotEquals(original, other.sessionSnapshot("SESSION"));
    }
    @Test public void httpsOnlyCasBindingPinsObservedHostOnlyScopeNotServerCaptchaPolicy() throws Exception {
        NativeCasHttps transport = new NativeCasHttps();
        try {
            URI authorize=NativeCasDiscovery.AUTHORIZE, login=NativeCasDiscovery.CAS_LOGIN;
            transport.receiveCookie(authorize,"JSESSIONID=synthetic; Path=/cas; HttpOnly");
            assertTrue(transport.cookieHeader(login).contains("JSESSIONID=synthetic"));
            Object binding=transport.sessionBinding();
            NativeCasCookies jar = new NativeCasCookies();
            jar.receive(authorize,"JSESSIONID=synthetic; Path=/cas; HttpOnly");
            assertThrows(IOException.class, () -> jar.sessionSnapshot("JSESSIONID"));
            jar.receive(login,"_csrf=synthetic; Domain=zju.edu.cn; Path=/");
            jar.receive(URI.create("https://zjuam.zju.edu.cn/cas/v2/getPubKey"),"_pv0=synthetic; Domain=zju.edu.cn; Path=/");
            assertThrows(IOException.class, () -> jar.sessionSnapshot("JSESSIONID"));
            assertEquals(binding,transport.sessionBinding());
        } finally { transport.close(); }
    }
    @Test public void newNonSessionCookiesInvalidateStrictSnapshot() throws Exception {
        NativeCasCookies jar = new NativeCasCookies(); URI cas=NativeCasDiscovery.CAS_LOGIN;
        jar.receive(cas,"JSESSIONID=synthetic; Path=/cas; Secure"); Object before=jar.sessionSnapshot("JSESSIONID");
        jar.receive(cas,"_csrf=synthetic; Domain=zju.edu.cn; Path=/");
        assertNotEquals(before, jar.sessionSnapshot("JSESSIONID"));
    }
    @Test public void changedFormKeyAndCaptchaSessionsStopBeforePost() {
        for (String changed : new String[]{"/cas/login", "/cas/v2/getPubKey", "/cas/v2/getKaptchaStatus"}) {
            NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake(); AtomicInteger generation = new AtomicInteger(1);
            NativeCasPrototype.Transport changing = new NativeCasPrototype.Transport() {
                public boolean fresh() { return true; }
                public Object sessionBinding() { return generation.get(); }
                public void close() { fake.close(); }
                public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return fake.post(u,b); }
                public NativeCasHttps.Response get(URI u) throws IOException {
                    NativeCasHttps.Response r=fake.get(u);
                    if (u.getPath().equals(changed)) generation.incrementAndGet();
                    return r;
                }
            };
            assertThrows(IOException.class, () -> new NativeCasPrototype(changing,new NativeVerificationGate()).run(true,"synthetic-user","synthetic-secret","synthetic-id",()->fake.reserved=true,()->fail()));
            assertEquals(0,fake.posts.get()); assertFalse(fake.reserved); assertTrue(fake.closed);
        }
    }
    @Test public void recreatedIdenticalCookieFailsBeforeSubmission() throws Exception {
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake(); NativeCasCookies jar = new NativeCasCookies();
        URI login=NativeCasDiscovery.CAS_LOGIN; String cookie="SESSION=synthetic; Path=/cas; Secure";
        jar.receive(login,cookie); AtomicInteger checks=new AtomicInteger();
        NativeCasPrototype.Transport changing = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; } public void close() { jar.clear(); fake.close(); }
            public Object sessionBinding() throws IOException { return jar.sessionSnapshot("SESSION"); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return fake.post(u,b); }
            public NativeCasHttps.Response get(URI u) throws IOException {
                NativeCasHttps.Response r=fake.get(u);
                if (u.getPath().endsWith("getKaptchaStatus") && checks.incrementAndGet()==2) { jar.clear(); jar.receive(login,cookie); }
                return r;
            }
        };
        assertThrows(IOException.class, () -> new NativeCasPrototype(changing,new NativeVerificationGate()).run(true,"synthetic-user","synthetic-secret","synthetic-id",()->fake.reserved=true,()->fail()));
        assertTrue(fake.reserved); assertEquals(0,fake.posts.get()); assertTrue(fake.closed);
    }
    @Test public void sessionChangeDuringReservationStopsBeforeNextRequest() throws Exception {
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake(); NativeCasCookies jar = new NativeCasCookies();
        URI login=NativeCasDiscovery.CAS_LOGIN; jar.receive(login,"SESSION=synthetic; Path=/cas; Secure");
        NativeCasPrototype.Transport transport = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; } public void close() { jar.clear(); fake.close(); }
            public Object sessionBinding() throws IOException { return jar.sessionSnapshot("SESSION"); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return fake.post(u,b); }
            public NativeCasHttps.Response get(URI u) throws IOException { return fake.get(u); }
        };
        assertThrows(IOException.class, () -> new NativeCasPrototype(transport,new NativeVerificationGate()).run(true,"synthetic-user","synthetic-secret","synthetic-id",()->{ fake.reserved=true; jar.clear(); },()->fail()));
        assertTrue(fake.reserved); assertEquals(0,fake.posts.get()); assertEquals(5,fake.gets.size());
    }
    @Test public void absentSessionEvidenceStopsBeforeFormRequest() {
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake();
        NativeCasPrototype.Transport unproven = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; } public void close() { fake.close(); }
            public NativeCasHttps.Response get(URI u) throws IOException { return fake.get(u); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return fake.post(u,b); }
        };
        assertThrows(IOException.class, () -> new NativeCasPrototype(unproven,new NativeVerificationGate()).run(true,"synthetic-user","synthetic-secret","synthetic-id",()->fail(),()->fail()));
        assertEquals(2,fake.gets.size()); assertEquals(0,fake.posts.get());
    }
    @Test public void syntheticIdentityMismatchNeverPublishes() {
        NativeCasPrototypeTest.Fake fake = new NativeCasPrototypeTest.Fake();
        fake.identity = "{\"params\":{\"id\":\"different-id\",\"account\":\"synthetic-user\"}}";
        AtomicInteger published = new AtomicInteger();
        assertThrows(IOException.class, () -> new NativeCasPrototype(fake, new NativeVerificationGate()).run(true, "synthetic-user", "synthetic-secret", "synthetic-id", () -> fake.reserved = true, published::incrementAndGet));
        assertEquals(1, fake.posts.get()); assertEquals(0, published.get()); assertTrue(fake.closed);
    }
}
