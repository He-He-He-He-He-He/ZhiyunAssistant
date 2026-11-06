package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeCasPreflightTest {
    private static final String FORM = "<form id='fm1' method='post' action='/cas/login'><input type='hidden' name='execution' value='e1s1'><input type='hidden' name='_eventId' value='submit'><input type='hidden' name='ys' value='5'></form>";
    private static final String KEY = "{\"modulus\":\"" + "d".repeat(128) + "\",\"exponent\":\"10001\"}";
    private static NativeCasHttps.Response response(int status, String body) { return new NativeCasHttps.Response(status, Collections.emptyMap(), body.getBytes(StandardCharsets.UTF_8)); }
    private static NativeCasPreflight.Get fixture(String form, String key, String captcha, int failureStatus, AtomicInteger calls) {
        return uri -> { calls.incrementAndGet(); if (failureStatus != 0) return response(failureStatus, ""); if (uri.getPath().endsWith("getPubKey")) return response(200, key); if (uri.getPath().endsWith("getKaptchaStatus")) return response(200, captcha); return response(200, form); };
    }
    @Test public void syntheticPreflightFetchesDynamicFieldsAndChecksCaptchaLast() throws Exception {
        AtomicInteger calls = new AtomicInteger(); NativeCasPreflight.Prepared p = NativeCasPreflight.fetch(fixture(FORM, KEY, "false", 0, calls));
        assertEquals(3, calls.get()); assertEquals("e1s1", p.execution); assertEquals("5", p.ys); assertEquals("10001", p.exponent);
        assertNotEquals(NativeCasRsa.encrypt("one", p.modulus, p.exponent), NativeCasRsa.encrypt("two", p.modulus, p.exponent));
    }
    @Test public void supportsLongUrlSafeExecutionAndOptionalYs() throws Exception {
        String token = "a".repeat(3935) + "_=";
        String form = FORM.replace("e1s1", token).replace("<input type='hidden' name='ys' value='5'>", "");
        NativeCasPreflight.Prepared p = NativeCasPreflight.fetch(fixture(form, KEY, "false", 0, new AtomicInteger()));
        assertEquals(token, p.execution); assertNull(p.ys);
    }
    @Test public void captchaRequiredUnknownAndErrorsFailClosed() {
        for (String s : new String[]{"true", "", "null", "0", "false false", "{\"captcha\":false}"}) {
            AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> NativeCasPreflight.fetch(fixture(FORM, KEY, s, 0, calls))); assertEquals(3, calls.get());
        }
        for (int status : new int[]{302, 400, 403, 500}) { AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> NativeCasPreflight.fetch(fixture(FORM, KEY, "false", status, calls))); assertEquals(1, calls.get()); }
    }
    @Test public void missingDuplicateOrUnexpectedCsrfFieldsFailClosed() {
        for (String form : new String[]{FORM.replace("name='execution'", "name='other'"), FORM.replace("value='e1s1'", "value=''") , FORM.replace("action='/cas/login'", "action='https://evil.invalid/'"), FORM.replace("</form>", "<input type='hidden' name='execution' value='duplicate'></form>"), FORM.replace("value='submit'", "value='cancel'"), FORM.replace("method='post'", "method='get'")}) {
            AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> NativeCasPreflight.fetch(fixture(form, KEY, "false", 0, calls))); assertEquals(1, calls.get());
        }
    }
    @Test public void publicKeyRequiresLiteralClosingBraceInEitherOrder() throws Exception {
        String modulus="d".repeat(128);
        String[] parsed=NativeCasPreflight.parseKey(" { \"exponent\":\"10001\", \"modulus\":\""+modulus+"\" } ");
        assertArrayEquals(new String[]{modulus,"10001"},parsed);
        assertThrows(IOException.class,()->NativeCasPreflight.parseKey(KEY.substring(0,KEY.length()-1)));
        assertThrows(IOException.class,()->NativeCasPreflight.parseKey(KEY+"}"));
    }
    @Test public void malformedOrAmbiguousPublicKeyFailsClosed() {
        for (String key : new String[]{"{}", KEY.replace("modulus", "exponent"), KEY.substring(0, KEY.length()-1) + ",\"extra\":\"1\"}", "{\"modulus\":\"x\",\"exponent\":\"10001\"}"}) {
            AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> NativeCasPreflight.fetch(fixture(FORM, key, "false", 0, calls))); assertEquals(2, calls.get());
        }
    }
    @Test public void realPostIsUnconditionallyDisabledEvenWithCasAddress() {
        NativeCasHttps transport = new NativeCasHttps();
        try { assertThrows(IOException.class, () -> transport.request(URI.create("https://zjuam.zju.edu.cn/cas/login"), "POST", "synthetic".getBytes(StandardCharsets.UTF_8))); }
        finally { transport.close(); }
    }
}
