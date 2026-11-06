package cn.suike.slides.android;

import java.io.IOException;
import java.net.URI;

/** Read-only, narrowly pinned discovery based on the public classroom login button.
 * Never follows arbitrary Location headers; no POST, credentials, or identity proof.
 * The upstream CAS service parameter is explicitly HTTP, so a post-login transition
 * to it MUST NOT be followed by the HTTPS-only client. This is not an enabled login. */
final class NativeCasDiscovery {
    static final URI ENTRY = URI.create("https://tgmedia.cmc.zju.edu.cn/index.php?r=auth/login&auType=&tenant_code=112&forward=https%3A%2F%2Fclassroom.zju.edu.cn%2F");
    static final URI AUTHORIZE = URI.create("https://zjuam.zju.edu.cn/cas/oauth2.0/authorize?response_type=code&client_id=ObXIv4FvjcC1e9hVcS&redirect_uri=https://tgmedia.cmc.zju.edu.cn/index.php?r=auth/get-info&url=https://classroom.zju.edu.cn/");
    static final URI CAS_LOGIN = URI.create("https://zjuam.zju.edu.cn/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize");
    static NativeCasPreflight.Prepared fetch(NativeCasHttps https) throws IOException {
        return fetch(uri -> https.request(uri, "GET", null));
    }
    static NativeCasPreflight.Prepared fetch(NativeCasPreflight.Get get) throws IOException {
        return fetch(get,null);
    }
    static NativeCasPreflight.Prepared fetch(NativeCasPreflight.Get get,NativeCasDiagnostics.Context diagnostics) throws IOException {
        if(diagnostics!=null) diagnostics.stage(NativeCasDiagnostics.Stage.DISCOVERY);
        requireRedirect(get.get(ENTRY), ENTRY, AUTHORIZE);
        requireRedirect(get.get(AUTHORIZE), AUTHORIZE, CAS_LOGIN);
        return NativeCasPreflight.fetch(get, CAS_LOGIN,diagnostics);
    }
    private static void requireRedirect(NativeCasHttps.Response response, URI from, URI expected) throws IOException {
        if (response == null || response.status != 302)
            throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.DISCOVERY,NativeCasDiagnostics.Category.HTTP_STATUS,response==null?0:response.status);
        try {
            URI actual = NativeCasHttps.allowedRedirect(from, response.one("location"));
            if (!actual.equals(expected)) throw new IOException("unexpected discovery destination");
        } catch(IOException rejected) {
            throw new NativeCasDiagnostics.Failure(NativeCasDiagnostics.Stage.DISCOVERY,NativeCasDiagnostics.Category.PROTOCOL_REJECTED,response.status);
        }
    }
}
