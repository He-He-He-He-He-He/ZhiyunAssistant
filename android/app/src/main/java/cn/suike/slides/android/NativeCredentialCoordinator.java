package cn.suike.slides.android;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Offline coordination building block, deliberately not connected to transport, UI or bridge.
 * Proof provenance, cross-process session revocation and cancellation of already-sent work
 * are NOT established by this class. Do not use it to enable production login.
 * Each method is short and performs no network or WebView work while holding its monitor. */
final class NativeCredentialCoordinator {
    private enum Phase { NEW, ENROLLING, ENROLLMENT_DISPATCHED, RESERVED, DISPATCHED, COMPLETE, CLOSED }
    private final NativeCredentialState state;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private Phase phase = Phase.NEW;
    private String token;

    NativeCredentialCoordinator(NativeCredentialState.Store store) { this.state = new NativeCredentialState(store); }

    synchronized void beginEnrollment(boolean consent) throws Exception {
        ensure(Phase.NEW);
        // A refused enrollment still invalidates old credentials; errors propagate.
        token = state.beginEnrollment(consent);
        if (cancelled.get()) throw new IOException("cancelled");
        phase = Phase.ENROLLING;
    }

    /** Compatible with a native verifier's reservation callback; records before any POST.
     * The callback deliberately performs no submission. */
    synchronized void reserveEnrollment(String username, String password, String accountId) throws Exception {
        ensure(Phase.ENROLLING);
        state.dispatchEnrollment(token, username, password, accountId, (u, p) -> {
            if (cancelled.get()) throw new IOException("cancelled");
        });
        if (cancelled.get()) throw new IOException("cancelled");
        phase = Phase.ENROLLMENT_DISPATCHED;
    }

    /** Identity and fresh-session proof are the verifier's responsibility, not this API's.
     * cleanupConfirmed must be independently established for the actual transport. */
    synchronized void verifiedEnrollment(String username, String password, String accountId,
                                         String verifiedUsername, String verifiedId,
                                         boolean freshAuthentication, boolean cleanupConfirmed) throws Exception {
        ensure(Phase.ENROLLMENT_DISPATCHED);
        state.saveVerified(token, freshAuthentication, cleanupConfirmed, username, password, accountId,
                username, verifiedId, verifiedUsername);
        if (cancelled.get()) throw new IOException("cancelled");
        token = null; phase = Phase.COMPLETE;
    }

    synchronized boolean reserveExisting(String username, String accountId) throws Exception {
        ensure(Phase.NEW);
        token = state.reserveFor(username, accountId);
        if (cancelled.get()) throw new IOException("cancelled");
        if (token == null) { phase = Phase.CLOSED; return false; }
        phase = Phase.RESERVED; return true;
    }

    /** Handoff callback must be synchronous, short, and perform no network or session writes.
     * DISPATCHED and quota are durable before the callback receives credentials. */
    synchronized void handoff(NativeCredentialState.Dispatch receiver) throws Exception {
        ensure(Phase.RESERVED);
        if (receiver == null) throw new IOException("missing receiver");
        state.dispatch(token, (username, password) -> {
            if (cancelled.get()) throw new IOException("cancelled");
            receiver.submit(username, password);
        });
        if (cancelled.get()) throw new IOException("cancelled");
        phase = Phase.DISPATCHED;
    }

    /** No retry is inferred. UNKNOWN and identity mismatch block use durably. */
    synchronized void finish(NativeCredentialState.Outcome outcome, String actualId, String actualUsername) throws Exception {
        ensure(Phase.DISPATCHED);
        state.finish(token, outcome, actualId, actualUsername);
        if (cancelled.get()) throw new IOException("cancelled");
        token = null; phase = Phase.COMPLETE;
    }

    /** Invalidate in-memory callbacks immediately; durable revoke is serialized afterward.
     * An already-submitted request and other processes require separate cancellation/IPC.
     * A durable write failure is propagated and is not safe to ignore across restart. */
    void cancelAndRevoke() throws Exception {
        cancelled.set(true);
        synchronized (this) {
            try { state.revoke(); }
            finally { phase = Phase.CLOSED; token = null; }
        }
    }

    private void ensure(Phase expected) throws IOException {
        if (cancelled.get() || phase != expected) throw new IOException("operation invalidated");
    }
}
