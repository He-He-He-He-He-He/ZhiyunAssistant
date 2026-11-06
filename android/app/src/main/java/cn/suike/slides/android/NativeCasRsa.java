package cn.suike.slides.android;

import java.io.IOException;
import java.math.BigInteger;

/** Official CAS security.js compatible RSA, intentionally limited to printable ASCII.
 * The upstream JS reverses UTF-16 code units and packs two code units per digit;
 * non-ASCII is refused rather than guessing at its nonstandard packing semantics. */
final class NativeCasRsa {
    static String encrypt(String password, String modulus, String exponent) throws IOException {
        if (password == null || password.isEmpty() || password.length() > 1024) throw new IOException("invalid password");
        for (int i = 0; i < password.length(); i++) if (password.charAt(i) < 0x20 || password.charAt(i) > 0x7e) throw new IOException("unsupported password encoding");
        if (modulus == null || exponent == null || !modulus.matches("[0-9a-fA-F]{64,1024}") || !exponent.matches("[0-9a-fA-F]{1,8}")) throw new IOException("invalid public key");
        BigInteger n = new BigInteger(modulus, 16), e = new BigInteger(exponent, 16);
        if (n.bitLength() < 256 || !n.testBit(0) || e.compareTo(BigInteger.valueOf(3)) < 0 || !e.testBit(0)) throw new IOException("invalid public key");
        int digits = (n.bitLength() + 15) / 16, chunk = 2 * (digits - 1);
        String reversed = new StringBuilder(password).reverse().toString();
        StringBuilder output = new StringBuilder();
        for (int off = 0; off < reversed.length(); off += chunk) {
            BigInteger block = BigInteger.ZERO;
            for (int j = 0; j < chunk && off + j < reversed.length(); j++) block = block.add(BigInteger.valueOf(reversed.charAt(off + j)).shiftLeft(8 * j));
            String hex = block.modPow(e, n).toString(16);
            int pad = (4 - hex.length() % 4) % 4;
            if (output.length() != 0) output.append(' ');
            for (int i = 0; i < pad; i++) output.append('0');
            output.append(hex);
        }
        return output.toString();
    }
}
