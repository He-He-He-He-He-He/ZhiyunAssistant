package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Fake POST lives only here. This is not a production CAS or identity implementation. */
public class NativeCasOfflineFlowTest {
    private static final class FakeServer {
        int posts, identityRequests;
        String destination = "http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=synthetic";
        String user = "synthetic-user", id = "synthetic-id";
        boolean reserved;
        String post(String username, String password) throws IOException {
            if (!reserved || ++posts != 1 || !username.equals("synthetic-user") || !password.equals("synthetic-secret")) throw new IOException("invalid synthetic submission");
            return destination;
        }
        String[] info() { identityRequests++; return new String[]{id, user}; }
    }
    private static boolean fakeFlow(FakeServer server, boolean consent, NativeVerificationGate.Captcha captcha, String expectedUser, String expectedId) throws Exception {
        NativeVerificationGate gate = new NativeVerificationGate(); AtomicInteger effects = new AtomicInteger();
        if (!gate.prepare(consent, true, captcha, () -> server.reserved = true)) return false;
        final String[] location = {null};
        if (!gate.submit(() -> location[0] = server.post(expectedUser, "synthetic-secret"))) return false;
        URI redirect;
        try { redirect = NativeCasHttps.allowedRedirect(NativeCasDiscovery.CAS_LOGIN, location[0]); }
        catch (IOException invalid) { return false; }
        // Hypothetical HTTPS classroom response; not a claim that the actual upstream uses it.
        if (!redirect.equals(URI.create("https://classroom.zju.edu.cn/synthetic-complete"))) return false;
        String[] identity = server.info();
        return gate.publish(expectedId.equals(identity[0]) && expectedUser.equals(identity[1]), effects::incrementAndGet) && effects.get() == 1;
    }
    @Test public void httpServiceAfterSyntheticPostIsNeverFollowed() throws Exception {
        FakeServer server = new FakeServer(); assertFalse(fakeFlow(server, true, NativeVerificationGate.Captcha.CLEAR, "synthetic-user", "synthetic-id"));
        assertTrue(server.reserved); assertEquals(1, server.posts); assertEquals(0, server.identityRequests);
    }
    @Test public void wrongConsentOrCaptchaNeverCallsSyntheticPost() throws Exception {
        for (NativeVerificationGate.Captcha c : new NativeVerificationGate.Captcha[]{NativeVerificationGate.Captcha.REQUIRED, NativeVerificationGate.Captcha.UNKNOWN}) {
            FakeServer server = new FakeServer(); assertFalse(fakeFlow(server, true, c, "synthetic-user", "synthetic-id")); assertEquals(0, server.posts); assertFalse(server.reserved);
        }
        FakeServer server = new FakeServer(); assertFalse(fakeFlow(server, false, NativeVerificationGate.Captcha.CLEAR, "synthetic-user", "synthetic-id")); assertEquals(0, server.posts);
    }
    @Test public void hypotheticalHttpsExchangeRequiresExactIdentity() throws Exception {
        FakeServer correct = new FakeServer(); correct.destination = "https://classroom.zju.edu.cn/synthetic-complete";
        assertTrue(fakeFlow(correct, true, NativeVerificationGate.Captcha.CLEAR, "synthetic-user", "synthetic-id"));
        for (boolean wrongId : new boolean[]{false, true}) {
            FakeServer mismatch = new FakeServer(); mismatch.destination = "https://classroom.zju.edu.cn/synthetic-complete";
            if (wrongId) mismatch.id = "other"; else mismatch.user = "other";
            assertFalse(fakeFlow(mismatch, true, NativeVerificationGate.Captcha.CLEAR, "synthetic-user", "synthetic-id"));
            assertEquals(1, mismatch.posts); assertEquals(1, mismatch.identityRequests);
        }
    }
}
