const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.SUIKE_TYPESCRIPT || 'typescript');
const crypto = require('node:crypto');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../entry/src/main/ets/services/NativeCas.ets'), 'utf8');
const acceptanceSource = fs.readFileSync(path.resolve(__dirname, '../entry/src/main/ets/services/NativeAccountAcceptance.ets'), 'utf8');
function fixture(options={}) {
 const state={requests:0,config:null,closed:false,calls:[],respond:null,cancelled:0,cancelRequest:null,cryptoCalls:[],algorithms:[]};
 const cryptoStep=step=>{state.cryptoCalls.push(step);if(state.cryptoFailAt===step)throw state.cryptoFailure||{code:801,message:'SECRET_BACKEND'}};
 const framework={
  CryptoMode:{ENCRYPT_MODE:1},
  createAsyKeyGenerator:algorithm=>{state.algorithms.push(algorithm);cryptoStep('config');return {
   convertKey:async blob=>{cryptoStep('import');return {pubKey:crypto.createPublicKey({key:Buffer.from(blob.data),format:'der',type:'spki'})}}
  }},
  createCipher:mode=>{cryptoStep('cipher');assert.equal(mode,'RSA|ECB|NoPadding');let pub;return {
   init:async(_mode,key)=>{cryptoStep('init');pub=key},
   doFinal:async blob=>{cryptoStep('encrypt');return {data:state.cryptoMalformed?new Uint8Array(1):crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_NO_PADDING},Buffer.from(blob.data))}}
  }}
 };
 const stubs={
  '@kit.ArkTS':{url:{URL},util:{TextDecoder:{create:(encoding,options)=>({decodeToString:x=>{
   if(state.decodeFailure)throw state.decodeFailure;return new TextDecoder(encoding,options).decode(x);
  }})}}},
  '@kit.CryptoArchitectureKit':{cryptoFramework:framework},
  '@kit.RemoteCommunicationKit':{rcp:{
   createSession:config=>{
    if(state.initFailure)throw state.initFailure;state.config=config;
    return {
     fetch:async request=>{state.requests++;state.calls.push(request);if(state.respond)return state.respond(request);throw Error('unexpected network')},
     cancel:()=>{state.cancelled++;if(state.cancelRequest)state.cancelRequest()},
     close:()=>state.closed=true
    };
   },
   Request:class {constructor(target,method,headers,body){Object.assign(this,{target,method,headers,body})}}
  }}
 };
 const acceptance={};vm.runInNewContext(ts.transpileModule(acceptanceSource,{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText,{exports:acceptance,Error,Number});
 stubs['./NativeAccountAcceptance']=acceptance;
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>stubs[name],URL,Date,Map,Set,Error,Number,Uint8Array,ArrayBuffer,JSON:options.json||JSON,encodeURIComponent,decodeURIComponent,RegExp});return {m:exports,state,acceptance:acceptance.NativeAccountAcceptance};
}
const {publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'}),modulus=Buffer.from(jwk.n,'base64url').toString('hex'),exponent=Buffer.from(jwk.e,'base64url').toString('hex');
const form='<form id="fm1" method="post" action="/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize"><input type="hidden" name="execution" value="fixture"><input type="hidden" name="_eventId" value="submit"><input type="hidden" name="ys" value="0"></form>';
function fake(m,opts={}) {
 const state={calls:[],posts:0,reserved:0,closed:false}, root='https://classroom.zju.edu.cn/', callback=opts.callback||opts.location||'https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-fixture', exchange=opts.exchange||'https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&code=fixture';
 const response=(status,body='',location='',cookies=[])=>({status,body,location,cookies});
 const transport={binding:()=>opts.binding===false?'':state.binding||'isolated-session-fixture',close:()=>state.closed=true,request:async(target,method,body,cookie)=>{state.calls.push({target,method,body,cookie});if(opts.respond){const result=opts.respond(target,method,state);if(result)return result}if(target===m.ENTRY)return response(302,'',m.AUTHORIZE);if(target===m.AUTHORIZE)return response(302,'',m.LOGIN,opts.authorizeCookies||[]);if(target===m.LOGIN&&method==='GET')return response(200,opts.form||form,'',opts.formCookies||(opts.mutate?['JSESSIONID=fixture; Secure; Path=/cas/login']:['JSESSIONID=fixture; Secure; Path=/cas']));if(target.endsWith('/cas/v2/getPubKey'))return response(200,JSON.stringify({modulus,exponent}),'',opts.keyCookies||[]);if(target.endsWith('/cas/v2/getKaptchaStatus'))return response(200,opts.captcha||'false','',opts.captchaCookies||[]);if(target===m.LOGIN&&method==='POST'){state.posts++;assert.equal(state.reserved,1);return response(302,'',opts.location||callback)}if(target===callback)return response(302,'',exchange);if(target===exchange)return response(302,'',root,['session=fixture; Domain=zju.edu.cn; Secure; Path=/','_token='+encodeURIComponent('{i:1;s:6:"_token";i:1;s:3:"abc";}')+'; Domain=zju.edu.cn; Secure; Path=/']);if(target===root)return response(200,'landing');if(target.endsWith('/userapi/v1/infosimple'))return response(200,opts.identity||JSON.stringify({params:{id:'id-fixture',account:'user-fixture',tenant_id:112}}));throw Error('unexpected request')}};
 const flow=new m.NativeCas(transport,{encrypt:async()=> 'fixture-rsa'}),expected={id:'id-fixture',username:'user-fixture',tenantId:112};
 return {flow,state,expected,transport,reserve:async()=>{state.reserved++}};
}
test('native CAS transport disables POST and automatic redirects',async()=>{const {m,state}=fixture(),t=new m.CasHttps();assert.equal(state.config.requestConfiguration.transfer.autoRedirect,false);assert.equal(state.config.cookieRepository,undefined);await assert.rejects(t.request(m.LOGIN,'POST','password=fixture',''));assert.ok(t.binding());assert.equal(t.binding(),t.binding());assert.notEqual(t.binding(),new m.CasHttps().binding());assert.equal(state.requests,0);t.close();assert.throws(()=>t.binding());assert.equal(state.closed,true)});
test('native CAS jar restricts domains, paths, expiry and remains private',()=>{const {m}=fixture(),a=new m.CasCookieJar(),b=new m.CasCookieJar(),cas='https://zjuam.zju.edu.cn/cas/login';a.receive(cas,'sid=abc; Secure; Path=/cas; Max-Age=2',1000);assert.equal(a.header(cas,1500),'sid=abc');assert.equal(b.header(cas,1500),'');assert.equal(a.header('https://classroom.zju.edu.cn/',1500),'');assert.equal(a.header(cas,3000),'');assert.throws(()=>a.receive(cas,'x=y; Domain=edu.cn'));assert.throws(()=>a.receive(cas,'x=y; Domain=evil.test'));assert.throws(()=>a.receive(cas,'x=y; Path=/; Path=/cas'));assert.throws(()=>a.receive(cas,'x=y; Max-Age='));assert.throws(()=>a.receive(cas,'x=y; Expires='));assert.throws(()=>a.receive(cas,'__Host-x=y; Secure; Domain=zju.edu.cn; Path=/'))});
test('native CAS rejects external, HTTP and userinfo redirects',()=>{const {m}=fixture();for(const u of ['http://zjuam.zju.edu.cn/cas/x','https://zjuam.zju.edu.cn@evil.test/','https://zjuam.zju.edu.cn.evil.test/','//evil.test/','https://classroom.zju.edu.cn:444/'])assert.throws(()=>m.casRedirect(m.LOGIN,u));assert.equal(m.casRedirect(m.LOGIN,'/cas/oauth2.0/callbackAuthorize?ticket=ST-x'),'https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-x')});
test('native CAS form, key and token reject ambiguity',()=>{const {m}=fixture();assert.equal(m.casForm(form).execution,'fixture');assert.throws(()=>m.casForm(form+form));assert.throws(()=>m.casForm(form.replace('value="fixture"','value="fixture" value="other"')));assert.throws(()=>m.casForm(form.replace('</form>','<input type="hidden" name="unknown" value="a"></form>')));assert.throws(()=>m.casKey('{"modulus":"a","modulus":"b"}'));const t=encodeURIComponent('{i:1;s:6:"_token";i:1;s:3:"abc";}');assert.equal(m.casBearer('_token='+t),'abc');assert.throws(()=>m.casBearer('_token='+t+'; _token='+t));assert.throws(()=>m.casBearer('_token='+encodeURIComponent('{i:1;s:6:"_token";i:1;s:2:"abc";}')))});
test('native RSA no padding matches independent JSBN arithmetic and multi-block formatting',async()=>{const {m}=fixture(),rsa=new m.CasCryptoRsa();function pow(x,e,n){let r=1n;while(e){if(e&1n)r=r*x%n;x=x*x%n;e>>=1n}return r}const n=BigInt('0x'+modulus),e=BigInt('0x'+exponent),chunk=254;for(const pass of ['abc','A'.repeat(300),'hello world']){const reverse=pass.split('').reverse().join(''),out=[];for(let i=0;i<reverse.length;i+=chunk){let x=0n;for(let j=0;j<chunk&&i+j<reverse.length;j++)x+=BigInt(reverse.charCodeAt(i+j))<<(8n*BigInt(j));let h=pow(x,e,n).toString(16);out.push(h.padStart(Math.ceil(h.length/4)*4,'0'))}assert.equal(await rsa.encrypt(pass,modulus,exponent),out.join(' '))}await assert.rejects(rsa.encrypt('中文',modulus,exponent))});
test('native CAS synthetic complete path reserves once and checks identity without publishing',async()=>{const {m}=fixture(),f=fake(m),out=await f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve);assert.equal(out.identity.id,'id-fixture');assert.match(out.cookie,/session=fixture/);assert.equal(f.state.posts,1);assert.equal(f.state.reserved,1);assert.equal(f.state.closed,true);await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve))});
test('native CAS fails closed before POST on no consent, captcha and mutation',async()=>{const {m}=fixture();for(const opts of [{captcha:'true'},{captcha:'unknown'},{binding:false},{mutate:true},{form:'<form></form>'}]){const f=fake(m,opts);await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));assert.equal(f.state.posts,0);assert.equal(f.state.closed,true)}const f=fake(m);await assert.rejects(f.flow.run(false,'user-fixture','synthetic-password',f.expected,f.reserve));assert.equal(f.state.calls.length,0)});
test('native CAS rejects HTTP or unknown post-redirect and identity mismatches',async()=>{const {m}=fixture();for(const opts of [{location:'http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=ST-x'},{location:'/cas/oauth2.0/callbackAuthorize?ticket=ST-x&other=1'},{identity:JSON.stringify({params:{id:'id-fixture',account:'other',tenant_id:112}})},{identity:'{"params":{"id":"id-fixture","id":"id-fixture","account":"user-fixture","tenant_id":112}}'},{identity:JSON.stringify({params:{id:'id-fixture',account:'user-fixture',tenant_id:113}})}]){const f=fake(m,opts);await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));assert.equal(f.state.posts,1)}});
test('native CAS snapshots expected identity before asynchronous requests',async()=>{const {m}=fixture(),f=fake(m);const out=await f.flow.run(true,'user-fixture','synthetic-password',f.expected,async()=>{f.expected.id='other';f.expected.tenantId=999;f.state.reserved++});assert.equal(out.identity.id,'id-fixture');assert.equal(out.identity.tenantId,112)});
test('native CAS cancellation and reservation failure prevent submission',async()=>{const {m}=fixture();const f=fake(m);await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,async()=>{throw Error('write failed')}));assert.equal(f.state.posts,0);const g=fake(m);await assert.rejects(g.flow.run(true,'user-fixture','synthetic-password',g.expected,async()=>{g.flow.cancel()}));assert.equal(g.state.posts,0)});

