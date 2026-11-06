package cn.suike.slides.android;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Strict bounded JSON parser: values support JSON Unicode escapes, while member
 * names must be literal to avoid escaped structural aliases. Duplicate fields,
 * malformed UTF-8/Unicode and trailing data are rejected at every nesting level. */
final class NativeCasIdentity {
    private static final class NumberToken { final String value; NumberToken(String value) { this.value = value; } }
    private final String text; private int pos;
    private NativeCasIdentity(String text) { this.text = text; }
    static boolean matches(byte[] body, String expectedId, String expectedUser) throws IOException {
        if(expectedId==null || expectedUser==null) throw new IOException("invalid identity response");
        String[] identity=read(body);
        return !expectedId.isEmpty() && !expectedUser.isEmpty() && expectedId.equals(identity[0]) && expectedUser.equals(identity[1]);
    }
    /** Only native HTTPS responses may be used to establish the currently selected account. */
    static String[] read(byte[] body) throws IOException {
        if (body == null || body.length > 512 * 1024) throw new IOException("invalid identity response");
        String text;
        try { text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(body)).toString(); }
        catch (Exception e) { throw new IOException("invalid identity encoding"); }
        NativeCasIdentity parser = new NativeCasIdentity(text); Object root = parser.value(0); parser.ws();
        if (parser.pos != text.length() || !(root instanceof Map)) throw new IOException("invalid identity response");
        Object params = ((Map<?, ?>)root).get("params"); if (!(params instanceof Map)) throw new IOException("missing identity");
        Object id = ((Map<?, ?>)params).get("id"), user = ((Map<?, ?>)params).get("account");
        String idText = id instanceof String ? (String)id : id instanceof NumberToken ? ((NumberToken)id).value : null;
        if(idText==null || idText.isEmpty() || idText.equals("0") || idText.length()>256 || !(user instanceof String))
            throw new IOException("missing identity");
        String username=((String)user).trim();
        if(username.isEmpty() || username.length()>128 || username.indexOf('\0')>=0) throw new IOException("missing identity");
        return new String[]{idText,username};
    }
    private void ws() { while (pos < text.length() && (text.charAt(pos) == ' ' || text.charAt(pos) == '\n' || text.charAt(pos) == '\r' || text.charAt(pos) == '\t')) pos++; }
    private boolean take(char c) { ws(); if (pos < text.length() && text.charAt(pos) == c) { pos++; return true; } return false; }
    private Object value(int depth) throws IOException {
        if (depth > 32) throw new IOException("identity nesting limit"); ws(); if (pos >= text.length()) throw new IOException("invalid JSON"); char c = text.charAt(pos);
        if (c == '"') return string(false);
        if (c == '{') { pos++; Map<String,Object> m = new HashMap<>(); if (take('}')) return m; do { ws(); if (pos >= text.length() || text.charAt(pos) != '"') throw new IOException("invalid JSON object"); String k = string(true); if (!take(':') || m.containsKey(k)) throw new IOException("duplicate JSON field"); m.put(k, value(depth + 1)); if (m.size() > 10000) throw new IOException("identity limit"); } while (take(',')); if (!take('}')) throw new IOException("invalid JSON object"); return m; }
        if (c == '[') { pos++; int count = 0; if (take(']')) return Boolean.FALSE; do { value(depth + 1); if (++count > 10000) throw new IOException("identity limit"); } while (take(',')); if (!take(']')) throw new IOException("invalid JSON array"); return Boolean.FALSE; }
        int start = pos; while (pos < text.length() && ",}] \t\r\n".indexOf(text.charAt(pos)) < 0) pos++; String token = text.substring(start, pos);
        if (token.equals("true") || token.equals("false") || token.equals("null")) return Boolean.FALSE;
        if (token.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")) return new NumberToken(token);
        throw new IOException("invalid JSON value");
    }
    private String string(boolean memberName) throws IOException {
        if (text.charAt(pos++) != '"') throw new IOException("invalid JSON string"); StringBuilder s = new StringBuilder();
        while (pos < text.length()) { char c = text.charAt(pos++); if (c == '"') {
                for(int i=0;i<s.length();i++) {
                    char unit=s.charAt(i);
                    if(Character.isHighSurrogate(unit)) {
                        if(++i>=s.length() || !Character.isLowSurrogate(s.charAt(i))) throw new IOException("invalid JSON Unicode");
                    } else if(Character.isLowSurrogate(unit)) throw new IOException("invalid JSON Unicode");
                }
                return s.toString();
            } if (c < 0x20) throw new IOException("invalid JSON string");
            if (c == '\\') { if(memberName) throw new IOException("escaped JSON field"); if (pos >= text.length()) throw new IOException("invalid JSON escape"); c = text.charAt(pos++); switch (c) {
                case '"': case '\\': case '/': s.append(c); break; case 'b': s.append('\b'); break; case 'f': s.append('\f'); break; case 'n': s.append('\n'); break; case 'r': s.append('\r'); break; case 't': s.append('\t'); break;
                case 'u':
                    if(pos+4>text.length()) throw new IOException("invalid JSON escape");
                    int unit=0;
                    for(int i=0;i<4;i++) {
                        char hex=text.charAt(pos++);
                        int digit=hex>='0' && hex<='9'?hex-'0':hex>='a' && hex<='f'?hex-'a'+10:hex>='A' && hex<='F'?hex-'A'+10:-1;
                        if(digit<0) throw new IOException("invalid JSON escape");
                        unit=(unit<<4)|digit;
                    }
                    s.append((char)unit); break;
                default: throw new IOException("invalid JSON escape"); }
            } else s.append(c);
        } throw new IOException("unterminated JSON string");
    }
}
