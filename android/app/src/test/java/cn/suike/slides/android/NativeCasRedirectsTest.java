package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import static org.junit.Assert.*;

/** Only synthetic credentials; no network, logging, device access or real tickets. */
public class NativeCasRedirectsTest {
    static final String CALLBACK = "https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?";
    static final String EXCHANGE = "https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&";
    static final String[] OPAQUE = {
        "synthetic.dot", "synthetic~tilde", "synthetic%25percent",
        "synthetic%26ticket%3Dother%3B%23%3F", "synthetic+plus%2B",
        "synthetic%2526%253D%250A%25FF", "synthetic%2f%2F%3d%3D",
        "synthetic!$'()*+,;=:@/?", "synthetic%E4%B8%AD"
    };
    static void rejected(String location, boolean callback) {
        IOException e = assertThrows(IOException.class, () -> {
            URI u = NativeCasHttps.allowedRedirect(NativeCasDiscovery.CAS_LOGIN, location);
            if (callback) NativeCasRedirects.requireCallback(u);
            else NativeCasRedirects.requireExchange(u);
        });
        assertNull(e.getCause());
        assertFalse(e.getMessage().contains("synthetic"));
        assertFalse(e.getMessage().contains("https:"));
    }
    @Test public void opaqueValuesAcceptUriSyntaxWithoutChangingRawEncoding() throws Exception {
        for (String suffix : OPAQUE) {
            String raw = "ticket=ST-" + suffix;
            URI callback = NativeCasHttps.allowedRedirect(NativeCasDiscovery.CAS_LOGIN, CALLBACK + raw);
            NativeCasRedirects.requireCallback(callback);
            assertEquals(raw, callback.getRawQuery());
            URI exchange = URI.create(EXCHANGE + "code=" + suffix);
            NativeCasRedirects.requireExchange(exchange);
            assertTrue(exchange.getRawQuery().endsWith("code=" + suffix));
        }
        URI u = URI.create(CALLBACK + "ticket=ST-a%2526b+%2B%25");
        assertEquals("ST-a%26b++%", NativeCasRedirects.query(u).get("ticket"));
        NativeCasRedirects.requireCallback(URI.create(CALLBACK + "%74icket=%53%54%2Dsynthetic"));
    }
    @Test public void emptyDuplicateMissingAndExtraParametersAreRejected() {
        for (String query : new String[]{
                "", "ticket", "=ST-synthetic", "ticket=", "ticket=ST-", "ticket=synthetic",
                "ticket=ST-synthetic&ticket=ST-other", "ticket=ST-synthetic&%74icket=ST-other",
                "ticket=ST-synthetic&ticket=", "ticket=ST-synthetic&extra=x",
                "ticket=ST-synthetic&", "&ticket=ST-synthetic", "t%250Aicket=ST-synthetic"})
            rejected(CALLBACK + query, true);
        for (String query : new String[]{"code=", "code", "code=synthetic&code=other",
                "code=synthetic&%63ode=other", "code=synthetic&extra=x"})
            rejected(EXCHANGE + query, false);
        rejected(EXCHANGE.replace("r=auth%2Fget-info&", "") + "code=synthetic", false);
        rejected(EXCHANGE.replace("classroom", "attacker") + "code=synthetic", false);
        rejected(EXCHANGE.replace("auth%2Fget-info", "auth%252Fget-info") + "code=synthetic", false);
    }
    @Test public void malformedEscapesUtf8AndControlsAreRejectedNotReplaced() {
        for (String value : new String[]{"synthetic%", "synthetic%2", "synthetic%GG", "synthetic%FF",
                "synthetic%C0%AF", "synthetic%C3%28", "synthetic%E2%82", "synthetic%ED%A0%80",
                "synthetic%F4%90%80%80", "synthetic%00", "synthetic%09", "synthetic%0A",
                "synthetic%0D", "synthetic%7F", "synthetic%C2%85", "synthetic\n", "synthetic\r",
                "synthetic\u0000", "synthetic\u007f", "synthetic\u0085", "synthetic中"}) {
            rejected(CALLBACK + "ticket=ST-" + value, true);
            rejected(EXCHANGE + "code=" + value, false);
        }
        rejected(CALLBACK + "tick%FFet=ST-synthetic", true);
        rejected(CALLBACK + "ticket=ST-synthetic&x=%00", true);
    }
    @Test public void decodedAndRawLengthBoundsAreEnforced() throws Exception {
        NativeCasRedirects.requireCallback(URI.create(CALLBACK + "ticket=ST-" + "x".repeat(512)));
        NativeCasRedirects.requireCallback(URI.create(CALLBACK + "ticket=ST-" + "%78".repeat(512)));
        NativeCasRedirects.requireExchange(URI.create(EXCHANGE + "code=" + "%78".repeat(1024)));
        rejected(CALLBACK + "ticket=ST-" + "x".repeat(513), true);
        rejected(CALLBACK + "ticket=ST-" + "%78".repeat(513), true);
        rejected(EXCHANGE + "code=" + "x".repeat(1025), false);
        rejected(EXCHANGE + "code=" + "%78".repeat(1025), false);
        rejected(CALLBACK + "ticket=ST-" + "x".repeat(4096), true);
    }
    @Test public void exactHttpsEndpointsRemainRequiredEvenWhenInvokedDirectly() {
        for (String target : new String[]{
                CALLBACK.replace("https:", "http:"), CALLBACK.replace("zjuam", "attacker"),
                CALLBACK.replace("zjuam.zju.edu.cn", "zjuam.zju.edu.cn:444"),
                CALLBACK.replace("zjuam.zju.edu.cn", "synthetic@zjuam.zju.edu.cn"),
                CALLBACK.replace("callbackAuthorize", "%63allbackAuthorize"),
                CALLBACK.replace("callbackAuthorize", "callbackAuthorize/")})
            rejected(target + "ticket=ST-synthetic", true);
        rejected(CALLBACK + "ticket=ST-synthetic#fragment", true);
        assertThrows(IOException.class, () -> NativeCasRedirects.requireCallback(
            URI.create(CALLBACK.replace("https:", "http:") + "ticket=ST-synthetic")));
        assertThrows(IOException.class, () -> NativeCasRedirects.requireExchange(
            URI.create(EXCHANGE.replace("https:", "http:") + "code=synthetic")));
    }
}
