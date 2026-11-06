package cn.suike.slides.android;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Arrays;

/** Native-only state machine; production CAS uses reserveOnceFor/finishOnce.
 * No password is accessible through the renderer bridge. */
final class NativeCredentialState {
    static final int MAX_ATTEMPTS = 3;
    enum Phase { EMPTY, ENROLLING, ENROLLMENT_DISPATCHED, READY, RESERVED, DISPATCHED, BLOCKED, REJECTED }
    enum Outcome { VERIFIED, REJECTED, NOT_SUBMITTED, UNKNOWN }

    static final class Record {
        final Phase phase;
        final String username, password, accountId, token;
        // Empty means legacy/unknown, not authorized. Epoch is an unpredictable generation ID.
        final String epoch;
        final boolean authorized;
        final int attempts;
        Record(Phase phase, String username, String password, String accountId, int attempts, String token) {
            this(phase, username, password, accountId, attempts, token, "", false);
        }
        Record(Phase phase, String username, String password, String accountId, int attempts, String token, String epoch, boolean authorized) {
            this.phase = phase; this.username = username; this.password = password; this.accountId = accountId;
            this.attempts = attempts; this.token = token; this.epoch = epoch; this.authorized = authorized;
        }
        Record authorization(String generation, boolean allowed) {
            return new Record(phase, username, password, accountId, attempts, token, generation, allowed);
        }
        static Record empty() { return new Record(Phase.EMPTY, "", "", "", 0, ""); }
        Record transition(Phase next, int count, String nextToken) { return new Record(next, username, password, accountId, count, nextToken); }
    }

    /** Implementations serialize complete transactions across all instances and processes. */
    interface Store {
        <T> T transaction(Transaction<T> operation) throws Exception;
    }
    interface Transaction<T> { T run(Access access) throws Exception; }
    interface Access { Record read() throws Exception; void write(Record record) throws Exception; }
    interface Dispatch { void submit(String username, String password) throws Exception; }
    private final Store store;
    private final SecureRandom random = new SecureRandom();
    NativeCredentialState(Store store) { this.store = store; }

    private static boolean identity(String username, String id) {
        return username != null && id != null && !username.trim().isEmpty() && username.equals(username.trim())
                && username.length() <= 128 && id.equals(id.trim()) && !id.isEmpty() && id.length() <= 256
                && username.indexOf('\0') < 0 && id.indexOf('\0') < 0;
    }
    private static boolean password(String value) { return value != null && !value.isEmpty() && value.length() <= 1024 && value.indexOf('\0') < 0; }
    static void validate(Record r) throws IOException {
        if (r == null || r.phase == null || r.username == null || r.password == null || r.accountId == null || r.token == null || r.epoch == null)
            throw new IOException("invalid credential state");
        if ((!r.epoch.isEmpty() && !r.epoch.matches("[0-9a-f]{64}")) || (r.authorized && r.epoch.isEmpty()))
            throw new IOException("invalid credential authorization");
        if (!r.epoch.isEmpty() && !r.authorized && r.phase != Phase.EMPTY)
            throw new IOException("invalid logout tombstone");
        if (r.phase == Phase.EMPTY || r.phase == Phase.ENROLLING) {
            if (!r.username.isEmpty() || !r.password.isEmpty() || !r.accountId.isEmpty() || r.attempts != 0
                    || (r.phase == Phase.EMPTY ? !r.token.isEmpty() : !r.token.matches("[0-9a-f]{64}"))) throw new IOException("invalid empty state");
            return;
        }
        if (r.phase == Phase.ENROLLMENT_DISPATCHED) {
            if (!identity(r.username, r.accountId) || !r.password.matches("[0-9a-f]{64}") || r.attempts != 1 || !r.token.matches("[0-9a-f]{64}"))
                throw new IOException("invalid enrollment attempt");
            return;
        }
        if (!identity(r.username, r.accountId) || !password(r.password) || r.attempts < 0 || r.attempts > MAX_ATTEMPTS)
            throw new IOException("invalid credential state");
        boolean inFlight = r.phase == Phase.RESERVED || r.phase == Phase.DISPATCHED;
        if ((inFlight && (!r.token.matches("[0-9a-f]{64}") || r.attempts == 0)) || (!inFlight && !r.token.isEmpty()))
            throw new IOException("invalid attempt state");
    }

