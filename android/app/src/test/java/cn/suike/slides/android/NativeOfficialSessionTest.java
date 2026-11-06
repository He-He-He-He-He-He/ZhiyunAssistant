package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeOfficialSessionTest {
    private NativeCasCookies candidate() throws Exception {
        NativeCasCookies jar=new NativeCasCookies();
        jar.receive(NativeOfficialSession.ROOT,"session=synthetic; Path=/; Secure; HttpOnly");
        return jar;
    }
    @Test public void actualOfficialAdapterRequeriesIdentityBeforeIndependentAtomicAdoption() throws Exception {
        AtomicInteger checks=new AtomicInteger();
        NativeOfficialSession session=new NativeOfficialSession(candidate->NativeCasHttps.officialValidation(candidate,(owner,uri,method,body)->{
            assertEquals(NativeOfficialSession.INFO,uri); assertEquals("GET",method);
            assertEquals("session=synthetic",owner.cookieHeader(uri)); checks.incrementAndGet();
            owner.receiveCookie(uri,"session=rotated-official; Path=/; Secure; HttpOnly");
            return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\"}}");
        }));
        NativeCasCookies candidate=candidate(),verified=session.verify(candidate,"synthetic-id","synthetic-user",()->{});
        assertFalse(session.active()); assertEquals(1,checks.get());
        assertEquals("session=synthetic",candidate.header(NativeOfficialSession.ROOT));
        session.commit(verified); verified.clear(); candidate.clear();
        assertEquals("session=rotated-official",session.header(URI.create("https://classroom.zju.edu.cn")));
        assertNull(session.header(NativeCasDiscovery.CAS_LOGIN));
    }
    @Test public void identityMismatchStatusMalformedBodyAndNetworkFailureNeverPublish() throws Exception {
        for(int kind=0;kind<4;kind++) {
            final int failure=kind;
            NativeOfficialSession session=new NativeOfficialSession(candidate->NativeCasHttps.officialValidation(candidate,(o,u,m,b)->{
                if(failure==3) throw new IOException("synthetic network failure");
                if(failure==2) return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"synthetic-id\",\"id\":\"other\",\"account\":\"synthetic-user\"}}");
                if(failure==1) return new NativeCasHttps.Response(401,Collections.emptyMap(),new byte[0]);
                return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"other\",\"account\":\"synthetic-user\"}}");
            }));
            NativeCasCookies candidate=candidate();
            assertThrows(IOException.class,()->session.verify(candidate,"synthetic-id","synthetic-user",()->{}));
            assertFalse(session.active()); assertEquals(0,session.version());
        }
    }
    @Test public void cancellationCheckpointPreventsAnyOfficialNetworkRequest() throws Exception {
        AtomicInteger requests=new AtomicInteger();
        NativeOfficialSession session=new NativeOfficialSession(candidate->NativeCasHttps.officialValidation(candidate,(o,u,m,b)->{requests.incrementAndGet();throw new IOException();}));
        NativeCasCookies candidate=candidate();
        assertThrows(IOException.class,()->session.verify(candidate,"synthetic-id","synthetic-user",()->{throw new IOException("cancelled");}));
        assertEquals(0,requests.get()); assertFalse(session.active());
    }
    @Test public void oldVerificationCompletionCannotEraseNewVerificationCancellationHandle() throws Exception {
        AtomicInteger opens=new AtomicInteger(),secondCloses=new AtomicInteger();
        var firstEntered=new java.util.concurrent.CountDownLatch(1);
        var secondEntered=new java.util.concurrent.CountDownLatch(1);
        var releaseFirst=new java.util.concurrent.CountDownLatch(1);
        var releaseSecond=new java.util.concurrent.CountDownLatch(1);
        NativeOfficialSession session=new NativeOfficialSession(candidate->{
            int number=opens.incrementAndGet();
            return NativeCasHttps.officialValidation(candidate,new NativeCasHttps.Wire() {
                public NativeCasHttps.Response exchange(NativeCasHttps owner,URI uri,String method,byte[] body) throws IOException {
                    (number==1?firstEntered:secondEntered).countDown();
                    NativeCasLoginTest.await(number==1?releaseFirst:releaseSecond);
                    return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\"}}");
                }
                public void close() { if(number==2) { secondCloses.incrementAndGet(); releaseSecond.countDown(); } }
            });
        });
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var first=pool.submit(()->session.verify(candidate(),"synthetic-id","synthetic-user",()->{}));
            assertTrue(firstEntered.await(5,java.util.concurrent.TimeUnit.SECONDS));
            var second=pool.submit(()->session.verify(candidate(),"synthetic-id","synthetic-user",()->{}));
            assertTrue(secondEntered.await(5,java.util.concurrent.TimeUnit.SECONDS));
            releaseFirst.countDown(); first.get(5,java.util.concurrent.TimeUnit.SECONDS).clear();
            session.cancelVerification();
            assertTrue(secondCloses.get()>0);
            assertThrows(java.util.concurrent.ExecutionException.class,()->second.get(5,java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(session.active());
        } finally { releaseFirst.countDown(); releaseSecond.countDown(); pool.shutdownNow(); }
    }
    @Test public void staleResponseAndCleanupCannotMutateNewlyAdoptedOfficialSession() throws Exception {
        NativeOfficialSession session=new NativeOfficialSession(); NativeCasCookies first=candidate();
        session.commit(first); long oldVersion=session.version();
        NativeCasCookies second=candidate(); second.receive(NativeOfficialSession.ROOT,"session=new-account; Path=/; Secure");
        session.commit(second);
        assertThrows(IOException.class,()->session.receiveIfVersion(NativeOfficialSession.INFO,"session=late; Path=/; Secure",oldVersion));
        assertThrows(IOException.class,()->session.clearIfVersion(oldVersion));
        assertEquals("session=new-account",session.header(NativeOfficialSession.INFO));
        session.clearIfVersion(session.version()); assertNull(session.header(NativeOfficialSession.INFO));
    }
    @Test public void privateCasSsoCookiesNeverAppearInOfficialCandidate() throws Exception {
        NativeCasCookies jar=candidate();
        jar.receive(NativeCasDiscovery.CAS_LOGIN,"JSESSIONID=private; Path=/cas; HttpOnly");
        jar.receive(NativeCasDiscovery.CAS_LOGIN,"CASTGC=private-sso; Domain=zju.edu.cn; Path=/; Secure");
        jar.receive(NativeCasDiscovery.CAS_LOGIN,"TGC=private-sso; Domain=zju.edu.cn; Path=/; Secure");
        NativeCasCookies copy=jar.officialCopy();
        assertEquals("session=synthetic",copy.header(NativeOfficialSession.ROOT));
        assertEquals("",copy.header(NativeCasDiscovery.CAS_LOGIN));
    }
}
