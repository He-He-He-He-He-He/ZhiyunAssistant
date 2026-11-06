package cn.suike.slides.android;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Redirect credentials are opaque, not base64url. Validation never reconstructs a URI.
 * Forward the original checked URI/raw query, including percent escapes and literal '+'.
 * Decode percent escapes exactly once, strictly as UTF-8, only for validation/comparison.
 * No exceptions include a URI, query, credential, decoder input, or nested cause. */
final class NativeCasRedirects {
    private NativeCasRedirects() {}
    private static final String ROOT = "https://classroom.zju.edu.cn/";

    static Map<String,String> query(URI uri) throws IOException {
        return query(uri,NativeCasDiagnostics.Stage.OAUTH);
    }
    private static Map<String,String> query(URI uri,NativeCasDiagnostics.Stage stage) throws IOException {
        String raw = uri.getRawQuery();
        if (raw == null || raw.isEmpty()) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
        if (raw.length() > 4096) throw reject(stage,NativeCasDiagnostics.Category.QUERY_SYNTAX);
        Map<String,String> values = new HashMap<>();
        // Split before decoding: encoded '&'/'=' are data, never new parameters.
        for (String part : raw.split("&", -1)) {
            int equals = part.indexOf('=');
            if (equals < 1) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
            String key;
            try { key=decode(part.substring(0, equals)); }
            catch(IOException bad) { throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS); }
            if (key.isEmpty() || values.containsKey(key)) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
            String value;
            try { value=decode(part.substring(equals + 1)); }
            catch(IOException bad) {
                throw reject(stage,"code".equals(key)?NativeCasDiagnostics.Category.CODE_SYNTAX:
                    "ticket".equals(key)?NativeCasDiagnostics.Category.TICKET_SYNTAX:
                    "url".equals(key)?NativeCasDiagnostics.Category.RETURN_URL:
                    "r".equals(key)?NativeCasDiagnostics.Category.ROUTE:NativeCasDiagnostics.Category.QUERY_SYNTAX);
            }
            values.put(key,value);
        }
        return values;
    }

    private static String decode(String raw) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '%') {
                if (i + 2 >= raw.length()) throw invalid();
                int hi = Character.digit(raw.charAt(++i), 16);
                int lo = Character.digit(raw.charAt(++i), 16);
                if (hi < 0 || lo < 0) throw invalid();
                bytes.write((hi << 4) | lo);
            } else {
                // RFC 3986 query = pchar / "/" / "?"; '&' separates fields.
                // This is URI syntax, not a guess at an issuer's credential alphabet.
                boolean allowed = c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
                    || c >= '0' && c <= '9' || "-._~!$'()*+,;=:@/?".indexOf(c) >= 0;
                if (!allowed) throw invalid();
                bytes.write(c);
            }
        }
        final String decoded;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        } catch (CharacterCodingException e) { throw invalid(); }
        for (int i = 0; i < decoded.length(); i++)
            if (Character.isISOControl(decoded.charAt(i))) throw invalid();
        return decoded;
    }

    // Retain the CAS service-ticket prefix, not an invented suffix alphabet.
    // Decoded length bounds retain the old 512-character suffix / 1024-character code limits.
    static boolean ticket(String value) {
        return value != null && value.startsWith("ST-") && value.length() > 3 && value.length() <= 515;
    }

    static void requireCallback(URI uri) throws IOException {
        NativeCasDiagnostics.Stage stage=NativeCasDiagnostics.Stage.CALLBACK;
        endpoint(uri,stage,"zjuam.zju.edu.cn","/cas/oauth2.0/callbackAuthorize");
        Map<String,String> q = query(uri,stage);
        if(q.size()!=1 || !q.containsKey("ticket")) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
        if(!ticket(q.get("ticket"))) throw reject(stage,NativeCasDiagnostics.Category.TICKET_SYNTAX);
    }

    static void requireExchange(URI uri) throws IOException {
        NativeCasDiagnostics.Stage stage=NativeCasDiagnostics.Stage.OAUTH;
        endpoint(uri,stage,"tgmedia.cmc.zju.edu.cn","/index.php");
        Map<String,String> q = query(uri,stage);
        // AUTHORIZE's unescaped '&url=' is a TOP-LEVEL parameter, not part of
        // redirect_uri. Both contract-compatible shapes remain narrowly pinned:
        // exactly {r,code}, or exactly {r,code,url} with the fixed return URL.
        if((q.size()!=2 && q.size()!=3) || !q.containsKey("r") || !q.containsKey("code")
                || (q.size()==3 && !q.containsKey("url"))) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
        if(!"auth/get-info".equals(q.get("r"))) throw reject(stage,NativeCasDiagnostics.Category.ROUTE);
        if(q.containsKey("url") && !ROOT.equals(q.get("url"))) throw reject(stage,NativeCasDiagnostics.Category.RETURN_URL);
        String code = q.get("code");
        if(code==null || code.isEmpty() || code.length()>1024) throw reject(stage,NativeCasDiagnostics.Category.CODE_SYNTAX);
    }
    static void requireLanding(URI uri) throws IOException {
        NativeCasDiagnostics.Stage stage=NativeCasDiagnostics.Stage.LANDING;
        endpoint(uri,stage,"classroom.zju.edu.cn","/");
        if(uri.getRawQuery()!=null) throw reject(stage,NativeCasDiagnostics.Category.QUERY_KEYS);
        if(!URI.create(ROOT).equals(uri)) throw reject(stage,NativeCasDiagnostics.Category.RETURN_URL);
    }
    /** Pure resolution + endpoint-specific validation, always before a follow-up GET.
     * No URL/string can escape through a decoder exception, cause, or diagnostic. */
    static URI resolve(URI from,String location,NativeCasDiagnostics.Stage stage) throws IOException {
        if(location==null || location.isEmpty() || location.length()>8192)
            throw reject(stage,NativeCasDiagnostics.Category.REDIRECT_LOCATION);
        final URI target;
        try { target=from.resolve(location); }
        catch(IllegalArgumentException bad) { throw reject(stage,NativeCasDiagnostics.Category.QUERY_SYNTAX); }
        if(stage==NativeCasDiagnostics.Stage.CALLBACK) requireCallback(target);
        else if(stage==NativeCasDiagnostics.Stage.OAUTH) requireExchange(target);
        else if(stage==NativeCasDiagnostics.Stage.LANDING) requireLanding(target);
        else throw reject(stage,NativeCasDiagnostics.Category.PROTOCOL_REJECTED);
        return target; // Forward the original raw query; never rebuild credential values.
    }
    private static void endpoint(URI uri,NativeCasDiagnostics.Stage stage,String host,String path) throws IOException {
        if(uri==null || !"https".equals(uri.getScheme()) || !host.equals(uri.getHost())
                || uri.getRawUserInfo()!=null || uri.getRawFragment()!=null
                || (!host.equals(uri.getRawAuthority()) && !(host+":443").equals(uri.getRawAuthority())))
            throw reject(stage,NativeCasDiagnostics.Category.AUTHORITY);
        if(!path.equals(uri.getRawPath())) throw reject(stage,NativeCasDiagnostics.Category.PATH);
        // The shared transport whitelist remains an independent final constraint.
        try { NativeCasHttps.checked(uri); }
        catch(IOException bad) { throw reject(stage,NativeCasDiagnostics.Category.QUERY_SYNTAX); }
    }

    private static NativeCasDiagnostics.Failure reject(NativeCasDiagnostics.Stage stage,NativeCasDiagnostics.Category category) {
        return NativeCasDiagnostics.failure(stage,category);
    }
    private static IOException invalid() { return new IOException("invalid authentication redirect"); }
}
