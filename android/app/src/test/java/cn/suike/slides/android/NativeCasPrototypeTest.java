package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeCasPrototypeTest {
    static final URI CALLBACK = URI.create("https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic");
    static final URI EXCHANGE = URI.create("https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&code=synthetic");
    static final String FORM = "<form id='fm1' action='/cas/login?" + NativeCasDiscovery.CAS_LOGIN.getRawQuery() + "' method='post'><input type='hidden' name='execution' value='dynamic-token'><input type='hidden' name='_eventId' value='submit'></form>";
    static final String KEY = "{\"modulus\":\"" + "d".repeat(128) + "\",\"exponent\":\"10001\"}";
    static NativeCasHttps.Response ok(String s) { return new NativeCasHttps.Response(200, Collections.emptyMap(), s.getBytes(StandardCharsets.UTF_8)); }
    static NativeCasHttps.Response redirect(String location) { return new NativeCasHttps.Response(302, Collections.singletonMap("location", Collections.singletonList(location)), new byte[0]); }
    static final class Fake implements NativeCasPrototype.Transport {
        final List<URI> gets = new ArrayList<>(); AtomicInteger posts = new AtomicInteger(); boolean fresh = true, reserved, closed, failPost;
        String captcha = "false", identity = "{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\"}}", afterPost = CALLBACK.toString(), exchange = EXCHANGE.toString(), home = "https://classroom.zju.edu.cn/";
        String body; byte[] sentBuffer; int postStatus = 302;
        final Object syntheticBinding = new Object();
        public boolean fresh() { return fresh; }
        public Object sessionBinding() { return syntheticBinding; }
        public void close() { closed = true; }
        public NativeCasHttps.Response post(URI uri, byte[] b) throws IOException {
            assertEquals(NativeCasDiscovery.CAS_LOGIN, uri); assertTrue(reserved); assertEquals(1, posts.incrementAndGet());
            sentBuffer = b; body = new String(b, StandardCharsets.UTF_8); if (failPost) throw new IOException("unknown"); return postStatus == 302 ? redirect(afterPost) : new NativeCasHttps.Response(postStatus, Collections.emptyMap(), new byte[0]);
        }
        public NativeCasHttps.Response get(URI u) throws IOException {
            gets.add(u);
            if (u.equals(NativeCasDiscovery.ENTRY)) return redirect(NativeCasDiscovery.AUTHORIZE.toString());
            if (u.equals(NativeCasDiscovery.AUTHORIZE)) return redirect(NativeCasDiscovery.CAS_LOGIN.toString());
            if (u.equals(NativeCasDiscovery.CAS_LOGIN)) return ok(FORM);
            if (u.getPath().endsWith("getPubKey")) return ok(KEY);
            if (u.getPath().endsWith("getKaptchaStatus")) return ok(captcha);
            if (u.equals(NativeCasDiscovery.CAS_LOGIN.resolve(afterPost))) return redirect(exchange);
            if (u.equals(URI.create(exchange))) return redirect(home);
            if (u.toString().equals("https://classroom.zju.edu.cn/")) return ok("synthetic landing");
            if (u.toString().equals("https://classroom.zju.edu.cn/userapi/v1/infosimple")) return ok(identity);
            throw new IOException("unexpected synthetic request");
        }
    }
    private static boolean run(Fake f, NativeCasPrototype p, AtomicInteger published) throws Exception {
        return p.run(true, "synthetic-user", "synthetic-secret", "synthetic-id", () -> f.reserved = true, published::incrementAndGet);
    }
    @Test public void fullSyntheticFlowBuildsOfficialEncryptedFormAndVerifiesInfosimple() throws Exception {
        Fake f = new Fake(); AtomicInteger published = new AtomicInteger(); NativeCasPrototype p = new NativeCasPrototype(f, new NativeVerificationGate());
        assertTrue(run(f,p,published)); assertTrue(f.closed); assertEquals(1,published.get()); assertEquals(1,f.posts.get()); assertEquals(10,f.gets.size());
        Map<String,String> fields = new HashMap<>(); for (String part : f.body.split("&")) { String[] pair = part.split("=",2); fields.put(pair[0], URLDecoder.decode(pair[1], "UTF-8")); }
        assertEquals("synthetic-user",fields.get("username")); assertEquals("dynamic-token",fields.get("execution")); assertEquals("submit",fields.get("_eventId")); assertEquals("",fields.get("authcode"));
        assertEquals(NativeCasRsa.encrypt("synthetic-secret", "d".repeat(128), "10001"),fields.get("password"));
        for (byte b : f.sentBuffer) assertEquals(0,b);
        assertThrows(IOException.class, () -> run(f,p,published));
    }
    @Test public void captchaConsentReservationAndFreshSessionPreventPost() {
        for (String captcha : new String[]{"true", "unknown", ""}) {
            Fake f = new Fake(); f.captcha = captcha; NativeCasPrototype p = new NativeCasPrototype(f,new NativeVerificationGate());
            assertThrows(IOException.class, () -> run(f,p,new AtomicInteger())); assertEquals(0,f.posts.get()); assertFalse(f.reserved);
        }
        Fake f = new Fake(); f.fresh=false; NativeCasPrototype p = new NativeCasPrototype(f,new NativeVerificationGate());
        assertThrows(IOException.class, () -> run(f,p,new AtomicInteger())); assertEquals(0,f.posts.get());
        Fake consent = new Fake(); NativeCasPrototype q = new NativeCasPrototype(consent,new NativeVerificationGate());
        assertThrows(IOException.class, () -> q.run(false,"synthetic-user","synthetic-secret","synthetic-id",()->fail(),()->fail())); assertEquals(0,consent.gets.size()); assertEquals(0,consent.posts.get());
        Fake reserve = new Fake(); NativeCasPrototype r = new NativeCasPrototype(reserve,new NativeVerificationGate());
        assertThrows(IOException.class, () -> r.run(true,"synthetic-user","synthetic-secret","synthetic-id",()->{throw new IOException();},()->fail())); assertEquals(0,reserve.posts.get());
    }
    @Test public void unsafeRedirectsAndIdentityProblemsNeverPublish() {
        for (String target : new String[]{"http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic", "https://attacker.invalid/?ticket=ST-synthetic", "https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic&ticket=ST-other", "https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=bad"}) {
            Fake f = new Fake(); f.afterPost=target; AtomicInteger n = new AtomicInteger(); assertThrows(IOException.class, () -> run(f,new NativeCasPrototype(f,new NativeVerificationGate()),n)); assertEquals(0,n.get()); assertEquals(1,f.posts.get()); assertEquals(6,f.gets.size());
        }
        for (String identity : new String[]{"{\"params\":{\"id\":\"other\",\"account\":\"synthetic-user\"}}", "{\"params\":{\"id\":\"synthetic-id\",\"account\":\"other\"}}", "{\"params\":{\"id\":\"synthetic-id\",\"id\":\"synthetic-id\",\"account\":\"synthetic-user\"}}", "not-json"}) {
            Fake f = new Fake(); f.identity=identity; AtomicInteger n = new AtomicInteger(); assertThrows(IOException.class, () -> run(f,new NativeCasPrototype(f,new NativeVerificationGate()),n)); assertEquals(0,n.get()); assertTrue(f.closed);
        }
    }
    @Test public void callbackParsingIsStrictForSyntheticRedirects() throws Exception {
        java.lang.reflect.Method callback=NativeCasPrototype.class.getDeclaredMethod("requireCallback", URI.class);
        callback.setAccessible(true);
        URI source=NativeCasDiscovery.CAS_LOGIN;
        for(String target:new String[]{"/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic_A-1", "/cas/oauth2.0/callbackAuthorize?ticket=ST-%73ynthetic", "/cas/oauth2.0/callbackAuthorize?ticket=ST-a+b"})
            callback.invoke(null,NativeCasHttps.allowedRedirect(source,target));
        for(String target:new String[]{"/cas/oauth2.0/%63allbackAuthorize?ticket=ST-synthetic", "/cas/oauth2.0/callbackAuthorize?ticket=ST-a&%74icket=ST-b", "/cas/oauth2.0/callbackAuthorize?ticket=ST-a&extra=x", "/cas/oauth2.0/callbackAuthorize?ticket=ST-%FF"}) {
            java.lang.reflect.InvocationTargetException failure=assertThrows(java.lang.reflect.InvocationTargetException.class,()->callback.invoke(null,NativeCasHttps.allowedRedirect(source,target)));
            assertTrue(failure.getCause() instanceof IOException);
        }
        assertThrows(IOException.class,()->NativeCasHttps.allowedRedirect(source,"/cas/oauth2.0/callbackAuthorize?ticket=%ZZ"));
        assertThrows(IOException.class,()->NativeCasHttps.allowedRedirect(source,"http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-synthetic"));
    }
    @Test public void opaqueTicketAndCodeAreForwardedWithOriginalRawQueryInFullFlow() throws Exception {
        for (String suffix : NativeCasRedirectsTest.OPAQUE) {
            Fake f = new Fake();
            f.afterPost = NativeCasRedirectsTest.CALLBACK + "ticket=ST-" + suffix;
            f.exchange = NativeCasRedirectsTest.EXCHANGE + "code=" + suffix;
            AtomicInteger published = new AtomicInteger();
            assertTrue(run(f, new NativeCasPrototype(f, new NativeVerificationGate()), published));
            assertEquals(f.afterPost, f.gets.get(6).toString());
            assertEquals(f.exchange, f.gets.get(7).toString());
            assertEquals(1, f.posts.get()); assertEquals(1, published.get());
        }
    }
    @Test public void malformedOpaqueRedirectsStopBeforeFollowingAndNeverRetry() {
        for (boolean callback : new boolean[]{true, false}) {
            for (String raw : new String[]{"synthetic%00", "synthetic%FF", "synthetic%C0%AF", "synthetic%0D%0A", "x".repeat(1025)}) {
                Fake f = new Fake();
                if (callback) f.afterPost = NativeCasRedirectsTest.CALLBACK + "ticket=ST-" + raw;
                else f.exchange = NativeCasRedirectsTest.EXCHANGE + "code=" + raw;
                AtomicInteger published = new AtomicInteger();
                NativeCasPrototype p = new NativeCasPrototype(f, new NativeVerificationGate());
                assertThrows(IOException.class, () -> run(f, p, published));
                assertEquals(callback ? 6 : 7, f.gets.size());
                assertThrows(IOException.class, () -> run(f, p, published));
                assertEquals(1, f.posts.get()); assertEquals(0, published.get());
            }
        }
    }
    @Test public void badExchangeOrLostResponseDoesNotRetry() {
        Fake exchange = new Fake(); exchange.exchange="https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fevil.invalid%2F&code=synthetic";
        assertThrows(IOException.class, () -> run(exchange,new NativeCasPrototype(exchange,new NativeVerificationGate()),new AtomicInteger())); assertEquals(1,exchange.posts.get()); assertEquals(7,exchange.gets.size());
        for (int status : new int[]{200, 301, 307, 308, 400, 403, 500}) {
            Fake error = new Fake(); error.postStatus = status; AtomicInteger published = new AtomicInteger();
            assertThrows(IOException.class, () -> run(error,new NativeCasPrototype(error,new NativeVerificationGate()),published));
            assertEquals(1,error.posts.get()); assertEquals(0,published.get()); assertEquals(6,error.gets.size());
        }
        Fake failed = new Fake(); failed.failPost=true; NativeCasPrototype p = new NativeCasPrototype(failed,new NativeVerificationGate());
        assertThrows(IOException.class, () -> run(failed,p,new AtomicInteger())); assertThrows(IOException.class, () -> run(failed,p,new AtomicInteger())); assertEquals(1,failed.posts.get());
    }
    @Test public void identityParserHandlesNumbersAndRejectsTrailingAndDuplicateData() throws Exception {
        assertTrue(NativeCasIdentity.matches("{\"params\":{\"id\":123,\"account\":\"synthetic-user\"}}".getBytes(StandardCharsets.UTF_8), "123", "synthetic-user"));
        assertFalse(NativeCasIdentity.matches("{\"params\":{\"id\":123,\"account\":\"other\"}}".getBytes(StandardCharsets.UTF_8), "123", "synthetic-user"));
        assertThrows(IOException.class, () -> NativeCasIdentity.matches("{\"params\":{}} trailing".getBytes(StandardCharsets.UTF_8), "123", "synthetic-user"));
        assertThrows(IOException.class, () -> NativeCasIdentity.matches("{\"params\":{},\"params\":{}}".getBytes(StandardCharsets.UTF_8), "123", "synthetic-user"));
    }
    @Test public void identityAllowsEscapedChineseAndSupplementaryUnicodeInValues() throws Exception {
        String json="{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"name\":\"\\u5f20\\u4e09\","
            +"\"school\":\"浙江大学\",\"label\":\"\\uD83D\\uDE00\",\"literal\":\"\\\\u0069d\","
            +"\"说明\":[\"\\u0070arams\",\"id\",\"account\",{\"value\":\"\\\"id\\\":\\\"other\\\"\"}]}}";
        assertTrue(NativeCasIdentity.matches(json.getBytes(StandardCharsets.UTF_8),"123","synthetic-user"));
    }
    @Test public void identityDecodesUnicodeValuesWithoutChangingIdentityComparison() throws Exception {
        byte[] json="{\"params\":{\"id\":\"\\u0031\\u0032\\u0033\",\"account\":\"synthetic-\\u0075ser\"}}".getBytes(StandardCharsets.UTF_8);
        assertArrayEquals(new String[]{"123","synthetic-user"},NativeCasIdentity.read(json));
        assertFalse(NativeCasIdentity.matches(json,"123","other"));
    }
    @Test public void identityRejectsDuplicateStructureAtEveryObjectDepth() {
        for(String json:new String[]{
            "{\"params\":{\"id\":123,\"account\":\"synthetic-user\"},\"params\":{\"id\":123,\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"id\":123,\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"name\":\"张三\",\"name\":\"张三\"}}",
            "{\"params\":{\"id\":123,\"account\":\"synthetic-user\"},\"metadata\":[{\"nested\":{\"x\":1,\"x\":1}}]}"})
            assertThrows(IOException.class,()->NativeCasIdentity.read(json.getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void identityRejectsEscapedMemberAliasesEvenWithoutLiteralDuplicate() {
        for(String json:new String[]{
            "{\"\\u0070arams\":{\"id\":123,\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"\\u0069d\":123,\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"\\u0061ccount\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"\\u0069d\":123,\"account\":\"synthetic-user\"}}",
            "{\"params\":{\"id\":123,\"account\":\"synthetic-user\"},\"metadata\":{\"na\\u006de\":\"张三\"}}"})
            assertThrows(IOException.class,()->NativeCasIdentity.read(json.getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void identityRejectsMalformedUnicodeValuesButAllowsRealSurrogatePairs() throws Exception {
        for(String value:new String[]{"\\u+123","\\u-123","\\u１２３４","\\u12g4","\\u123","\\uD800","\\uDC00","\\uD800x","\\uD800\\u0041"})
            assertThrows(IOException.class,()->NativeCasIdentity.read(("{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"name\":\""+value+"\"}}").getBytes(StandardCharsets.UTF_8)));
        assertTrue(NativeCasIdentity.matches("{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"name\":\"😀\"}}".getBytes(StandardCharsets.UTF_8),"123","synthetic-user"));
    }
    @Test public void identityStillRejectsMalformedUtf8AndTrailingDataWithUnicodeValues() {
        assertThrows(IOException.class,()->NativeCasIdentity.read(new byte[]{'{','"',(byte)0xc3,0x28,'"','}',}));
        assertThrows(IOException.class,()->NativeCasIdentity.read("{\"params\":{\"id\":123,\"account\":\"synthetic-user\",\"name\":\"\\u5f20\\u4e09\"}} false".getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void fullProtocolPublishesIdentityWithEscapedChineseDisplayName() throws Exception {
        Fake flow=new Fake();
        flow.identity="{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\",\"name\":\"\\u5f20\\u4e09\"}}";
        AtomicInteger published=new AtomicInteger();
        assertTrue(run(flow,new NativeCasPrototype(flow,new NativeVerificationGate()),published));
        assertEquals(1,flow.posts.get()); assertEquals(1,published.get());
    }
    @Test public void changedCaptchaAfterReservationStopsWithoutPost() {
        Fake f = new Fake(); AtomicInteger checks = new AtomicInteger();
        NativeCasPrototype.Transport changing = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; } public Object sessionBinding() { return f.sessionBinding(); } public void close() { f.close(); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return f.post(u,b); }
            public NativeCasHttps.Response get(URI u) throws IOException {
                if (u.getPath().endsWith("getKaptchaStatus") && checks.incrementAndGet() == 2) return ok("true");
                return f.get(u);
            }
        };
        assertThrows(IOException.class, () -> run(f,new NativeCasPrototype(changing,new NativeVerificationGate()),new AtomicInteger()));
        assertTrue(f.reserved); assertEquals(0,f.posts.get()); assertEquals(2,checks.get());
    }
    @Test public void unexpectedCsrfFieldStopsBeforeReservation() {
        Fake f = new Fake(); NativeCasPrototype.Transport tampered = new NativeCasPrototype.Transport() {
            public boolean fresh() { return true; } public Object sessionBinding() { return f.sessionBinding(); } public void close() { f.close(); }
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException { return f.post(u,b); }
            public NativeCasHttps.Response get(URI u) throws IOException {
                if (u.equals(NativeCasDiscovery.CAS_LOGIN)) return ok(FORM.replace("</form>", "<input type='hidden' name='_csrf' value='unexpected'></form>"));
                return f.get(u);
            }
        };
        NativeCasPrototype p = new NativeCasPrototype(tampered,new NativeVerificationGate());
        assertThrows(IOException.class, () -> run(f,p,new AtomicInteger())); assertEquals(0,f.posts.get()); assertFalse(f.reserved);
    }
    @Test public void realTransportCannotPostWithoutConsentAndGateDispatch() throws Exception {
        NativeVerificationGate gate = new NativeVerificationGate();
        assertThrows(IOException.class, () -> NativeCasPrototype.newExplicitlyAuthorizedTransport(false, gate));
        assertThrows(IOException.class, () -> NativeCasPrototype.newExplicitlyAuthorizedTransport(true, null));
        try(NativeCasPrototype.Transport transport=NativeCasPrototype.newExplicitlyAuthorizedTransport(true,gate)) {
            assertThrows(IOException.class,()->transport.post(NativeCasDiscovery.CAS_LOGIN,new byte[0]));
        }
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        try(NativeCasPrototype.Transport transport=NativeCasPrototype.newExplicitlyAuthorizedTransport(true,gate)) {
            assertThrows(IOException.class,()->transport.post(NativeCasDiscovery.CAS_LOGIN,new byte[0]));
        }
    }
    @Test public void cancelDuringIdentityPreventsLatePublication() throws Exception {
        Fake f = new Fake(); // fake transport below blocks identity without networking
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1); AtomicInteger published = new AtomicInteger();
        NativeCasPrototype.Transport blocking = new NativeCasPrototype.Transport() {
            public boolean fresh(){return true;} public Object sessionBinding(){return f.sessionBinding();} public void close(){f.close(); release.countDown();}
            public NativeCasHttps.Response post(URI u, byte[] b) throws IOException {return f.post(u,b);}
            public NativeCasHttps.Response get(URI u) throws IOException { if (u.getPath().endsWith("infosimple")) {entered.countDown(); try {if(!release.await(5,TimeUnit.SECONDS)) throw new IOException();} catch(InterruptedException e){throw new IOException();}} return f.get(u); }
        };
        NativeCasPrototype p = new NativeCasPrototype(blocking,new NativeVerificationGate()); var pool=Executors.newSingleThreadExecutor();
        try { var future=pool.submit(()->run(f,p,published)); assertTrue(entered.await(5,TimeUnit.SECONDS)); p.close(); assertThrows(Exception.class,()->future.get(5,TimeUnit.SECONDS)); assertEquals(0,published.get()); }
        finally { release.countDown(); pool.shutdownNow(); }
    }
}
