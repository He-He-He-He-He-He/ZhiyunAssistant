package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import static org.junit.Assert.*;

public class NativeCasInfrastructureTest {
    private static final String MODULUS = "d".repeat(128);
    @Test public void officialJavascriptSyntheticVectorsMatch() throws Exception {
        assertEquals("00f07e860f66da0d311ac11bad9b15abbd5dcf79718a6a29cbd3676f5ed6c92ee08f16beb77f2db393517f2491834399bc30205f23c2ed748b6391a25c54eeed", NativeCasRsa.encrypt("abc", MODULUS, "10001"));
        assertEquals("d23990a9236da6393075bbe4fc2b30c71b8263e605356fcbbb09bda89c2de571f6b5f49ef02388728ac24e17c08399e5a3f9ad3195edabf05c6f991750e1db25", NativeCasRsa.encrypt("synthetic-secret", MODULUS, "10001"));
        assertEquals("15cda1f48918c3566efa440c3f988568a5629ff99c94ebde0390a8ae0d2d662d1cf4e0f97d5f410831438f22f23655d58762bf65eadd18755156acc63dcc6bb2 afd47c3b4bb5babccd0cde683826d5f85aa77a36bd9f0989ba0faee9e86b96c96d71fb8c5fd3f8743b8b6ba4cb548079be795f97dd833417462ff4b20cac6131", NativeCasRsa.encrypt("a".repeat(70), MODULUS, "10001"));
    }
    @Test public void malformedKeysAndUnsupportedPasswordsFailClosed() {
        assertThrows(IOException.class, () -> NativeCasRsa.encrypt("秘密", MODULUS, "10001"));
        assertThrows(IOException.class, () -> NativeCasRsa.encrypt("", MODULUS, "10001"));
        assertThrows(IOException.class, () -> NativeCasRsa.encrypt("abc", "00", "10001"));
        assertThrows(IOException.class, () -> NativeCasRsa.encrypt("abc", MODULUS, "2"));
        assertThrows(IOException.class, () -> NativeCasRsa.encrypt("abc", MODULUS, "bad!"));
    }
    @Test public void cookiesArePerInstanceAndExactHostAndPath() throws Exception {
        URI cas = URI.create("https://zjuam.zju.edu.cn/cas/login"), classroom = URI.create("https://classroom.zju.edu.cn/");
        NativeCasHttps a = new NativeCasHttps(), b = new NativeCasHttps();
        try {
            a.receiveCookie(cas, "CASSESSION=synthetic; Path=/cas; Secure; HttpOnly");
            assertEquals("CASSESSION=synthetic", a.cookieHeader(cas)); assertEquals("", a.cookieHeader(classroom)); assertEquals("", b.cookieHeader(cas));
            assertEquals("", a.cookieHeader(URI.create("https://zjuam.zju.edu.cn/cast")));
            a.receiveCookie(cas, "token=x; Domain=zju.edu.cn; Path=/");
            assertEquals("token=x", a.cookieHeader(classroom));
            assertThrows(IOException.class, () -> a.receiveCookie(cas, "token=x; Domain=attacker.invalid; Path=/"));
            a.receiveCookie(cas, "CASSESSION=other; Path=/");
            assertEquals("CASSESSION=synthetic; token=x; CASSESSION=other", a.cookieHeader(cas));
            assertThrows(IOException.class, () -> a.receiveCookie(cas, "bad=x\r\nX-Evil: value"));
            a.receiveCookie(cas, "CASSESSION=; Path=/cas; Max-Age=0"); assertEquals("token=x; CASSESSION=other", a.cookieHeader(cas));
        } finally { a.close(); b.close(); }
    }
    @Test public void cookieDomainPathsExpirationAndPrefixes() throws Exception {
        java.util.concurrent.atomic.AtomicLong now = new java.util.concurrent.atomic.AtomicLong(1000000);
        NativeCasCookies c = new NativeCasCookies(now::get);
        URI cas=URI.create("https://zjuam.zju.edu.cn/cas/login"), school=URI.create("https://classroom.zju.edu.cn/cas/x");
        c.receive(cas,"host=only; Secure");
        c.receive(cas,"domain=shared; Domain=.ZJU.edu.cn; Path=/cas; Secure; Max-Age=2");
        assertEquals("domain=shared",c.header(school));
        assertEquals("host=only; domain=shared",c.header(cas));
        assertEquals("",c.header(URI.create("https://classroom.zju.edu.cn/casino")));
        assertThrows(IOException.class,()->c.receive(cas,"x=y; Domain=cmc.zju.edu.cn"));
        assertThrows(IOException.class,()->c.receive(cas,"x=y; Domain=edu.cn"));
        assertThrows(IOException.class,()->c.receive(cas,"x=y; Domain=zju.edu.cn; Domain=zju.edu.cn"));
        assertThrows(IOException.class,()->c.receive(cas,"__Host-id=x; Secure; Domain=zju.edu.cn; Path=/"));
        assertThrows(IOException.class,()->c.receive(cas,"__Secure-id=x; Path=/"));
        now.addAndGet(2000); assertEquals("",c.header(school)); assertEquals("host=only",c.header(cas));
        c.receive(cas,"old=x; Expires=Wed, 09 Jun 2021 10:18:14 GMT; Path=/"); assertFalse(c.header(cas).contains("old="));
        c.clear(); assertEquals("",c.header(cas));
    }
    @Test public void bearerIsOnlyExtractedFromValidatedTokenCookie() throws Exception {
        assertEquals("", NativeCasHttps.identityBearer("session=synthetic"));
        String serialized = "{i:0;s:6:\"_token\";i:1;s:9:\"synthetic\";}";
        String encoded = java.net.URLEncoder.encode(serialized, "UTF-8");
        assertEquals("synthetic", NativeCasHttps.identityBearer("session=x; _token=" + encoded));
        String wrong = java.net.URLEncoder.encode(serialized.replace("s:9:","s:2:"), "UTF-8");
        assertThrows(IOException.class, () -> NativeCasHttps.identityBearer("_token=" + wrong));
        assertThrows(IOException.class, () -> NativeCasHttps.identityBearer("_token=%GG"));
        assertThrows(IOException.class, () -> NativeCasHttps.identityBearer("_token=" + encoded + "; _token=" + encoded));
    }
    @Test public void redirectTargetsMustBeExactHttpsOrigins() throws Exception {
        URI base = URI.create("https://zjuam.zju.edu.cn/cas/login");
        assertEquals("https://zjuam.zju.edu.cn/cas/next", NativeCasHttps.allowedRedirect(base, "/cas/next").toString());
        assertEquals("classroom.zju.edu.cn", NativeCasHttps.allowedRedirect(base, "https://classroom.zju.edu.cn/?ticket=synthetic").getHost());
        for (String target : new String[]{"http://zjuam.zju.edu.cn/cas/login", "https://zjuam.zju.edu.cn.attacker.invalid/", "https://attacker.invalid/", "https://u@zjuam.zju.edu.cn/", "https://zjuam.zju.edu.cn:444/", "//attacker.invalid/", "https://classroom.zju.edu.cn/#x"})
            assertThrows(IOException.class, () -> NativeCasHttps.allowedRedirect(base, target));
    }
    @Test public void cancellationAndInvalidPostsDoNotReachNetwork() throws Exception {
        NativeCasHttps h = new NativeCasHttps(); h.close();
        assertThrows(IOException.class, () -> h.request(URI.create("https://zjuam.zju.edu.cn/cas/login"), "POST", new byte[0]));
        NativeCasHttps another = new NativeCasHttps();
        try { assertThrows(IOException.class, () -> another.request(URI.create("https://classroom.zju.edu.cn/"), "POST", new byte[0])); }
        finally { another.close(); }
    }
}
