package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

public class NativeCasHttpsCapabilityTest {
    @Test public void consentGateDurableCheckpointAndExactOnePostAreAllRequired() throws Exception {
        NativeVerificationGate gate=new NativeVerificationGate(); AtomicInteger sends=new AtomicInteger();
        assertThrows(IOException.class,()->NativeCasHttps.authorizedForOnePost(false,gate));
        assertThrows(IOException.class,()->NativeCasHttps.authorizedForOnePost(true,null));
        try(NativeCasHttps https=NativeCasHttps.authorizedForOnePost(true,gate,(owner,uri,method,body)->{
            sends.incrementAndGet(); owner.receiveCookie(uri,"JSESSIONID=rotated; Path=/cas; HttpOnly");
            return NativeCasPrototypeTest.redirect(NativeCasPrototypeTest.CALLBACK.toString());
        })) {
            https.receiveCookie(NativeCasDiscovery.CAS_LOGIN,"JSESSIONID=private; Path=/cas; HttpOnly");
            Object initial=https.sessionBinding();
            assertThrows(IOException.class,()->https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0]));
            assertTrue(gate.prepare(true,true,NativeVerificationGate.Captcha.CLEAR,()->assertEquals(0,sends.get())));
            assertTrue(gate.submit(()->{
                assertThrows(IOException.class,()->https.request(URI.create("https://zjuam.zju.edu.cn/cas/login"),"POST",new byte[0]));
                assertEquals(302,https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0]).status);
                assertThrows(IOException.class,()->https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0]));
            }));
            assertNotEquals(initial,https.sessionBinding()); assertEquals(1,sends.get());
            assertFalse(gate.submit(()->fail()));
        }
    }
    @Test public void uncertainSendSpendsCapabilityBeforeWireAndCannotRetryEvenInsideSameCallback() throws Exception {
        NativeVerificationGate gate=new NativeVerificationGate(); AtomicInteger sends=new AtomicInteger();
        try(NativeCasHttps https=NativeCasHttps.authorizedForOnePost(true,gate,(o,u,m,b)->{sends.incrementAndGet();throw new IOException("synthetic network error");})) {
            https.receiveCookie(NativeCasDiscovery.AUTHORIZE,"JSESSIONID=private; Path=/cas; HttpOnly");
            assertTrue(gate.prepare(true,true,NativeVerificationGate.Captcha.CLEAR,()->{}));
            assertTrue(gate.submit(()->{
                assertThrows(IOException.class,()->https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0]));
                assertThrows(IOException.class,()->https.request(NativeCasDiscovery.CAS_LOGIN,"POST",new byte[0]));
            }));
            assertEquals(1,sends.get());
        }
    }
    @Test public void sessionBindingTracksOnlyExactCasSessionMutationIncludingExpiryAndRecreation() throws Exception {
        AtomicLong now=new AtomicLong(1000); NativeCasCookies jar=new NativeCasCookies(now::get);
        URI cas=NativeCasDiscovery.CAS_LOGIN;
        jar.receive(cas,"JSESSIONID=private; Path=/cas; HttpOnly; Max-Age=10"); Object pinned=jar.casSessionBinding();
        jar.receive(cas,"_csrf=synthetic; Domain=zju.edu.cn; Path=/"); assertEquals(pinned,jar.casSessionBinding());
        jar.receive(NativeOfficialSession.ROOT,"JSESSIONID=official; Path=/; Secure"); assertEquals(pinned,jar.casSessionBinding());
        jar.receive(cas,"JSESSIONID=private; Path=/cas; HttpOnly; Max-Age=10"); assertNotEquals(pinned,jar.casSessionBinding());
        Object reset=jar.casSessionBinding();
        jar.receive(cas,"JSESSIONID=; Path=/cas; Max-Age=0"); assertThrows(IOException.class,jar::casSessionBinding);
        jar.receive(cas,"JSESSIONID=private; Path=/cas; Max-Age=1"); assertNotEquals(reset,jar.casSessionBinding());
        now.addAndGet(1000); assertThrows(IOException.class,jar::casSessionBinding);
        for(String scope:new String[]{"Path=/","Path=/cas/login","Path=/cas; Domain=zju.edu.cn","Path=/cas; Domain=zjuam.zju.edu.cn"})
            assertThrows(IOException.class,()->jar.receive(cas,"JSESSIONID=private; "+scope));
    }
    @Test public void closedSessionCannotReceiveOrExportLateCookies() throws Exception {
        NativeCasHttps https=new NativeCasHttps();
        https.receiveCookie(NativeCasDiscovery.CAS_LOGIN,"JSESSIONID=private; Path=/cas; HttpOnly"); https.close();
        assertThrows(IOException.class,()->https.receiveCookie(NativeCasDiscovery.CAS_LOGIN,"JSESSIONID=late; Path=/cas"));
        assertThrows(IOException.class,https::officialCookies); assertThrows(IOException.class,https::sessionBinding);
    }
}
