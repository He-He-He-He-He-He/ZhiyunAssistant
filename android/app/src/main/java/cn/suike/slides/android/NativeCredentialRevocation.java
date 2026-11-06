package cn.suike.slides.android;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Arrays;

/** Durable generation/revocation protocol used by the private native CAS controller.
 * All participating processes MUST use the same recoverable store and guarded view.
 * IndependentAuthority is a trust boundary, not a production authority implementation.
 * In particular, a UI boolean, old cookie, renderer or CAS redirect is not proof.
 * No local-only design can detect a logout whose durable write never reached storage. */
final class NativeCredentialRevocation {
    interface RecoverableStore extends NativeCredentialState.Store {
        /** Atomically and durably replace even a poisoned/unreadable record with only a tombstone. */
        void replaceWithTombstone(NativeCredentialState.Record tombstone) throws Exception;
    }
    interface IndependentAuthority {
        /** Synchronously establish new explicit authorization independently of the old record.
         * Implementations must bind their proof to this generation, not reuse cached authority. */
        void authorize(String tombstoneGeneration) throws Exception;
    }
    interface Cleanup { void run() throws Exception; }
    private final RecoverableStore store;
    private final SecureRandom random = new SecureRandom();
    NativeCredentialRevocation(RecoverableStore store) { this.store = store; }

    private String generation() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes); StringBuilder value = new StringBuilder(64);
        for (byte b : bytes) value.append(Character.forDigit((b & 255) >>> 4, 16)).append(Character.forDigit(b & 15, 16));
        Arrays.fill(bytes, (byte) 0); return value.toString();
    }
    private String tombstone() throws Exception {
        String epoch = generation();
        store.replaceWithTombstone(NativeCredentialState.Record.empty().authorization(epoch, false));
        return epoch;
    }
    /** Commit the tombstone before cleanup, and propagate BOTH storage and cleanup failures.
     * This cannot interrupt an already-sent request; cleanup must revoke live sessions too. */
    void logout(Cleanup cleanup) throws Exception {
        if (cleanup == null) throw new IOException("cleanup required");
        Exception failure = null;
        try { tombstone(); } catch (Exception error) { failure = error; }
        try { cleanup.run(); } catch (Exception error) {
            if (failure == null) failure = error; else failure.addSuppressed(error);
        }
        if (failure != null) throw failure;
    }
    /** Recovery destroys all previous credential state first. Authority must be independent;
     * an intervening logout or recovery makes the proof stale and prevents reauthorization. */
    String recover(IndependentAuthority authority) throws Exception {
        if (authority == null) throw new IOException("independent authority required");
        String epoch = tombstone();
        authority.authorize(epoch);
        store.transaction(access -> {
            NativeCredentialState.Record r = access.read();
            if (r.phase != NativeCredentialState.Phase.EMPTY || r.authorized || !epoch.equals(r.epoch))
                throw new IOException("recovery invalidated");
            access.write(NativeCredentialState.Record.empty().authorization(epoch, true));
            return null;
        });
        return epoch;
    }
    /** Open a one-shot coordinator after restart, with the persisted generation rechecked
     * transactionally at every reservation, handoff and result. Returns null unless READY. */
    NativeCredentialCoordinator openExisting() throws Exception {
        String epoch = store.transaction(access -> {
            NativeCredentialState.Record r = access.read();
            return r.authorized && r.phase == NativeCredentialState.Phase.READY ? r.epoch : null;
        });
        return epoch == null ? null : new NativeCredentialCoordinator(guarded(epoch));
    }

    /** The credential transaction and authorization check share the underlying process/file lock.
     * Every write receives the same checked epoch, regardless of state-machine transition. */
    NativeCredentialState.Store guarded(String epoch) throws IOException {
        if (epoch == null || !epoch.matches("[0-9a-f]{64}")) throw new IOException("unknown generation");
        return new NativeCredentialState.Store() {
            @Override public <T> T transaction(NativeCredentialState.Transaction<T> operation) throws Exception {
                return store.transaction(access -> {
                    NativeCredentialState.Record initial = access.read();
                    if (!initial.authorized || !epoch.equals(initial.epoch)) throw new IOException("authorization invalidated");
                    return operation.run(new NativeCredentialState.Access() {
                        @Override public NativeCredentialState.Record read() throws Exception {
                            NativeCredentialState.Record r = access.read();
                            if (!r.authorized || !epoch.equals(r.epoch)) throw new IOException("authorization invalidated");
                            return r;
                        }
                        @Override public void write(NativeCredentialState.Record r) throws Exception {
                            access.write(r.authorization(epoch, true));
                        }
                    });
                });
            }
        };
    }
}
