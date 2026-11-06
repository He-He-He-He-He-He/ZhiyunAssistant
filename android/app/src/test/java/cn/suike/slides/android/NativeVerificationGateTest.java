package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeVerificationGateTest {
    @Test public void consentFreshBaselineAndPositiveCaptchaAreMandatory() {
        for (int fault = 0; fault < 5; fault++) {
            NativeVerificationGate gate = new NativeVerificationGate(); AtomicInteger calls = new AtomicInteger();
            NativeVerificationGate.Captcha c = fault == 2 ? NativeVerificationGate.Captcha.REQUIRED : fault == 3 ? NativeVerificationGate.Captcha.UNKNOWN : fault == 4 ? null : NativeVerificationGate.Captcha.CLEAR;
            assertFalse(gate.prepare(fault != 0, fault != 1, c, calls::incrementAndGet));
            assertFalse(gate.submit(calls::incrementAndGet));
            assertFalse(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, calls::incrementAndGet));
            assertEquals(0, calls.get());
        }
    }
    @Test public void reserveAndSubmitAreOneShotAndFailuresBlock() {
        for (int fault = 0; fault < 3; fault++) {
            NativeVerificationGate gate = new NativeVerificationGate(); AtomicInteger reserved = new AtomicInteger(), sent = new AtomicInteger(), published = new AtomicInteger();
            final int f = fault;
            boolean ok = gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> { reserved.incrementAndGet(); if (f == 0) throw new IOException(); });
            assertEquals(f != 0, ok);
            assertFalse(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, reserved::incrementAndGet));
            boolean submitted = gate.submit(() -> { sent.incrementAndGet(); if (f == 1) throw new IOException(); });
            assertEquals(f == 2, submitted);
            assertFalse(gate.submit(sent::incrementAndGet));
            assertEquals(f == 2, gate.publish(true, published::incrementAndGet));
            assertFalse(gate.publish(true, published::incrementAndGet));
            assertEquals(1, reserved.get()); assertEquals(f == 0 ? 0 : 1, sent.get()); assertEquals(f == 2 ? 1 : 0, published.get());
        }
    }
    @Test public void missingProofOrPublicationFailureCannotPublishAgain() {
        for (boolean proof : new boolean[]{false, true}) {
            NativeVerificationGate gate = new NativeVerificationGate(); AtomicInteger effects = new AtomicInteger();
            assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
            assertTrue(gate.submit(() -> {}));
            assertFalse(gate.publish(proof, () -> { effects.incrementAndGet(); throw new IOException(); }));
            assertFalse(gate.publish(true, effects::incrementAndGet));
            assertEquals(proof ? 1 : 0, effects.get());
        }
    }
    @Test public void cancellationPreventsLateSubmissionAndPublication() {
        NativeVerificationGate before = new NativeVerificationGate(); before.cancel();
        assertFalse(before.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> fail()));
        NativeVerificationGate reserved = new NativeVerificationGate();
        assertTrue(reserved.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {})); reserved.cancel();
        assertFalse(reserved.submit(() -> fail()));
        NativeVerificationGate sent = new NativeVerificationGate();
        assertTrue(sent.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {})); assertTrue(sent.submit(() -> {})); sent.cancel();
        assertFalse(sent.publish(true, () -> fail()));
    }
    @Test public void concurrentSubmitCanRunOnlyOnce() throws Exception {
        NativeVerificationGate gate = new NativeVerificationGate(); AtomicInteger calls = new AtomicInteger();
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Boolean> run = () -> { start.await(); return gate.submit(calls::incrementAndGet); };
            Future<Boolean> a = pool.submit(run), b = pool.submit(run); start.countDown();
            assertNotEquals(a.get(5, TimeUnit.SECONDS), b.get(5, TimeUnit.SECONDS));
            assertEquals(1, calls.get());
        } finally { start.countDown(); pool.shutdownNow(); }
    }
    @Test public void dispatchCapabilityExistsOnlyInsideCallback() {
        NativeVerificationGate gate = new NativeVerificationGate(); assertFalse(gate.isSubmittingHere());
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> assertFalse(gate.isSubmittingHere())));
        assertFalse(gate.isSubmittingHere()); assertTrue(gate.submit(() -> assertTrue(gate.isSubmittingHere())));
        assertFalse(gate.isSubmittingHere());
    }
    @Test public void reentrantCancellationNeverRearmsAttempt() {
        NativeVerificationGate preflight = new NativeVerificationGate();
        assertFalse(preflight.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, preflight::cancel));
        assertFalse(preflight.submit(() -> fail()));
        NativeVerificationGate submitting = new NativeVerificationGate();
        assertTrue(submitting.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        assertFalse(submitting.submit(submitting::cancel));
        assertFalse(submitting.publish(true, () -> fail()));
        NativeVerificationGate publishing = new NativeVerificationGate();
        assertTrue(publishing.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        assertTrue(publishing.submit(() -> {}));
        assertFalse(publishing.publish(true, publishing::cancel));
        assertFalse(publishing.publish(true, () -> fail()));
    }
    @Test public void cancellationDoesNotWaitForSubmissionAndBlocksLatePublication() throws Exception {
        NativeVerificationGate gate = new NativeVerificationGate();
        assertTrue(gate.prepare(true, true, NativeVerificationGate.Captcha.CLEAR, () -> {}));
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), cancellationStarted = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> submission = pool.submit(() -> gate.submit(() -> { entered.countDown(); if (!release.await(5, TimeUnit.SECONDS)) throw new IOException(); }));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            Future<?> logout = pool.submit(() -> { cancellationStarted.countDown(); gate.cancel(); });
            assertTrue(cancellationStarted.await(5, TimeUnit.SECONDS));
            logout.get(5,TimeUnit.SECONDS); // Cancellation returns even while the wire callback is blocked.
            release.countDown();
            assertFalse(submission.get(5, TimeUnit.SECONDS));
            assertFalse(gate.publish(true, () -> fail()));
        } finally { release.countDown(); pool.shutdownNow(); }
    }
}
