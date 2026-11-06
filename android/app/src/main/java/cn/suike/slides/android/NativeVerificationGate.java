package cn.suike.slides.android;

/**
 * Local coordination primitive only: no network, credential storage, or CAS adapter.
 * All callbacks are trusted native code and run synchronously while holding this gate.
 * NativeCasLogin supplies durable reservations and uses its generation lock to
 * serialize logout against session publication. Cancellation is non-blocking, including
 * when a synchronous submit callback is waiting for DNS/TLS/network IO.
 * This does not cancel an already-sent request or undo server-side authentication.
 */
final class NativeVerificationGate {
    enum Captcha { CLEAR, REQUIRED, UNKNOWN }
    private enum Phase { NEW, RESERVED, DISPATCHED, PUBLISHING, COMPLETE, BLOCKED, CANCELLED }
    interface Action { void run() throws Exception; }
    private Phase phase = Phase.NEW;
    private volatile boolean cancelled;
    private volatile Thread submittingThread;
    private NativeCasDiagnostics.Context diagnostics;
    private NativeCasDiagnostics.Failure failure;
    synchronized void diagnostics(NativeCasDiagnostics.Context context) { diagnostics=context; }
    synchronized NativeCasDiagnostics.Failure failure(NativeCasDiagnostics.Stage stage,NativeCasDiagnostics.Category category) {
        return failure!=null?failure:NativeCasDiagnostics.failure(stage,cancelled?NativeCasDiagnostics.Category.CANCELLED:category);
    }
    private void failed(Exception error,NativeCasDiagnostics.Stage fallback) {
        failure=NativeCasDiagnostics.typed(error,diagnostics==null?fallback:diagnostics.currentStage());
        if(error instanceof InterruptedException) Thread.currentThread().interrupt();
    }
    /** True only inside this gate's synchronous submit callback. */
    boolean isSubmittingHere() { return !cancelled && submittingThread == Thread.currentThread() && phase == Phase.BLOCKED; }

    /** The reservation callback must durably record a consumed attempt before returning. */
    synchronized boolean prepare(boolean consent, boolean freshSessionProven, Captcha captcha, Action reserve) {
        if (cancelled || phase != Phase.NEW) return false;
        phase = Phase.BLOCKED; // Includes callback exceptions and reentrant calls.
        if (!consent || !freshSessionProven || captcha != Captcha.CLEAR || reserve == null) return false;
        try { reserve.run(); if (cancelled || phase != Phase.BLOCKED) return false; phase = Phase.RESERVED; return true; }
        catch (Exception error) { failed(error,NativeCasDiagnostics.Stage.RESERVE); return false; }
    }

    /** One synchronous submission only; uncertain failure is never retried. */
    synchronized boolean submit(Action send) {
        if (cancelled || phase != Phase.RESERVED) return false;
        phase = Phase.BLOCKED;
        if (send == null) return false;
        submittingThread = Thread.currentThread();
        try { send.run(); if (cancelled || phase != Phase.BLOCKED) return false; phase = Phase.DISPATCHED; return true; }
        catch (Exception error) { failed(error,NativeCasDiagnostics.Stage.POST); return false; }
        finally { submittingThread = null; }
    }

    /** Proof must come from the fresh native session, not navigation or a login page.
     * The publication callback must be synchronous and must not enqueue later effects. */
    synchronized boolean publish(boolean identityProven, Action publication) {
        if (cancelled || phase != Phase.DISPATCHED) return false;
        phase = Phase.BLOCKED;
        if (!identityProven || publication == null) return false;
        phase = Phase.PUBLISHING;
        try { publication.run(); if (cancelled || phase != Phase.PUBLISHING) return false; phase = Phase.COMPLETE; return true; }
        catch (Exception error) { failed(error,NativeCasDiagnostics.Stage.COMMIT); if (phase == Phase.PUBLISHING) phase = Phase.BLOCKED; return false; }
    }

    /** Called by logout before its synchronous revocation. In-flight work may have
     * already reached the server; logout must also clear the live local session. */
    void cancel() { cancelled=true; } // Never wait behind an in-flight network callback.
}
