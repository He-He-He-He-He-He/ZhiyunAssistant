package cn.suike.slides.android;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Experimental read-only CAS preflight. This cannot submit credentials or verify identity.
 * Fail closed on unfamiliar forms, ambiguous key JSON, redirects, or uncertain captcha. */
final class NativeCasPreflight {
    private static final URI LOGIN = URI.create("https://zjuam.zju.edu.cn/cas/login");
    private static final URI KEY = URI.create("https://zjuam.zju.edu.cn/cas/v2/getPubKey");
    private static final URI CAPTCHA = URI.create("https://zjuam.zju.edu.cn/cas/v2/getKaptchaStatus");
    interface Get { NativeCasHttps.Response get(URI uri) throws IOException; }
    static final class Prepared {
        final String execution, ys, modulus, exponent;
        Prepared(String execution, String ys, String modulus, String exponent) { this.execution = execution; this.ys = ys; this.modulus = modulus; this.exponent = exponent; }
    }
    static Prepared fetch(NativeCasHttps https) throws IOException { return fetch(uri -> https.request(uri, "GET", null)); }
    static Prepared fetch(Get get) throws IOException { return fetch(get, LOGIN); }
    static Prepared fetch(Get get, URI login) throws IOException {
        return fetch(get,login,null);
    }
    static Prepared fetch(Get get, URI login,NativeCasDiagnostics.Context diagnostics) throws IOException {
        if (!LOGIN.equals(login) && !NativeCasDiscovery.CAS_LOGIN.equals(login)) throw new IOException("untrusted CAS entry");
        if(diagnostics!=null) diagnostics.stage(NativeCasDiagnostics.Stage.FORM);
        NativeCasHttps.Response page = get.get(login); require200(page,NativeCasDiagnostics.Stage.FORM);
        String text = new String(page.body, StandardCharsets.UTF_8);
        String expectedAction = login.getRawPath() + (login.getRawQuery() == null ? "" : "?" + login.getRawQuery());
        String[] form;
        try { form=parseForm(text, expectedAction); }
        catch(IOException rejected) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.FORM,NativeCasDiagnostics.Category.FORM_REJECTED); }
        if(diagnostics!=null) diagnostics.stage(NativeCasDiagnostics.Stage.KEY);
        NativeCasHttps.Response key = get.get(KEY); require200(key,NativeCasDiagnostics.Stage.KEY);
        String[] pub;
        try { pub=parseKey(new String(key.body, StandardCharsets.UTF_8)); }
        catch(IOException rejected) { throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.KEY,NativeCasDiagnostics.Category.KEY_REJECTED); }
        // Request captcha last, in the same private cookie session; no inference from UI.
        requireCaptchaClear(get,diagnostics);
        return new Prepared(form[0], form[1], pub[0], pub[1]);
    }
    /** A second check narrows, but cannot eliminate, the server-side captcha race. */
    static void requireCaptchaClear(Get get) throws IOException {
        requireCaptchaClear(get,null);
    }
    static void requireCaptchaClear(Get get,NativeCasDiagnostics.Context diagnostics) throws IOException {
        if(diagnostics!=null) diagnostics.stage(NativeCasDiagnostics.Stage.CAPTCHA);
        NativeCasHttps.Response captcha = get.get(CAPTCHA); require200(captcha,NativeCasDiagnostics.Stage.CAPTCHA);
        String value=new String(captcha.body,StandardCharsets.UTF_8).trim();
        if(!value.equals("false")) throw NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.CAPTCHA,
            value.equals("true")?NativeCasDiagnostics.Category.CAPTCHA_REQUIRED:NativeCasDiagnostics.Category.CAPTCHA_UNRECOGNIZED);
    }
    private static void require200(NativeCasHttps.Response r,NativeCasDiagnostics.Stage stage) throws IOException {
        if (r == null || r.status != 200 || r.body == null || r.body.length > 512 * 1024)
            throw new NativeCasDiagnostics.Failure(stage,NativeCasDiagnostics.Category.HTTP_STATUS,r==null?0:r.status);
    }
    private static final Pattern FORMS = Pattern.compile("<form\\b([^>]*)>([\\s\\S]*?)</form\\s*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern INPUTS = Pattern.compile("<input\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTRIBUTE = Pattern.compile("([A-Za-z_:][A-Za-z0-9_:.-]*)\\s*=\\s*([\"'])(.*?)\\2", Pattern.DOTALL);
    private static Map<String, String> attrs(String input) throws IOException {
        Map<String, String> values = new HashMap<>(); Matcher m = ATTRIBUTE.matcher(input);
        while (m.find()) { String name = m.group(1).toLowerCase(java.util.Locale.ROOT); if (values.put(name, m.group(3)) != null) throw new IOException("ambiguous attributes"); }
        return values;
    }
    static String[] parseForm(String html) throws IOException { return parseForm(html, "/cas/login"); }
    private static String[] parseForm(String html, String expectedAction) throws IOException {
        Matcher forms = FORMS.matcher(html); String[] found = null;
        while (forms.find()) {
            Map<String, String> form = attrs(forms.group(1)); if (!"fm1".equals(form.get("id"))) continue;
            if (found != null || !"post".equalsIgnoreCase(form.get("method")) || !expectedAction.equals(form.get("action"))) throw new IOException("unexpected form");
            Map<String, String> fields = new HashMap<>(); Matcher inputs = INPUTS.matcher(forms.group(2));
            while (inputs.find()) {
                Map<String, String> attrs = attrs(inputs.group(1)); String name = attrs.get("name");
                if (name != null && "hidden".equalsIgnoreCase(attrs.get("type")) && !"execution".equals(name) && !"_eventId".equals(name) && !"ys".equals(name)) throw new IOException("unexpected hidden field");
                if ("execution".equals(name) || "_eventId".equals(name) || "ys".equals(name)) {
                    if (!"hidden".equalsIgnoreCase(attrs.get("type")) || attrs.get("value") == null || fields.put(name, attrs.get("value")) != null) throw new IOException("ambiguous form fields");
                }
            }
            String execution = fields.get("execution"), ys = fields.get("ys");
            if (execution == null || !execution.matches("[A-Za-z0-9_=\\-]{1,8192}") || !"submit".equals(fields.get("_eventId")) || (ys != null && !ys.matches("[0-9]{1,8}"))) throw new IOException("missing form fields");
            found = new String[]{execution, ys};
        }
        if (found == null) throw new IOException("CAS form unavailable"); return found;
    }
    static String[] parseKey(String json) throws IOException {
        // Accept precisely two string members with no escapes or duplicate/extra fields.
        Matcher all = Pattern.compile("\\s*\\{\\s*\"(modulus|exponent)\"\\s*:\\s*\"([0-9A-Fa-f]+)\"\\s*,\\s*\"(modulus|exponent)\"\\s*:\\s*\"([0-9A-Fa-f]+)\"\\s*\\}\\s*").matcher(json);
        if (!all.matches() || all.group(1).equals(all.group(3))) throw new IOException("invalid public key response");
        String modulus = all.group(1).equals("modulus") ? all.group(2) : all.group(4), exponent = all.group(1).equals("exponent") ? all.group(2) : all.group(4);
        // Validate key without disclosing or logging the actual password.
        NativeCasRsa.encrypt("x", modulus, exponent);
        return new String[]{modulus, exponent};
    }
}
