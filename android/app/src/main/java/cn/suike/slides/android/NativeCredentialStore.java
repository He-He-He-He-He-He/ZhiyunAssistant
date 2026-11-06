package cn.suike.slides.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.system.Os;
import android.system.OsConstants;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Private, no-backup, AES-GCM record. Not registered with the JS bridge.
 * A write error poisons this process only. If a revocation cannot be durably written,
 * neither another process nor a later restart can be guaranteed to observe it; callers
 * must report failure and must not enable login until a recovery design is proven. */
final class NativeCredentialStore implements NativeCredentialRevocation.RecoverableStore {
    private static final String KEY = "zhiyun-native-official-credential-v1";
    private static final byte[] AAD = "zhiyun-native-official-credential-record-v1".getBytes(StandardCharsets.UTF_8);
    private static final Object PROCESS_LOCK = new Object();
    private static final Set<String> POISONED = new HashSet<>();
    private static final int MAX_ENVELOPE = 16384;
    private final File dir, file, lockFile;
    private final String keyAlias;
    private final SecureRandom random = new SecureRandom();

    NativeCredentialStore(Context context) throws IOException { this(context.getNoBackupFilesDir(), "native-official-credentials", KEY); }

    /** The caller validates fixture roots; neither the user record nor its key is accessed. */
    NativeCredentialStore(File root, String name) throws IOException {
        this(root, name, KEY + "-fixture-" + root.getName());
    }
    private NativeCredentialStore(File root, String name, String alias) throws IOException {
        keyAlias = alias;
        dir = new File(root, name).getCanonicalFile();
        if (!dir.getParentFile().equals(root.getCanonicalFile())) throw new IOException("invalid credential directory");
        if (!dir.mkdirs() && !dir.isDirectory()) throw new IOException("credential storage unavailable");
        file = new File(dir, "state.v1"); lockFile = new File(dir, "lock");
    }

    @Override public <T> T transaction(NativeCredentialState.Transaction<T> operation) throws Exception {
        synchronized (PROCESS_LOCK) {
            String key = file.getCanonicalPath();
            if (POISONED.contains(key)) throw new IOException("credential storage requires recovery");
            try (RandomAccessFile guard = new RandomAccessFile(lockFile, "rw"); FileLock ignored = guard.getChannel().lock()) {
                return operation.run(new NativeCredentialState.Access() {
                    public NativeCredentialState.Record read() throws Exception { return readRecord(); }
                    public void write(NativeCredentialState.Record record) throws Exception {
                        try { writeRecord(record); }
                        catch (Exception failure) { POISONED.add(key); throw failure; }
                    }
                });
            }
        }
    }

