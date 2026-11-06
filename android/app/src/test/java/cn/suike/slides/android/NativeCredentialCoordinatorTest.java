package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public final class NativeCredentialCoordinatorTest {
    private static final String USER = "synthetic-user", PASS = "synthetic-password", ID = "synthetic-id";
    private static final class Memory implements NativeCredentialState.Store, NativeCredentialState.Access {
        NativeCredentialState.Record disk = NativeCredentialState.Record.empty();
        boolean failWrite, writeThenFail, poisoned;
        @Override public synchronized <T> T transaction(NativeCredentialState.Transaction<T> operation) throws Exception {
            if (poisoned) throw new IOException("poisoned"); return operation.run(this);
        }
        @Override public NativeCredentialState.Record read() throws Exception { NativeCredentialState.validate(disk); return disk; }
        @Override public void write(NativeCredentialState.Record next) throws Exception {
            NativeCredentialState.validate(next);
            if (failWrite) { poisoned = true; throw new IOException("write failed"); }
            disk = next;
            if (writeThenFail) { poisoned = true; throw new IOException("ambiguous write"); }
        }
    }
    private static NativeCredentialCoordinator enrollment(Memory disk) throws Exception {
        NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk); c.beginEnrollment(true); return c;
    }
    private static void install(Memory disk) throws Exception {
        NativeCredentialCoordinator c = enrollment(disk); c.reserveEnrollment(USER, PASS, ID);
        c.verifiedEnrollment(USER, PASS, ID, USER, ID, true, true);
    }
    @Test public void gateReservesDurablyBeforeSyntheticSendAndSavesOnlyVerifiedCandidate() throws Exception {
        Memory disk = new Memory(); NativeCredentialCoordinator c = enrollment(disk); NativeVerificationGate gate = new NativeVerificationGate();
        AtomicInteger sends = new AtomicInteger();
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> c.reserveEnrollment(USER, PASS, ID)));
        assertEquals(NativeCredentialState.Phase.ENROLLMENT_DISPATCHED, disk.disk.phase); assertEquals(1, disk.disk.attempts);
        assertNotEquals(PASS, disk.disk.password);
        assertTrue(gate.submit(() -> { assertEquals(1, disk.disk.attempts); sends.incrementAndGet(); }));
        assertTrue(gate.publish(true, () -> c.verifiedEnrollment(USER, PASS, ID, USER, ID, true, true)));
        assertEquals(1, sends.get()); assertEquals(NativeCredentialState.Phase.READY, disk.disk.phase);
        assertThrows(IOException.class, () -> c.verifiedEnrollment(USER, PASS, ID, USER, ID, true, true));
    }
    @Test public void lackOfConsentCaptchaOrDurabilityNeverSubmits() throws Exception {
        for (NativeVerificationGate.Captcha captcha : NativeVerificationGate.Captcha.values()) {
            Memory disk = new Memory(); NativeCredentialCoordinator c = enrollment(disk); NativeVerificationGate gate = new NativeVerificationGate();
            if (captcha == NativeVerificationGate.Captcha.CLEAR) disk.failWrite = true;
            AtomicInteger sends = new AtomicInteger();
            assertFalse(gate.prepare(true, true, captcha, () -> c.reserveEnrollment(USER, PASS, ID)));
            assertFalse(gate.submit(sends::incrementAndGet)); assertEquals(0, sends.get());
        }
        Memory disk = new Memory(); NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk);
        assertThrows(IOException.class, () -> c.beginEnrollment(false)); assertEquals(NativeCredentialState.Phase.EMPTY, disk.disk.phase);
    }
    @Test public void wrongAccountAndUnknownResultsNeverRetry() throws Exception {
        Memory disk = new Memory(); install(disk);
        NativeCredentialCoordinator wrong = new NativeCredentialCoordinator(disk);
        assertFalse(wrong.reserveExisting(USER, "other")); assertEquals(0, disk.disk.attempts);
        NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk); assertTrue(c.reserveExisting(USER, ID));
        c.handoff((u,p) -> { assertEquals(USER, u); assertEquals(PASS, p); assertEquals(1, disk.disk.attempts); assertEquals(NativeCredentialState.Phase.DISPATCHED, disk.disk.phase); });
        c.finish(NativeCredentialState.Outcome.UNKNOWN, null, null);
        assertEquals(NativeCredentialState.Phase.BLOCKED, disk.disk.phase);
        assertFalse(new NativeCredentialCoordinator(disk).reserveExisting(USER, ID));
    }
    @Test public void quotaSurvivesSeparateControllersAndIsSpentBeforeHandoff() throws Exception {
        Memory disk = new Memory(); install(disk);
        for (int i = 1; i <= 3; i++) {
            NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk); assertTrue(c.reserveExisting(USER, ID));
            assertEquals(i, disk.disk.attempts); c.handoff((u,p) -> {});
            c.finish(NativeCredentialState.Outcome.NOT_SUBMITTED, null, null);
        }
        assertFalse(new NativeCredentialCoordinator(disk).reserveExisting(USER, ID));
    }
    @Test public void failedOrAmbiguousReservationNeverCallsReceiver() throws Exception {
        for (boolean ambiguous : new boolean[]{false, true}) {
            Memory disk = new Memory(); install(disk); disk.failWrite = !ambiguous; disk.writeThenFail = ambiguous;
            NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk); AtomicInteger calls = new AtomicInteger();
            assertThrows(IOException.class, () -> c.reserveExisting(USER, ID));
            assertThrows(IOException.class, () -> c.handoff((u,p) -> calls.incrementAndGet())); assertEquals(0, calls.get());
        }
    }
    @Test public void otherInstanceRevocationSuppressesLateVerification() throws Exception {
        Memory disk = new Memory(); NativeCredentialCoordinator c = enrollment(disk); c.reserveEnrollment(USER, PASS, ID);
        new NativeCredentialCoordinator(disk).cancelAndRevoke();
        assertThrows(IOException.class, () -> c.verifiedEnrollment(USER, PASS, ID, USER, ID, true, true));
        assertEquals(NativeCredentialState.Phase.EMPTY, disk.disk.phase);
    }
    @Test public void cancelBeforeLateCallbacksCannotReviveCredential() throws Exception {
        Memory disk = new Memory(); NativeCredentialCoordinator c = enrollment(disk); c.reserveEnrollment(USER, PASS, ID);
        c.cancelAndRevoke(); assertThrows(IOException.class, () -> c.verifiedEnrollment(USER, PASS, ID, USER, ID, true, true));
        assertEquals(NativeCredentialState.Phase.EMPTY, disk.disk.phase);
    }
    @Test public void cancelWhileHandoffRunsRevokesAndPreventsFinish() throws Exception {
        Memory disk = new Memory(); install(disk); NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk);
        assertTrue(c.reserveExisting(USER, ID)); CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> handoff = pool.submit(() -> { try { c.handoff((u,p) -> { entered.countDown(); if (!release.await(5, TimeUnit.SECONDS)) throw new IOException("timeout"); }); } catch (Exception expected) {} });
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            Future<?> logout = pool.submit(() -> { try { c.cancelAndRevoke(); } catch (Exception e) { throw new RuntimeException(e); } });
            release.countDown(); handoff.get(5, TimeUnit.SECONDS); logout.get(5, TimeUnit.SECONDS);
            assertThrows(IOException.class, () -> c.finish(NativeCredentialState.Outcome.VERIFIED, ID, USER));
            assertEquals(NativeCredentialState.Phase.EMPTY, disk.disk.phase);
        } finally { release.countDown(); pool.shutdownNow(); }
    }
    @Test public void revocationWriteFailureIsReportedNotDeclaredSuccess() throws Exception {
        Memory disk = new Memory(); install(disk); NativeCredentialCoordinator c = new NativeCredentialCoordinator(disk);
        disk.failWrite = true; assertThrows(IOException.class, c::cancelAndRevoke);
        assertThrows(IOException.class, () -> c.reserveExisting(USER, ID));
        assertEquals(NativeCredentialState.Phase.READY, disk.disk.phase); // Remains a cross-restart blocker.
    }
}
