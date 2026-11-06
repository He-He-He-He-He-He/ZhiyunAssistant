package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

public class NativeCasDiscoveryTest {
    private static final String FORM = "<form id='fm1' action='/cas/login' method='post'><input type='hidden' name='execution' value='synthetic'><input type='hidden' name='_eventId' value='submit'></form>";
    private static final String KEY = "{\"modulus\":\"" + "d".repeat(128) + "\",\"exponent\":\"10001\"}";
    private static NativeCasHttps.Response redirect(int status, String location) {
        return new NativeCasHttps.Response(status, Map.of("location", Collections.singletonList(location)), new byte[0]);
    }
    private static NativeCasHttps.Response ok(String body) { return new NativeCasHttps.Response(200, Collections.emptyMap(), body.getBytes(StandardCharsets.UTF_8)); }
    private static class Fake implements NativeCasPreflight.Get {
        final List<URI> seen = new ArrayList<>(); String first = NativeCasDiscovery.AUTHORIZE.toString(), second = NativeCasDiscovery.CAS_LOGIN.toString(); int status = 302; boolean captcha;
        public NativeCasHttps.Response get(URI u) throws IOException {
            seen.add(u);
            if (u.equals(NativeCasDiscovery.ENTRY)) return redirect(status, first);
            if (u.equals(NativeCasDiscovery.AUTHORIZE)) return redirect(status, second);
            if (u.equals(NativeCasDiscovery.CAS_LOGIN)) return ok(FORM.replace("action='/cas/login'", "action='/cas/login?" + u.getRawQuery() + "'"));
            if (u.toString().endsWith("/getPubKey")) return ok(KEY);
            if (u.toString().endsWith("/getKaptchaStatus")) return ok(captcha ? "true" : "false");
            throw new IOException("unexpected request");
        }
    }
    @Test public void followsOnlyExactDocumentedAnonymousChainThenPreflights() throws Exception {
        Fake fake = new Fake(); NativeCasPreflight.Prepared result = NativeCasDiscovery.fetch(fake);
        assertEquals("synthetic", result.execution); assertEquals(5, fake.seen.size());
        assertEquals(NativeCasDiscovery.ENTRY, fake.seen.get(0)); assertEquals(NativeCasDiscovery.AUTHORIZE, fake.seen.get(1)); assertEquals(NativeCasDiscovery.CAS_LOGIN, fake.seen.get(2));
    }
    @Test public void rejectsUntrustedAndChangedLocationsWithoutFollowing() {
        for (String target : new String[]{"http://zjuam.zju.edu.cn/cas/oauth2.0/authorize", "https://attacker.invalid/", "https://zjuam.zju.edu.cn/other", "https://tgmedia.cmc.zju.edu.cn/index.php?r=auth/login", NativeCasDiscovery.AUTHORIZE + "&extra=1"}) {
            Fake f = new Fake(); f.first = target; assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(f)); assertEquals(1, f.seen.size());
        }
        Fake f = new Fake(); f.second = "https://zjuam.zju.edu.cn/cas/login?service=https%3A%2F%2Fattacker.invalid";
        assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(f)); assertEquals(2, f.seen.size());
    }
    @Test public void rejectsRedirectStatusAndCaptchaAndHttpServiceHandoff() {
        for (int status : new int[]{200, 301, 303, 307, 308, 500}) { Fake f = new Fake(); f.status = status; assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(f)); assertEquals(1, f.seen.size()); }
        Fake captcha = new Fake(); captcha.captcha = true; assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(captcha)); assertEquals(5, captcha.seen.size());
        assertThrows(IOException.class, () -> NativeCasHttps.allowedRedirect(NativeCasDiscovery.CAS_LOGIN, "http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=synthetic"));
    }
    @Test public void discoveryRefusesFormActionThatDropsService() {
        Fake f = new Fake() {
            @Override public NativeCasHttps.Response get(URI u) throws IOException {
                if (u.equals(NativeCasDiscovery.CAS_LOGIN)) { seen.add(u); return ok(FORM); }
                return super.get(u);
            }
        };
        assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(f)); assertEquals(3, f.seen.size());
    }
    @Test public void duplicateLocationCannotBeAccepted() {
        NativeCasHttps.Response ambiguous = new NativeCasHttps.Response(302, Map.of("location", List.of(NativeCasDiscovery.AUTHORIZE.toString(), "https://attacker.invalid/")), new byte[0]);
        assertThrows(IOException.class, () -> NativeCasDiscovery.fetch(uri -> ambiguous));
    }
}