    /** Recovery may bypass process poison only to replace the record with a tombstone.
     * It does not read or restore an old credential, even if the old record is corrupt. */
    @Override public void replaceWithTombstone(NativeCredentialState.Record tombstone) throws Exception {
        NativeCredentialState.validate(tombstone);
        if (tombstone.phase != NativeCredentialState.Phase.EMPTY || tombstone.authorized || tombstone.epoch.isEmpty())
            throw new IOException("invalid recovery tombstone");
        synchronized (PROCESS_LOCK) {
            String path = file.getCanonicalPath();
            try (RandomAccessFile guard = new RandomAccessFile(lockFile, "rw"); FileLock ignored = guard.getChannel().lock()) {
                writeRecord(tombstone);
                POISONED.remove(path);
            } catch (Exception failure) { POISONED.add(path); throw failure; }
        }
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(keyAlias)) {
            java.security.Key existing = store.getKey(keyAlias, null);
            if (!(existing instanceof SecretKey)) throw new IOException("credential key unavailable");
            return (SecretKey) existing;
        }
        if (!create) throw new IOException("credential key missing");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    private NativeCredentialState.Record readRecord() throws Exception {
        if (!file.exists()) return NativeCredentialState.Record.empty();
        if (!file.isFile() || file.length() < 29 || file.length() > MAX_ENVELOPE) throw new IOException("credential envelope invalid");
        byte[] envelope = Files.readAllBytes(file.toPath());
        if (envelope.length < 29 || envelope.length > MAX_ENVELOPE || envelope[0] != 1) throw new IOException("credential envelope invalid");
        return open(envelope, key(false));
    }
    static NativeCredentialState.Record open(byte[] envelope, SecretKey secret) throws Exception {
        if (envelope.length < 29 || envelope.length > MAX_ENVELOPE || envelope[0] != 1) throw new IOException("credential envelope invalid");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Arrays.copyOfRange(envelope, 1, 13)));
        cipher.updateAAD(AAD); byte[] plaintext = cipher.doFinal(envelope, 13, envelope.length - 13);
        try { return decode(plaintext); } finally { Arrays.fill(plaintext, (byte) 0); }
    }
    static byte[] seal(NativeCredentialState.Record record, SecretKey secret) throws Exception {
        byte[] plaintext = encode(record); byte[] encrypted;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        try {
            cipher.init(Cipher.ENCRYPT_MODE, secret); cipher.updateAAD(AAD); encrypted = cipher.doFinal(plaintext);
        } finally { Arrays.fill(plaintext, (byte) 0); }
        byte[] iv = cipher.getIV(); if (iv == null || iv.length != 12) throw new IOException("credential cipher invalid");
        byte[] envelope = new byte[1 + iv.length + encrypted.length]; envelope[0] = 1;
        System.arraycopy(iv, 0, envelope, 1, iv.length); System.arraycopy(encrypted, 0, envelope, 13, encrypted.length);
        return envelope;
    }
    private void writeRecord(NativeCredentialState.Record record) throws Exception {
        byte[] envelope = seal(record, key(!file.exists()));
        byte[] suffix = new byte[16]; random.nextBytes(suffix); StringBuilder name = new StringBuilder(".pending-");
        for (byte b : suffix) name.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        File pending = new File(dir, name.toString());
        try {
            if (!pending.createNewFile()) throw new IOException("credential temporary file exists");
            try (FileOutputStream output = new FileOutputStream(pending)) { output.write(envelope); output.getFD().sync(); }
            Files.move(pending.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            FileDescriptor descriptor = Os.open(dir.getAbsolutePath(), OsConstants.O_RDONLY, 0);
            try { Os.fsync(descriptor); } finally { Os.close(descriptor); }
        } finally { Files.deleteIfExists(pending.toPath()); }
    }
    static byte[] encode(NativeCredentialState.Record r) throws IOException {
        NativeCredentialState.validate(r);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeInt(2); out.writeUTF(r.phase.name()); out.writeUTF(r.username); out.writeUTF(r.password);
            out.writeUTF(r.accountId); out.writeInt(r.attempts); out.writeUTF(r.token);
            out.writeUTF(r.epoch); out.writeBoolean(r.authorized);
        }
        return bytes.toByteArray();
    }
    static NativeCredentialState.Record decode(byte[] bytes) throws IOException {
        if (bytes.length > MAX_ENVELOPE) throw new IOException("credential state too large");
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes))) {
            int version = in.readInt();
            if (version != 1 && version != 2) throw new IOException("credential version invalid");
            NativeCredentialState.Phase phase;
            try { phase = NativeCredentialState.Phase.valueOf(in.readUTF()); }
            catch (IllegalArgumentException invalid) { throw new IOException("credential phase invalid", invalid); }
            String username = in.readUTF(), password = in.readUTF(), id = in.readUTF();
            int attempts = in.readInt(); String token = in.readUTF();
            String epoch = version == 2 ? in.readUTF() : "";
            boolean authorized = version == 2 && in.readBoolean();
            NativeCredentialState.Record r = new NativeCredentialState.Record(phase, username, password, id, attempts, token, epoch, authorized);
            if (in.available() != 0) throw new IOException("credential state trailing bytes");
            NativeCredentialState.validate(r); return r;
        }
    }
}
