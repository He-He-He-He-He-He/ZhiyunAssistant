package cn.suike.slides.android;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;

/** Production orchestration; no Android/UI dependency and no renderer-provided proof.
 * All network runs outside the controller/store locks. Cancellation first invalidates
 * the generation, then closes the private transport. Publication is synchronous.
 * The atomic encrypted store/epoch is rechecked before dispatch and credential save.
 */
final class NativeCasLogin {
    interface Factory { NativeCasPrototype.Transport open(boolean consent, NativeVerificationGate gate) throws IOException; }
    interface AnonymousFactory { NativeCasPrototype.Transport open() throws IOException; }
    interface Sessions {
        NativeCasCookies verify(NativeCasCookies candidate,String id,String user,NativeCasPrototype.Reserve current) throws IOException;
        default NativeCasCookies verify(NativeCasCookies candidate,String id,String user,NativeCasPrototype.Reserve current,NativeCasDiagnostics.Context report) throws IOException {
            return verify(candidate,id,user,current);
        }
        void commit(NativeCasCookies verified);
        void clear();
        default void cancelVerification() {}
    }
    static final class Identity {
        final String user,id;
        Identity(String user,String id) { this.user=user; this.id=id; }
    }
    private static final class Operation {
        final long generation; final boolean automatic;
        final CompletableFuture<Boolean> completed=new CompletableFuture<>();
        volatile NativeCasPrototype protocol;
        volatile NativeCasPrototype.Transport transport;
        Identity expected;
        final NativeCasDiagnostics.Context report;
        Operation(long generation,boolean automatic,NativeCasDiagnostics.Context report) { this.generation=generation; this.automatic=automatic; this.report=report; }
    }
    private final NativeCredentialRevocation.RecoverableStore store;
    private final Factory factory;
    private final Sessions sessions;
    private final NativeCasDiagnostics diagnostics;
    private long generation,cancellationEpoch;
    private int transitions;
    private Operation active;
    synchronized long generation() { return cancellationEpoch; }
    NativeCasLogin(NativeCredentialRevocation.RecoverableStore store, Factory factory,Sessions sessions) {
        this(store,factory,sessions,new NativeCasDiagnostics());
    }
    NativeCasLogin(NativeCredentialRevocation.RecoverableStore store, Factory factory,Sessions sessions,NativeCasDiagnostics diagnostics) {
        this.store=store; this.factory=factory; this.sessions=sessions; this.diagnostics=diagnostics;
    }
    synchronized Identity savedIdentity() throws Exception {
        requireStore();
        return store.transaction(a -> {
            NativeCredentialState.Record r=a.read();
            return r.authorized && r.phase==NativeCredentialState.Phase.READY
                ? new Identity(r.username,r.accountId):null;
        });
    }
    private void requireStore() throws IOException {
        if(store==null) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.STORE,NativeCasDiagnostics.Category.STORE_UNAVAILABLE);
    }
    private synchronized void check(Operation op) throws IOException {
        if(active!=op || op.generation!=generation) throw NativeCasDiagnostics.failure(op.report.currentStage(),NativeCasDiagnostics.Category.CANCELLED);
    }
    private synchronized Operation begin(boolean automatic,NativeCasDiagnostics.Context report) throws IOException {
        if(active!=null || transitions!=0) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.ALREADY_RUNNING);
        active=new Operation(++generation,automatic,report); return active;
    }
    /** Called only by native consent controls. The unverified password is never persisted.
     * New explicit enrollment also revokes any old account before starting a private session. */
    boolean enroll(boolean consent,String user,String password,String id) throws IOException {
        return enrollAtGeneration(generation(),consent,user,password,id);
    }
    boolean enrollAtGeneration(long expectedGeneration,boolean consent,String user,String password,String id) throws IOException {
        return enrollAtGeneration(expectedGeneration,consent,user,password,id,diagnostics.begin(NativeCasDiagnostics.Kind.ENROLLMENT));
    }
    boolean enrollAtGeneration(long expectedGeneration,boolean consent,String user,String password,String id,NativeCasDiagnostics.Context report) throws IOException {
        Operation op;
        try {
            if(!consent) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.CONSENT,NativeCasDiagnostics.Category.CONSENT_REQUIRED);
            synchronized(this) {
                if(expectedGeneration!=cancellationEpoch) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.CONSENT,NativeCasDiagnostics.Category.CANCELLED);
                op=begin(false,report);
            }
        } catch(IOException denied) { report.fail(denied); throw denied; }
        try {
            requireStore();
            report.stage(NativeCasDiagnostics.Stage.REVOKE);
            NativeCredentialRevocation revoke=new NativeCredentialRevocation(store);
            String epoch;
            synchronized(this) { check(op); epoch=revoke.recover(e -> check(op)); }
            report.stage(NativeCasDiagnostics.Stage.STORE);
            NativeCredentialState.Store guarded=revoke.guarded(epoch);
            NativeCredentialState state=new NativeCredentialState(guarded);
            report.stage(NativeCasDiagnostics.Stage.ENROLLMENT);
            String enrollment;
            synchronized(this) { check(op); enrollment=state.beginEnrollment(true); }
            boolean result=authenticate(op,user,password,id,
                () -> { synchronized(this) { check(op); state.dispatchEnrollment(enrollment,user,password,id,(u,p)->{}); } },
                () -> state.saveVerified(enrollment,true,true,user,password,id,user,id,user));
            if(result) report.success();
            return result;
        } catch(Exception error) { report.fail(error); return false; }
        finally { finishOperation(op); }
    }
    /** Read-only production transport preflight. No store read/write, password, reservation or POST. */
    boolean anonymousPreflight(AnonymousFactory anonymous,NativeCasDiagnostics.Context report) {
        return anonymousPreflight(anonymous,report,generation());
    }
    boolean anonymousPreflight(AnonymousFactory anonymous,NativeCasDiagnostics.Context report,long expectedGeneration) {
        Operation op=null;
        try {
            synchronized(this) {
                if(expectedGeneration!=cancellationEpoch) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.SESSION,NativeCasDiagnostics.Category.CANCELLED);
                op=begin(false,report);
            }
            report.stage(NativeCasDiagnostics.Stage.SESSION);
            check(op); op.transport=anonymous.open();
            op.protocol=new NativeCasPrototype(op.transport,new NativeVerificationGate(),report);
            check(op);
            return op.protocol.preflight();
        } catch(Exception error) { report.fail(error); return false; }
        finally { if(op!=null) finishOperation(op); }
    }
    /** This method may be called only for a real official API HTTP 401. Concurrent
     * callers join one flight. A durable attempts=1 survives success/restart, so there
     * is no second automatic CAS POST without a new explicit verified enrollment. */
    boolean onUnauthorized(int status,boolean officialOrigin,Identity expected) throws IOException {
        return onUnauthorized(status,officialOrigin,expected,generation());
    }
    boolean onUnauthorized(int status,boolean officialOrigin,Identity expected,long expectedGeneration) throws IOException {
        if(status!=401 || !officialOrigin || expected==null) return false;
        Operation op; boolean owner;
        synchronized(this) {
            if(expectedGeneration!=cancellationEpoch || transitions!=0) return false;
            if(active!=null) {
                if(!active.automatic || !active.expected.id.equals(expected.id) || !active.expected.user.equals(expected.user)) return false;
                op=active; owner=false;
            } else { op=begin(true,diagnostics.begin(NativeCasDiagnostics.Kind.AUTOMATIC)); op.expected=expected; owner=true; }
        }
        if(!owner) {
            try { return op.completed.get(); }
            catch(InterruptedException error) { Thread.currentThread().interrupt(); op.report.cleanup(error); return false; }
            catch(java.util.concurrent.ExecutionException error) { op.report.cleanup(error); return false; }
        }
        boolean result=false;
        NativeCredentialState state=null; String reservation=null;
        try {
            op.report.stage(NativeCasDiagnostics.Stage.STORE);
            requireStore();
            NativeCredentialRevocation revoke=new NativeCredentialRevocation(store);
            String epoch=store.transaction(a -> {
                NativeCredentialState.Record r=a.read();
                return r.authorized?r.epoch:null;
            });
            if(epoch==null) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.STORE,NativeCasDiagnostics.Category.AUTHORIZATION);
            NativeCredentialState.Store guarded=revoke.guarded(epoch);
            state=new NativeCredentialState(guarded);
            final NativeCredentialState protocolState=state;
            final String[] credentials=new String[2];
            synchronized(this) {
                check(op);
                op.report.stage(NativeCasDiagnostics.Stage.RESERVE);
                reservation=state.reserveOnceFor(expected.user,expected.id);
                if(reservation==null) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.RESERVE,NativeCasDiagnostics.Category.RESERVATION_UNAVAILABLE);
                state.dispatch(reservation,(u,p)->{ credentials[0]=u; credentials[1]=p; });
            }
            final String token=reservation;
            try {
                result=authenticate(op,credentials[0],credentials[1],expected.id,
                    () -> guarded.transaction(a -> {
                        NativeCredentialState.Record r=a.read();
                        if(r.phase!=NativeCredentialState.Phase.DISPATCHED || !r.token.equals(token))
                            throw new IOException("native reservation invalidated");
                        return null;
                    }),
                    () -> protocolState.finishOnce(token,NativeCredentialState.Outcome.VERIFIED,expected.id,expected.user));
                if(result) op.report.success();
                return result;
            } finally { credentials[0]=null; credentials[1]=null; }
        } catch(Exception error) { op.report.fail(error); return false; }
        finally {
            if(!result && state!=null && reservation!=null) {
                try { state.finishOnce(reservation,NativeCredentialState.Outcome.UNKNOWN,"",""); } catch(Exception error) { op.report.cleanup(error); }
            }
            op.completed.complete(result);
            finishOperation(op);
        }
    }
    private boolean authenticate(Operation op,String user,String password,String id,
                                 NativeCasPrototype.Reserve reserve,NativeCasPrototype.Publish persist) throws Exception {
        check(op);
        op.report.stage(NativeCasDiagnostics.Stage.SESSION);
        NativeVerificationGate gate=new NativeVerificationGate();
        NativeCasPrototype.Transport transport=factory.open(true,gate);
        op.transport=transport;
        NativeCasPrototype protocol=new NativeCasPrototype(transport,gate,op.report); op.protocol=protocol;
        check(op);
        return protocol.run(true,user,password,id,reserve,() -> {
            check(op);
            NativeCasCookies candidate=transport.officialCookies(), verified=null;
            try {
                op.report.stage(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY);
                verified=sessions.verify(candidate,id,user,() -> check(op),op.report);
                check(op);
                // Close the private CAS session before certifying cleanup/saving the credential.
                op.report.stage(NativeCasDiagnostics.Stage.CLEANUP); transport.close();
                synchronized(this) {
                    check(op); op.report.stage(NativeCasDiagnostics.Stage.SAVE); persist.publish(); // Atomic store commit precedes official publication.
                    op.report.stage(NativeCasDiagnostics.Stage.COMMIT);
                    sessions.commit(verified);
                }
            } finally { candidate.clear(); if(verified!=null) verified.clear(); }
        });
    }
    private void finishOperation(Operation op) {
        NativeCasPrototype protocol=op.protocol;
        if(protocol!=null) protocol.close();
        else if(op.transport!=null) try { op.transport.close(); } catch(IOException error) { op.report.cleanup(error); }
        synchronized(this) { if(active==op) active=null; }
        op.completed.complete(false);
    }
    /** Background/logout/account switch invalidate publication before closing network.
     * Do not hold this monitor while acquiring the protocol gate or blocking on IO. */
    void cancel() {
        Operation op;
        synchronized(this) { transitions++; generation++; cancellationEpoch++; op=active; active=null; }
        try { stop(op); } finally { synchronized(this) { transitions--; } }
    }
    private void stop(Operation op) {
        if(op!=null) {
            op.report.fail(NativeCasDiagnostics.failure(op.report.currentStage(),NativeCasDiagnostics.Category.CANCELLED));
            op.completed.complete(false);
            sessions.cancelVerification();
            if(op.protocol!=null) op.protocol.close();
            else if(op.transport!=null) try { op.transport.close(); } catch(IOException error) { op.report.cleanup(error); }
        }
    }
    void logout() throws Exception {
        Operation op;
        synchronized(this) { transitions++; generation++; cancellationEpoch++; op=active; active=null; }
        NativeCasDiagnostics.Context report=null;
        try {
            stop(op);
            report=diagnostics.begin(NativeCasDiagnostics.Kind.REVOCATION); report.stage(NativeCasDiagnostics.Stage.REVOKE);
            if(store==null) { sessions.clear(); requireStore(); }
            synchronized(this) { new NativeCredentialRevocation(store).logout(sessions::clear); }
            report.success();
        } catch(Exception error) {
            if(report!=null) report.fail(error); throw error;
        } finally { synchronized(this) { transitions--; } }
    }
}