const callbackBase='https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize';
const exchangeBase='https://tgmedia.cmc.zju.edu.cn/index.php';
const exchangeQuery='r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&code=';
function runSynthetic(f) { return f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve); }
test('native RCP request configuration sends a fixed application UA on every GET and POST through a no-url exchange',async()=>{
 const {m,state,acceptance}=fixture();
 const exchange=exchangeBase+'?r=auth%2Fget-info&code=opaque.~%2B%26';
 const f=fake(m,{exchange});
 acceptance.grant(f.expected.id,f.expected.tenantId,f.expected.username,true);
 state.respond=async request=>{
  assert.equal(request.headers['user-agent'],'ZhiyunAssistant/0.7 (HarmonyOS; NativeCAS)');
  assert.equal(request.configuration.transfer.autoRedirect,false);
  assert.equal(request.destination,'array-buffer');
  if(request.method==='POST'){
   assert.equal(request.target,m.LOGIN);assert.equal(request.headers.origin,'https://zjuam.zju.edu.cn');
   assert.equal(request.headers.referer,m.LOGIN);
   assert.equal(request.headers['content-type'],'application/x-www-form-urlencoded');
   assert.match(request.headers.cookie,/JSESSIONID=fixture/);
  } else assert.equal(request.body,undefined);
  const response=await f.transport.request(request.target,request.method,request.body||'',request.headers.cookie||'');
  return {statusCode:response.status,body:response.body,effectiveUrl:request.target,
   headers:{location:response.location?[response.location]:[],'set-cookie':response.cookies}};
 };
 const flow=new m.NativeCas(new m.CasHttps(),{encrypt:async()=> 'synthetic-cipher'});
 const result=await flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve);
 assert.equal(result.identity.id,f.expected.id);assert.match(result.cookie,/session=fixture/);
 assert.equal(state.calls.length,11);assert.equal(state.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(f.state.posts,1);assert.equal(f.state.reserved,1);assert.equal(state.closed,true);
 assert.equal(state.config.requestConfiguration.transfer.autoRedirect,false);
 assert.equal(state.config.cookieRepository,undefined);assert.equal(m.NATIVE_CAS_REAL_POST_ENABLED,false);
 assert.equal(state.calls[8].target,exchange);
 assert.equal(state.calls[10].headers.authorization,'Bearer abc');
});
test('native CAS no-url exchange rejects unknown and duplicate fields and unsafe return targets before identity',async()=>{
 const {m}=fixture(),query='r=auth%2Fget-info&code=opaque';
 for(const suffix of [
  '&extra=x','&url=','&code=b','&%63ode=b','&r=auth%2Fget-info','&%72=auth%2Fget-info',
  '&other=https%3A%2F%2Fclassroom.zju.edu.cn%2F','&url='+encodeURIComponent('http://classroom.zju.edu.cn/'),
  '&url='+encodeURIComponent('https://classroom.zju.edu.cn/other'),
  '&url='+encodeURIComponent('https://classroom.zju.edu.cn/?x=y'),
  '&url='+encodeURIComponent('https://classroom.zju.edu.cn/#fragment'),
  '&url='+encodeURIComponent('https://user@classroom.zju.edu.cn/'),
  '&url='+encodeURIComponent('https://evil.test/'),'&','&%GG=x'
 ]){
  const f=fake(m,{exchange:exchangeBase+'?'+query+suffix});
  const d=await reportOf(m,runSynthetic(f));
  assert.equal(d.category,'EXCHANGE_PARAMS');assert.equal(f.state.calls.length,8);
  assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
  assert.ok(!f.state.calls.some(c=>c.target.endsWith('/infosimple')));
 }
 for(const target of [
  'http://tgmedia.cmc.zju.edu.cn/index.php','https://user@tgmedia.cmc.zju.edu.cn/index.php',
  'https://@tgmedia.cmc.zju.edu.cn/index.php','//tgmedia.cmc.zju.edu.cn@tgmedia.cmc.zju.edu.cn/index.php',
  'https://tgmedia.cmc.zju.edu.cn.evil.test/index.php','https://tgmedia.cmc.zju.edu.cn:444/index.php',
  'https://tgmedia.cmc.zju.edu.cn/other'
 ].map(base=>base+'?'+query).concat([exchangeBase+'?'+query+'#fragment'])){
  const f=fake(m,{exchange:target});await assert.rejects(runSynthetic(f));
  assert.equal(f.state.calls.length,8);assert.equal(f.state.closed,true);
 }
});
test('native CAS rejects even empty userinfo before URL normalization can erase it',async()=>{
 const {m,state}=fixture(),transport=new m.CasHttps();
 for(const target of [
  'https://@zjuam.zju.edu.cn/cas/login','https://user@zjuam.zju.edu.cn/cas/login',
  'https://:pass@zjuam.zju.edu.cn/cas/login'
 ])await assert.rejects(transport.request(target,'GET','',''));
 assert.equal(state.requests,0);transport.close();
 for(const base of ['https://@zjuam.zju.edu.cn','//user@zjuam.zju.edu.cn']){
  const f=fake(m,{location:base+'/cas/oauth2.0/callbackAuthorize?ticket=opaque'});
  await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,7);assert.equal(f.state.closed,true);
 }
});
test('native CAS no-url exchange still requires exact landing root and matching identity',async()=>{
 const {m}=fixture(),exchange=exchangeBase+'?r=auth%2Fget-info&code=opaque';
 for(const home of ['https://classroom.zju.edu.cn/other','https://classroom.zju.edu.cn/?x=y']){
  const f=fake(m,{exchange,respond:target=>target===exchange?{status:302,body:'',location:home,cookies:[]}:null});
  const d=await reportOf(m,runSynthetic(f));assert.equal(d.category,'REDIRECT_TARGET');
  assert.equal(f.state.calls.length,9);assert.equal(f.state.closed,true);
 }
 const f=fake(m,{exchange,identity:JSON.stringify({params:{id:'other',account:'user-fixture',tenant_id:112}})});
 const d=await reportOf(m,runSynthetic(f));assert.equal(d.category,'IDENTITY');assert.equal(f.state.closed,true);
});
for(const [name,body] of [
 ['escaped Chinese name',String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112,"name":"\u5f20\u4e09"}}`],
 ['escaped supplementary Unicode',String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112,"name":"\ud83d\ude00\u5f20"}}`],
 ['escaped identity values',String.raw`{"params":{"id":"\u0069d-fixture","account":"\u0075ser-fixture","tenant_id":112}}`],
 ['canonical unique escaped keys',String.raw`{"\u0070arams":{"\u0069d":"id-fixture","\u0061ccount":"user-fixture","tenant_\u0069d":112}}`],
 ['independent object key scopes',JSON.stringify({params:{id:'id-fixture',account:'user-fixture',tenant_id:112,name:'张三',metadata:{id:'aux',account:'aux',tenant_id:1},list:[{id:1},{id:2}]},metadata:{params:{id:'aux'}}})],
 ['JSON syntax inside string values',JSON.stringify({params:{id:'id-fixture',account:'user-fixture',tenant_id:112,name:'"params":{"id":"other"} \\u0069d \\ " \\ / \t'}})]
]){
 test('native identity accepts '+name+' without weakening account checks',async()=>{
  const {m}=fixture(),f=fake(m,{identity:body}),out=await runSynthetic(f);
  assert.equal(out.identity.id,'id-fixture');assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
 });
}
test('native identity rejects duplicate decoded keys at every object scope, including escaped aliases',async()=>{
 const {m}=fixture();
 for(const body of [
  String.raw`{"params":{"id":"id-fixture","\u0069d":"id-fixture","account":"user-fixture","tenant_id":112}}`,
  String.raw`{"params":{"\u0069d":"other","id":"id-fixture","account":"user-fixture","tenant_id":112}}`,
  String.raw`{"params":{"id":"id-fixture","account":"user-fixture","\u0061ccount":"user-fixture","tenant_id":112}}`,
  String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112,"tenant_\u0069d":112}}`,
  String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112},"\u0070arams":{"id":"id-fixture","account":"user-fixture","tenant_id":112}}`,
  String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112,"name":"\u5f20\u4e09","metadata":{"x":1,"\u0078":2}}}`,
  String.raw`{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112},"list":[{"x":1,"x":1}]}`
 ]){
  const f=fake(m,{identity:body});await assert.rejects(runSynthetic(f));assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
 }
});
test('native identity tokenizer rejects malformed JSON, wrong shapes and trailing data',async()=>{
 const {m}=fixture(),valid='{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112}}';
 for(const body of [
  valid+'{}','['+valid+']',valid.replace('112','0112'),valid.replace('112','+112'),
  valid.replace('112','112,'),valid.replace('}}','},"name":"\\uZZZZ"}'),
  valid.replace('}}','},"name":"\\q"}'),valid.replace('}}','},"name":"a\tb"}'),
  valid.replace('}}','},"name":"unterminated}'),valid.replace('112','true'),'\u00a0'+valid,
  '{"params":null}','{"params":[]}','{"params":"identity"}','{"params":{}}',
  '{"metadata":{"params":{"id":"id-fixture","account":"user-fixture","tenant_id":112}}}'
 ]){
  const f=fake(m,{identity:body});await assert.rejects(runSynthetic(f));assert.equal(f.state.closed,true);
 }
});
test('native identity tokenizer bounds nesting and token count before materializing parsed objects',async()=>{
 const {m}=fixture(),base={id:'id-fixture',account:'user-fixture',tenant_id:112};
 for(const body of [
  '{"params":'+JSON.stringify(base)+',"deep":'+'['.repeat(34)+'0'+']'.repeat(34)+'}',
  '{"params":'+JSON.stringify(base)+',"many":['+Array(20001).fill('null').join(',')+']}'
 ]){
  const f=fake(m,{identity:body});await assert.rejects(runSynthetic(f));assert.equal(f.state.closed,true);
 }
});
test('native identity requires own structural fields even if object prototypes already contain matching identity data',async()=>{
 for(const body of ['{}','{"params":{}}']){
  const expected={id:'id-fixture',account:'user-fixture',tenant_id:112};
  const json={stringify:JSON.stringify,parse:text=>{
   const value=JSON.parse(text);
   if(text===body)Object.setPrototypeOf(body==='{}'?value:value.params,body==='{}'?{params:expected}:expected);
   return value;
  }};
  const {m}=fixture({json}),f=fake(m,{identity:body});await assert.rejects(runSynthetic(f));assert.equal(f.state.closed,true);
 }
});
function redirectFixture(m,ticket,code) {
 return fake(m,{location:callbackBase+'?ticket='+ticket,exchange:exchangeBase+'?'+exchangeQuery+code});
}
for(const [name,value] of [
 ['dot and tilde','ST-fixture.with.dot~node'],
 ['no assumed ticket prefix','opaque.without.prefix~'],
 ['raw URI delimiters',"opaque!$'()*+,-./:;=?@_~"],
 ['escaped separators','opaque%2f%2B%3d%26%3F%23%25%3B%3A%40%5C~.'],
 ['single-decode percent','opaque%252F%2526%250A%25GG'],
 ['encoded UTF-8','opaque.%E6%B5%99~'],
 ['escaped unreserved characters','%61%2e%7E%5f%2D']
]) {
 test('native CAS accepts opaque ticket/code: '+name,async()=>{
  const {m}=fixture(),f=redirectFixture(m,value,value),out=await runSynthetic(f);
  assert.equal(out.identity.id,'id-fixture');assert.equal(f.state.posts,1);assert.equal(f.state.reserved,1);
  assert.equal(f.state.calls[7].target,callbackBase+'?ticket='+value);
  assert.equal(f.state.calls[8].target,exchangeBase+'?'+exchangeQuery+value);
  assert.equal(f.state.closed,true);
 });
}
test('native CAS resolves relative paths without reserializing an opaque query',async()=>{
 const {m}=fixture(),query="?ticket=opaque.'~+%2f%252F%250A%26%3D";
 const target=m.casRedirect(m.LOGIN,'/cas/oauth2.0/callbackAuthorize'+query);
 assert.equal(target,callbackBase+query);
 const f=fake(m,{location:'/cas/oauth2.0/callbackAuthorize'+query,callback:target});
 await runSynthetic(f);assert.equal(f.state.calls[7].target,target);
 // Query-only resolution must preserve spelling too, not just absolute locations.
 assert.equal(m.casRedirect(callbackBase+'?old=1',query),target);
});
test('native CAS hands the unchanged raw target to the RCP request constructor',async()=>{
 const {m,state}=fixture(),transport=new m.CasHttps();
 state.respond=()=>({statusCode:200,body:'fixture',headers:{}});
 try {
  for(const target of [callbackBase+"?ticket=opaque.'~+%2f%252F",exchangeBase+'?'+exchangeQuery+'opaque%26%3d~+']) {
   await transport.request(target,'GET','','');assert.equal(state.calls.at(-1).target,target);
  }
 } finally { transport.close(); }
 assert.equal(state.requests,2);assert.equal(state.cancelled,1);assert.equal(m.NATIVE_CAS_REAL_POST_ENABLED,false);
});
test('native CAS retains decoded token and raw query length bounds',async()=>{
 const {m}=fixture();
 const encodedBoundary='%41'.repeat(512)+'x'.repeat(1536),encodedTooLong=encodedBoundary+'x';
 for(const [ticket,code] of [['x'.repeat(2048),'x'.repeat(2048)],[encodedBoundary,encodedBoundary]]) {
  await runSynthetic(redirectFixture(m,ticket,code));
 }
 for(const [ticket,code] of [['x'.repeat(2049),'ok'],[encodedTooLong,'ok'],['ok','x'.repeat(2049)],['ok',encodedTooLong]]) {
  const f=redirectFixture(m,ticket,code);await assert.rejects(runSynthetic(f));
  assert.equal(f.state.calls.length,ticket==='ok'?8:7);assert.equal(f.state.closed,true);
 }
 for(const [location,exchange,steps] of [
  [callbackBase+'?ticket='+'%E6%B5%99'.repeat(512),undefined,7],
  [undefined,exchangeBase+'?'+exchangeQuery+'%F0%9F%8E%93'.repeat(512),8]
 ]) {
  const f=fake(m,{location,exchange});await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,steps);
 }
});
for(const [name,value] of [
 ['NUL','%00'],['tab','%09'],['LF','%0A'],['CR','%0d'],['ASCII space','%20'],
 ['DEL','%7f'],['C1 lower bound','%C2%80'],['C1 upper bound','%C2%9f'],
 ['raw DEL','\x7f'],['raw LF','\n'],['raw C1','\x85']
]) {
 test('native CAS rejects control/space in opaque ticket and code: '+name,async()=>{
  const {m}=fixture();
  for(const [ticket,code,steps] of [['a'+value+'b','valid',7],['valid','a'+value+'b',8]]) {
   const f=redirectFixture(m,ticket,code);await assert.rejects(runSynthetic(f));
   assert.equal(f.state.calls.length,steps);assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
  }
 });
}
test('native CAS rejects empty, malformed percent and malformed UTF-8 opaque values',async()=>{
 const {m}=fixture();
 for(const value of ['', '%', '%2', '%GG', 'a%2Zb', '%FF', '%C0%AF', '%C3%28', '%ED%A0%80']) {
  for(const [ticket,code,steps] of [[value,'valid',7],['valid',value,8]]) {
   const f=redirectFixture(m,ticket,code);await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,steps);
  }
 }
});
test('native CAS checks decoded unique parameter names and exact callback field count',async()=>{
 const {m}=fixture();
 for(const query of [
  'ticket=a&ticket=b','ticket=a&%74icket=b','%74icket=a&ticket=b',
  'ticket=a&extra=b','other=a','ticket=a&','ticket=a&&','ticket',
  '=a','ticket=a;other=b&ticket=c','ti%GGcket=a','ticket%00=a'
 ]) {
  const f=fake(m,{location:callbackBase+'?'+query});await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,7);
 }
 const target=callbackBase+'?%74icket=opaque%26ticket%3Db~.';
 const f=fake(m,{location:target});await runSynthetic(f);assert.equal(f.state.calls[7].target,target);
});
test('native CAS checks all exchange parameters without splitting encoded delimiters',async()=>{
 const {m}=fixture();
 for(const query of [
  exchangeQuery+'a&code=b',exchangeQuery+'a&%63ode=b',
  exchangeQuery+'a&r=auth%2Fget-info',exchangeQuery+'a&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F',
  exchangeQuery+'a&extra=b',exchangeQuery.replace('&code=','&other=')+'a',
  'code=a&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F',
  exchangeQuery.replace('auth%2Fget-info','auth%252Fget-info')+'a',
  exchangeQuery.replace('https%3A%2F%2Fclassroom.zju.edu.cn%2F','https%253A%252F%252Fclassroom.zju.edu.cn%252F')+'a',
  exchangeQuery.replace('classroom.zju.edu.cn','evil.test')+'a',
  exchangeQuery.replace('r=','r%00=')+'a',exchangeQuery+'a&',exchangeQuery+'a&%GG=b'
 ]) {
  const f=fake(m,{exchange:exchangeBase+'?'+query});await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,8);
 }
 const exchange=exchangeBase+'?%63ode=opaque%26r%3Db%3D~.&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&r=auth%2Fget-info';
 const f=fake(m,{exchange});await runSynthetic(f);assert.equal(f.state.calls[8].target,exchange);
});
test('native CAS keeps exact HTTPS callback and exchange host/path boundaries',async()=>{
 const {m}=fixture();
 for(const base of [
  'http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize',
  'https://zjuam.zju.edu.cn.evil.test/cas/oauth2.0/callbackAuthorize',
  'https://classroom.zju.edu.cn/cas/oauth2.0/callbackAuthorize',
  'https://zjuam.zju.edu.cn:444/cas/oauth2.0/callbackAuthorize',
  callbackBase+'/',callbackBase+'Other',callbackBase.replace('/cas/','/%63as/')
 ]) {
  const f=fake(m,{location:base+'?ticket=opaque.~'});await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,7);
 }
 for(const base of [
  'http://tgmedia.cmc.zju.edu.cn/index.php','https://tgmedia.cmc.zju.edu.cn.evil.test/index.php',
  'https://classroom.zju.edu.cn/index.php','https://zjuam.zju.edu.cn/index.php',
  exchangeBase+'/',exchangeBase+'Other',exchangeBase.replace('/index.php','/%69ndex.php'),
  'https://tgmedia.cmc.zju.edu.cn:444/index.php'
 ]) {
  const f=fake(m,{exchange:base+'?'+exchangeQuery+'opaque.~'});await assert.rejects(runSynthetic(f));assert.equal(f.state.calls.length,8);
 }
 for(const suffix of ['#','#fragment']) {
  const callback=fake(m,{location:callbackBase+'?ticket=opaque.~'+suffix});
  await assert.rejects(runSynthetic(callback));assert.equal(callback.state.calls.length,7);
  const exchange=fake(m,{exchange:exchangeBase+'?'+exchangeQuery+'opaque.~'+suffix});
  await assert.rejects(runSynthetic(exchange));assert.equal(exchange.state.calls.length,8);
 }
});

test('anonymous preflight is one-shot, GET-only and returns no session secrets',async()=>{
 const {m}=fixture(),f=fake(m),out=await f.flow.preflight();
 assert.equal(out.formReady,true);assert.equal(out.publicKeyReady,true);assert.equal(out.sessionContinuous,true);
 assert.equal(out.captchaRequired,false);assert.equal(out.realPostEnabled,false);
 assert.equal(f.state.calls.length,6);assert.ok(f.state.calls.every(c=>c.method==='GET'&&!c.body));
 assert.equal(f.state.posts,0);assert.equal(f.state.reserved,0);assert.equal(f.state.closed,true);
 assert.ok(!JSON.stringify(out).includes('fixture'));await assert.rejects(f.flow.preflight());
 await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));
});
test('anonymous preflight reports server captcha and rejects unknown responses',async()=>{
 const {m}=fixture();assert.equal((await fake(m,{captcha:'true'}).flow.preflight()).captchaRequired,true);
 const f=fake(m,{captcha:'null'});await assert.rejects(f.flow.preflight());assert.equal(f.state.closed,true);
 let count=0;const g=fake(m,{respond:target=>target.endsWith('getKaptchaStatus')?{status:200,body:++count===1?'false':'true',location:'',cookies:[]}:null});
 assert.equal((await g.flow.preflight()).captchaRequired,true);
});
test('form can initialize JSESSIONID but any subsequent session reissue is rejected',async()=>{
 const {m}=fixture(),cookie='JSESSIONID=fixture; Secure; Path=/cas';
 const f=fake(m);
 await f.flow.preflight();
 for(const c of f.state.calls.filter(c=>c.target.includes('/cas/v2/')))assert.equal(c.cookie,cookie.split(';')[0]);
 for(const options of [{authorizeCookies:[cookie],formCookies:[cookie]},{keyCookies:[cookie]},{captchaCookies:[cookie]}]){
  const g=fake(m,options),d=await reportOf(m,g.flow.preflight());assert.equal(d.category,'COOKIE_CHANGED');assert.equal(g.state.posts,0);
 }
});
test('CAS session scope rejects missing, broad, shadowed and wrong-path JSESSIONID',async()=>{
 const {m}=fixture();for(const formCookies of [[],['sid=fixture; Path=/cas'],['JSESSIONID=fixture; Domain=zju.edu.cn; Path=/cas'],['JSESSIONID=fixture; Path=/cas/login'],['JSESSIONID=a; Path=/cas','JSESSIONID=b; Path=/']]){
  const f=fake(m,{formCookies});await assert.rejects(f.flow.preflight());assert.equal(f.state.posts,0);assert.equal(f.state.closed,true);
 }
});
test('key and captcha cookie rotations, deletion and scope mutation abort before POST',async()=>{
 const {m}=fixture();for(const cookie of ['JSESSIONID=rotated; Secure; Path=/cas','JSESSIONID=fixture; Secure; Path=/cas; Max-Age=0','JSESSIONID=fixture; Secure; Domain=zjuam.zju.edu.cn; Path=/cas','JSESSIONID=shadow; Secure; Path=/cas/v2']){
  for(const stage of ['keyCookies','captchaCookies']){
   const f=fake(m,{[stage]:[cookie]});await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));assert.equal(f.state.posts,0);
  }
 }
});
test('reservation transport change and late captcha prevent single submission',async()=>{
 const {m}=fixture(),f=fake(m);await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,async()=>{f.state.reserved++;f.state.binding='replacement'}));assert.equal(f.state.posts,0);
 let checks=0;const g=fake(m,{respond:target=>target.endsWith('getKaptchaStatus')?{status:200,body:++checks===1?'false':'true',location:'',cookies:[]}:null});
 await assert.rejects(g.flow.run(true,'user-fixture','synthetic-password',g.expected,g.reserve));assert.equal(g.state.posts,0);assert.equal(g.state.reserved,1);
});
test('server remains authoritative when POST returns captcha form after last check',async()=>{
 const {m}=fixture(),f=fake(m,{respond:(target,method,state)=>{if(target===m.LOGIN&&method==='POST'){state.posts++;return {status:200,body:form,location:'',cookies:[]}}}});
 await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
});
test('real RCP adapter anonymously preflights through stubbed HTTP with private scoped headers',async()=>{
 const {m,state}=fixture();let captcha=0;
 state.respond=async request=>{
  const {target,headers,method,body}=request;assert.equal(method,'GET');assert.equal(body,undefined);
  let statusCode=200,text='',responseHeaders={};
  if(target===m.ENTRY){statusCode=302;responseHeaders.location=m.AUTHORIZE;assert.equal(headers.cookie,undefined)}
  else if(target===m.AUTHORIZE){statusCode=302;responseHeaders.location=m.LOGIN}
  else if(target===m.LOGIN){text=form;responseHeaders['set-cookie']=['JSESSIONID=adapter-fixture; Path=/cas; Secure']}
  else {assert.equal(headers.cookie,'JSESSIONID=adapter-fixture');if(target.endsWith('getPubKey'))text=JSON.stringify({modulus,exponent});else if(target.endsWith('getKaptchaStatus')){text='false';captcha++}else throw Error('unexpected')}
  return {statusCode,headers:responseHeaders,body:new TextEncoder().encode(text).buffer};
 };
 const out=await new m.NativeCas().preflight();assert.equal(out.sessionContinuous,true);assert.equal(state.requests,6);assert.equal(captcha,2);assert.equal(state.closed,true);
});
test('jar detects effective expiry and metadata changes but ignores exact reissue',()=>{
 const {m}=fixture(),jar=new m.CasCookieJar(),target=m.LOGIN,cookie='JSESSIONID=fixture; Secure; Path=/cas';
 jar.receive(target,cookie,1000);const first=jar.generation();jar.receive(target,cookie,2000);assert.equal(jar.generation(),first);
 jar.receive(target,cookie+'; Max-Age=1',2000);assert.ok(jar.generation()>first);const second=jar.generation();
 assert.equal(jar.header(target,3000),'');assert.ok(jar.generation()>second);assert.throws(()=>jar.header('http://zjuam.zju.edu.cn/cas/login'));
});
test('last synchronous pre-send check blocks transport drift after final captcha response',async()=>{
 const {m}=fixture(),f=fake(m);let lateChecks=0;
 f.transport.binding=()=>{
  if(f.state.calls.filter(c=>c.target.endsWith('getKaptchaStatus')).length===2&&++lateChecks>1)return 'late-replacement';
  return 'isolated-session-fixture';
 };
 await assert.rejects(f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve));
 assert.equal(lateChecks,2);assert.equal(f.state.posts,0);assert.equal(f.state.reserved,1);
});
test('anonymous cancellation stops before subsequent endpoints',async()=>{
 const {m}=fixture();let f;
 f=fake(m,{respond:target=>{if(target.endsWith('getPubKey'))f.flow.cancel();return null}});
 await assert.rejects(f.flow.preflight());assert.equal(f.state.calls.length,4);assert.equal(f.state.closed,true);assert.equal(f.state.posts,0);
});
test('concurrent anonymous invocation cannot reuse a private session',async()=>{
 const {m}=fixture(),f=fake(m),first=f.flow.preflight();
 await assert.rejects(f.flow.preflight());assert.equal((await first).sessionContinuous,true);
 assert.equal(f.state.calls.length,6);assert.equal(f.state.posts,0);
});
test('diagnostic page is registered without changing launch page or automatically starting requests',()=>{
 const root=path.resolve(__dirname,'../entry/src/main');
 const routes=JSON.parse(fs.readFileSync(path.join(root,'resources/base/profile/main_pages.json'),'utf8'));
 assert.equal(routes.src[0],'pages/Index');assert.ok(routes.src.includes('pages/NativeCasPreflight'));
 const page=fs.readFileSync(path.join(root,'ets/pages/NativeCasPreflight.ets'),'utf8');
 assert.match(page,/\.onClick\(\(\) => \{ this\.start\(\); \}\)/);assert.match(page,/await probe\.preflight\(\(stage: CasStage\)/);
 assert.doesNotMatch(page,/aboutToAppear|onPageShow|\.run\(|console\.|preferences|SessionStore|OfficialLoginStore/);
 assert.match(page,/aboutToDisappear\(\): void \{ this\.stop\(\); \}/);
 assert.match(page,/private stop\(\)[\s\S]*?probe\.cancel\(\)/);
});
function pageLogic() {
 const source=fs.readFileSync(path.resolve(__dirname,'../entry/src/main/ets/pages/NativeCasPreflight.ets'),'utf8');
 const state={created:0,requests:0,cancelled:0,backs:0,pending:[]};
 class Probe {
  constructor(){state.created++}
  preflight(){state.requests++;return new Promise((resolve,reject)=>state.pending.push({resolve,reject}))}
  cancel(){state.cancelled++}
 }
 const logic=source.slice(source.indexOf('struct NativeCasPreflightPage'),source.indexOf('\n  build()'))
  .replace('struct NativeCasPreflightPage','class NativeCasPreflightPage').replace(/@State /g,'')
  .replace(/@StorageProp\('[^']+'\) /g,'')+'\n}\nexports.Page=NativeCasPreflightPage;';
 const exports={};
 const {m}=fixture();
 vm.runInNewContext(ts.transpileModule(logic,{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText,{
  exports,NativeCas:Probe,casProgressText:m.casProgressText,casDiagnosticText:m.casDiagnosticText
 });
 const page=new exports.Page();page.getUIContext=()=>({getRouter:()=>({back:()=>state.backs++})});
 return {page,state};
}
test('privacy developer menu only navigates, with no anonymous request on opening',async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../entry/src/main/ets/components/PrivacyPage.ets'),'utf8');
 assert.match(source,/Button\('开发测试：匿名登录预检'\)[\s\S]*?\.onClick\(\(\) => this\.openAnonymousPreflight\(\)\)/);
 assert.doesNotMatch(source,/NativeCas'|new NativeCas|\.preflight\(|getKaptchaStatus|password|SessionStore/);
 const logic=source.slice(source.indexOf('  private openAnonymousPreflight()'),source.indexOf('\n  build()'));
 const exports={},targets=[];
 vm.runInNewContext(ts.transpileModule('class Menu { error="";'+logic+'}\nexports.Menu=Menu;',{
  compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}
 }).outputText,{exports});
 const menu=new exports.Menu();menu.getUIContext=()=>({getRouter:()=>({pushUrl:async args=>targets.push(args.url)})});
 menu.openAnonymousPreflight();assert.deepEqual(targets,['pages/NativeCasPreflight']);
 const {page,state}=pageLogic();assert.equal(page.result,'尚未运行');assert.equal(state.created,0);assert.equal(state.requests,0);
 page.aboutToDisappear();assert.equal(state.requests,0);
});
test('diagnostic back button cancels pending GET and suppresses late result',async()=>{
 const {page,state}=pageLogic(),work=page.start();assert.equal(state.requests,1);
 page.back();assert.equal(state.backs,1);assert.equal(state.cancelled,1);assert.equal(page.running,false);
 const cancelled=page.result;state.pending[0].resolve({captchaRequired:false});await work;
 assert.equal(page.result,cancelled);assert.equal(page.running,false);
});
test('system back, page hiding and disappearance cancel without affecting app session',async()=>{
 for(const lifecycle of ['onBackPress','onPageHide','aboutToDisappear']){
  const {page,state}=pageLogic(),work=page.start(),out=page[lifecycle]();
  if(lifecycle==='onBackPress')assert.equal(out,false);
  assert.equal(state.cancelled,1);assert.equal(state.backs,0);
  state.pending[0].reject(Error('cancelled'));await work;
  assert.match(page.result,/已取消/);assert.equal(page.running,false);
 }
});
test('cancelled probe cannot overwrite a newly started probe',async()=>{
 const {page,state}=pageLogic(),old=page.start();page.stop();const next=page.start();
 assert.equal(state.requests,2);state.pending[0].resolve({captchaRequired:true});await old;
 assert.equal(page.running,true);assert.match(page.result,/正在执行/);
 state.pending[1].resolve({captchaRequired:false});await next;
 assert.equal(page.running,false);assert.match(page.result,/预检完成/);
});
test('RCP cancellation explicitly aborts in-flight GET before closing session and is idempotent',async()=>{
 const {m,state}=fixture(),transport=new m.CasHttps();
 state.respond=()=>new Promise((_resolve,reject)=>{state.cancelRequest=()=>reject(Error('request cancelled'))});
 const pending=transport.request(m.LOGIN,'GET','','');
 assert.equal(state.requests,1);transport.close();transport.close();
 assert.equal(state.cancelled,1);assert.equal(state.closed,true);await assert.rejects(pending);
});
async function reportOf(m, promise) {
 try { await promise;assert.fail('expected diagnostic failure') }
 catch(error){assert.ok(error instanceof m.CasFailure);return m.casDiagnostic(error)}
}
test('preflight reports exact fixed protocol stage, category and HTTP status',async()=>{
 const {m}=fixture(),r=(status,body='',location='',cookies=[])=>({status,body,location,cookies});
 const cases=[
  [{respond:t=>t===m.ENTRY?r(503):null},'ENTRY_REDIRECT','HTTP_STATUS',503],
  [{respond:t=>t===m.ENTRY?r(200):null},'ENTRY_REDIRECT','REDIRECT_STATUS',200],
  [{respond:t=>t===m.ENTRY?r(302):null},'ENTRY_REDIRECT','REDIRECT_MISSING',302],
  [{respond:t=>t===m.ENTRY?r(302,'','https://evil.test/?account=private'):null},'ENTRY_REDIRECT','REDIRECT_TARGET',302],
  [{respond:t=>t===m.AUTHORIZE?r(302,'',m.ENTRY):null},'AUTHORIZE_REDIRECT','REDIRECT_TARGET',302],
  [{respond:t=>t===m.LOGIN?r(403):null},'FORM_GET','HTTP_STATUS',403],
  [{form:'<form></form>'},'FORM_PARSE','FORM_PARSE',200],
  [{formCookies:[]},'SESSION_PIN','COOKIE_MISSING',200],
  [{formCookies:['JSESSIONID=fixture; Domain=zju.edu.cn; Path=/cas']},'SESSION_PIN','COOKIE_SCOPE',200],
  [{formCookies:['sid=invalid; Domain=evil.test']},'FORM_GET','COOKIE_PARSE',200],
  [{keyCookies:['JSESSIONID=rotation; Secure; Path=/cas']},'KEY_GET','COOKIE_CHANGED',200],
  [{respond:t=>t.endsWith('getPubKey')?r(200,'{}'):null},'KEY_PARSE','KEY_JSON_SHAPE',200],
  [{captcha:'null'},'CAPTCHA_PARSE','CAPTCHA_PARSE',200]
 ];
 for(const [options,stage,category,httpStatus]of cases){
  const f=fake(m,options),d=await reportOf(m,f.flow.preflight());
  assert.equal(d.stage,stage);assert.equal(d.category,category);assert.equal(d.httpStatus,httpStatus);assert.equal(d.nativeCode,0);
  assert.equal(f.state.posts,0);assert.equal(f.state.closed,true);
 }
});
test('network diagnostics distinguish documented RCP categories without copying exception text',async()=>{
 for(const [code,category] of [[1007900006,'DNS'],[1007900035,'TLS'],[1007900060,'TLS'],[1007900028,'TIMEOUT'],
  [1007900007,'CONNECT'],[1007900016,'HTTP_PROTOCOL'],[201,'PERMISSION'],[401,'REQUEST_CONFIG'],[1007900992,'CANCELLED'],[1007900999,'NETWORK']]){
  const {m,state}=fixture();state.respond=async()=>{throw {code,message:'SECRET_COOKIE=abc https://private.test/?account=private'}};
  const flow=new m.NativeCas(),d=await reportOf(m,flow.preflight());
  assert.equal(d.stage,'ENTRY_GET');assert.equal(d.category,category);assert.equal(d.nativeCode,code);assert.equal(d.httpStatus,0);
  assert.doesNotMatch(JSON.stringify(d),/SECRET|private|https/);assert.equal(state.closed,true);
 }
});
test('unknown errors, forged enum values and numeric strings cannot leak data into diagnostic UI',()=>{
 const {m}=fixture(),secret='https://private.test/?cookie=SECRET';
 for(const e of [new Error(secret),{message:secret,code:secret},{code:'1007900006'},{code:13612345678},null,secret,
  {get code(){throw Error(secret)}},new m.CasFailure(secret,secret,13612345678,13612345678)]){
  const text=m.casDiagnosticText(e);assert.doesNotMatch(text,/SECRET|private|https|13612345678/);
  assert.match(text,/INIT/);assert.match(text,/INTERNAL/);
 }
 const forged=new m.CasFailure(m.CasError.TLS);forged.category=secret;forged.stage=secret;
 assert.doesNotMatch(m.casDiagnosticText(forged),/SECRET|private|https/);
});
test('response body compatibility handles buffers, typed views and strings without silent empty conversion',()=>{
 const {m}=fixture(),bytes=new TextEncoder().encode('xfalsey');
 assert.equal(m.casDecodeBody(bytes.subarray(1,6)),'false');assert.equal(m.casDecodeBody(bytes.buffer),'xfalsey');
 assert.equal(m.casDecodeBody('false'),'false');assert.equal(m.casDecodeBody(undefined),'');
 for(const body of [{body:'SECRET'},null,123,[]])assert.throws(()=>m.casDecodeBody(body),e=>e.category==='RESPONSE_TYPE');
 assert.throws(()=>m.casDecodeBody('x'.repeat(512*1024+1)),e=>e.category==='RESPONSE_LIMIT');
});
test('RCP case-insensitive header arrays and actual body variants complete anonymous GET preflight',async()=>{
 const {m,state}=fixture();let count=0;
 state.respond=async request=>{
  assert.equal(request.method,'GET');assert.equal(request.destination,'array-buffer');
  assert.equal(request.configuration.transfer.autoRedirect,false);
  let statusCode=200,text='',headers={};
  if(request.target===m.ENTRY){statusCode=302;headers={Location:[m.AUTHORIZE]}}
  else if(request.target===m.AUTHORIZE){statusCode=302;headers={LOCATION:m.LOGIN}}
  else if(request.target===m.LOGIN){text=form;headers={'Set-Cookie':['JSESSIONID=fixture; Path=/cas; Secure; Expires=Fri, 06 Nov 2037 00:00:00 GMT','aux=fixture; Path=/cas; Secure']}}
  else if(request.target.endsWith('getPubKey'))text=JSON.stringify({modulus,exponent});
  else text='false';
  const encoded=new TextEncoder().encode(text);const body=[text,encoded,encoded.buffer][count++%3];
  return {statusCode,headers,body,effectiveUrl:new URL(request.target)};
 };
 const result=await new m.NativeCas().preflight();assert.equal(result.sessionContinuous,true);
 assert.equal(state.requests,6);assert.ok(state.calls.every(c=>c.method==='GET'));
});
test('malformed RCP headers, combined cookies, response types and implicit redirect get distinct categories',async()=>{
 const cases=[
  [{statusCode:302,headers:{Location:['a','b']}},'REDIRECT_AMBIGUOUS'],
  [{statusCode:302,headers:{Location:'a',location:'b'}},'REDIRECT_AMBIGUOUS'],
  [{statusCode:302,headers:{Location:123}},'HEADERS_TYPE'],
  [{statusCode:302,headers:{'Set-Cookie':['sid=a','sid=b, other=SECRET']}},'COOKIE_COMBINED'],
  [{statusCode:302,headers:{'Set-Cookie':[123]}},'HEADERS_TYPE'],
  [{statusCode:302,headers:{},body:{account:'SECRET'}},'RESPONSE_TYPE'],
  [{statusCode:302,headers:{},effectiveUrl:new URL('https://zjuam.zju.edu.cn/cas/login?cookie=SECRET')},'REDIRECT_FOLLOWED']
 ];
 for(const [response,category]of cases){
  const {m,state}=fixture();state.respond=async()=>response;
  const d=await reportOf(m,new m.NativeCas().preflight());
  assert.equal(d.stage,'ENTRY_GET');assert.equal(d.category,category);assert.equal(d.httpStatus,302);
  assert.doesNotMatch(JSON.stringify(d),/SECRET|account|cookie|https/);
 }
});
test('last captcha parse and key network failure keep exact stage without stale HTTP code',async()=>{
 const {m}=fixture();let n=0;
 const f=fake(m,{respond:t=>t.endsWith('getKaptchaStatus')?{status:200,body:++n===1?'false':'SECRET',location:'',cookies:[]}:null});
 const d=await reportOf(m,f.flow.preflight());assert.equal(d.stage,'FINAL_CAPTCHA_PARSE');assert.equal(d.category,'CAPTCHA_PARSE');assert.equal(d.httpStatus,200);
 const g=fake(m,{respond:t=>{if(t.endsWith('getPubKey'))throw {code:1007900028,message:'SECRET'};return null}});
 const e=await reportOf(m,g.flow.preflight());assert.equal(e.stage,'KEY_GET');assert.equal(e.category,'TIMEOUT');assert.equal(e.httpStatus,0);
});
test('progress callback reports fixed stages only and cleanup cannot replace a primary failure',async()=>{
 const {m}=fixture(),f=fake(m),stages=[];await f.flow.preflight(stage=>stages.push(stage));
 assert.deepEqual(stages,['ENTRY_GET','ENTRY_REDIRECT','AUTHORIZE_GET','AUTHORIZE_REDIRECT','FORM_GET','FORM_PARSE',
  'SESSION_PIN','KEY_GET','KEY_PARSE','CAPTCHA_GET','CAPTCHA_PARSE','RSA_CHECK','FINAL_CAPTCHA_GET','FINAL_CAPTCHA_PARSE','FINAL_SESSION','CLEANUP','COMPLETE']);
 const g=fake(m,{form:'<form></form>'});g.transport.close=()=>{throw Error('SECRET')};
 const d=await reportOf(m,g.flow.preflight());assert.equal(d.stage,'FORM_PARSE');assert.equal(d.category,'FORM_PARSE');
 const h=fake(m);h.transport.close=()=>{throw Error('SECRET')};
 const e=await reportOf(m,h.flow.preflight());assert.equal(e.stage,'CLEANUP');assert.equal(e.category,'CLEANUP');
});
test('diagnostic page displays safe stage/category instead of unknown exception text',async()=>{
 const {page,state}=pageLogic(),work=page.start();
 state.pending[0].reject(Error('SECRET https://private.test/?cookie=private'));await work;
 assert.match(page.result,/阶段：INIT/);assert.match(page.result,/类别：INTERNAL/);
 assert.doesNotMatch(page.result,/SECRET|private|https/);
});
test('RCP session creation errors report INIT stage and safe native category',()=>{
 const {m,state}=fixture();state.initFailure={code:201,message:'SECRET https://private.test'};
 assert.throws(()=>new m.NativeCas(),e=>{
  const d=m.casDiagnostic(e);assert.equal(d.stage,'INIT');assert.equal(d.category,'PERMISSION');assert.equal(d.nativeCode,201);
  assert.doesNotMatch(m.casDiagnosticText(e),/SECRET|private|https/);return true;
 });
 assert.equal(state.requests,0);
});
test('RCP body decoder failure is not mislabeled as DNS, TLS or network',async()=>{
 const {m,state}=fixture();state.decodeFailure=Error('SECRET https://private.test');
 state.respond=async()=>({statusCode:302,headers:{Location:m.AUTHORIZE},body:new TextEncoder().encode('fixture').buffer});
 const d=await reportOf(m,new m.NativeCas().preflight());
 assert.equal(d.stage,'ENTRY_GET');assert.equal(d.category,'BODY_DECODE');assert.equal(d.httpStatus,302);assert.equal(d.nativeCode,0);
});
test('observed anonymous authorize JSESSIONID, form csrf, key parent-domain pv0 shape completes',async()=>{
 const {m,state}=fixture();
 state.respond=async request=>{
  const {target,headers}=request;assert.equal(request.method,'GET');let statusCode=200,text='',responseHeaders={};
  if(target===m.ENTRY){statusCode=302;responseHeaders.Location=m.AUTHORIZE}
  else if(target===m.AUTHORIZE){statusCode=302;responseHeaders.Location=m.LOGIN;responseHeaders['Set-Cookie']=['JSESSIONID=observed-fixture; Path=/cas; Secure; HttpOnly']}
  else if(target===m.LOGIN){assert.equal(headers.cookie,'JSESSIONID=observed-fixture');text=form;responseHeaders['Set-Cookie']=['_csrf=csrf-fixture; Path=/cas; Secure']}
  else if(target.endsWith('getPubKey')){
   assert.match(headers.cookie,/JSESSIONID=observed-fixture/);assert.match(headers.cookie,/_csrf=csrf-fixture/);
   text=JSON.stringify({modulus,exponent});responseHeaders['Set-Cookie']=['_pv0=pv-fixture; Domain=.zju.edu.cn; Path=/; Secure'];
  } else {
   assert.match(headers.cookie,/JSESSIONID=observed-fixture/);assert.match(headers.cookie,/_csrf=csrf-fixture/);
   assert.match(headers.cookie,/_pv0=pv-fixture/);text='false';
  }
  return {statusCode,headers:responseHeaders,body:new TextEncoder().encode(text).buffer};
 };
 const result=await new m.NativeCas().preflight();assert.equal(result.sessionContinuous,true);
 assert.equal(state.requests,6);assert.ok(state.calls.every(c=>c.method==='GET'));assert.equal(state.closed,true);
});
test('auxiliary cookie additions, updates, deletion and scope do not impersonate session changes',async()=>{
 const {m}=fixture(),f=fake(m,{
  authorizeCookies:['JSESSIONID=fixture; Path=/cas; Secure'],
  formCookies:['_csrf=original; Path=/cas; Secure','gone=fixture; Path=/cas; Secure'],
  keyCookies:['_pv0=fixture; Domain=.zju.edu.cn; Path=/; Secure','_csrf=updated; Path=/cas; Secure','gone=fixture; Path=/cas; Max-Age=0','keyOnly=fixture; Path=/cas/v2/getPubKey; Secure'],
  captchaCookies:['_pv0=updated; Domain=zju.edu.cn; Path=/; Secure']
 });
 await f.flow.preflight();
 for(const c of f.state.calls.filter(c=>c.target.endsWith('getKaptchaStatus'))){
  assert.match(c.cookie,/JSESSIONID=fixture/);assert.match(c.cookie,/_csrf=updated/);assert.match(c.cookie,/_pv0=/);
  assert.doesNotMatch(c.cookie,/gone=|keyOnly=/);
 }
 assert.equal(f.state.posts,0);
});
test('session writes including same-value reset, ABA rebuild and transient shadows always abort',async()=>{
 const {m}=fixture(),original='JSESSIONID=fixture; Secure; Path=/cas';
 const mutations=[
  [original],
  [original+'; Max-Age=0',original],
  ['JSESSIONID=other; Secure; Path=/cas',original],
  ['JSESSIONID=fixture; Secure; Path=/cas/v2','JSESSIONID=fixture; Secure; Path=/cas/v2; Max-Age=0'],
  ['JSESSIONID=fixture; Domain=zjuam.zju.edu.cn; Secure; Path=/cas'],
  ['JSESSIONID=fixture; Path=/cas'],
  [original+'; Max-Age=60'],
  ['JSESSIONID=fixture; Domain=zju.edu.cn; Secure; Path=/cas'],
  ['JSESSIONID=fixture; Secure; Path=/unrelated']
 ];
 for(const cookies of mutations){
  for(const phase of ['keyCookies','captchaCookies']){
   const f=fake(m,{[phase]:cookies}),d=await reportOf(m,f.flow.preflight());
   assert.equal(d.category,'COOKIE_CHANGED');assert.equal(d.httpStatus,200);assert.equal(f.state.posts,0);
  }
  let calls=0;const f=fake(m,{respond:t=>t.endsWith('getKaptchaStatus')?{
   status:200,body:'false',location:'',cookies:++calls===2?cookies:[]
  }:null});
  const d=await reportOf(m,f.flow.preflight());assert.equal(d.stage,'FINAL_CAPTCHA_GET');assert.equal(d.category,'COOKIE_CHANGED');
 }
});
test('same-name session shadows are rejected even with identical values before initial pin',async()=>{
 const {m}=fixture(),base='JSESSIONID=fixture; Secure; Path=/cas';
 for(const shadow of ['JSESSIONID=fixture; Secure; Path=/','JSESSIONID=fixture; Secure; Path=/cas/v2',
  'JSESSIONID=fixture; Domain=zju.edu.cn; Secure; Path=/cas','JSESSIONID=fixture; Secure; Path=/unrelated']){
  const f=fake(m,{formCookies:[base,shadow]}),d=await reportOf(m,f.flow.preflight());
  assert.equal(d.category,'COOKIE_SCOPE');assert.equal(f.state.posts,0);
 }
});
test('CAS session generation ignores auxiliary expiry and sibling sessions but records every CAS write',()=>{
 const {m}=fixture(),jar=new m.CasCookieJar(),now=Date.now(),base='JSESSIONID=fixture; Secure; Path=/cas';
 jar.receive(m.LOGIN,base,now);const pin=jar.casSessionPin(m.LOGIN),generation=jar.sessionGeneration();
 assert.equal(pin.hostOnly,true);assert.equal(pin.domain,'zjuam.zju.edu.cn');assert.equal(pin.path,'/cas');
 jar.receive(m.LOGIN,'aux=fixture; Path=/cas; Max-Age=1',now);
 jar.receive('https://classroom.zju.edu.cn/','JSESSIONID=sibling; Secure; Path=/',now);
 assert.equal(jar.sessionGeneration(),generation);jar.header(m.LOGIN,now+1001);
 assert.equal(jar.sessionGeneration(),generation);assert.equal(jar.casSessionPin(m.LOGIN).value,pin.value);
 jar.receive(m.LOGIN,base,now);assert.ok(jar.sessionGeneration()>generation);
 const second=jar.sessionGeneration();jar.receive(m.LOGIN,base+'; Max-Age=0',now);jar.receive(m.LOGIN,base,now);
 assert.ok(jar.sessionGeneration()>=second+2);assert.equal(jar.casSessionPin(m.LOGIN).value,pin.value);
 assert.equal(jar.header('https://classroom.zju.edu.cn/'),'JSESSIONID=sibling');
});
test('auxiliary cookies retain domain, HTTPS and prefix validation after session-only pin fix',async()=>{
 const {m}=fixture();for(const cookie of ['aux=fixture; Domain=evil.test; Path=/','__Host-aux=fixture; Domain=zju.edu.cn; Secure; Path=/']){
  const f=fake(m,{keyCookies:[cookie]}),d=await reportOf(m,f.flow.preflight());
  assert.equal(d.category,'COOKIE_PARSE');assert.equal(f.state.posts,0);
 }
 const jar=new m.CasCookieJar();
 assert.throws(()=>jar.receive('http://zjuam.zju.edu.cn/cas/login','aux=fixture'));
 assert.throws(()=>jar.receive(m.ENTRY,'JSESSIONID=fixture; Domain=zjuam.zju.edu.cn; Secure; Path=/cas'));
});
test('final pre-send checks permit auxiliary changes but reject identical session reset during reserve',async()=>{
 const {m}=fixture(),f=fake(m);
 await f.flow.run(true,'user-fixture','synthetic-password',f.expected,async()=>{
  f.state.reserved++;f.flow.jar.receive(m.LOGIN,'_pv0=fixture; Domain=zju.edu.cn; Secure; Path=/');
 });
 assert.equal(f.state.posts,1);assert.equal(f.state.reserved,1);
 const g=fake(m);await assert.rejects(g.flow.run(true,'user-fixture','synthetic-password',g.expected,async()=>{
  g.state.reserved++;g.flow.jar.receive(m.LOGIN,'JSESSIONID=fixture; Secure; Path=/cas');
 }));
 assert.equal(g.state.posts,0);assert.equal(g.state.reserved,1);
});
// Synthetic integer with the observed SIZE only; never stores the official public key.
const legacyModulus='8'+'a'.repeat(126)+'1';
const legacyKeyBody=JSON.stringify({modulus:legacyModulus,exponent:'10001'});
test('observed 161-byte 128-hex 512-bit key shape is compatible with an advisory warning',async()=>{
 const {m}=fixture();assert.equal(Buffer.byteLength(legacyKeyBody),161);
 const key=m.casKey(legacyKeyBody);assert.equal(key.bits,512);
 assert.equal(m.casKey('\ufeff \n'+JSON.stringify({exponent:'10001',modulus:legacyModulus})).bits,512);
 const f=fake(m,{respond:t=>t.endsWith('getPubKey')?{status:200,body:legacyKeyBody,location:'',cookies:[]}:null});
 const out=await f.flow.preflight();assert.equal(out.publicKeyBits,512);assert.equal(out.publicKeyWeak,true);
 assert.equal(out.realPostEnabled,false);assert.equal(out.sessionContinuous,true);
 assert.equal(f.state.calls.length,6);assert.ok(f.state.calls.every(c=>c.method==='GET'));assert.equal(f.state.posts,0);
 assert.doesNotMatch(JSON.stringify(out),new RegExp(legacyModulus));
});
test('key JSON shape failures have their own fixed category without body disclosure',async()=>{
 const {m}=fixture();
 for(const body of ['{}','[]','null','<html>private</html>',
  JSON.stringify({modulus:legacyModulus,exponent:65537}),
  '{"modulus":"'+legacyModulus+'","modulus":"'+legacyModulus+'"}',
  JSON.stringify({modulus:legacyModulus,exponent:'10001',private:'SECRET'}),
  '{"\\u006dodulus":"'+legacyModulus+'","exponent":"10001"}',
  legacyKeyBody.slice(0,-1)+',}']){
  const f=fake(m,{respond:t=>t.endsWith('getPubKey')?{status:200,body,location:'',cookies:[]}:null});
  const d=await reportOf(m,f.flow.preflight());
  assert.equal(d.stage,'KEY_PARSE');assert.equal(d.category,'KEY_JSON_SHAPE');assert.equal(d.httpStatus,200);
  assert.equal(f.state.calls.length,4);assert.doesNotMatch(JSON.stringify(d),/SECRET|private|modulus/);
 }
});
test('key modulus syntax and actual numeric strength are distinct, with no padding bypass',()=>{
 const {m}=fixture(),check=(n,category)=>assert.throws(()=>m.casKey(JSON.stringify({modulus:n,exponent:'10001'})),e=>e.category===category);
 for(const n of ['', '0','a'.repeat(127)+'2','0x'+legacyModulus,legacyModulus.slice(0,-1)+'G'])check(n,'KEY_MODULUS_FORMAT');
 for(const n of ['1','7'+'a'.repeat(62)+'1',
  '0'.repeat(192)+'7'+'a'.repeat(62)+'1','1'+'a'.repeat(1023)+'1'])check(n,'KEY_MODULUS_STRENGTH');
 assert.equal(m.casKey(JSON.stringify({modulus:'8'+'a'.repeat(62)+'1',exponent:'10001'})).bits,256);
 assert.equal(m.casKey(JSON.stringify({modulus:'7'+'a'.repeat(126)+'1',exponent:'10001'})).bits,511);
 assert.equal(m.casKey(JSON.stringify({modulus:'00'+legacyModulus,exponent:'10001'})).bits,512);
 assert.equal(m.casKey(JSON.stringify({modulus:'8'+'a'.repeat(1022)+'1',exponent:'10001'})).bits,4096);
});
test('invalid key exponents report KEY_EXPONENT independently of JSON and modulus',async()=>{
 const {m}=fixture();
 for(const exponent of ['', '0','1','2','10000','100000001','0x10001','SECRET']){
  const f=fake(m,{respond:t=>t.endsWith('getPubKey')?{
   status:200,body:JSON.stringify({modulus:legacyModulus,exponent}),location:'',cookies:[]
  }:null});
  const d=await reportOf(m,f.flow.preflight());assert.equal(d.stage,'KEY_PARSE');assert.equal(d.category,'KEY_EXPONENT');
  assert.equal(d.httpStatus,200);assert.equal(d.nativeCode,0);assert.doesNotMatch(JSON.stringify(d),/SECRET/);
 }
});
test('official-size 512-bit RSA encrypts synthetic text with independent JSBN multi-block parity',async()=>{
 const {m,state}=fixture(),rsa=new m.CasCryptoRsa();
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:512}).publicKey.export({format:'jwk'});
 const nhex=Buffer.from(key.n,'base64url').toString('hex'),ehex=Buffer.from(key.e,'base64url').toString('hex');
 function pow(x,e,n){let r=1n;while(e){if(e&1n)r=r*x%n;x=x*x%n;e>>=1n}return r}
 for(const text of ['CAS-PREFLIGHT-PROBE','A'.repeat(130),'hello world']){
  const reversed=text.split('').reverse().join(''),expected=[],n=BigInt('0x'+nhex),e=BigInt('0x'+ehex);
  for(let off=0;off<reversed.length;off+=62){
   let x=0n;for(let j=0;j<62&&off+j<reversed.length;j++)x+=BigInt(reversed.charCodeAt(off+j))<<(8n*BigInt(j));
   const h=pow(x,e,n).toString(16);expected.push(h.padStart(Math.ceil(h.length/4)*4,'0'));
  }
  assert.equal(await rsa.encrypt(text,nhex,ehex),expected.join(' '));
 }
 assert.ok(state.algorithms.every(a=>a==='RSA512'));assert.equal(state.requests,0);
});
test('512-bit official protocol reaches synthetic encryption without an added product strength gate',async()=>{
 const {m}=fixture(),f=fake(m,{respond:t=>t.endsWith('getPubKey')?{
  status:200,body:legacyKeyBody,location:'',cookies:[]
 }:null});let encryptionCalls=0;
 f.flow.rsa={encrypt:async()=>{encryptionCalls++;return 'synthetic'}};
 const out=await f.flow.run(true,'user-fixture','synthetic-password',f.expected,f.reserve);
 assert.equal(out.identity.id,'id-fixture');
 assert.equal(encryptionCalls,1);assert.equal(f.state.reserved,1);assert.equal(f.state.posts,1);assert.equal(f.state.closed,true);
 assert.equal(m.NATIVE_CAS_REAL_POST_ENABLED,false);
});
test('observed weak key survives real adapter string, ArrayBuffer and offset Uint8Array decoding',async()=>{
 const bytes=new TextEncoder().encode('x'+legacyKeyBody+'y');
 for(const body of [legacyKeyBody,new TextEncoder().encode(legacyKeyBody).buffer,bytes.subarray(1,bytes.length-1)]){
  const {m,state}=fixture();
  state.respond=async request=>{
   let statusCode=200,headers={},text='';
   if(request.target===m.ENTRY){statusCode=302;headers.Location=m.AUTHORIZE}
   else if(request.target===m.AUTHORIZE){statusCode=302;headers.Location=m.LOGIN;headers['Set-Cookie']=['JSESSIONID=fixture; Secure; Path=/cas']}
   else if(request.target===m.LOGIN)text=form;
   else if(request.target.endsWith('getPubKey'))return {statusCode,headers,body};
   else text='false';
   return {statusCode,headers,body:text};
  };
  const out=await new m.NativeCas().preflight();
  assert.equal(out.publicKeyBits,512);assert.equal(out.publicKeyWeak,true);assert.equal(out.publicKeyCryptoReady,true);
  assert.deepEqual(state.algorithms,['RSA512']);assert.ok(state.cryptoCalls.includes('encrypt'));assert.equal(state.calls.length,6);
  assert.ok(state.calls.every(c=>c.method==='GET'));assert.equal(state.closed,true);
 }
});
test('preflight UI warns about weak service RSA and does not call key format alone secure',async()=>{
 const {page,state}=pageLogic(),work=page.start();
 state.pending[0].resolve({publicKeyBits:512,publicKeyWeak:true,publicKeyCryptoReady:true,captchaRequired:false});await work;
 assert.match(page.result,/512 位/);assert.match(page.result,/传统弱 RSA/);assert.match(page.result,/合成文本测试通过/);
 assert.doesNotMatch(page.result,/禁止凭据使用|最低位数门槛/);
 assert.match(page.result,/真实认证 POST：关闭/);assert.doesNotMatch(page.result,/安全密钥|已登录/);
 const {m}=fixture(),out=await fake(m).flow.preflight();assert.equal(out.publicKeyBits,2048);assert.equal(out.publicKeyWeak,false);
});
test('malformed UTF-8 is BODY_DECODE at KEY_GET rather than a JSON or strength error',async()=>{
 const {m,state}=fixture();
 state.respond=async request=>{
  if(request.target===m.ENTRY)return {statusCode:302,headers:{Location:m.AUTHORIZE},body:''};
  if(request.target===m.AUTHORIZE)return {statusCode:302,headers:{Location:m.LOGIN},body:''};
  if(request.target===m.LOGIN)return {statusCode:200,headers:{'Set-Cookie':['JSESSIONID=fixture; Secure; Path=/cas']},body:form};
  return {statusCode:200,headers:{},body:new Uint8Array([0x7b,0xff,0x7d]).buffer};
 };
 const d=await reportOf(m,new m.NativeCas().preflight());
 assert.equal(d.stage,'KEY_GET');assert.equal(d.category,'BODY_DECODE');assert.equal(d.httpStatus,200);
 assert.equal(d.nativeCode,0);assert.equal(state.requests,4);assert.ok(state.calls.every(c=>c.method==='GET'));
});
test('invalid protocol keys are rejected before invoking the native crypto backend',async()=>{
 const {m,state}=fixture(),rsa=new m.CasCryptoRsa();
 for(const [n,e,category] of [
  ['7'+'a'.repeat(62)+'1','10001','KEY_MODULUS_STRENGTH'],
  ['0'.repeat(200)+'7'+'a'.repeat(62)+'1','10001','KEY_MODULUS_STRENGTH'],
  [legacyModulus.slice(0,-1)+'2','10001','KEY_MODULUS_FORMAT'],
  [legacyModulus,'1','KEY_EXPONENT'],[legacyModulus,'2','KEY_EXPONENT'],
  [legacyModulus,'100000001','KEY_EXPONENT']]){
  await assert.rejects(rsa.encrypt('CAS-PREFLIGHT-PROBE',n,e),error=>error.category===category);
 }
 assert.deepEqual(state.cryptoCalls,[]);assert.equal(state.requests,0);
});
test('native SDK rejection is reported at RSA_CHECK, never claimed ready or mislabeled RCP',async()=>{
 for(const phase of ['config','cipher','import','init','encrypt']){
  for(const code of [801,401]){
   const {m,state}=fixture(),f=fake(m,{respond:t=>t.endsWith('getPubKey')?{
    status:200,body:legacyKeyBody,location:'',cookies:[]
   }:null});
   state.cryptoFailAt=phase;state.cryptoFailure={code,message:'SECRET_SDK_DETAIL'};
   const flow=new m.NativeCas(f.transport,new m.CasCryptoRsa()),d=await reportOf(m,flow.preflight());
   const expected=code===801?'RSA_UNSUPPORTED':phase==='config'||phase==='cipher'?'RSA_CONFIG':phase==='import'?'RSA_KEY_IMPORT':'RSA_ENCRYPT';
   assert.equal(d.stage,'RSA_CHECK');assert.equal(d.category,expected);
   assert.equal(d.httpStatus,0);assert.equal(d.nativeCode,0);assert.equal(f.state.posts,0);
   assert.equal(f.state.calls.length,5);assert.equal(f.state.closed,true);
   assert.doesNotMatch(m.casDiagnosticText(new m.CasFailure(d.category,d.stage)),/SECRET|SDK_DETAIL/);
  }
 }
});
test('native crypto malformed output is RSA_RESULT instead of false compatibility success',async()=>{
 const {m,state}=fixture(),f=fake(m,{respond:t=>t.endsWith('getPubKey')?{
  status:200,body:legacyKeyBody,location:'',cookies:[]
 }:null});
 state.cryptoMalformed=true;
 const d=await reportOf(m,new m.NativeCas(f.transport,new m.CasCryptoRsa()).preflight());
 assert.equal(d.stage,'RSA_CHECK');assert.equal(d.category,'RSA_RESULT');assert.equal(d.httpStatus,0);assert.equal(f.state.posts,0);
});
test('preflight crypto probe uses fixed public text, spends no attempt and never publishes ciphertext',async()=>{
 const {m}=fixture(),f=fake(m);let probes=0;
 f.flow.rsa={encrypt:async(text,n,e)=>{
  probes++;assert.equal(text,'CAS-PREFLIGHT-PROBE');assert.equal(n,modulus);assert.equal(e,exponent);return 'deadbeef';
 }};
 const out=await f.flow.preflight();assert.equal(out.publicKeyCryptoReady,true);assert.equal(probes,1);
 assert.equal(f.state.posts,0);assert.equal(f.state.reserved,0);assert.doesNotMatch(JSON.stringify(out),/deadbeef|PREFLIGHT-PROBE/);
 assert.ok(f.state.calls.every(call=>call.method==='GET'&&!call.body));
});
