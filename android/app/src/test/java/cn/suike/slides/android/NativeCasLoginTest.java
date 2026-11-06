package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Complete production controller + real capability/cookie logic, injected wire only.
 * Synthetic values, no socket, device, CookieManager, real account or diagnostic quota. */
public class NativeCasLoginTest {
    static final String USER="synthetic-user", PASS="synthetic-secret", ID="synthetic-id";
    static final NativeCasLogin.Identity ACCOUNT=new NativeCasLogin.Identity(USER,ID);
    static final class Disk implements NativeCredentialRevocation.RecoverableStore, NativeCredentialState.Access {
        NativeCredentialState.Record record=NativeCredentialState.Record.empty();
        NativeCredentialState.Phase failAt;
        boolean poison,ambiguous;
        public synchronized <T> T transaction(NativeCredentialState.Transaction<T> action) throws Exception {
            if(poison) throw new IOException("storage unavailable"); return action.run(this);
        }
        public NativeCredentialState.Record read() throws Exception { NativeCredentialState.validate(record); return record; }
        public void write(NativeCredentialState.Record value) throws Exception {
            NativeCredentialState.validate(value);
            if(value.phase==failAt) {
                poison=true; if(ambiguous) record=value;
                throw new IOException("durable write unavailable");
            }
            record=value;
        }
        public synchronized void replaceWithTombstone(NativeCredentialState.Record tombstone) throws Exception {
            NativeCredentialState.validate(tombstone); record=tombstone; poison=false;
        }
    }
    static final class Sessions implements NativeCasLogin.Sessions {
        final NativeOfficialSession official=new NativeOfficialSession();
        final Disk disk;
        final AtomicInteger checks=new AtomicInteger(), commits=new AtomicInteger();
        boolean reject,block;
        final CountDownLatch entered=new CountDownLatch(1), release=new CountDownLatch(1);
        Sessions(Disk disk) { this.disk=disk; }
        public NativeCasCookies verify(NativeCasCookies candidate,String id,String user,NativeCasPrototype.Reserve current) throws IOException {
            checks.incrementAndGet();
            assertEquals(ID,id); assertEquals(USER,user);
            assertTrue(candidate.header(NativeOfficialSession.ROOT).contains("_token="));
            assertFalse(candidate.header(NativeOfficialSession.ROOT).contains("private-"));
            assertFalse(candidate.header(NativeOfficialSession.ROOT).contains("rotated"));
            entered.countDown(); if(block) await(release);
            try { current.reserve(); } catch(Exception cancelled) { throw new IOException("cancelled"); }
            if(reject) throw new IOException("official account mismatch");
            return candidate.officialCopy();
        }
        public void commit(NativeCasCookies verified) {
            assertEquals(NativeCredentialState.Phase.READY,disk.record.phase);
            assertEquals(PASS,disk.record.password);
            official.commit(verified); commits.incrementAndGet();
        }
        public void clear() { official.clear(); }
        public void cancelVerification() { release.countDown(); }
    }
    static final class Factory implements NativeCasLogin.Factory {
        final Disk disk; final List<NativeCasPrototypeTest.Fake> flows=new ArrayList<>();
        final AtomicInteger opens=new AtomicInteger(),posts=new AtomicInteger();
        String exchange=NativeCasPrototypeTest.EXCHANGE.toString();
        String captcha="false"; boolean rotate=true,mutateKey,failPost,blockIdentity,blockSecondCaptcha;
        final CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        Factory(Disk disk) { this.disk=disk; }
        public NativeCasPrototype.Transport open(boolean consent,NativeVerificationGate gate) throws IOException {
            assertTrue(consent); int number=opens.incrementAndGet();
            NativeCasPrototypeTest.Fake flow=new NativeCasPrototypeTest.Fake();
            flow.captcha=captcha; flow.failPost=failPost; flow.exchange=exchange; flows.add(flow);
            final boolean blockThisIdentity=blockIdentity,blockThisCaptcha=blockSecondCaptcha;
            AtomicInteger captchaChecks=new AtomicInteger();
            NativeCasHttps https=NativeCasHttps.authorizedForOnePost(true,gate,new NativeCasHttps.Wire() {
                public NativeCasHttps.Response exchange(NativeCasHttps owner,URI uri,String method,byte[] body) throws IOException {
                    if(method.equals("POST")) {
                        NativeCredentialState.Record persisted=disk.record;
                        assertTrue(persisted.phase==NativeCredentialState.Phase.DISPATCHED || persisted.phase==NativeCredentialState.Phase.ENROLLMENT_DISPATCHED);
                        assertEquals(1,persisted.attempts); assertTrue(persisted.authorized);
                        if(persisted.phase==NativeCredentialState.Phase.ENROLLMENT_DISPATCHED) assertNotEquals(PASS,persisted.password);
                        flow.reserved=true; posts.incrementAndGet();
                        NativeCasHttps.Response response=flow.post(uri,body);
                        if(rotate) owner.receiveCookie(uri,"JSESSIONID=rotated; Path=/cas; HttpOnly");
                        return response;
                    }
                    if(uri.equals(NativeCasDiscovery.AUTHORIZE))
                        owner.receiveCookie(uri,"JSESSIONID=private-"+number+"; Path=/cas; HttpOnly");
                    if(uri.getPath().endsWith("getPubKey")) {
                        owner.receiveCookie(uri,"_pv0=analytics; Domain=zju.edu.cn; Path=/");
                        if(mutateKey) owner.receiveCookie(uri,"JSESSIONID=private-"+number+"; Path=/cas; HttpOnly");
                    }
                    if(blockThisIdentity && uri.equals(NativeOfficialSession.INFO)
                            || blockThisCaptcha && uri.getPath().endsWith("getKaptchaStatus") && captchaChecks.incrementAndGet()==2) {
                        entered.countDown(); await(release);
                    }
                    if(uri.equals(URI.create(flow.exchange))) {
                        owner.receiveCookie(NativeOfficialSession.ROOT,"_token="+URLEncoder.encode("a:2:{i:0;s:6:\"_token\";i:1;s:9:\"synthetic\";}","UTF-8")+"; Path=/; Secure; HttpOnly");
                        owner.receiveCookie(NativeOfficialSession.ROOT,"JSESSIONID=official-only; Path=/; Secure; HttpOnly");
                    }
                    return flow.get(uri);
                }
                public void close() { flow.close(); if(blockThisIdentity || blockThisCaptcha) release.countDown(); }
            });
            return new NativeCasPrototype.Transport() {
                public boolean fresh() { return true; }
                public Object sessionBinding() throws IOException { return https.sessionBinding(); }
                public NativeCasCookies officialCookies() throws IOException { return https.officialCookies(); }
                public NativeCasHttps.Response get(URI uri) throws IOException { return https.request(uri,"GET",null); }
                public NativeCasHttps.Response post(URI uri,byte[] body) throws IOException { return https.request(uri,"POST",body); }
                public void close() { https.close(); }
            };
        }
    }
    static final class Harness {
        final Disk disk=new Disk(); final Sessions sessions=new Sessions(disk); final Factory factory=new Factory(disk);
        NativeCasLogin controller() { return new NativeCasLogin(disk,factory,sessions); }
        NativeCasLogin enrolled() throws Exception {
            NativeCasLogin login=controller(); assertTrue(login.enroll(true,USER,PASS,ID)); return login;
        }
    }
    static void await(CountDownLatch latch) throws IOException {
        try { if(!latch.await(5,TimeUnit.SECONDS)) throw new IOException("offline barrier timeout"); }
        catch(InterruptedException stopped) { Thread.currentThread().interrupt(); throw new IOException("stopped"); }
    }
    @Test public void fullNativeEnrollmentUsesPrivateBindingAllowsPostRotationAndAdoptsOnlyVerifiedOfficialCookies() throws Exception {
        Harness h=new Harness(); h.enrolled();
        assertEquals(1,h.factory.posts.get()); assertEquals(1,h.sessions.checks.get()); assertEquals(1,h.sessions.commits.get());
        assertEquals(NativeCredentialState.Phase.READY,h.disk.record.phase); assertEquals(0,h.disk.record.attempts);
        assertTrue(h.disk.record.authorized); assertFalse(h.disk.record.epoch.isEmpty());
        assertEquals("synthetic",h.sessions.official.bearer(NativeOfficialSession.INFO));
        String header=h.sessions.official.header(URI.create("https://classroom.zju.edu.cn"));
        assertTrue(header.contains("_token=")); assertTrue(header.contains("JSESSIONID=official-only"));
        assertFalse(header.contains("private-")); assertFalse(header.contains("rotated"));
        assertTrue(h.factory.flows.get(0).closed);
    }
    @Test public void automaticSuccessRemainsDurablySpentAcrossNewControllersAndRestarts() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled();
        assertTrue(login.onUnauthorized(401,true,ACCOUNT));
        assertEquals(1,h.disk.record.attempts); assertEquals(NativeCredentialState.Phase.READY,h.disk.record.phase);
        assertFalse(login.onUnauthorized(401,true,ACCOUNT));
        assertFalse(h.controller().onUnauthorized(401,true,ACCOUNT));
        assertEquals(2,h.factory.posts.get()); assertEquals(2,h.factory.opens.get());
    }
    @Test public void network403InteractiveAndWrongIdentityCannotReserveOrOpenCas() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled();
        for(int status:new int[]{0,200,302,403,500}) assertFalse(login.onUnauthorized(status,true,ACCOUNT));
        assertFalse(login.onUnauthorized(401,false,ACCOUNT));
        assertFalse(login.onUnauthorized(401,true,new NativeCasLogin.Identity(USER,"other")));
        assertEquals(0,h.disk.record.attempts); assertEquals(1,h.factory.opens.get());
    }
    @Test public void officialAdoptionIdentityFailureNeverSavesUnverifiedPasswordOrPublishes() throws Exception {
        Harness h=new Harness(); h.sessions.reject=true;
        assertFalse(h.controller().enroll(true,USER,PASS,ID));
        assertEquals(1,h.factory.posts.get()); assertEquals(0,h.sessions.commits.get());
        assertEquals(NativeCredentialState.Phase.ENROLLMENT_DISPATCHED,h.disk.record.phase);
        assertNotEquals(PASS,h.disk.record.password); assertFalse(h.sessions.official.owns(NativeOfficialSession.INFO));
    }
    @Test public void captchaBeforeSubmitStopsWithoutPostAndAutomaticAllowanceRemainsSpent() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); h.factory.captcha="true";
        assertFalse(login.onUnauthorized(401,true,ACCOUNT));
        assertEquals(1,h.factory.posts.get()); assertEquals(1,h.disk.record.attempts);
        assertEquals(NativeCredentialState.Phase.BLOCKED,h.disk.record.phase);
        assertFalse(h.controller().onUnauthorized(401,true,ACCOUNT)); assertEquals(2,h.factory.opens.get());
    }
    @Test public void uncertainPostDoesNotRetryAndDoesNotReplaceOfficialSession() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); long version=h.sessions.official.version();
        h.factory.failPost=true; assertFalse(login.onUnauthorized(401,true,ACCOUNT));
        assertEquals(2,h.factory.posts.get()); assertEquals(version,h.sessions.official.version());
        assertFalse(login.onUnauthorized(401,true,ACCOUNT)); assertEquals(2,h.factory.posts.get());
    }
    @Test public void sameValueSessionResetDuringPreflightFailsBeforePostButOtherCookiesDoNot() throws Exception {
        Harness h=new Harness(); h.factory.mutateKey=true;
        assertFalse(h.controller().enroll(true,USER,PASS,ID)); assertEquals(0,h.factory.posts.get());
        assertEquals(0,h.sessions.commits.get());
        assertEquals(NativeCredentialState.Phase.ENROLLING,h.disk.record.phase);
    }
    @Test public void durableReservationFailureIncludingWriteThenErrorPreventsAnyNetworkFactory() throws Exception {
        for(boolean ambiguous:new boolean[]{false,true}) {
            Harness h=new Harness(); NativeCasLogin login=h.enrolled();
            h.disk.failAt=NativeCredentialState.Phase.RESERVED; h.disk.ambiguous=ambiguous;
            assertFalse(login.onUnauthorized(401,true,ACCOUNT));
            assertEquals(1,h.factory.opens.get()); assertEquals(1,h.factory.posts.get());
            assertFalse(h.controller().onUnauthorized(401,true,ACCOUNT)); assertEquals(1,h.factory.opens.get());
        }
    }
    @Test public void concurrent401sJoinExactlyOnePrivateAuthentication() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); h.factory.blockIdentity=true;
        var pool=Executors.newFixedThreadPool(2);
        try {
            var first=pool.submit(()->login.onUnauthorized(401,true,ACCOUNT));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS));
            var second=pool.submit(()->login.onUnauthorized(401,true,ACCOUNT));
            // Both may join while in flight or arrive after commit; neither can issue another POST.
            h.factory.release.countDown();
            assertTrue(first.get(5,TimeUnit.SECONDS)); second.get(5,TimeUnit.SECONDS);
            assertEquals(2,h.factory.opens.get()); assertEquals(2,h.factory.posts.get()); assertEquals(1,h.disk.record.attempts);
        } finally { pool.shutdownNow(); }
    }
    @Test public void twoControllersShareDurableReservationWithoutDuplicatePosts() throws Exception {
        Harness h=new Harness(); NativeCasLogin first=h.enrolled(),second=h.controller(); h.factory.blockIdentity=true;
        var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->first.onUnauthorized(401,true,ACCOUNT));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS));
            assertFalse(second.onUnauthorized(401,true,ACCOUNT)); h.factory.release.countDown();
            assertTrue(pending.get(5,TimeUnit.SECONDS)); assertEquals(2,h.factory.posts.get());
        } finally { h.factory.release.countDown(); pool.shutdownNow(); }
    }
    @Test public void backgroundCancellationDuringFinalCaptchaCannotSendLatePost() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); h.factory.blockSecondCaptcha=true;
        var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->login.onUnauthorized(401,true,ACCOUNT));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS)); login.cancel();
            assertFalse(pending.get(5,TimeUnit.SECONDS)); assertEquals(1,h.factory.posts.get());
            assertFalse(h.controller().onUnauthorized(401,true,ACCOUNT)); assertEquals(1,h.disk.record.attempts);
        } finally { pool.shutdownNow(); }
    }
    @Test public void logoutDuringIdentityPreventsLateCookiesCredentialRestoreAndPublication() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); h.factory.blockIdentity=true;
        var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->login.onUnauthorized(401,true,ACCOUNT));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS)); login.logout();
            assertFalse(pending.get(5,TimeUnit.SECONDS));
            assertEquals(NativeCredentialState.Phase.EMPTY,h.disk.record.phase); assertFalse(h.disk.record.authorized);
            assertEquals("",h.disk.record.password); assertFalse(h.sessions.official.owns(NativeOfficialSession.INFO));
            assertEquals(1,h.sessions.commits.get()); assertFalse(h.controller().onUnauthorized(401,true,ACCOUNT));
        } finally { pool.shutdownNow(); }
    }
    @Test public void cancellationDuringOfficialReverificationCannotPublishAndLeavesNoPlaintextCandidate() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.controller(); h.sessions.block=true;
        var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->login.enroll(true,USER,PASS,ID));
            assertTrue(h.sessions.entered.await(5,TimeUnit.SECONDS)); login.cancel();
            assertFalse(pending.get(5,TimeUnit.SECONDS)); assertEquals(0,h.sessions.commits.get());
            assertNotEquals(PASS,h.disk.record.password); assertEquals(NativeCredentialState.Phase.ENROLLMENT_DISPATCHED,h.disk.record.phase);
        } finally { pool.shutdownNow(); }
    }
    @Test public void explicitConsentIsRequiredWithoutCreatingAnyFactory() throws Exception {
        Harness h=new Harness();
        assertThrows(IOException.class,()->h.controller().enroll(false,USER,PASS,ID));
        assertEquals(0,h.factory.opens.get()); assertEquals(NativeCredentialState.Phase.EMPTY,h.disk.record.phase);
    }
    @Test public void queuedConsentAnd401PermitsCannotStartAfterBackgroundCancellation() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.controller(); long queuedConsent=login.generation();
        login.cancel();
        assertThrows(IOException.class,()->login.enrollAtGeneration(queuedConsent,true,USER,PASS,ID));
        assertEquals(0,h.factory.opens.get());
        assertTrue(login.enroll(true,USER,PASS,ID)); long queued401=login.generation();
        login.cancel();
        assertFalse(login.onUnauthorized(401,true,ACCOUNT,queued401));
        assertEquals(0,h.disk.record.attempts); assertEquals(1,h.factory.opens.get());
    }
    @Test public void oldCancelledResponseCannotOverwriteNewVerifiedAccountGeneration() throws Exception {
        Harness h=new Harness(); NativeCasLogin login=h.enrolled(); h.factory.blockIdentity=true;
        String oldEpoch=h.disk.record.epoch; var pool=Executors.newSingleThreadExecutor();
        try {
            var pending=pool.submit(()->login.onUnauthorized(401,true,ACCOUNT));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS));
            login.logout(); h.factory.blockIdentity=false;
            assertTrue(login.enroll(true,USER,PASS,ID));
            assertFalse(pending.get(5,TimeUnit.SECONDS));
            assertNotEquals(oldEpoch,h.disk.record.epoch); assertEquals(NativeCredentialState.Phase.READY,h.disk.record.phase);
            assertEquals(0,h.disk.record.attempts); assertEquals(2,h.sessions.commits.get());
            assertTrue(h.sessions.official.active());
        } finally { pool.shutdownNow(); }
    }
}
