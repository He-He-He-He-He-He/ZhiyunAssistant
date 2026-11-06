package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeCredentialStateTest {
    private static final String USER = "synthetic-user", PASSWORD = "synthetic-secret", ID = "synthetic-id";
    private static final class Memory implements NativeCredentialState.Store, NativeCredentialState.Access {
        NativeCredentialState.Record disk = NativeCredentialState.Record.empty();
        boolean readFail, writeFail, writeThenFail, poisoned;
        public synchronized <T> T transaction(NativeCredentialState.Transaction<T> op) throws Exception {
            if (poisoned) throw new IOException("poisoned"); return op.run(this);
        }
        public NativeCredentialState.Record read() throws Exception {
            if (readFail) throw new IOException("read failed"); NativeCredentialState.validate(disk); return disk;
        }
        public void write(NativeCredentialState.Record next) throws Exception {
            NativeCredentialState.validate(next);
            if (writeFail) { poisoned = true; throw new IOException("write failed"); }
            disk = next;
            if (writeThenFail) { poisoned = true; throw new IOException("ambiguous write"); }
        }
    }
    private static String enroll(NativeCredentialState state) throws Exception { return state.beginEnrollment(true); }
    private static void save(NativeCredentialState state, String enrollment) throws Exception {
        state.saveVerified(enrollment, true, true, USER, PASSWORD, ID, USER, ID, USER);
    }
    private static void submitEnrollment(NativeCredentialState state, String enrollment) throws Exception { state.dispatchEnrollment(enrollment, USER, PASSWORD, ID, (u, p) -> {}); }
    private static void install(NativeCredentialState state) throws Exception { String enrollment = enroll(state); submitEnrollment(state, enrollment); save(state, enrollment); }

    @Test public void rejectsWithoutConsentCleanupAndBothExactIdentities() throws Exception {
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory);
        assertThrows(IOException.class, () -> state.beginEnrollment(false));
        String e = enroll(state);
        assertThrows(IOException.class, () -> state.saveVerified(e, false, true, USER, PASSWORD, ID, USER, ID, USER));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, false, USER, PASSWORD, ID, USER, ID, USER));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, true, USER, PASSWORD, ID, USER, "other", USER));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, true, USER, PASSWORD, ID, "other", ID, USER));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, true, USER, PASSWORD, ID, USER, ID, "other"));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, true, USER, "", ID, USER, ID, USER));
        assertNull(state.reserve());
        assertThrows(IOException.class, () -> save(state, e));
        submitEnrollment(state, e); save(state, e); assertNotNull(state.reserve());
    }
    @Test public void enrollmentAndLogoutInvalidateOldAndLateOperationsAcrossInstances() throws Exception {
        Memory memory = new Memory(); NativeCredentialState a = new NativeCredentialState(memory), b = new NativeCredentialState(memory);
        install(a); String attempt = a.reserve(); String enrollment = b.beginEnrollment(true);
        assertThrows(IOException.class, () -> a.dispatch(attempt, (u, p) -> fail()));
        assertThrows(IOException.class, () -> a.finish(attempt, NativeCredentialState.Outcome.VERIFIED, ID, USER));
        b.revoke(); assertThrows(IOException.class, () -> save(a, enrollment)); assertNull(a.reserve());
        String newer = enroll(a); String newer2 = enroll(b);
        assertThrows(IOException.class, () -> save(a, newer)); submitEnrollment(b, newer2); save(b, newer2);
        String inFlight = a.reserve(); a.dispatch(inFlight, (u, p) -> {}); b.revoke();
        assertThrows(IOException.class, () -> a.finish(inFlight, NativeCredentialState.Outcome.VERIFIED, ID, USER)); assertNull(a.reserve());
    }
    @Test public void quotaIsDurableBeforeDispatchAndNoRetryAfterThird() throws Exception {
        Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
        AtomicInteger submissions = new AtomicInteger();
        for (int i = 1; i <= 3; i++) {
            String t = new NativeCredentialState(memory).reserve(); assertEquals(i, memory.disk.attempts);
            assertEquals(NativeCredentialState.Phase.RESERVED, memory.disk.phase);
            s.dispatch(t, (user, password) -> { assertEquals(USER, user); assertEquals(PASSWORD, password); assertEquals(NativeCredentialState.Phase.DISPATCHED, memory.disk.phase); submissions.incrementAndGet(); });
            assertThrows(IOException.class, () -> s.dispatch(t, (u, p) -> fail()));
            s.finish(t, NativeCredentialState.Outcome.NOT_SUBMITTED, null, null);
        }
        assertNull(s.reserve()); assertEquals(3, submissions.get());
    }
    @Test public void onlyVerifiedMatchingAccountResetsFailures() throws Exception {
        Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
        String t = s.reserve(); s.dispatch(t, (u,p) -> {});
        s.finish(t, NativeCredentialState.Outcome.VERIFIED, ID, USER); assertEquals(0, memory.disk.attempts);
        t = s.reserve(); s.dispatch(t, (u,p) -> {}); final String wrong = t;
        assertThrows(IOException.class, () -> s.finish(wrong, NativeCredentialState.Outcome.VERIFIED, "other", USER));
        assertEquals(NativeCredentialState.Phase.BLOCKED, memory.disk.phase); assertNull(s.reserve());
    }
    @Test public void rejectedUnknownAndCrashedAttemptsFailClosed() throws Exception {
        for (NativeCredentialState.Outcome outcome : new NativeCredentialState.Outcome[]{NativeCredentialState.Outcome.REJECTED, NativeCredentialState.Outcome.UNKNOWN}) {
            Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
            String t = s.reserve(); s.dispatch(t, (u,p) -> {}); s.finish(t, outcome, null, null);
            assertNull(new NativeCredentialState(memory).reserve());
        }
        Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
        s.reserve(); assertNull(new NativeCredentialState(memory).reserve());
        Memory second = new Memory(); NativeCredentialState retry = new NativeCredentialState(second); install(retry); String token = retry.reserve();
        assertThrows(IOException.class, () -> retry.dispatch(token, (u,p) -> { throw new IOException("uncertain"); }));
        assertEquals(NativeCredentialState.Phase.DISPATCHED, second.disk.phase); assertNull(new NativeCredentialState(second).reserve());
    }
    @Test public void preSubmitAndAmbiguousWriteFailuresNeverCallSubmitter() throws Exception {
        for (boolean after : new boolean[]{false, true}) {
            Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
            if (after) memory.writeThenFail = true; else memory.writeFail = true;
            assertThrows(IOException.class, s::reserve); assertThrows(IOException.class, s::reserve);
        }
        Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s); String t = s.reserve(); memory.writeFail = true;
        AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> s.dispatch(t, (u,p) -> calls.incrementAndGet())); assertEquals(0, calls.get());
        assertThrows(IOException.class, s::revoke);
    }
    @Test public void unreadableAndCorruptRecordsNeverPermitDispatchOrOverwrite() throws Exception {
        Memory memory = new Memory(); NativeCredentialState s = new NativeCredentialState(memory); install(s);
        memory.readFail = true;
        assertThrows(IOException.class, s::reserve); assertThrows(IOException.class, s::revoke);
        assertThrows(IOException.class, () -> s.beginEnrollment(true));
        memory.readFail = false;
        memory.disk = new NativeCredentialState.Record(NativeCredentialState.Phase.READY, USER, PASSWORD, ID, -1, "");
        assertThrows(IOException.class, s::reserve); assertThrows(IOException.class, s::revoke);
    }
    @Test public void oneConcurrentReservationAndLogoutWaitsForDispatchEntry() throws Exception {
        Memory memory = new Memory(); NativeCredentialState a = new NativeCredentialState(memory), b = new NativeCredentialState(memory); install(a);
        var pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<String>> reservations = new ArrayList<>(); for (int i = 0; i < 8; i++) reservations.add(pool.submit(a::reserve));
            String token = null; int count = 0; for (Future<String> f : reservations) { String value = f.get(5, TimeUnit.SECONDS); if (value != null) { token = value; count++; } }
            assertEquals(1, count); final String t = token;
            CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
            Future<?> send = pool.submit(() -> { a.dispatch(t, (u,p) -> { entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); }); return null; });
            assertTrue(entered.await(5, TimeUnit.SECONDS)); Future<?> logout = pool.submit(() -> { b.revoke(); return null; });
            release.countDown(); send.get(5, TimeUnit.SECONDS); logout.get(5, TimeUnit.SECONDS);
            assertThrows(IOException.class, () -> a.finish(t, NativeCredentialState.Outcome.VERIFIED, ID, USER)); assertNull(a.reserve());
        } finally { pool.shutdownNow(); }
    }
    @Test public void refusingConsentRevokesExistingCredential() throws Exception {
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); install(state);
        assertThrows(IOException.class, () -> state.beginEnrollment(false));
        assertEquals(NativeCredentialState.Phase.EMPTY, memory.disk.phase); assertNull(state.reserve());
    }
    @Test public void enrollmentAttemptIsDurableOneShotAndBoundToCandidate() throws Exception {
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); String e = enroll(state);
        AtomicInteger calls = new AtomicInteger();
        state.dispatchEnrollment(e, USER, PASSWORD, ID, (u, p) -> {
            assertEquals(NativeCredentialState.Phase.ENROLLMENT_DISPATCHED, memory.disk.phase);
            assertNotEquals(PASSWORD, memory.disk.password); calls.incrementAndGet();
        });
        assertThrows(IOException.class, () -> state.dispatchEnrollment(e, USER, PASSWORD, ID, (u, p) -> calls.incrementAndGet()));
        assertThrows(IOException.class, () -> state.saveVerified(e, true, true, USER, "different", ID, USER, ID, USER));
        assertEquals(NativeCredentialState.Phase.EMPTY, memory.disk.phase);
        assertThrows(IOException.class, () -> save(state, e)); assertNull(state.reserve());
        assertEquals(1, calls.get());
    }
    @Test public void enrollmentFailurePermanentlyInvalidatesOnlyItsOwnAttempt() throws Exception {
        for (int failure = 0; failure < 6; failure++) {
            Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); String e = enroll(state);
            submitEnrollment(state, e); final int kind = failure;
            assertThrows(IOException.class, () -> state.saveVerified(e, kind != 0, kind != 1, USER, kind == 5 ? "wrong" : PASSWORD, ID,
                    kind == 2 ? "other" : USER, kind == 3 ? "other" : ID, kind == 4 ? "other" : USER));
            assertEquals(NativeCredentialState.Phase.EMPTY, memory.disk.phase);
            assertThrows(IOException.class, () -> save(state, e)); assertNull(state.reserve());
        }
    }
    @Test public void staleEnrollmentFailureCannotEraseNewAttempt() throws Exception {
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory);
        String stale = enroll(state); submitEnrollment(state, stale);
        String current = enroll(state); submitEnrollment(state, current);
        assertThrows(IOException.class, () -> state.saveVerified(stale, false, false, USER, PASSWORD, ID, USER, ID, USER));
        assertEquals(NativeCredentialState.Phase.ENROLLMENT_DISPATCHED, memory.disk.phase);
        save(state, current); assertNotNull(state.reserve());
    }
    @Test public void failedInvalidationWriteIsReportedAndPoisonsProcess() throws Exception {
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); String e = enroll(state);
        submitEnrollment(state, e); memory.writeFail = true;
        assertThrows(IOException.class, () -> state.saveVerified(e, false, true, USER, PASSWORD, ID, USER, ID, USER));
        assertThrows(IOException.class, () -> save(state, e)); assertThrows(IOException.class, state::reserve);
    }
    @Test public void concurrentEnrollmentSubmissionsAllowOnlyOne() throws Exception {
        Memory memory = new Memory(); NativeCredentialState a = new NativeCredentialState(memory), b = new NativeCredentialState(memory);
        String e = enroll(a); AtomicInteger calls = new AtomicInteger(); var pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Boolean> first = () -> {
                start.await(); try { a.dispatchEnrollment(e, USER, PASSWORD, ID, (u,p) -> calls.incrementAndGet()); return true; }
                catch (IOException invalidated) { return false; }
            };
            java.util.concurrent.Callable<Boolean> second = () -> {
                start.await(); try { b.dispatchEnrollment(e, USER, PASSWORD, ID, (u,p) -> calls.incrementAndGet()); return true; }
                catch (IOException invalidated) { return false; }
            };
            Future<Boolean> x = pool.submit(first), y = pool.submit(second); start.countDown();
            assertNotEquals(x.get(5, TimeUnit.SECONDS), y.get(5, TimeUnit.SECONDS)); assertEquals(1, calls.get());
            b.revoke(); assertThrows(IOException.class, () -> save(a, e));
        } finally { pool.shutdownNow(); }
    }
    @Test public void enrollmentWriteFailureOrUnknownResultNeverResubmits() throws Exception {
        for (boolean ambiguous : new boolean[]{false, true}) {
            Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); String e = enroll(state);
            memory.writeFail = !ambiguous; memory.writeThenFail = ambiguous; AtomicInteger calls = new AtomicInteger();
            assertThrows(IOException.class, () -> state.dispatchEnrollment(e, USER, PASSWORD, ID, (u, p) -> calls.incrementAndGet()));
            assertEquals(0, calls.get());
        }
        Memory memory = new Memory(); NativeCredentialState state = new NativeCredentialState(memory); String e = enroll(state);
        assertThrows(IOException.class, () -> state.dispatchEnrollment(e, USER, PASSWORD, ID, (u, p) -> { throw new IOException("unknown"); }));
        assertThrows(IOException.class, () -> new NativeCredentialState(memory).dispatchEnrollment(e, USER, PASSWORD, ID, (u, p) -> fail()));
        state.revoke(); assertThrows(IOException.class, () -> save(state, e));
    }
    @Test public void encryptedEnvelopeRejectsTamperingAndWrongKeys() throws Exception {
        javax.crypto.KeyGenerator generator = javax.crypto.KeyGenerator.getInstance("AES"); generator.init(256);
        javax.crypto.SecretKey key = generator.generateKey(), other = generator.generateKey();
        NativeCredentialState.Record record = new NativeCredentialState.Record(NativeCredentialState.Phase.READY, USER, PASSWORD, ID, 2, "");
        byte[] first = NativeCredentialStore.seal(record, key), second = NativeCredentialStore.seal(record, key);
        assertFalse(java.util.Arrays.equals(first, second));
        assertFalse(new String(first, java.nio.charset.StandardCharsets.ISO_8859_1).contains(PASSWORD));
        assertEquals(PASSWORD, NativeCredentialStore.open(first, key).password);
        assertThrows(Exception.class, () -> NativeCredentialStore.open(first, other));
        for (int offset : new int[]{1, 13, first.length - 1}) {
            byte[] tampered = first.clone(); tampered[offset] ^= 1;
            assertThrows(Exception.class, () -> NativeCredentialStore.open(tampered, key));
        }
    }
    @Test public void codecRejectsCorruptionAndInvalidStates() throws Exception {
        NativeCredentialState.Record r = new NativeCredentialState.Record(NativeCredentialState.Phase.READY, USER, PASSWORD, ID, 2, "");
        byte[] bytes = NativeCredentialStore.encode(r); NativeCredentialState.Record copy = NativeCredentialStore.decode(bytes);
        assertEquals(USER, copy.username); assertEquals(PASSWORD, copy.password); assertEquals(2, copy.attempts);
        byte[] extra = java.util.Arrays.copyOf(bytes, bytes.length + 1);
        assertThrows(IOException.class, () -> NativeCredentialStore.decode(extra));
        assertThrows(IOException.class, () -> NativeCredentialStore.decode(new byte[]{0, 0, 0, 5}));
        assertThrows(IOException.class, () -> NativeCredentialStore.encode(new NativeCredentialState.Record(NativeCredentialState.Phase.READY, USER, PASSWORD, ID, 4, "")));
        assertThrows(IOException.class, () -> NativeCredentialStore.encode(new NativeCredentialState.Record(NativeCredentialState.Phase.RESERVED, USER, PASSWORD, ID, 1, "forged")));
    }
}
