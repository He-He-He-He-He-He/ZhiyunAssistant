package cn.suike.slides.android;

import org.junit.Test;
import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Synthetic credentials only; no network, device, real Location, or authentication quota. */
public class NativeCasOAuthContractTest {
    private static final String BASE="https://tgmedia.cmc.zju.edu.cn/index.php?";
    private static final String TWO=BASE+"r=auth/get-info&code=synthetic";
    private static final String ROOT="https://classroom.zju.edu.cn/";
    private static final String FIXED_URL="&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F";

    @Test public void recordedAuthorizeHasTopLevelUrlNotNestedInRedirectUri() throws Exception {
        Map<String,String> authorize=NativeCasRedirects.query(NativeCasDiscovery.AUTHORIZE);
        assertEquals(4,authorize.size());
        assertEquals(ROOT,authorize.get("url"));
        assertEquals(BASE+"r=auth/get-info",authorize.get("redirect_uri"));
        Map<String,String> redirect=NativeCasRedirects.query(URI.create(authorize.get("redirect_uri")));
        assertEquals(1,redirect.size()); assertEquals("auth/get-info",redirect.get("r"));
        assertFalse(redirect.containsKey("url"));
    }
    @Test public void strictTwoAndThreeFieldFormsKeepOriginalOpaqueQueryBytes() throws Exception {
        for(String code:NativeCasRedirectsTest.OPAQUE) {
            for(String raw:new String[]{"r=auth/get-info&code="+code,
                    "code="+code+"&r=auth%2Fget-info",
                    "r=auth/get-info&code="+code+FIXED_URL,
                    "url="+ROOT+"&%63ode="+code+"&%72=auth/get-info"}) {
                URI uri=URI.create(BASE+raw);
                NativeCasRedirects.requireExchange(uri);
                assertEquals(uri,NativeCasRedirects.resolve(NativeCasPrototypeTest.CALLBACK,uri.toString(),
                    NativeCasDiagnostics.Stage.OAUTH));
                assertEquals(raw,uri.getRawQuery());
            }
        }
        NativeCasRedirects.requireExchange(URI.create(BASE+"r=auth/get-info&code="+"%78".repeat(1024)));
        NativeCasRedirects.requireExchange(URI.create(BASE.replace(".cn/",".cn:443/")+"r=auth/get-info&code=x"));
    }
    private static void rejected(String target,NativeCasDiagnostics.Category category) throws Exception {
        NativeCasDiagnostics.Failure failure=assertThrows(NativeCasDiagnostics.Failure.class,
            ()->NativeCasRedirects.requireExchange(URI.create(target)));
        assertEquals(NativeCasDiagnostics.Stage.OAUTH,failure.stage); assertEquals(category,failure.category);
        assertNull(failure.getCause()); assertEquals(category.name(),failure.getMessage());
        NativeCasDiagnostics d=new NativeCasDiagnostics();
        NativeCasDiagnostics.Context c=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        c.stage(NativeCasDiagnostics.Stage.OAUTH); c.postResponded(302); c.http(302); c.fail(failure);
        NativeCasDiagnosticsTest.safe(d);
        assertFalse(d.latest().encode().contains(target));
    }
    @Test public void authorityAndPathAreExactEvenWithoutAnyUrlParameter() throws Exception {
        for(String target:new String[]{TWO.replace("https:","http:"),TWO.replace("tgmedia.cmc.zju.edu.cn","evil.invalid"),
                TWO.replace(".cn/",".cn.evil.invalid/"),TWO.replace(".cn/",".cn:444/"),
                TWO.replace(".cn/",".cn:/"),TWO.replace(".cn/",".cn:0443/"),
                TWO.replace("https://","https://synthetic@"),TWO+"#fragment",TWO+"#",
                TWO.replace("index.php","index.php/"),TWO.replace("index.php","%69ndex.php"),
                TWO.replace("index.php","other.php")}) {
            boolean path=target.contains("index.php/") || target.contains("%69ndex.php") || target.contains("other.php");
            rejected(target,path?NativeCasDiagnostics.Category.PATH:NativeCasDiagnostics.Category.AUTHORITY);
        }
    }
    @Test public void unknownDuplicateMissingAndEncodedAliasKeysAreNeverAllowed() throws Exception {
        for(String query:new String[]{"r=auth/get-info", "code=synthetic", "r=auth/get-info&code=synthetic&extra=x",
                "r=auth/get-info&code=synthetic&code=other", "r=auth/get-info&code=synthetic&%63ode=other",
                "r=auth/get-info&%72=auth/get-info&code=synthetic",
                "r=auth/get-info&code=synthetic"+FIXED_URL+FIXED_URL,
                "r=auth/get-info&code=synthetic"+FIXED_URL+"&%75rl="+ROOT,
                "r=auth/get-info&code=synthetic&", "&r=auth/get-info&code=synthetic",
                "r=auth/get-info&code=synthetic&extra=", "r=auth/get-info&code=synthetic&url",
                "r=auth/get-info&code=synthetic&Code=other", "r=auth/get-info&url="+ROOT})
            rejected(BASE+query,NativeCasDiagnostics.Category.QUERY_KEYS);
    }
    @Test public void routeReturnUrlAndCodeReasonsAreFixedAndBoundsAreNotRelaxed() throws Exception {
        for(String route:new String[]{"auth/login","auth%252Fget-info","","auth/get-info/","AUTH/get-info"})
            rejected(BASE+"r="+route+"&code=synthetic",NativeCasDiagnostics.Category.ROUTE);
        for(String url:new String[]{"","http://classroom.zju.edu.cn/","https://evil.invalid/",
                "https://classroom.zju.edu.cn","https://classroom.zju.edu.cn/other",
                "https://classroom.zju.edu.cn:443/","https%253A%252F%252Fclassroom.zju.edu.cn%252F",
                "https%3A%2F%2Fclassroom.zju.edu.cn%2F%3Fnext%3Devil","%FF"})
            rejected(TWO+"&url="+url,NativeCasDiagnostics.Category.RETURN_URL);
        for(String code:new String[]{"","x".repeat(1025),"%FF","%C0%AF","%00","%0A","%C2%85"})
            rejected(BASE+"r=auth/get-info&code="+code,NativeCasDiagnostics.Category.CODE_SYNTAX);
        rejected(BASE+"r=auth/get-info&code="+"x".repeat(4096),NativeCasDiagnostics.Category.QUERY_SYNTAX);
    }
    @Test public void landingRemainsTheExactRootWithoutQueryFragmentOrArbitraryDestination() throws Exception {
        NativeCasRedirects.requireLanding(URI.create(ROOT));
        for(String target:new String[]{ROOT+"other",ROOT+"?next=synthetic",ROOT+"?",ROOT+"#",
                ROOT.replace("https:","http:"),ROOT.replace("classroom","evil"),
                ROOT.replace(".cn/",".cn:443/"),ROOT.replace("https://","https://synthetic@")})
            assertThrows(IOException.class,()->NativeCasRedirects.requireLanding(URI.create(target)));
    }
    @Test public void callbackAndOAuthNonRedirectResponsesKeepTheRespondingStageAndNeverAdvance() throws Exception {
        for(boolean callback:new boolean[]{true,false}) for(int status:new int[]{200,301,307,400,500}) {
            NativeCasPrototypeTest.Fake f=new NativeCasPrototypeTest.Fake(); f.exchange=TWO;
            NativeCasDiagnostics d=new NativeCasDiagnostics();
            NativeCasPrototype.Transport transport=new NativeCasPrototype.Transport() {
                public boolean fresh() { return true; }
                public Object sessionBinding() { return f.sessionBinding(); }
                public void close() { f.close(); }
                public NativeCasHttps.Response post(URI uri,byte[] body) throws IOException { return f.post(uri,body); }
                public NativeCasHttps.Response get(URI uri) throws IOException {
                    NativeCasHttps.Response response=f.get(uri);
                    if(uri.equals(callback?NativeCasPrototypeTest.CALLBACK:URI.create(TWO)))
                        return new NativeCasHttps.Response(status,java.util.Collections.emptyMap(),new byte[0]);
                    return response;
                }
            };
            NativeCasPrototype p=new NativeCasPrototype(transport,new NativeVerificationGate(),
                d.begin(NativeCasDiagnostics.Kind.ENROLLMENT));
            NativeCasDiagnostics.Failure failure=assertThrows(NativeCasDiagnostics.Failure.class,
                ()->p.run(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID,
                    ()->f.reserved=true,()->fail("must not publish")));
            assertEquals(callback?NativeCasDiagnostics.Stage.CALLBACK:NativeCasDiagnostics.Stage.OAUTH,failure.stage);
            assertEquals(NativeCasDiagnostics.Category.HTTP_STATUS,failure.category); assertEquals(status,failure.http);
            assertFalse(d.latest().visited.contains(callback?NativeCasDiagnostics.Stage.OAUTH:NativeCasDiagnostics.Stage.LANDING));
            assertEquals(1,f.posts.get()); assertEquals(callback?7:8,f.gets.size()); NativeCasDiagnosticsTest.safe(d);
        }
    }