    private String token() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes); StringBuilder token = new StringBuilder(64);
        for (byte b : bytes) token.append(Character.forDigit((b & 255) >>> 4, 16)).append(Character.forDigit(b & 15, 16));
        Arrays.fill(bytes, (byte) 0); return token.toString();
    }

    /** Invalidate the old credential before starting a consented verification. */
    String beginEnrollment(boolean consent) throws Exception {
        if (!consent) { revoke(); throw new IOException("consent required"); }
        return store.transaction(access -> {
            access.read(); String token = token();
            access.write(new Record(Phase.ENROLLING, "", "", "", 0, token)); return token;
        });
    }

    private static String candidateDigest(String token, String username, String password, String id) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        byte[] key = token.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        mac.init(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA256"));
        Arrays.fill(key, (byte) 0);
        for (String value : new String[]{username, password, id}) {
            byte[] data = value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            mac.update((byte)(data.length >>> 24)); mac.update((byte)(data.length >>> 16)); mac.update((byte)(data.length >>> 8)); mac.update((byte)data.length);
            mac.update(data); Arrays.fill(data, (byte)0);
        }
        byte[] digest = mac.doFinal(); StringBuilder hex = new StringBuilder(64);
        for (byte b : digest) hex.append(Character.forDigit((b & 255) >>> 4, 16)).append(Character.forDigit(b & 15, 16));
        Arrays.fill(digest, (byte)0); return hex.toString();
    }

    /** A single explicit verification attempt is recorded before any native submitter starts.
     * Only a keyed candidate digest is persisted, never an unverified password. */
    void dispatchEnrollment(String enrollment, String username, String password, String accountId, Dispatch submitter) throws Exception {
        if (enrollment == null || !identity(username, accountId) || !password(password) || submitter == null)
            throw new IOException("invalid enrollment");
        store.transaction(access -> {
            Record r = access.read();
            if (r.phase != Phase.ENROLLING || !r.token.equals(enrollment)) throw new IOException("enrollment invalidated");
            String digest = candidateDigest(enrollment, username, password, accountId);
            access.write(new Record(Phase.ENROLLMENT_DISPATCHED, username, digest, accountId, 1, enrollment));
            submitter.submit(username, password); return null;
        });
    }

    /** Caller must be a native controller that has independently established consent, fresh
     * authentication and successful cleanup. This method checks identity, not proof provenance. */
    void saveVerified(String enrollment, boolean freshAuthentication, boolean cleanupConfirmed,
                      String username, String password, String currentId, String currentUsername,
                      String verifiedId, String verifiedUsername) throws Exception {
        if (enrollment == null) throw new IOException("credential verification not established");
        boolean saved = store.transaction(access -> {
            Record existing = access.read();
            if (existing.phase != Phase.ENROLLMENT_DISPATCHED || !existing.token.equals(enrollment))
                throw new IOException("enrollment invalidated");
            boolean valid = freshAuthentication && cleanupConfirmed && identity(username, currentId)
                    && password(password) && currentId.equals(verifiedId) && username.equals(currentUsername)
                    && username.equals(verifiedUsername) && existing.username.equals(username) && existing.accountId.equals(currentId);
            if (valid) valid = java.security.MessageDigest.isEqual(existing.password.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                    candidateDigest(enrollment, username, password, currentId).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            if (!valid) { access.write(Record.empty()); return false; }
            access.write(new Record(Phase.READY, username, password, currentId, 0, "")); return true;
        });
        if (!saved) throw new IOException("credential verification not established");
    }

    /** Clear first on new manual login and on logout; never report success on write failure. */
    void revoke() throws Exception { store.transaction(access -> { access.read(); access.write(Record.empty()); return null; }); }

    /** Reserve one durable attempt before any credential can reach a submitter. */
    String reserve() throws Exception { return reserveFor(null, null, false); }

    /** Bind reservation to the controller's expected account in the same transaction. */
    String reserveFor(String username, String accountId) throws Exception {
        if (!identity(username, accountId)) throw new IOException("invalid expected account");
        return reserveFor(username, accountId, true);
    }
    /** Production consent permits one automatic re-login, including across restarts.
     * Success does not reset this allowance. Only a new explicit verified enrollment does. */
    String reserveOnceFor(String username, String accountId) throws Exception {
        if(!identity(username,accountId)) throw new IOException("invalid expected account");
        return store.transaction(access -> {
            Record r=access.read();
            if(r.phase!=Phase.READY || r.attempts!=0 || !r.username.equals(username) || !r.accountId.equals(accountId)) return null;
            String token=token(); access.write(r.transition(Phase.RESERVED,1,token)); return token;
        });
    }
    private String reserveFor(String username, String accountId, boolean match) throws Exception {
        return store.transaction(access -> {
            Record r = access.read();
            if (r.phase != Phase.READY || r.attempts >= MAX_ATTEMPTS) return null;
            if (match && (!r.username.equals(username) || !r.accountId.equals(accountId))) return null;
            String token = token();
            access.write(r.transition(Phase.RESERVED, r.attempts + 1, token));
            return token;
        });
    }

    /** Mark dispatch durably before invoking a native-only submitter. No automatic retry.
     * The submitter must not reenter this store or block waiting on it. This lock only
     * serializes entry to the submitter with revoke; the eventual controller must also
     * cancel WebView/network work and suppress late session effects. */
    void dispatch(String token, Dispatch submitter) throws Exception {
        if (token == null || submitter == null) throw new IOException("invalid attempt");
        store.transaction(access -> {
            Record r = access.read();
            if (r.phase != Phase.RESERVED || !r.token.equals(token)) throw new IOException("attempt invalidated");
            access.write(r.transition(Phase.DISPATCHED, r.attempts, token));
            submitter.submit(r.username, r.password);
            return null;
        });
    }

    /** Only a trusted native controller may supply proof. Unknown outcomes block further use. */
    void finish(String token, Outcome outcome, String actualId, String actualUsername) throws Exception {
        finish(token,outcome,actualId,actualUsername,false);
    }
    void finishOnce(String token, Outcome outcome, String actualId, String actualUsername) throws Exception {
        finish(token,outcome,actualId,actualUsername,true);
    }
    private void finish(String token, Outcome outcome, String actualId, String actualUsername, boolean retainSpent) throws Exception {
        if (token == null || outcome == null) throw new IOException("invalid outcome");
        store.transaction(access -> {
            Record r = access.read();
            if (r.phase != Phase.DISPATCHED || !r.token.equals(token)) throw new IOException("attempt invalidated");
            Phase phase; int count = r.attempts;
            if (outcome == Outcome.REJECTED) phase = Phase.REJECTED;
            else if (outcome == Outcome.NOT_SUBMITTED) phase = Phase.READY; // Only with positive native proof; quota remains spent.
            else if (outcome == Outcome.VERIFIED && r.accountId.equals(actualId) && r.username.equals(actualUsername)) { phase = Phase.READY; if(!retainSpent) count = 0; }
            else phase = Phase.BLOCKED;
            access.write(r.transition(phase, count, ""));
            if (outcome == Outcome.VERIFIED && phase != Phase.READY) throw new IOException("authenticated account mismatch");
            return null;
        });
    }
}
