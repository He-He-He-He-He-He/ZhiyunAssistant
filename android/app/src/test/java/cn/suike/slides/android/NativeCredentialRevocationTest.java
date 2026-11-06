package cn.suike.slides.android;

import org.junit.Test;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public final class NativeCredentialRevocationTest {
    private static final String USER = "synthetic-user", PASSWORD = "synthetic-password", ID = "synthetic-id";
    private static final class Disk { NativeCredentialState.Record value = NativeCredentialState.Record.empty(); boolean corrupt; }
    /** Independent instance-local poison and shared transactional disk simulate processes;
     * this is not an OS file-lock or crash-durability test. */
    private static final class Store implements NativeCredentialRevocation.RecoverableStore {
        final Disk disk; boolean poisoned, fail, afterWrite;
        Store(Disk disk) { this.disk = disk; }
        @Override public <T> T transaction(NativeCredentialState.Transaction<T> operation) throws Exception {
            synchronized (disk) {
                if (poisoned) throw new IOException("poisoned");
                return operation.run(new NativeCredentialState.Access() {
                    public NativeCredentialState.Record read() throws Exception {
                        if (disk.corrupt) throw new IOException("corrupt");
                        NativeCredentialState.validate(disk.value); return disk.value;
                    }
                    public void write(NativeCredentialState.Record r) throws Exception { writeDisk(r); }
                });
            }
        }
        void writeDisk(NativeCredentialState.Record r) throws Exception {
            NativeCredentialState.validate(r);
            if (fail) { poisoned = true; throw new IOException("write failed"); }
            disk.value = r; disk.corrupt = false;
            if (afterWrite) { poisoned = true; throw new IOException("ambiguous write"); }
        }
        @Override public void replaceWithTombstone(NativeCredentialState.Record r) throws Exception {
            synchronized (disk) { writeDisk(r); poisoned = false; }
        }
    }
    private static void install(NativeCredentialState state) throws Exception {
        String e = state.beginEnrollment(true); state.dispatchEnrollment(e, USER, PASSWORD, ID, (u,p) -> {});
        state.saveVerified(e, true, true, USER, PASSWORD, ID, USER, ID, USER);
    }
    @Test public void unknownAndLegacyRecordsNeverAuthorize() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation p = new NativeCredentialRevocation(new Store(d));
        assertThrows(IOException.class, () -> new NativeCredentialState(p.guarded("a".repeat(64))).reserve());
        assertThrows(IOException.class, () -> p.guarded(""));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeInt(1); out.writeUTF("READY"); out.writeUTF(USER); out.writeUTF(PASSWORD); out.writeUTF(ID); out.writeInt(0); out.writeUTF("");
        }
        d.value = NativeCredentialStore.decode(bytes.toByteArray());
        assertEquals("", d.value.epoch); assertFalse(d.value.authorized);
        assertThrows(IOException.class, () -> new NativeCredentialState(p.guarded("a".repeat(64))).reserve());
    }
    @Test public void crossInstanceLogoutTombstonePrecedesCleanupAndInvalidatesOldCallbacks() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation a = new NativeCredentialRevocation(new Store(d)), b = new NativeCredentialRevocation(new Store(d));
        String epoch = a.recover(g -> {}); NativeCredentialState state = new NativeCredentialState(a.guarded(epoch)); install(state);
        String attempt = state.reserve(); AtomicInteger sends = new AtomicInteger();
        b.logout(() -> { assertFalse(d.value.authorized); assertEquals(NativeCredentialState.Phase.EMPTY, d.value.phase); assertEquals("", d.value.password); });
        assertThrows(IOException.class, () -> state.dispatch(attempt, (u,p) -> sends.incrementAndGet()));
        assertThrows(IOException.class, () -> state.finish(attempt, NativeCredentialState.Outcome.VERIFIED, ID, USER));
        assertEquals(0, sends.get()); assertNotEquals(epoch, d.value.epoch);
    }
    @Test public void failedOrDelayedAuthorityCannotRestoreOldCredentials() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation a = new NativeCredentialRevocation(new Store(d)), b = new NativeCredentialRevocation(new Store(d));
        String old = a.recover(g -> {}); install(new NativeCredentialState(a.guarded(old)));
        assertThrows(IOException.class, () -> a.recover(g -> { throw new IOException("not authorized"); }));
        assertEquals(NativeCredentialState.Phase.EMPTY, d.value.phase); assertFalse(d.value.authorized);
        assertThrows(IOException.class, () -> a.recover(g -> b.logout(() -> {})));
        assertFalse(d.value.authorized);
        assertThrows(IOException.class, () -> new NativeCredentialState(a.guarded(old)).reserve());
    }
    @Test public void failedWritesCleanupButCannotPromiseCrossRestartRevocation() throws Exception {
        Disk d = new Disk(); Store one = new Store(d); NativeCredentialRevocation p = new NativeCredentialRevocation(one);
        String epoch = p.recover(g -> {}); install(new NativeCredentialState(p.guarded(epoch)));
        one.fail = true; AtomicInteger cleanup = new AtomicInteger();
        assertThrows(IOException.class, () -> p.logout(cleanup::incrementAndGet)); assertEquals(1, cleanup.get());
        assertThrows(IOException.class, () -> new NativeCredentialState(p.guarded(epoch)).reserve());
        // Independent process still sees old READY when no durable tombstone was written.
        NativeCredentialRevocation other = new NativeCredentialRevocation(new Store(d));
        assertNotNull(new NativeCredentialState(other.guarded(epoch)).reserve());
    }
    @Test public void ambiguousTombstoneIsSafeToObserveButFailureStillReported() throws Exception {
        Disk d = new Disk(); Store one = new Store(d); NativeCredentialRevocation p = new NativeCredentialRevocation(one);
        String epoch = p.recover(g -> {}); install(new NativeCredentialState(p.guarded(epoch))); one.afterWrite = true;
        assertThrows(IOException.class, () -> p.logout(() -> {})); assertFalse(d.value.authorized);
        NativeCredentialRevocation other = new NativeCredentialRevocation(new Store(d));
        assertThrows(IOException.class, () -> new NativeCredentialState(other.guarded(epoch)).reserve());
    }
    @Test public void poisonAndCorruptionRecoverOnlyByDiscardAndIndependentAuthority() throws Exception {
        Disk d = new Disk(); Store one = new Store(d); NativeCredentialRevocation p = new NativeCredentialRevocation(one);
        String old = p.recover(g -> {}); install(new NativeCredentialState(p.guarded(old)));
        one.fail = true; assertThrows(IOException.class, () -> p.logout(() -> {})); one.fail = false;
        d.corrupt = true; AtomicInteger proof = new AtomicInteger();
        String fresh = p.recover(g -> { assertFalse(d.corrupt); assertFalse(d.value.authorized); assertEquals("", d.value.password); proof.incrementAndGet(); });
        assertEquals(1, proof.get()); assertNotEquals(old, fresh); assertTrue(d.value.authorized);
        assertNull(new NativeCredentialState(p.guarded(fresh)).reserve());
        assertThrows(IOException.class, () -> new NativeCredentialState(p.guarded(old)).reserve());
    }
    @Test public void recoveryWriteFailureNeverInvokesAuthority() throws Exception {
        Disk d = new Disk(); Store s = new Store(d); NativeCredentialRevocation p = new NativeCredentialRevocation(s); s.fail = true;
        AtomicInteger calls = new AtomicInteger(); assertThrows(IOException.class, () -> p.recover(g -> calls.incrementAndGet()));
        assertEquals(0, calls.get());
    }
    @Test public void failedAuthorizationWriteDoesNotReviveAnyCredential() throws Exception {
        for (boolean ambiguous : new boolean[]{false, true}) {
            Disk d = new Disk(); Store s = new Store(d); NativeCredentialRevocation p = new NativeCredentialRevocation(s);
            String old = p.recover(g -> {}); install(new NativeCredentialState(p.guarded(old)));
            assertThrows(IOException.class, () -> p.recover(g -> { s.fail = !ambiguous; s.afterWrite = ambiguous; }));
            assertEquals(NativeCredentialState.Phase.EMPTY, d.value.phase); assertEquals("", d.value.password);
            assertThrows(IOException.class, () -> new NativeCredentialState(new NativeCredentialRevocation(new Store(d)).guarded(old)).reserve());
            if (!ambiguous) assertFalse(d.value.authorized);
            // Ambiguous success can leave a new empty authorization, never the old credential.
        }
    }
    @Test public void logoutDuringProofInvalidatesRecoveryAcrossInstances() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation a = new NativeCredentialRevocation(new Store(d)), b = new NativeCredentialRevocation(new Store(d));
        CountDownLatch inProof = new CountDownLatch(1), resume = new CountDownLatch(1); var pool = Executors.newSingleThreadExecutor();
        try {
            var result = pool.submit(() -> { try { a.recover(g -> { inProof.countDown(); if (!resume.await(5, TimeUnit.SECONDS)) throw new IOException("timeout"); }); return true; } catch (Exception e) { return false; } });
            assertTrue(inProof.await(5, TimeUnit.SECONDS)); b.logout(() -> {}); resume.countDown();
            assertFalse(result.get(5, TimeUnit.SECONDS)); assertFalse(d.value.authorized);
        } finally { resume.countDown(); pool.shutdownNow(); }
    }
    @Test public void restartedCoordinatorReservesOnceAndLogoutInvalidatesHandoff() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation initial = new NativeCredentialRevocation(new Store(d));
        String epoch = initial.recover(g -> {}); install(new NativeCredentialState(initial.guarded(epoch)));
        NativeCredentialRevocation restarted = new NativeCredentialRevocation(new Store(d));
        NativeCredentialCoordinator first = restarted.openExisting(), second = restarted.openExisting();
        assertNotNull(first); assertNotNull(second); assertTrue(first.reserveExisting(USER, ID));
        assertFalse(second.reserveExisting(USER, ID)); assertEquals(1, d.value.attempts);
        new NativeCredentialRevocation(new Store(d)).logout(() -> {});
        AtomicInteger calls = new AtomicInteger();
        assertThrows(IOException.class, () -> first.handoff((u,p) -> calls.incrementAndGet()));
        assertEquals(0, calls.get()); assertNull(restarted.openExisting());
    }
    @Test public void restartedCoordinatorUnknownSubmissionBlocksAnyRetry() throws Exception {
        Disk d = new Disk(); NativeCredentialRevocation p = new NativeCredentialRevocation(new Store(d));
        String epoch = p.recover(g -> {}); install(new NativeCredentialState(p.guarded(epoch)));
        NativeCredentialCoordinator c = new NativeCredentialRevocation(new Store(d)).openExisting();
        assertTrue(c.reserveExisting(USER, ID));
        assertThrows(IOException.class, () -> c.handoff((u,pw) -> { throw new IOException("uncertain"); }));
        assertNull(new NativeCredentialRevocation(new Store(d)).openExisting());
        assertEquals(NativeCredentialState.Phase.DISPATCHED, d.value.phase);
    }
    @Test public void authenticatedMetadataRoundTripsAndTamperingFails() throws Exception {
        var generator = javax.crypto.KeyGenerator.getInstance("AES"); generator.init(256); var key = generator.generateKey();
        NativeCredentialState.Record r = NativeCredentialState.Record.empty().authorization("a".repeat(64), false);
        byte[] data = NativeCredentialStore.seal(r, key); var opened = NativeCredentialStore.open(data, key);
        assertEquals(r.epoch, opened.epoch); assertFalse(opened.authorized);
        data[data.length - 1] ^= 1; assertThrows(Exception.class, () -> NativeCredentialStore.open(data, key));
    }
}