    private static final class Enrollment {
        final NativeCasLoginTest.Harness h=new NativeCasLoginTest.Harness();
        final NativeCasDiagnostics diagnostics=new NativeCasDiagnostics();
        final AtomicInteger officialChecks=new AtomicInteger();
        final NativeOfficialSession official;
        final NativeCasLogin login;
        Enrollment(String exchange,int officialFault) {
            h.factory.exchange=exchange;
            official=new NativeOfficialSession(candidate->NativeCasHttps.officialValidation(candidate,(owner,uri,method,body)->{
                officialChecks.incrementAndGet();
                assertEquals(NativeOfficialSession.INFO,uri); assertEquals("GET",method); assertNull(body);
                String cookies=owner.cookieHeader(uri);
                assertTrue(cookies.contains("_token=")); assertFalse(cookies.contains("private-"));
                assertFalse(cookies.contains("rotated;")); assertEquals("synthetic",NativeCasHttps.identityBearer(cookies));
                if(officialFault==1) return new NativeCasHttps.Response(403,java.util.Collections.emptyMap(),new byte[0]);
                if(officialFault==2) return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"other\",\"account\":\"synthetic-user\"}}");
                if(officialFault==3) return NativeCasPrototypeTest.ok(NativeCasDiagnosticsTest.CANARY);
                return NativeCasPrototypeTest.ok("{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\",\"name\":\"\\u5f20\\u4e09\"}}");
            }));
            login=new NativeCasLogin(h.disk,h.factory,official,diagnostics);
        }
        boolean enroll() throws IOException {
            return login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID);
        }
        void noPublication(int gets) throws Exception {
            assertFalse(official.active()); assertEquals(1,h.factory.posts.get()); assertEquals(1,h.factory.opens.get());
            assertEquals(gets,h.factory.flows.get(0).gets.size()); assertTrue(h.factory.flows.get(0).closed);
            assertNotEquals(NativeCredentialState.Phase.READY,h.disk.record.phase);
            assertEquals(NativeCasDiagnostics.Post.RESPONDED,diagnostics.latest().post);
            assertEquals(302,diagnostics.latest().postHttp); NativeCasDiagnosticsTest.safe(diagnostics);
        }
    }
    @Test public void twoFieldExchangeCompletes302Landing200Identity200AndIndependentOfficialRecheck() throws Exception {
        for(String exchange:new String[]{TWO,TWO+FIXED_URL,BASE+"code=synthetic%2Bopaque&r=auth/get-info"}) {
            Enrollment e=new Enrollment(exchange,0);
            assertTrue(e.enroll()); assertTrue(e.official.active());
            assertEquals(1,e.h.factory.posts.get()); assertEquals(1,e.officialChecks.get());
            assertEquals(10,e.h.factory.flows.get(0).gets.size());
            assertEquals(exchange,e.h.factory.flows.get(0).gets.get(7).toString());
            assertEquals(NativeCredentialState.Phase.READY,e.h.disk.record.phase);
            assertEquals(NativeCasDiagnostics.Result.SUCCESS,e.diagnostics.latest().result);
            assertEquals(Integer.valueOf(302),e.diagnostics.latest().httpCodes.get(NativeCasDiagnostics.Stage.OAUTH));
            assertEquals(Integer.valueOf(200),e.diagnostics.latest().httpCodes.get(NativeCasDiagnostics.Stage.LANDING));
            assertEquals(Integer.valueOf(200),e.diagnostics.latest().httpCodes.get(NativeCasDiagnostics.Stage.IDENTITY));
            assertEquals(Integer.valueOf(200),e.diagnostics.latest().httpCodes.get(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY));
            NativeCasDiagnosticsTest.safe(e.diagnostics);
        }
    }
    @Test public void everyExchangeRejectReasonStopsBeforeExchangeGetAndCannotPublish() throws Exception {
        String[] targets={TWO.replace("https:","http:"),TWO.replace("index.php","other.php"),TWO+"&extra=x",
            TWO.replace("auth/get-info","auth/login"),TWO+"&url=https://evil.invalid/",TWO.replace("synthetic",""),
            TWO+"&%63ode=other"};
        NativeCasDiagnostics.Category[] reasons={NativeCasDiagnostics.Category.AUTHORITY,NativeCasDiagnostics.Category.PATH,
            NativeCasDiagnostics.Category.QUERY_KEYS,NativeCasDiagnostics.Category.ROUTE,NativeCasDiagnostics.Category.RETURN_URL,
            NativeCasDiagnostics.Category.CODE_SYNTAX,NativeCasDiagnostics.Category.QUERY_KEYS};
        for(int i=0;i<targets.length;i++) {
            Enrollment e=new Enrollment(targets[i],0); assertFalse(e.enroll()); e.noPublication(7);
            assertEquals(0,e.officialChecks.get());
            assertEquals(NativeCasDiagnostics.Stage.OAUTH,e.diagnostics.latest().stage);
            assertEquals(reasons[i],e.diagnostics.latest().category); assertEquals(302,e.diagnostics.latest().http);
            assertFalse(e.h.factory.flows.get(0).gets.contains(URI.create(targets[i])));
        }
    }
    @Test public void invalidLandingIsNotFetchedAndIdentityIsNeverReached() throws Exception {
        for(String target:new String[]{ROOT+"other",ROOT+"?next=synthetic",ROOT.replace("https:","http:"),ROOT+"#fragment"}) {
            Enrollment e=new Enrollment(TWO,0);
            NativeCasLogin.Factory altered=(consent,gate)->{
                NativeCasPrototype.Transport transport=e.h.factory.open(consent,gate);
                e.h.factory.flows.get(0).home=target; return transport;
            };
            NativeCasLogin login=new NativeCasLogin(e.h.disk,altered,e.official,e.diagnostics);
            assertFalse(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
            e.noPublication(8); assertEquals(0,e.officialChecks.get());
            assertEquals(NativeCasDiagnostics.Stage.LANDING,e.diagnostics.latest().stage);
        }
    }
    @Test public void identityMismatchOrMalformedJsonCannotPublishAfterSuccessfulTwoFieldExchange() throws Exception {
        for(String body:new String[]{"{\"params\":{\"id\":\"other\",\"account\":\"synthetic-user\"}}",
                "{\"params\":{\"id\":\"synthetic-id\",\"account\":\"other\"}}",
                "{\"params\":{\"id\":\"synthetic-id\",\"id\":\"other\",\"account\":\"synthetic-user\"}}",
                "{\"params\":{\"id\":\"synthetic-id\",\"account\":\"synthetic-user\"}} trailing",
                NativeCasDiagnosticsTest.CANARY}) {
            Enrollment e=new Enrollment(TWO,0);
            NativeCasLogin.Factory altered=(consent,gate)->{
                NativeCasPrototype.Transport transport=e.h.factory.open(consent,gate);
                e.h.factory.flows.get(0).identity=body; return transport;
            };
            NativeCasLogin login=new NativeCasLogin(e.h.disk,altered,e.official,e.diagnostics);
            assertFalse(login.enroll(true,NativeCasLoginTest.USER,NativeCasLoginTest.PASS,NativeCasLoginTest.ID));
            e.noPublication(10); assertEquals(0,e.officialChecks.get());
            assertEquals(NativeCasDiagnostics.Stage.IDENTITY,e.diagnostics.latest().stage);
            assertEquals(NativeCasDiagnostics.Category.IDENTITY_MISMATCH,e.diagnostics.latest().category);
        }
    }
    @Test public void officialIdentityRecheckStillBlocksAdoptionAfterInitialIdentitySuccess() throws Exception {
        for(int fault:new int[]{1,2,3}) {
            Enrollment e=new Enrollment(TWO,fault); assertFalse(e.enroll()); e.noPublication(10);
            assertEquals(1,e.officialChecks.get()); assertEquals(NativeCasDiagnostics.Stage.OFFICIAL_VERIFY,e.diagnostics.latest().stage);
            assertEquals(fault==1?NativeCasDiagnostics.Category.HTTP_STATUS:NativeCasDiagnostics.Category.IDENTITY_MISMATCH,
                e.diagnostics.latest().category);
        }
    }
    @Test public void oldGenericReportRemainsReadableAndNewReasonsAreOnlyFixedEnumTokens() throws Exception {
        NativeCasDiagnostics old=new NativeCasDiagnostics();
        NativeCasDiagnostics.Context c=old.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
        c.stage(NativeCasDiagnostics.Stage.OAUTH); c.postResponded(302);
        c.fail(NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.OAUTH,NativeCasDiagnostics.Category.PROTOCOL_REJECTED));
        String prior=old.latest().encode();
        assertTrue(prior.startsWith("1|"));
        assertEquals(prior,NativeCasDiagnostics.Report.decode(prior).encode());
        for(NativeCasDiagnostics.Category reason:new NativeCasDiagnostics.Category[]{NativeCasDiagnostics.Category.AUTHORITY,
                NativeCasDiagnostics.Category.PATH,NativeCasDiagnostics.Category.QUERY_KEYS,NativeCasDiagnostics.Category.ROUTE,
                NativeCasDiagnostics.Category.RETURN_URL,NativeCasDiagnostics.Category.CODE_SYNTAX}) {
            NativeCasDiagnostics d=new NativeCasDiagnostics(); NativeCasDiagnostics.Context report=d.begin(NativeCasDiagnostics.Kind.ENROLLMENT);
            report.stage(NativeCasDiagnostics.Stage.OAUTH); report.fail(NativeCasDiagnostics.failure(NativeCasDiagnostics.Stage.OAUTH,reason));
            assertTrue(d.latest().encode().contains("|"+reason.name()+"|")); NativeCasDiagnosticsTest.safe(d);
        }
    }
}
