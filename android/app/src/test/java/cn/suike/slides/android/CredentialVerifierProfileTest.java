package cn.suike.slides.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class CredentialVerifierProfileTest {
    @Test public void deletionRequiresKnownPresentProfileAndPositiveConfirmation() {
        String own = "zhiyun-verify-5782ea3c-5974-40b4-9d76-3b77274017af";
        class Fake implements CredentialVerifier.ProfileDeletion {
            boolean present, deleted, deleteResult = true, stayPresent;
            public boolean contains(String name) { return present; }
            public boolean delete(String name) { deleted = true; if (!stayPresent && deleteResult) present = false; return deleteResult; }
        }
        Fake missing = new Fake();
        assertThrows(IllegalStateException.class, () -> CredentialVerifier.deleteOwned(missing, own));
        assertFalse(missing.deleted);
        Fake foreign = new Fake(); foreign.present = true;
        assertThrows(IllegalStateException.class, () -> CredentialVerifier.deleteOwned(foreign, "Default"));
        assertFalse(foreign.deleted);
        Fake failure = new Fake(); failure.present = true; failure.deleteResult = false;
        assertThrows(IllegalStateException.class, () -> CredentialVerifier.deleteOwned(failure, own));
        Fake inconsistent = new Fake(); inconsistent.present = true; inconsistent.stayPresent = true;
        assertThrows(IllegalStateException.class, () -> CredentialVerifier.deleteOwned(inconsistent, own));
        Fake success = new Fake(); success.present = true;
        CredentialVerifier.deleteOwned(success, own); assertTrue(success.deleted); assertFalse(success.present);
    }
    @Test public void readOnlyPendingCheckKeepsMarkersAndRefusesUnknownProfiles() throws Exception {
        java.util.Set<String> names = new java.util.HashSet<>();
        names.add("zhiyun-verify-5782ea3c-5974-40b4-9d76-3b77274017af");
        assertThrows(java.io.IOException.class, () -> CredentialVerifier.assertNoPendingNames(true, names));
        assertThrows(java.io.IOException.class, () -> CredentialVerifier.assertNoPendingNames(false, names));
        assertEquals(1, names.size());
        assertThrows(java.io.IOException.class, () -> CredentialVerifier.assertNoPendingNames(true, java.util.Collections.emptySet()));
        CredentialVerifier.assertNoPendingNames(false, java.util.Collections.emptySet());
        CredentialVerifier.assertNoUnrecordedProfiles(java.util.Arrays.asList("Default", "other"));
        assertThrows(java.io.IOException.class, () -> CredentialVerifier.assertNoUnrecordedProfiles(java.util.Arrays.asList("Default", "zhiyun-verify-unknown")));
    }
    @Test public void onlyCanonicalVerifierUuidsAreOwned() {
        assertTrue(CredentialVerifier.ownedProfile("zhiyun-verify-5782ea3c-5974-40b4-9d76-3b77274017af"));
        assertFalse(CredentialVerifier.ownedProfile("Default"));
        assertFalse(CredentialVerifier.ownedProfile("zhiyun-test-5782ea3c-5974-40b4-9d76-3b77274017af"));
        assertFalse(CredentialVerifier.ownedProfile("zhiyun-verify-not-a-uuid"));
        assertFalse(CredentialVerifier.ownedProfile("zhiyun-verify-1-1-1-1-1"));
        assertFalse(CredentialVerifier.ownedProfile("zhiyun-verify-5782EA3C-5974-40B4-9D76-3B77274017AF"));
    }
}
