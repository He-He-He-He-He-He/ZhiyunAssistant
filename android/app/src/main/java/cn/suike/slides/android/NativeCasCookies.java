package cn.suike.slides.android;

import java.io.IOException;
import java.net.HttpCookie;
import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.LongSupplier;

/** Per-session, memory-only cookie jar. Domains are restricted to the three explicit
 * school hosts and their known organizational suffixes; no public-suffix guessing. */
final class NativeCasCookies {
    private static final class Cookie {
        final String name, value, domain, path; final boolean hostOnly, secure; final long expires, order;
        Cookie(String n, String v, String d, String p, boolean h, boolean s, long e, long o) { name=n; value=v; domain=d; path=p; hostOnly=h; secure=s; expires=e; order=o; }
    }
    private final Map<String,Cookie> jar = new LinkedHashMap<>();
    private final LongSupplier clock; private long sequence, revision, casRevision;
    NativeCasCookies() { this(System::currentTimeMillis); }
    NativeCasCookies(LongSupplier clock) { this.clock=clock; }
    synchronized void clear() { revision++; casRevision++; jar.clear(); }
    private static boolean domainMatch(String host, String domain) { return host.equals(domain) || host.endsWith("." + domain); }
    synchronized void receive(URI source, String header) throws IOException {
        checkedSource(source);
        revision++; // Invalidate on every attempted mutation, even delete-and-recreate.
        if (header == null || header.length() > 4096 || header.indexOf('\r') >= 0 || header.indexOf('\n') >= 0) throw new IOException("invalid cookie");
        String[] parts=header.split(";",-1); int eq=parts[0].indexOf('='); if(eq<=0) throw new IOException("invalid cookie");
        String name=parts[0].substring(0,eq).trim(), value=parts[0].substring(eq+1).trim();
        if(!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}") || !value.matches("[\\x21-\\x2B\\x2D-\\x3A\\x3C-\\x7E]{0,2048}")) throw new IOException("invalid cookie");
        String host=source.getHost().toLowerCase(Locale.ROOT), domain=host, path=null; boolean hostOnly=true, secure=false;
        if("JSESSIONID".equals(name) && host.equals("zjuam.zju.edu.cn")) casRevision++;
        String age=null, expires=null; java.util.Set<String> seen=new java.util.HashSet<>();
        for(int i=1;i<parts.length;i++) {
            String a=parts[i].trim(); if(a.isEmpty()) continue; int at=a.indexOf('='); String key=(at<0?a:a.substring(0,at)).trim().toLowerCase(Locale.ROOT), v=at<0?"":a.substring(at+1).trim();
            if((key.equals("domain") || key.equals("path") || key.equals("max-age") || key.equals("expires") || key.equals("secure")) && !seen.add(key)) throw new IOException("ambiguous cookie attributes");
            switch(key) {
                case "domain":
                    domain=(v.startsWith(".")?v.substring(1):v).toLowerCase(Locale.ROOT); hostOnly=false;
                    if (!domainMatch(host,domain) || !(domain.equals(host) || domain.equals("zju.edu.cn") || domain.equals("cmc.zju.edu.cn"))) throw new IOException("cookie domain refused"); break;
                case "path": if(v.startsWith("/")) { if(v.indexOf(' ')>=0 || v.indexOf('\t')>=0) throw new IOException("invalid cookie path"); path=v; } break;
                case "secure": if(at>=0) throw new IOException("invalid secure attribute"); secure=true; break;
                case "max-age": age=v; break;
                case "expires": expires=v; break;
                default: break;
            }
        }
        if(path==null) { path=source.getRawPath(); int slash=path.lastIndexOf('/'); path=slash<=0?"/":path.substring(0,slash); }
        if ("JSESSIONID".equals(name) && domainMatch("zjuam.zju.edu.cn",domain)
                && (!host.equals("zjuam.zju.edu.cn") || !hostOnly || !path.equals("/cas")))
            throw new IOException("CAS session scope refused");
        long now=clock.getAsLong(), deadline=Long.MAX_VALUE;
        if(age!=null) {
            if(!age.matches("-?[0-9]{1,18}")) throw new IOException("invalid cookie max-age");
            try { long seconds=Long.parseLong(age); if(seconds<=0) deadline=now; else if(seconds <= (Long.MAX_VALUE-now)/1000) deadline=now+seconds*1000; }
            catch(NumberFormatException bad) { throw new IOException("invalid cookie max-age"); }
        } else if(expires!=null) {
            // HttpCookie implements the obsolete HTTP-date variants used by servers.
            try { List<HttpCookie> parsed=HttpCookie.parse("x=y; Expires="+expires); long seconds=parsed.get(0).getMaxAge();
                if(seconds<0) throw new IOException("invalid cookie expiry"); if(seconds==0) deadline=now; else if(seconds <= (Long.MAX_VALUE-now)/1000) deadline=now+seconds*1000;
            } catch(IllegalArgumentException bad) { throw new IOException("invalid cookie expiry"); }
        }
        if(name.startsWith("__Secure-") && !secure) throw new IOException("invalid secure prefix");
        if(name.startsWith("__Host-") && (!secure || !hostOnly || !path.equals("/"))) throw new IOException("invalid host prefix");
        String key=name+"\n"+domain+"\n"+path; Cookie old=jar.get(key);
        if(deadline<=now) { jar.remove(key); return; }
        purge(now); if(old==null && jar.size()>=64) throw new IOException("too many cookies");
        jar.put(key,new Cookie(name,value,domain,path,hostOnly,secure,deadline,old==null?sequence++:old.order));
    }
    private void purge(long now) { Iterator<Cookie> it=jar.values().iterator(); while(it.hasNext()) { Cookie c=it.next(); if(c.expires<=now) { it.remove(); revision++; if(c.name.equals("JSESSIONID") && domainMatch("zjuam.zju.edu.cn",c.domain)) casRevision++; } } }
    /** Production binding proves local cookie continuity, not that captcha cannot change.
     * CAS currently omits Secure; this jar is HTTPS-only and never exports CAS cookies.
     * Pin the exact host-only /cas cookie, including same-value reset/delete generation.
     * Unrelated analytics/CSRF cookies do not change this binding. */
    synchronized Object casSessionBinding() throws IOException {
        purge(clock.getAsLong()); Cookie selected=null;
        for (Cookie c:jar.values()) if(c.name.equals("JSESSIONID") && domainMatch("zjuam.zju.edu.cn",c.domain)) {
            if(selected!=null || c.value.isEmpty() || !c.hostOnly || !c.domain.equals("zjuam.zju.edu.cn") || !c.path.equals("/cas"))
                throw new IOException("CAS session unavailable");
            selected=c;
        }
        if(selected==null) throw new IOException("CAS session unavailable");
        return new Snapshot(this,casRevision,"JSESSIONID");
    }
    static boolean officialHost(URI uri) {
        return uri!=null && "https".equals(uri.getScheme()) && uri.getRawUserInfo()==null && uri.getRawFragment()==null
            && (uri.getPort()==-1 || uri.getPort()==443)
            && ("classroom.zju.edu.cn".equals(uri.getHost()) || "interactivemeta.cmc.zju.edu.cn".equals(uri.getHost()));
    }
    private static void checkedSource(URI uri) throws IOException {
        if(!officialHost(uri)) NativeCasHttps.checked(uri);
    }
    /** Independent memory jar for ordinary official API traffic; never adopt CAS SSO cookies. */
    synchronized NativeCasCookies officialCopy() {
        purge(clock.getAsLong()); NativeCasCookies copy=new NativeCasCookies(clock);
        for(Map.Entry<String,Cookie> e:jar.entrySet()) {
            Cookie c=e.getValue();
            if(c.name.equals("CASTGC") || c.name.equals("TGC") || c.name.equals("JSESSIONID") && domainMatch("zjuam.zju.edu.cn",c.domain)) continue;
            if(domainMatch("classroom.zju.edu.cn",c.domain) || domainMatch("interactivemeta.cmc.zju.edu.cn",c.domain))
                copy.jar.put(e.getKey(),c);
        }
        copy.sequence=sequence; return copy;
    }
    /** Experimental primitive, not a claim about which cookie CAS actually uses. The
     * caller must establish the name and server semantics independently. Tokens expose
     * no cookie values and are valid only for this exact jar and mutation generation. */
    private static final class Snapshot {
        private final NativeCasCookies owner; private final long revision; private final String name;
        Snapshot(NativeCasCookies owner, long revision, String name) { this.owner=owner; this.revision=revision; this.name=name; }
        @Override public boolean equals(Object other) { return other instanceof Snapshot && ((Snapshot)other).owner == owner && ((Snapshot)other).revision == revision && name.equals(((Snapshot)other).name); }
        @Override public int hashCode() { return (System.identityHashCode(owner) * 31 + Long.hashCode(revision)) * 31 + name.hashCode(); }
    }
    synchronized Object sessionSnapshot(String name) throws IOException {
        if (name == null || !name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}")) throw new IOException("session policy unavailable");
        purge(clock.getAsLong()); Cookie selected = null;
        String[] paths = {"/cas/login", "/cas/v2/getPubKey", "/cas/v2/getKaptchaStatus"};
        for (String path : paths) {
            Cookie match = null;
            for (Cookie c : jar.values()) {
                boolean domain = c.hostOnly ? c.domain.equals("zjuam.zju.edu.cn") : domainMatch("zjuam.zju.edu.cn", c.domain);
                boolean pathMatch = path.equals(c.path) || path.startsWith(c.path) && (c.path.endsWith("/") || path.length()>c.path.length() && path.charAt(c.path.length())=='/');
                if (c.name.equals(name) && domain && pathMatch) { if (match != null) throw new IOException("ambiguous session cookie"); match=c; }
            }
            if (match == null || match.value.isEmpty() || !match.hostOnly || !match.secure || !match.domain.equals("zjuam.zju.edu.cn") || selected != null && selected != match)
                throw new IOException("session cookie unavailable or inconsistent");
            selected=match;
        }
        return new Snapshot(this,revision,name);
    }
    synchronized String header(URI uri) throws IOException {
        checkedSource(uri); long now=clock.getAsLong(); purge(now); String host=uri.getHost().toLowerCase(Locale.ROOT), path=uri.getRawPath(); if(path==null || path.isEmpty()) path="/"; List<Cookie> matches=new ArrayList<>();
        for(Cookie c:jar.values()) {
            boolean domains=c.hostOnly?host.equals(c.domain):domainMatch(host,c.domain);
            boolean paths=path.equals(c.path) || path.startsWith(c.path) && (c.path.endsWith("/") || path.length()>c.path.length() && path.charAt(c.path.length())=='/');
            if(domains && paths && (!c.secure || "https".equals(uri.getScheme()))) matches.add(c);
        }
        matches.sort(Comparator.<Cookie>comparingInt(c -> -c.path.length()).thenComparingLong(c -> c.order));
        StringBuilder out=new StringBuilder(); for(Cookie c:matches) { if(out.length()>0) out.append("; "); out.append(c.name).append('=').append(c.value); }
        if(out.length()>16384) throw new IOException("cookie header too large"); return out.toString();
    }
}
