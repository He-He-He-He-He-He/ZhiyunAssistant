package cn.suike.slides.android;

import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLHandshakeException;
import static org.junit.Assert.*;

/** No sockets, device, real credentials, or authentication quota. Only injected production wires. */
public class NativeCasDiagnosticsTest {
    static final String CANARY="SENSITIVE-password-cookie-account-ticket-https://invalid.example/?token=secret";
    static NativeCasLogin login(NativeCasLoginTest.Harness h,NativeCasDiagnostics d) {
        return new NativeCasLogin(h.disk,h.factory,h.sessions,d);
    }
    static void safe(NativeCasDiagnostics d) throws Exception {
        NativeCasDiagnostics.Report r=d.latest();
        assertNotNull(r); String encoded=r.encode();
        assertFalse(encoded.contains(CANARY)); assertFalse(encoded.contains(NativeCasLoginTest.PASS));
        assertFalse(encoded.contains(NativeCasLoginTest.USER)); assertFalse(encoded.contains("synthetic"));
        assertEquals(encoded,NativeCasDiagnostics.Report.decode(encoded).encode());
    }
    @Test public void fullEnrollmentCoversAllProductionStagesAndBothPostAndOfficialStatus() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        assertTrue(login(h,d).enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        NativeCasDiagnostics.Report r=d.latest();
        assertEquals(NativeCasDiagnostics.Result.SUCCESS,r.result);
        assertEquals(NativeCasDiagnostics.Post.RESPONDED,r.post); assertEquals(302,r.postHttp);
        for(NativeCasDiagnostics.Stage s:NativeCasDiagnostics.Stage.values()) assertTrue(s.name(),r.visited.contains(s));
        safe(d);
    }
    @Test public void exceptionClassificationNeverReadsMessageCauseOrClassName() throws Exception {
        NativeCasDiagnostics d=new NativeCasDiagnostics();
        RuntimeException hostile=new RuntimeException(CANARY) {
            @Override public String getMessage() { throw new AssertionError("message accessed"); }
            @Override public synchronized Throwable getCause() { throw new AssertionError("cause accessed"); }
            @Override public String toString() { throw new AssertionError("text accessed"); }
        };
        NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        c.stage(NativeCasDiagnostics.Stage.SAVE); c.fail(hostile);
        assertEquals(NativeCasDiagnostics.Stage.SAVE,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Category.RUNTIME_EXCEPTION,d.latest().category); safe(d);
    }
    @Test public void fixedNetworkCategoriesAndNoPostAreUnambiguous() throws Exception {
        Exception[] errors={new UnknownHostException(CANARY),new SocketTimeoutException(CANARY),
            new SSLHandshakeException(CANARY),new ConnectException(CANARY),new IOException(CANARY),new SecurityException(CANARY)};
        NativeCasDiagnostics.Category[] categories={NativeCasDiagnostics.Category.DNS,NativeCasDiagnostics.Category.TIMEOUT,
            NativeCasDiagnostics.Category.TLS,NativeCasDiagnostics.Category.CONNECT,NativeCasDiagnostics.Category.IO,NativeCasDiagnostics.Category.SECURITY};
        for(int i=0;i<errors.length;i++) {
            NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
            c.stage(NativeCasDiagnostics.Stage.DISCOVERY); c.fail(errors[i]);
            assertEquals(categories[i],d.latest().category); assertEquals(NativeCasDiagnostics.Post.NOT_STARTED,d.latest().post); safe(d);
        }
    }
    @Test public void gatePreservesTypedStageStatusAndCategoryAcrossAllThreeCallbacks() {
        NativeCasDiagnostics.Failure original=new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY,NativeCasDiagnostics.Category.HTTP_STATUS,403);
        for(int point=0;point<3;point++) {
            final int p=point; NativeVerificationGate gate=new NativeVerificationGate();
            boolean prepared=gate.prepare(true,true,NativeVerificationGate.Captcha.CLEAR,()->{if(p==0) throw original;});
            boolean sent=gate.submit(()->{if(p==1) throw original;});
            boolean committed=gate.publish(true,()->{if(p==2) throw original;});
            assertFalse(committed); assertEquals(point!=0,prepared); assertEquals(point==2,sent);
            assertSame(original,gate.failure(NativeCasDiagnostics.Stage.POST,NativeCasDiagnostics.Category.AUTHORIZATION));
        }
    }
    @Test public void productionHttpParserFailureIsDistinguishedFromNetworkIoWithoutReportingRawInput() throws Exception {
        java.lang.reflect.Method line=NativeCasHttps.class.getDeclaredMethod("line",InputStream.class,int[].class);
        line.setAccessible(true);
        java.lang.reflect.InvocationTargetException error=assertThrows(java.lang.reflect.InvocationTargetException.class,
            ()->line.invoke(null,new ByteArrayInputStream((CANARY+"\n").getBytes(StandardCharsets.US_ASCII)),new int[]{32768}));
        NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT);
        c.stage(NativeCasDiagnostics.Stage.DISCOVERY); c.fail(error.getCause());
        assertEquals(NativeCasDiagnostics.Category.HTTP_FRAMING,d.latest().category); safe(d);
    }
    @Test public void latestOperationCannotBeOverwrittenByOldCancellationCloseOrCompletion() {
        List<String> writes=new ArrayList<>(); NativeCasDiagnostics d=new NativeCasDiagnostics(writes::add);
        NativeCasDiagnostics.Context old=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        old.stage(NativeCasDiagnostics.Stage.POST); old.postStarted();
        NativeCasDiagnostics.Context fresh=d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT);
        fresh.stage(NativeCasDiagnostics.Stage.KEY); fresh.http(200); fresh.success();
        String latest=d.latest().encode(); int count=writes.size();
        old.fail(NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.POST,NativeCasDiagnostics.Category.CANCELLED));
        old.postResponded(302); old.cleanup(new IOException(CANARY)); old.success();
        d.failIfCurrent(old.id,NativeCasDiagnostics.Kind.STORE_READ,NativeCasDiagnostics.Stage.STORE,new IOException(CANARY));
        assertEquals(latest,d.latest().encode()); assertEquals(count,writes.size());
    }
    @Test public void reportWriteFailureIsExplicitStickyAndDoesNotChangeOneShotAllowance() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness();
        NativeCasDiagnostics d=new NativeCasDiagnostics(text->{throw new IOException(CANARY);});
        NativeCasLogin login=login(h,d);
        assertTrue(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertTrue(login.onUnauthorized(401,true,NativeCasLoginTest.ACCOUNT));
        assertEquals(1,h.disk.record.attempts); assertEquals(NativeCasDiagnostics.Persistence.FAILED,d.latest().persistence);
        assertTrue(d.display().contains("报告落盘失败")); assertFalse(d.display().contains(CANARY));
        assertFalse(login.onUnauthorized(401,true,NativeCasLoginTest.ACCOUNT));
        assertEquals(2,h.factory.posts.get()); assertEquals(1,h.disk.record.attempts);
    }
    @Test public void safeReportIsAtomicallyPersistedAndStrictlyDecodable() throws Exception {
        Path root=Files.createTempDirectory("safe-native-report-"); File file=root.resolve("report.safe").toFile();
        try {
            NativeCasDiagnostics d=NativeCasDiagnostics.forFile(file); NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
            c.stage(NativeCasDiagnostics.Stage.POST); c.postStarted(); c.fail(new IOException(CANARY));
            NativeCasDiagnostics.Report restored=NativeCasDiagnostics.Report.decode(new String(Files.readAllBytes(file.toPath()),StandardCharsets.US_ASCII));
            assertEquals(NativeCasDiagnostics.Persistence.STORED,restored.persistence);
            assertEquals(NativeCasDiagnostics.Post.MAY_HAVE_BEEN_SENT,restored.post); assertEquals(d.latest().encode(),restored.encode());
            assertFalse(new String(Files.readAllBytes(file.toPath()),StandardCharsets.US_ASCII).contains(CANARY));
            assertFalse(root.resolve("report.safe.pending").toFile().exists());
        } finally { Files.deleteIfExists(file.toPath()); Files.delete(root); }
    }
    @Test public void corruptOrHostileDiskReportIsNotReflectedToUi() throws Exception {
        Path root=Files.createTempDirectory("safe-native-corrupt-"); File file=root.resolve("report.safe").toFile();
        try {
            Files.write(file.toPath(),CANARY.getBytes(StandardCharsets.US_ASCII));
            NativeCasDiagnostics d=NativeCasDiagnostics.forFile(file);
            assertEquals(NativeCasDiagnostics.Category.REPORT_READ_FAILED,d.latest().category);
            assertFalse(d.display().contains(CANARY)); safe(d);
        } finally { Files.deleteIfExists(file.toPath()); Files.delete(root); }
    }
    @Test public void reportDecoderRejectsUnboundedStatusUnknownFieldsAndExtraContent() {
        NativeCasDiagnostics d=new NativeCasDiagnostics(); d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        String valid=d.latest().encode();
        for(String invalid:new String[]{valid+"|"+CANARY,valid.replace("|CONSENT|","|"+CANARY+"|"),valid.replace("|0|NOT_STARTED|","|999|NOT_STARTED|")})
            assertThrows(IOException.class,()->NativeCasDiagnostics.Report.decode(invalid));
    }
    @Test public void restartTurnsInterruptedInFlightSnapshotIntoTypedFailureWithoutResettingPostState() throws Exception {
        Path root=Files.createTempDirectory("safe-native-restart-"); File file=root.resolve("report.safe").toFile();
        try {
            NativeCasDiagnostics previous=new NativeCasDiagnostics(); NativeCasDiagnostics.Context c=previous.begin(NativeCasDiagnostics.Kind.AUTOMATIC);
            c.stage(NativeCasDiagnostics.Stage.POST); c.postStarted();
            Files.write(file.toPath(),previous.latest().encode().getBytes(StandardCharsets.US_ASCII));
            NativeCasDiagnostics reopened=NativeCasDiagnostics.forFile(file);
            assertEquals(NativeCasDiagnostics.Result.FAILED,reopened.latest().result);
            assertEquals(NativeCasDiagnostics.Category.INTERRUPTED,reopened.latest().category);
            assertEquals(NativeCasDiagnostics.Post.MAY_HAVE_BEEN_SENT,reopened.latest().post);
            long id=reopened.latest().id; reopened.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT);
            assertEquals(id+1,reopened.latest().id);
        } finally { Files.deleteIfExists(file.toPath()); Files.delete(root); }
    }
    @Test public void lateQueuedAnonymousPermitCannotCreateTransportAfterCancellation() {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCasLogin login=login(h,d); long permit=login.generation(); login.cancel(); AtomicInteger opens=new AtomicInteger();
        assertFalse(login.anonymousPreflight(()->{opens.incrementAndGet(); return NativeCasPrototype.newAnonymousTransport();},
            d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT),permit));
        assertEquals(0,opens.get()); assertEquals(NativeCasDiagnostics.Category.CANCELLED,d.latest().category);
    }
    @Test public void callbackOauthLandingAndIdentityRejectionsRetainStagesStatusesAndPostResponse() throws Exception {
        for(int fault=0;fault<5;fault++) {
            NativeCasPrototypeTest.Fake f=new NativeCasPrototypeTest.Fake();
            NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
            if(fault==0) f.postStatus=403;
            if(fault==1) f.afterPost="https://invalid.example/"+CANARY;
            if(fault==2) f.exchange="https://tgmedia.cmc.zju.edu.cn/index.php?r=wrong&code=synthetic";
            if(fault==3) f.home="https://classroom.zju.edu.cn/wrong";
            if(fault==4) f.identity=CANARY;
            NativeCasPrototype p=new NativeCasPrototype(f,new NativeVerificationGate(),c);
            assertThrows(IOException.class,()->p.run(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID,()->f.reserved=true,()->fail()));
            NativeCasDiagnostics.Stage expected=fault==0?NativeCasDiagnostics.Stage.POST:fault==1?NativeCasDiagnostics.Stage.CALLBACK:fault==2?NativeCasDiagnostics.Stage.OAUTH:
                fault==3?NativeCasDiagnostics.Stage.LANDING:NativeCasDiagnostics.Stage.IDENTITY;
            assertEquals(expected,d.latest().stage); assertEquals(fault==0?403:fault==4?200:302,d.latest().http);
            assertEquals(NativeCasDiagnostics.Post.RESPONDED,d.latest().post); assertEquals(1,f.posts.get()); safe(d);
        }
    }
    @Test public void revokeFailureCannotOpenNetworkAndCommitFailureIsNotFlattenedByGate() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCredentialRevocation.RecoverableStore bad=new NativeCredentialRevocation.RecoverableStore() {
            public <T> T transaction(NativeCredentialState.Transaction<T> action) throws Exception { throw new IOException(CANARY); }
            public void replaceWithTombstone(NativeCredentialState.Record record) throws Exception { throw new IOException(CANARY); }
        };
        NativeCasLogin login=new NativeCasLogin(bad,h.factory,h.sessions,d);
        assertFalse(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.REVOKE,d.latest().stage); assertEquals(0,h.factory.opens.get()); safe(d);
        NativeCasLogin.Sessions brokenCommit=new NativeCasLogin.Sessions() {
            public NativeCasCookies verify(NativeCasCookies jar,String id,String user,NativeCasPrototype.Reserve current) { return jar.officialCopy(); }
            public void commit(NativeCasCookies jar) { throw new IllegalStateException(CANARY); }
            public void clear() {}
        };
        login=new NativeCasLogin(h.disk,h.factory,brokenCommit,d);
        assertFalse(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.COMMIT,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Category.RUNTIME_EXCEPTION,d.latest().category); safe(d);
    }
    @Test public void storeUnavailableAndEnrollmentWriteFailureArePrePostTypedFailures() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCasLogin missing=new NativeCasLogin(null,h.factory,h.sessions,d);
        assertFalse(missing.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.STORE,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Category.STORE_UNAVAILABLE,d.latest().category); assertEquals(0,h.factory.opens.get());
        h.disk.failAt=NativeCredentialState.Phase.ENROLLING;
        assertFalse(login(h,d).enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.ENROLLMENT,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Post.NOT_STARTED,d.latest().post); safe(d);
    }
    @Test public void saveFailureSurvivesGateAndRetainsActualPostResponse() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        h.disk.failAt=NativeCredentialState.Phase.READY;
        assertFalse(login(h,d).enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.SAVE,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Category.IO,d.latest().category);
        assertEquals(302,d.latest().postHttp); assertEquals(NativeCasDiagnostics.Post.RESPONDED,d.latest().post);
        assertEquals(0,h.sessions.commits.get()); safe(d);
    }
    @Test public void lostPostResponseIsNotMisreportedAsNotSentOrRetried() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        h.factory.failPost=true;
        assertFalse(login(h,d).enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.POST,d.latest().stage);
        assertEquals(NativeCasDiagnostics.Post.MAY_HAVE_BEEN_SENT,d.latest().post); assertEquals(0,d.latest().postHttp);
        assertEquals(1,h.factory.posts.get()); safe(d);
    }
    @Test public void officialVerifyPreservesItsHttpCodeWithoutLeakingBody() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeOfficialSession official=new NativeOfficialSession(candidate->NativeCasHttps.officialValidation(candidate,
            (owner,uri,method,body)->new NativeCasHttps.Response(403,Collections.emptyMap(),CANARY.getBytes(StandardCharsets.UTF_8))));
        NativeCasLogin login=new NativeCasLogin(h.disk,h.factory,official,d);
        assertFalse(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertEquals(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY,d.latest().stage); assertEquals(403,d.latest().http);
        assertEquals(NativeCasDiagnostics.Category.HTTP_STATUS,d.latest().category); assertEquals(302,d.latest().postHttp); safe(d);
    }
    static NativeCasHttps.Wire anonymousWire(String fault,AtomicInteger posts) {
        NativeCasPrototypeTest.Fake fake=new NativeCasPrototypeTest.Fake();
        return (owner,uri,method,body)->{
            if(!method.equals("GET")) { posts.incrementAndGet(); throw new AssertionError("anonymous POST"); }
            assertNull(body);
            if(fault.equals("tls")) throw new SSLHandshakeException(CANARY);
            if(uri.equals(NativeCasDiscovery.AUTHORIZE) && !fault.equals("session"))
                owner.receiveCookie(uri,"JSESSIONID=synthetic-private; Path=/cas; HttpOnly");
            if(uri.equals(NativeCasDiscovery.ENTRY) && fault.equals("http"))
                return new NativeCasHttps.Response(503,Collections.emptyMap(),new byte[0]);
            if(uri.equals(NativeCasDiscovery.CAS_LOGIN) && fault.equals("form")) return NativeCasPrototypeTest.ok(CANARY);
            if(uri.getPath().endsWith("getPubKey")) {
                if(fault.equals("key")) return NativeCasPrototypeTest.ok(CANARY);
                if(fault.equals("mutation")) owner.receiveCookie(uri,"JSESSIONID=reset; Path=/cas; HttpOnly");
            }
            if(uri.getPath().endsWith("getKaptchaStatus") && (fault.equals("captcha") || fault.equals("captcha-shape")))
                return NativeCasPrototypeTest.ok(fault.equals("captcha")?"true":CANARY);
            return fake.get(uri);
        };
    }
    @Test public void anonymousPreflightUsesRealCapabilityAndFreshJarWithoutAnyStoreOrPasswordPost() throws Exception {
        NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness();
        AtomicInteger posts=new AtomicInteger(); NativeCasLogin login=new NativeCasLogin(null,h.factory,h.sessions,d);
        assertTrue(login.anonymousPreflight(()->NativeCasPrototype.newAnonymousTransport(anonymousWire("",posts)),d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT)));
        assertEquals(0,posts.get()); assertEquals(0,h.factory.opens.get()); assertEquals(0,h.sessions.checks.get());
        assertEquals(NativeCredentialState.Phase.EMPTY,h.disk.record.phase);
        assertEquals(NativeCasDiagnostics.Post.NOT_STARTED,d.latest().post);
        assertEquals(NativeCasDiagnostics.Result.SUCCESS,d.latest().result); safe(d);
    }
    @Test public void anonymousPreflightDistinguishesEveryPrePostFailureWithoutConsumingAllowance() throws Exception {
        String[] faults={"tls","http","session","form","key","captcha","captcha-shape","mutation"};
        NativeCasDiagnostics.Stage[] stages={NativeCasDiagnostics.Stage.DISCOVERY,NativeCasDiagnostics.Stage.DISCOVERY,
            NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Stage.FORM,NativeCasDiagnostics.Stage.KEY,
            NativeCasDiagnostics.Stage.CAPTCHA,NativeCasDiagnostics.Stage.CAPTCHA,NativeCasDiagnostics.Stage.SESSION};
        NativeCasDiagnostics.Category[] cats={NativeCasDiagnostics.Category.TLS,NativeCasDiagnostics.Category.HTTP_STATUS,
            NativeCasDiagnostics.Category.SESSION_UNAVAILABLE,NativeCasDiagnostics.Category.FORM_REJECTED,NativeCasDiagnostics.Category.KEY_REJECTED,
            NativeCasDiagnostics.Category.CAPTCHA_REQUIRED,NativeCasDiagnostics.Category.CAPTCHA_UNRECOGNIZED,NativeCasDiagnostics.Category.SESSION_CHANGED};
        for(int i=0;i<faults.length;i++) {
            final String fault=faults[i]; NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness();
            AtomicInteger posts=new AtomicInteger(); NativeCasLogin login=login(h,d);
            assertFalse(login.anonymousPreflight(()->NativeCasPrototype.newAnonymousTransport(anonymousWire(fault,posts)),d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT)));
            assertEquals(fault,stages[i],d.latest().stage); assertEquals(fault,cats[i],d.latest().category);
            assertEquals(NativeCasDiagnostics.Post.NOT_STARTED,d.latest().post); assertEquals(0,posts.get());
            assertEquals(0,h.disk.record.attempts); assertEquals(NativeCredentialState.Phase.EMPTY,h.disk.record.phase);
            if(fault.equals("http")) assertEquals(503,d.latest().http); safe(d);
        }
    }
    @Test public void anonymousPreflightDoesNotReplenishSpentCredentialsOrReplaceOfficialSession() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasLogin login=login(h,d);
        assertTrue(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
        assertTrue(login.onUnauthorized(401,true,NativeCasLoginTest.ACCOUNT));
        long version=h.sessions.official.version(); String epoch=h.disk.record.epoch;
        for(int n=0;n<2;n++) assertTrue(login.anonymousPreflight(
            ()->NativeCasPrototype.newAnonymousTransport(anonymousWire("",new AtomicInteger())),d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT)));
        assertEquals(1,h.disk.record.attempts); assertEquals(epoch,h.disk.record.epoch); assertEquals(version,h.sessions.official.version());
        assertFalse(login.onUnauthorized(401,true,NativeCasLoginTest.ACCOUNT)); assertEquals(2,h.factory.posts.get()); assertEquals(2,h.factory.opens.get());
    }
    @Test public void anonymousTransportCannotPostEvenFromAReservedGate() throws Exception {
        AtomicInteger posts=new AtomicInteger(); NativeVerificationGate gate=new NativeVerificationGate();
        NativeCasHttps https=NativeCasHttps.anonymous(anonymousWire("",posts));
        assertTrue(gate.prepare(true,true,NativeVerificationGate.Captcha.CLEAR,()->{}));
        assertFalse(gate.submit(()->https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0])));
        assertEquals(0,posts.get()); assertEquals(NativeCasDiagnostics.Category.AUTHORIZATION,
            gate.failure(NativeCasDiagnostics.Stage.POST,NativeCasDiagnostics.Category.IO).category); https.close();
    }
    @Test public void cancellingOldAuthenticationCannotOverwriteNewSuccessfulPreflight() throws Exception {
        NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness(); NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCasLogin login=login(h,d); h.factory.blockIdentity=true;
        ExecutorService pool=Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> old=pool.submit(()->login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
            assertTrue(h.factory.entered.await(5,TimeUnit.SECONDS)); login.cancel();
            assertTrue(login.anonymousPreflight(()->NativeCasPrototype.newAnonymousTransport(anonymousWire("",new AtomicInteger())),d.begin(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT)));
            String latest=d.latest().encode(); assertFalse(old.get(5,TimeUnit.SECONDS));
            assertEquals(latest,d.latest().encode()); assertEquals(NativeCasDiagnostics.Kind.ANONYMOUS_PREFLIGHT,d.latest().kind);
        } finally { pool.shutdownNow(); }
    }
}
