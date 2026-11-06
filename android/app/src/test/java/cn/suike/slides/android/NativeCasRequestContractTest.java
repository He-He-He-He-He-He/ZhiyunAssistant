package cn.suike.slides.android;

import org.junit.Test;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Only synthetic in-memory streams. Header assertions use the real production writer,
 * NOT Wire.exchange (which intentionally bypasses HTTP serialization). No sockets. */
public class NativeCasRequestContractTest {
    private static String write(NativeCasHttps https, URI uri, String method, byte[] body) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        https.writeRequest(out,uri,method,body);
        return new String(out.toByteArray(),StandardCharsets.US_ASCII);
    }
    private static void fixedAgent(String request) {
        String header = "User-Agent: ZhiyunAssistant/0.1 (Android; NativeCAS)\r\n";
        assertTrue(request.contains("\r\n"+header));
        assertEquals(request.indexOf(header),request.lastIndexOf(header));
        assertFalse(request.contains("Dalvik")); assertFalse(request.contains("Chrome"));
        assertFalse(request.contains("Build/")); assertFalse(request.contains("http.agent"));
    }
    @Test public void everyProductionGetAndPostWritesTheSameFixedAgentToActualOutputBytes() throws Exception {
        AtomicInteger bypasses = new AtomicInteger();
        try(NativeCasHttps https = NativeCasHttps.anonymous((owner,uri,method,body)->{
            bypasses.incrementAndGet(); throw new AssertionError("Wire must not be a header test");
        })) {
            URI[] gets = {NativeCasDiscovery.ENTRY,NativeCasDiscovery.AUTHORIZE,NativeCasDiscovery.CAS_LOGIN,
                URI.create("https://zjuam.zju.edu.cn/cas/v2/getPubKey"),
                URI.create("https://zjuam.zju.edu.cn/cas/v2/getKaptchaStatus"),
                NativeCasPrototypeTest.CALLBACK,NativeCasPrototypeTest.EXCHANGE,NativeOfficialSession.ROOT,
                URI.create("https://classroom.zju.edu.cn/userapi/v1/infosimple")};
            for(URI uri:gets) {
                String request=write(https,uri,"GET",null); fixedAgent(request);
                assertTrue(request.startsWith("GET "+uri.getRawPath()+
                    (uri.getRawQuery()==null?"":"?"+uri.getRawQuery())+" HTTP/1.1\r\n"));
                assertTrue(request.endsWith("\r\n\r\n"));
                assertFalse(request.contains("Content-Length:")); assertFalse(request.contains("Cookie:"));
            }
            fixedAgent(write(https,NativeCasDiscovery.CAS_LOGIN,"POST","username=synthetic".getBytes(StandardCharsets.UTF_8)));
            assertEquals(0,bypasses.get());
        }
    }
    @Test public void writerPreservesRawQueryCookieScopeExactFormBytesAndByteLength() throws Exception {
        try(NativeCasHttps https = new NativeCasHttps()) {
            https.receiveCookie(NativeCasDiscovery.CAS_LOGIN,"JSESSIONID=synthetic-private; Path=/cas; HttpOnly");
            byte[] body="username=synthetic%2Buser&password=00a1&authcode=&execution=dynamic-token&_eventId=submit&ys=1".getBytes(StandardCharsets.UTF_8);
            String request=write(https,NativeCasDiscovery.CAS_LOGIN,"POST",body);
            fixedAgent(request);
            assertEquals("POST "+NativeCasDiscovery.CAS_LOGIN.getRawPath()+"?"+
                NativeCasDiscovery.CAS_LOGIN.getRawQuery()+" HTTP/1.1",request.substring(0,request.indexOf("\r\n")));
            assertTrue(request.contains("\r\nHost: zjuam.zju.edu.cn\r\n"));
            assertTrue(request.contains("\r\nCookie: JSESSIONID=synthetic-private\r\n"));
            assertTrue(request.contains("\r\nContent-Type: application/x-www-form-urlencoded\r\n"));
            assertTrue(request.contains("\r\nContent-Length: "+body.length+"\r\n"));
            assertTrue(request.contains("\r\nConnection: close\r\n"));
            assertTrue(request.contains("\r\nCache-Control: no-store\r\n"));
            assertTrue(request.contains("\r\nAccept-Encoding: identity\r\n"));
            assertFalse(request.contains("Transfer-Encoding:")); assertFalse(request.contains("Authorization:"));
            assertArrayEquals(body,request.substring(request.indexOf("\r\n\r\n")+4).getBytes(StandardCharsets.US_ASCII));
            assertTrue(write(https,URI.create("https://zjuam.zju.edu.cn/cas/v2/getPubKey"),"GET",null)
                .contains("\r\nCookie: JSESSIONID=synthetic-private\r\n"));
            assertFalse(write(https,NativeOfficialSession.ROOT,"GET",null).contains("Cookie:"));
            try(NativeCasHttps fresh=new NativeCasHttps()) {
                assertFalse(write(fresh,NativeCasDiscovery.CAS_LOGIN,"GET",null).contains("Cookie:"));
            }
        }
    }
    @Test public void uncertainRealWriterFailureKeepsTypedSafeDiagnosticsWithoutSensitiveText() throws Exception {
        NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        c.stage(NativeCasDiagnostics.Stage.POST);
        try(NativeCasHttps https=new NativeCasHttps()) {
            https.diagnostics(c);
            IOException original=assertThrows(IOException.class,()->https.writeRequest(new OutputStream() {
                @Override public void write(int b) throws IOException { throw new IOException(NativeCasDiagnosticsTest.CANARY); }
            },NativeCasDiscovery.CAS_LOGIN,"POST",NativeCasDiagnosticsTest.CANARY.getBytes(StandardCharsets.UTF_8)));
            c.fail(original);
            assertEquals(NativeCasDiagnostics.Stage.POST,d.latest().stage);
            assertEquals(NativeCasDiagnostics.Post.MAY_HAVE_BEEN_SENT,d.latest().post);
            assertEquals(NativeCasDiagnostics.Category.IO,d.latest().category);
            NativeCasDiagnosticsTest.safe(d);
        }
    }
    @Test public void nonRedirectPostIncluding500IsPostStageOneSendAndNoCallbackOrFallback() throws Exception {
        for(int status:new int[]{200,301,307,308,400,403,500,502}) {
            NativeCasPrototypeTest.Fake f=new NativeCasPrototypeTest.Fake(); f.postStatus=status;
            NativeCasDiagnostics d=new NativeCasDiagnostics();
            NativeVerificationGate gate=new NativeVerificationGate();
            NativeCasPrototype p=new NativeCasPrototype(f,gate,d.begin(NativeCasDiagnostics.Kind.ENROLLMENT));
            NativeCasDiagnostics.Failure error=assertThrows(NativeCasDiagnostics.Failure.class,
                ()->p.run(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID,
                    ()->f.reserved=true,()->fail("must not publish")));
            assertEquals(NativeCasDiagnostics.Stage.POST,error.stage);
            assertEquals(NativeCasDiagnostics.Category.HTTP_STATUS,error.category); assertEquals(status,error.http);
            assertEquals(NativeCasDiagnostics.Stage.POST,d.latest().stage);
            assertEquals(NativeCasDiagnostics.Result.FAILED,d.latest().result);
            assertEquals(NativeCasDiagnostics.Post.RESPONDED,d.latest().post);
            assertEquals(status,d.latest().postHttp); assertEquals(status,d.latest().http);
            assertFalse(d.latest().visited.contains(NativeCasDiagnostics.Stage.CALLBACK));
            assertFalse(f.gets.contains(NativeCasPrototypeTest.CALLBACK));
            assertEquals(6,f.gets.size()); assertEquals(1,f.posts.get()); assertTrue(f.closed);
            assertThrows(IOException.class,()->p.run(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,
                NativeCasLoginTest.ID,()->fail("no second reservation"),()->fail("no fallback")));
            assertFalse(gate.submit(()->fail("no second dispatch")));
            assertEquals(1,f.posts.get()); assertEquals(6,f.gets.size());
            NativeCasDiagnosticsTest.safe(d);
        }
    }
}
