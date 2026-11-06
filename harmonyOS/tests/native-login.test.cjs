const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(process.env.SUIKE_TYPESCRIPT||'typescript');
const root=path.resolve(__dirname,'../entry/src/main/ets');
const known=()=>({id:'fixture-id',name:'Fixture',tenantId:112,username:'canonical-user'});
const typed=()=>({username:'alias@example.invalid',password:'SYNTHETIC-ONLY'});
function fixture(options={}) {
 const records=options.records||new Map(),events=[],state={posts:0,created:0,rcp:0,beforeWrite:null,requestHook:null,failWrite:null,captcha:false,identity:null,transport:null};
 const tags={ALIAS:'alias',SECRET:'secret',RETURN_TYPE:'return',DATA_LABEL_NORMAL_LOCAL_1:'label',ACCESSIBILITY:'access',CONFLICT_RESOLUTION:'conflict'};
 const text=x=>Buffer.from(x).toString('utf8');
 const asset={Tag:tags,ReturnType:{ALL:1},Accessibility:{DEVICE_UNLOCKED:1},ConflictResolution:{OVERWRITE:1},
  query:async query=>{const row=records.get(text(query.get(tags.ALIAS)));if(!row)throw {code:24000002};return [new Map([[tags.SECRET,new Uint8Array(row)]])]},
  add:async attrs=>{
   const alias=text(attrs.get(tags.ALIAS)),bytes=new Uint8Array(attrs.get(tags.SECRET));
   if(state.beforeWrite)await state.beforeWrite(alias,bytes);
   if(state.failWrite&&state.failWrite(alias,bytes))throw {code:24000001,message:'DO_NOT_ECHO_ASSET'};
   records.set(alias,bytes);events.push(alias==='zhiyun-official-login-v2'?'RECORD_WRITE':alias==='zhiyun-official-session-v2'?'SESSION_COMMIT':'ASSET_WRITE');
  },
  remove:async query=>{if(query.has(tags.ALIAS))records.delete(text(query.get(tags.ALIAS)));else for(const key of records.keys())if(key.startsWith('zhiyun-official-session-'))records.delete(key)}
 };
 const cache=new Map(),stubs={
  '@kit.AssetStoreKit':{asset},
  '@kit.ArkTS':{url:{URL},util:{TextEncoder:class{encodeInto(s){return new Uint8Array(Buffer.from(s))}},TextDecoder:{create:()=>({decodeToString:x=>text(x)})}}},
  '@kit.ArkWeb':{webview:{WebCookieManager:{fetchCookieSync:()=>'',clearAllCookiesSync(){}}}},
  '@kit.RemoteCommunicationKit':{rcp:{
   createSession(){
    state.rcp++;if(!options.realTransport)throw Error('NO_REAL_RCP_IN_TEST');
    return {fetch:async request=>{
     const response=await state.transport.request(request.target,request.method,request.body,request.headers.cookie||'');
     return {statusCode:response.status,body:response.body,effectiveUrl:request.target,
      headers:{location:response.location?[response.location]:[],'set-cookie':response.cookies}};
    },cancel(){},close(){}};
   },
   Request:class {constructor(target,method,headers,body){Object.assign(this,{target,method,headers,body})}}
  }},
  '@kit.NetworkKit':options.network||{},
  '@kit.CryptoArchitectureKit':{cryptoFramework:{}}
 };
 function load(file) {
  file=path.normalize(file);if(cache.has(file))return cache.get(file);
  let source=fs.readFileSync(path.join(root,file+'.ets'),'utf8');
  if(file==='services/OfficialLoginStore'&&options.credentialsEnabled!==false)source=source.replace('CREDENTIAL_FEATURE_ENABLED: boolean = false','CREDENTIAL_FEATURE_ENABLED: boolean = true');
  const exports={};cache.set(file,exports);
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(output,{exports,require:name=>name.startsWith('.')?load(path.join(path.dirname(file),name)):stubs[name]||{},URL,Date,Map,Set,Error,Uint8Array,ArrayBuffer,TextDecoder,Number,setTimeout,clearTimeout,encodeURIComponent,decodeURIComponent},{filename:file});
  return exports;
 }
 const cas=load('services/NativeCas'),n=load('services/NativeLogin'),store=load('services/OfficialLoginStore').OfficialLoginStore,sessions=load('services/SessionStore').SessionStore;
 const callback='https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=opaque.fixture~%2f%26';
 const exchange=options.exchange||'https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&code=opaque.fixture~%2B%3D';
 const factory={enabled:()=>options.realTransport?new n.OfficialNativeRunnerFactory().enabled():options.nativeEnabled!==false,create:()=>{
  state.created++;let closed=false;events.push('CREATE');
  const response=(status,body='',location='',cookies=[])=>({status,body,location,cookies});
  const transport={binding:()=>{if(closed)throw Error('closed');return 'fixture-private-session'},close:()=>{closed=true},request:async(target,method,body,cookie)=>{
   if(closed)throw Error('closed');
   if(state.requestHook)await state.requestHook(target,method,body,cookie);
   if(target===cas.ENTRY)return response(302,'',cas.AUTHORIZE);
   if(target===cas.AUTHORIZE)return response(302,'',cas.LOGIN,['JSESSIONID=fixture; Secure; Path=/cas']);
   if(target===cas.LOGIN&&method==='GET')return response(200,'<form id="fm1" method="post" action="/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize"><input type="hidden" name="execution" value="fixture"><input type="hidden" name="_eventId" value="submit"></form>');
   if(target.endsWith('/getPubKey'))return response(200,JSON.stringify({modulus:'c1'.repeat(64),exponent:'10001'}));
   if(target.endsWith('/getKaptchaStatus'))return response(200,state.captcha?'true':'false');
   if(target===cas.LOGIN&&method==='POST'){state.posts++;events.push('POST');state.lastUsername=new URLSearchParams(body).get('username');return response(302,'',callback)}
   if(target===callback)return response(302,'',exchange);
   if(target===exchange)return response(302,'','https://classroom.zju.edu.cn/',['session=fixture; Secure; Domain=zju.edu.cn; Path=/','_token='+encodeURIComponent('{i:1;s:6:"_token";i:1;s:3:"abc";}')+'; Secure; Domain=zju.edu.cn; Path=/']);
   if(target==='https://classroom.zju.edu.cn/')return response(200,'landing');
   if(target.endsWith('/infosimple'))return response(200,JSON.stringify({params:state.identity||{id:'fixture-id',tenant_id:112,account:'canonical-user'}}));
   throw Error('NO_EXTERNAL_REQUEST');
  }};
  state.transport=transport;
  return new cas.NativeCas(options.realTransport?new cas.CasHttps():transport,{encrypt:async()=> 'synthetic-cipher'});
 }};
 const credentials=new n.OfficialNativeCredentials(),sessionPort=new n.OfficialNativeSessions();
 const wrap=(object,method,label)=>{const original=object[method].bind(object);object[method]=async(...args)=>{events.push(label);return original(...args)}};
 wrap(credentials,'reserveEnrollment','ENROLL_RESERVE');wrap(credentials,'saveVerified','SAVE');
 wrap(credentials,'reserve','RESERVE');wrap(credentials,'confirm','CONFIRM');
 wrap(sessionPort,'adoptVerifiedCookie','ADOPT');wrap(sessionPort,'rememberAccount','ACCOUNT');
 const coordinator=new n.NativeLoginCoordinator(credentials,sessionPort,factory);
 return {load,n,cas,store,sessions,state,records,events,credentials,sessionPort,factory,coordinator,
  acceptance:load('services/NativeAccountAcceptance').NativeAccountAcceptance,
  row:()=>JSON.parse(text(records.get('zhiyun-official-login-v2')))};
}
const category=(f,name)=>error=>error instanceof f.n.NativeLoginFailure&&error.category===f.n.NativeLoginError[name];
async function enroll(f){await f.coordinator.enroll(true,typed(),known())}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}

test('native enrollment uses the real asset store after proof and accepts a typed alias without guessing canonical identity',async()=>{
 const f=fixture();await enroll(f);
 assert.equal(f.state.lastUsername,'alias@example.invalid');assert.equal(f.row().username,'alias@example.invalid');
 assert.equal(f.row().accountId,'fixture-id');assert.equal(f.row().attempts,0);assert.equal(f.state.posts,1);
 assert.ok(f.events.indexOf('ENROLL_RESERVE')<f.events.indexOf('POST'));assert.ok(f.events.indexOf('POST')<f.events.indexOf('SAVE'));
 assert.equal(f.events.filter(e=>e==='ENROLL_RESERVE').length,1);assert.equal(f.events.includes('ADOPT'),false);
 assert.equal(f.state.rcp,0);assert.match(await f.store.status(known()),/已加密保存/);
});
test('native recovery durably reserves once then adopts/commits/account-saves before confirm',async()=>{
 const f=fixture();await enroll(f);f.events.length=0;
 const account=await f.coordinator.recover(true,known());
 assert.equal(account.username,'canonical-user');assert.equal(f.row().attempts,0);assert.equal(f.state.posts,2);
 const ordered=['RESERVE','CREATE','POST','ADOPT','SESSION_COMMIT','ACCOUNT','CONFIRM'];let at=-1;
 for(const label of ordered){const next=f.events.indexOf(label);assert.ok(next>at,label);at=next}
 assert.equal(f.events.filter(e=>e==='RESERVE').length,1);assert.equal(f.events.includes('ENROLL_RESERVE'),false);
 assert.match(f.sessions.cookie('https://classroom.zju.edu.cn'),/session=fixture/);
 assert.equal(f.sessions.cookie('https://interactivemeta.cmc.zju.edu.cn'),'');
 assert.equal((await f.sessions.savedAccount()).id,'fixture-id');assert.equal(f.coordinator.isActive(),false);
});
test('no-url OAuth exchange supports enrollment and recovery only after identity verification',async()=>{
 const f=fixture({exchange:'https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&code=opaque.fixture~%2B%3D'});
 await enroll(f);assert.equal(f.state.posts,1);assert.ok(f.row());assert.equal(f.events.includes('ADOPT'),false);
 f.events.length=0;await f.coordinator.recover(true,known());
 assert.equal(f.state.posts,2);assert.ok(f.events.includes('SESSION_COMMIT'));assert.ok(f.events.includes('ACCOUNT'));
 assert.match(f.sessions.cookie('https://classroom.zju.edu.cn'),/session=fixture/);
});
test('malicious no-url OAuth exchange never saves credentials or publishes identity or session',async()=>{
 const base='https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&code=opaque';
 for(const suffix of ['&unknown=x','&code=other','&%63ode=other','&r=auth%2Fget-info',
  '&url='+encodeURIComponent('https://evil.test/'),'&url=',
  '&url='+encodeURIComponent('https://classroom.zju.edu.cn/')+'&%75rl='+encodeURIComponent('https://classroom.zju.edu.cn/')]){
  const f=fixture({exchange:base+suffix});await assert.rejects(enroll(f));
  assert.equal(f.state.posts,1);
  for(const event of ['SAVE','ADOPT','SESSION_COMMIT','ACCOUNT','CONFIRM'])assert.equal(f.events.includes(event),false,event);
  assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'');
 }
 const f=fixture({exchange:base});
 f.state.identity={id:'other',account:'canonical-user',tenant_id:112};
 await assert.rejects(enroll(f));assert.equal(f.state.posts,1);
 for(const event of ['SAVE','ADOPT','SESSION_COMMIT','ACCOUNT','CONFIRM'])assert.equal(f.events.includes(event),false,event);
 assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'');
});
for(const [name,options]of[['POST switch',{nativeEnabled:false}],['saving switch',{credentialsEnabled:false}]]){
 test('disabled '+name+' returns an honest status before constructing a transport or reading/writing assets',async()=>{
  const f=fixture(options);await assert.rejects(enroll(f),category(f,'DISABLED'));
  await assert.rejects(f.coordinator.recover(true,known()),category(f,'DISABLED'));
  assert.equal(f.state.created,0);assert.equal(f.records.size,0);assert.equal(f.state.posts,0);assert.equal(f.state.rcp,0);
 });
}
test('no consent, missing canonical identity and invalid credentials never send or save',async()=>{
 const f=fixture();await assert.rejects(f.coordinator.enroll(false,typed(),known()),category(f,'CONSENT'));
 for(const account of [{...known(),username:undefined},{...known(),id:''},{...known(),tenantId:0}]){
  await assert.rejects(f.coordinator.enroll(true,typed(),account),category(f,'IDENTITY'));
  await assert.rejects(f.coordinator.recover(true,account),category(f,'IDENTITY'));
 }
 await assert.rejects(f.coordinator.enroll(true,{username:'',password:'x'},known()),category(f,'CREDENTIALS'));
 assert.equal(f.state.posts,0);assert.equal(f.state.created,0);assert.equal(f.records.size,0);
});
for(const mismatch of [{id:'other',tenant_id:112,account:'canonical-user'},{id:'fixture-id',tenant_id:113,account:'canonical-user'},{id:'fixture-id',tenant_id:112,account:'alias@example.invalid'}]){
 test('native proof rejects changed identity '+JSON.stringify(mismatch),async()=>{
  const f=fixture();f.state.identity=mismatch;await assert.rejects(enroll(f));assert.equal(f.records.has('zhiyun-official-login-v2'),false);
 });
}
test('captcha after saved credentials spends the attempt once and never POSTs/re-arms',async()=>{
 const f=fixture();await enroll(f);f.state.captcha=true;
 await assert.rejects(f.coordinator.recover(true,known()),category(f,'CAPTCHA'));
 assert.equal(f.row().attempts,1);assert.equal(f.state.posts,1);
 assert.equal(await f.coordinator.recover(true,known()),undefined);assert.equal(f.state.posts,1);
 assert.match(await f.store.status(known()),/已消耗/);
});
test('a network failure after reservation is spent and cannot silently retry',async()=>{
 const f=fixture();await enroll(f);f.state.requestHook=()=>{throw {code:1007900006,message:'SECRET_NETWORK'}};
 await assert.rejects(f.coordinator.recover(true,known()));
 assert.equal(f.row().attempts,1);assert.equal(await f.coordinator.recover(true,known()),undefined);assert.equal(f.state.posts,1);
});
test('session adoption failure and account-save failure do not confirm or re-arm',async()=>{
 for(const fail of ['zhiyun-official-session-v2','zhiyun-official-session-v2-account']){
  const f=fixture();await enroll(f);f.events.length=0;f.state.failWrite=alias=>alias===fail;
  await assert.rejects(f.coordinator.recover(true,known()),category(f,'STORAGE'));
  assert.equal(f.row().attempts,1);assert.equal(f.events.includes('CONFIRM'),false);
 }
});
test('save failure cannot publish consent or leak unknown asset exceptions',async()=>{
 const f=fixture();f.state.failWrite=alias=>alias==='zhiyun-official-login-v2';
 let failure;try{await enroll(f)}catch(error){failure=error}
 assert.equal(failure.category,f.n.NativeLoginError.STORAGE);
 assert.equal(f.n.nativeLoginMessage(failure).includes('DO_NOT_ECHO_ASSET'),false);
 assert.equal(await f.store.reserve(known(),f.store.generation()),undefined);
});
test('cancellation while reserving and while adopting blocks late POST/confirm and keeps old session',async()=>{
 for(const stage of ['reserve','adopt']){
  const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=old',f.sessions.generation());
  const gate=deferred(),entered=deferred();let blocked=false;
  f.state.beforeWrite=async(alias,bytes)=>{
   if(!blocked&&((stage==='reserve'&&alias==='zhiyun-official-login-v2'&&Buffer.from(bytes).toString().includes('"attempts":1'))||(stage==='adopt'&&alias==='zhiyun-official-session-v2'))){
    blocked=true;entered.resolve();await gate.promise;
   }
  };
  f.events.length=0;const task=f.coordinator.recover(true,known());await entered.promise;
  f.coordinator.cancel();gate.resolve();await assert.rejects(task);
  assert.equal(f.events.includes('CONFIRM'),false);assert.equal(f.row().attempts,1);
  assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=old');
  assert.equal(f.state.posts,stage==='reserve'?1:2);assert.equal(f.coordinator.isActive(),false);
 }
});
test('cancellation racing final confirm asset write rolls back attempts=0',async()=>{
 const f=fixture();await enroll(f);const gate=deferred(),entered=deferred();let blocked=false;
 f.state.beforeWrite=async(alias,bytes)=>{
  if(!blocked&&alias==='zhiyun-official-login-v2'&&JSON.parse(Buffer.from(bytes).toString()).attempts===0){
   blocked=true;entered.resolve();await gate.promise;
  }
 };
 const task=f.coordinator.recover(true,known());await entered.promise;f.coordinator.cancel();gate.resolve();
 await assert.rejects(task);assert.equal(f.row().attempts,1);
 assert.equal(await f.store.reserve(known(),f.store.generation()),undefined);
});
test('cancellation racing account metadata persistence restores the previous record or removes the late first write',async()=>{
 for(const previous of [false,true]){
  const f=fixture();await enroll(f);
  if(previous)await f.sessions.rememberAccount({...known(),name:'previous metadata'});
  const gate=deferred(),entered=deferred();let blocked=false;
  f.state.beforeWrite=async alias=>{
   if(!blocked&&alias==='zhiyun-official-session-v2-account'){blocked=true;entered.resolve();await gate.promise}
  };
  f.events.length=0;const pending=f.coordinator.recover(true,known());await entered.promise;
  f.coordinator.cancel();gate.resolve();await assert.rejects(pending);
  const saved=await f.sessions.savedAccount();
  assert.equal(saved?.name,previous?'previous metadata':undefined);
  assert.equal(f.events.includes('CONFIRM'),false);assert.equal(f.row().attempts,1);
 }
});
for(const which of ['credential','session','UI']){
 test('final pre-dispatch guard blocks '+which+' generation change during last captcha GET',async()=>{
  const f=fixture();await enroll(f);let count=0,current=true;
  f.state.requestHook=target=>{
   if(target.endsWith('/getKaptchaStatus')&&++count===2){
    if(which==='credential')f.store.invalidate();else if(which==='session')f.sessions.invalidate();else current=false;
   }
  };
  await assert.rejects(f.coordinator.recover(true,known(),()=>current));
  assert.equal(f.state.posts,1);assert.equal(f.row().attempts,1);
 });
}
test('single in-flight coordinator rejects simultaneous enrollment/recovery',async()=>{
 const f=fixture(),gate=deferred(),entered=deferred();
 f.state.requestHook=async()=>{entered.resolve();await gate.promise};
 const first=enroll(f);await entered.promise;
 await assert.rejects(enroll(f),category(f,'BUSY'));await assert.rejects(f.coordinator.recover(true,known()),category(f,'BUSY'));
 f.coordinator.cancel();gate.resolve();await assert.rejects(first);assert.equal(f.state.posts,0);
});
test('explicit UI offline demo exercises the same coordinator and NativeCas without RCP/assets',async()=>{
 const f=fixture(),{NativeLoginDemo}=f.load('services/NativeLoginDemo');
 const result=await new NativeLoginDemo().exercise(false);assert.match(result,/纯离线演练通过/);
 assert.match(result,/RECOVER_RESERVE → POST → ADOPT → ACCOUNT → CONFIRM/);
 const captcha=await new NativeLoginDemo().exercise(true);assert.match(captcha,/验证码/);assert.doesNotMatch(captcha,/CONFIRM/);
 assert.equal(f.records.size,0);assert.equal(f.state.rcp,0);
});
test('unknown exception text is never shown by the native UI',()=>{
 const f=fixture();assert.doesNotMatch(f.n.nativeLoginMessage(Error('PASSWORD_COOKIE_TICKET_SECRET')),/PASSWORD_COOKIE/);
 assert.match(f.n.nativeLoginMessage(new f.n.NativeLoginFailure(f.n.NativeLoginError.DISABLED)),/开关关闭/);
});

function uiFixture(f,names=['tick','recoverNativeSession']) {
 const source=fs.readFileSync(path.join(root,'pages/Index.ets'),'utf8');
 const methods=names.map(name=>{
  let start=source.indexOf('  private async '+name+'(');if(start<0)start=source.indexOf('  private '+name+'(');
  assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n  }',start)+4);
 }).join('\n');
 const z=f.load('services/Zhiyun'),exports={};
 vm.runInNewContext(ts.transpileModule('export class UI {\n'+methods+'\n}',{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports,AuthenticationExpired:z.AuthenticationExpired,AccessDenied:z.AccessDenied,nativeLoginMessage:f.n.nativeLoginMessage,
   OfficialLoginStore:f.store,SessionStore:f.sessions,NativeAccountAcceptance:f.acceptance,nativeLoginEnabled:f.n.nativeLoginEnabled,
   KnowledgeJobs:{cancel(){}},webview:{WebCookieManager:{clearAllCookiesSync(){}}},
   Date,Math,Number,Promise,setTimeout,clearTimeout,copyStringMap:x=>({...x})});
 const p=new exports.UI();
 Object.assign(p,{account:known(),foreground:true,privacyAccepted:true,authEpoch:0,generation:1,failureCount:0,screen:'home',catalogAt:0,
  nativeRecoveryBlocked:false,nativeRecoveryBusy:false,credentialBusy:false,downloadScopeRefresh:0,nativeLogin:f.coordinator,
  api:{cancel(){},courses:async()=>[],cachedPermissions:()=>({}),refreshToday:async()=>{},permissions:async()=>{}},
  initializeStore(account){this.initializedScope=account.tenantId+':'+account.id},refreshLibrary(){this.refreshedLibrary=true},
  refreshCredentialStatus(){},schedule(delay){this.scheduled=delay}});
 return {p,z};
}
test('only typed classroom 401 triggers the Index native coordinator, updates scope and refreshes promptly',async()=>{
 const f=fixture();await enroll(f);const {p,z}=uiFixture(f);
 p.api.courses=async()=>{throw new z.AuthenticationExpired(true)};
 await p.tick();assert.equal(f.state.posts,2);assert.equal(p.initializedScope,'112:fixture-id');
 assert.equal(p.refreshedLibrary,true);assert.equal(p.downloadScopeRefresh,1);assert.equal(p.scheduled,100);
 assert.equal(p.account.username,'canonical-user');assert.equal(p.nativeRecoveryBlocked,true);
 await p.tick();assert.equal(f.state.posts,2);assert.match(p.message,/不会再次提交密码/);
 // Only a normal successful authenticated refresh permits a later expiry episode.
 p.api.courses=async()=>[];await p.tick();assert.equal(p.nativeRecoveryBlocked,false);
 p.catalogAt=0;p.api.courses=async()=>{throw new z.AuthenticationExpired(true)};
 await p.tick();assert.equal(f.state.posts,3);
});
test('network errors, 403, generic login-looking messages and interactive 401 never invoke native recovery',async()=>{
 for(const kind of ['network','403','login-text','interactive']){
  const f=fixture();await enroll(f);const {p,z}=uiFixture(f);
  const error=kind==='403'?new z.AccessDenied('permission'):kind==='interactive'?new z.AuthenticationExpired(false):Error(kind==='login-text'?'登录失效，请重新登录':'network');
  p.api.courses=async()=>{throw error};await p.tick();
  assert.equal(f.state.posts,1);assert.equal(p.nativeRecoveryBlocked,false);assert.equal(f.row().attempts,0);
  assert.equal(p.account.id,'fixture-id');
 }
});
test('Index ignores late native results after account switch or background epoch change',async()=>{
 for(const change of ['account','background']){
  const f=fixture();await enroll(f);const {p}=uiFixture(f,['recoverNativeSession']);
  const gate=deferred(),entered=deferred();
  f.state.requestHook=async target=>{if(target.endsWith('/infosimple')){entered.resolve();await gate.promise}};
  const pending=p.recoverNativeSession();await entered.promise;
  if(change==='account')p.account={...known(),id:'other'};else{p.foreground=false;p.authEpoch++;f.coordinator.cancel()}
  gate.resolve();assert.equal(await pending,false);assert.equal(p.initializedScope,undefined);
  assert.equal(f.events.includes('ADOPT'),false);assert.equal(f.row().attempts,1);
 }
});
test('actual API errors tag classroom vs interactive 401 and keep 403/network separate',async()=>{
 for(const status of [401,403,0]){
  const network={http:{RequestMethod:{GET:'GET',POST:'POST'},HttpDataType:{STRING:1},createHttp:()=>({
   request:async()=>{if(!status)throw Error('synthetic network');return {responseCode:status,result:'{}'}},destroy(){}
  })}};
  const f=fixture({network}),{Zhiyun,AuthenticationExpired,AccessDenied}=f.load('services/Zhiyun'),api=new Zhiyun();
  for(const origin of ['https://classroom.zju.edu.cn','https://interactivemeta.cmc.zju.edu.cn']){
   await assert.rejects(api.request('/fixture','',origin),error=>{
    if(status===401)return error instanceof AuthenticationExpired&&error.classroom===(origin==='https://classroom.zju.edu.cn');
    if(status===403)return error instanceof AccessDenied;
    return !(error instanceof AuthenticationExpired);
   });
  }
 }
});
test('offline exercise has a registered visible menu, no auto-start and cancellation-safe UI',()=>{
 const routes=JSON.parse(fs.readFileSync(path.join(root,'../resources/base/profile/main_pages.json'),'utf8'));
 assert.ok(routes.src.includes('pages/NativeLoginExercise'));
 const menu=fs.readFileSync(path.join(root,'components/PrivacyPage.ets'),'utf8'),page=fs.readFileSync(path.join(root,'pages/NativeLoginExercise.ets'),'utf8'),index=fs.readFileSync(path.join(root,'pages/Index.ets'),'utf8');
 assert.match(menu,/开发测试：原生保存与重登离线演练/);assert.match(menu,/url: 'pages\/NativeLoginExercise'/);
 assert.match(page,/demo\.exercise\(captcha\)/);assert.doesNotMatch(page,/aboutToAppear|onPageShow|TextInput|asset\.|new NativeCas/);
 assert.match(page,/onPageHide.*cancel/);assert.match(page,/epoch === this\.epoch/);
 assert.match(index,/Button\('原生验证与保存账号'\)/);assert.doesNotMatch(index,/ArkWebIsolatedLogin|isolatedMounted/);
 assert.match(index,/this\.nativeLogin\?\.cancel/);
});

function acceptanceFixture(options={}){return fixture({credentialsEnabled:false,realTransport:true,...options})}
function grant(f){const a=known();f.acceptance.grant(a.id,a.tenantId,a.username,true)}
test('per-launch native permission gates real coordinator, Asset and CasHttps before any POST',async()=>{
 const f=acceptanceFixture();assert.equal(f.acceptance.enabled(),false);assert.equal(f.n.nativeLoginEnabled(),false);
 await assert.rejects(enroll(f),category(f,'DISABLED'));await assert.rejects(f.coordinator.recover(true,known()),category(f,'DISABLED'));
 assert.equal(await f.store.reserve(known(),f.store.generation()),undefined);
 await assert.rejects(f.store.reserveEnrollment(f.store.generation()));
 await assert.rejects(f.store.saveVerified(typed(),known(),known(),true,f.store.generation()));
 await assert.rejects(f.store.confirm(known(),known(),f.store.generation()));
 const t=new f.cas.CasHttps();await assert.rejects(t.request(f.cas.LOGIN,'POST','SYNTHETIC',''));
 assert.equal(f.state.posts,0);assert.equal(f.state.created,0);assert.equal(f.records.size,0);t.close();
 for(const args of [['fixture-id',112,'canonical-user',false],['',112,'canonical-user',true],['fixture-id',112,'',true]])
  assert.throws(()=>f.acceptance.grant(...args));
 assert.equal(f.acceptance.enabled(),false);
});
test('native grant enables actual transport and actual Asset implementation, but enrollment remains one-shot',async()=>{
 const f=acceptanceFixture();grant(f);assert.equal(f.n.nativeLoginEnabled(),true);
 await enroll(f);assert.equal(f.state.posts,1);assert.equal(f.state.rcp,1);assert.equal(f.row().attempts,0);
 assert.equal(f.acceptance.enrollmentAvailable(),false);assert.throws(()=>grant(f));
 await assert.rejects(enroll(f));assert.equal(f.state.posts,1);
 await f.coordinator.recover(true,known());assert.equal(f.state.posts,2);assert.equal(f.row().attempts,0);
 assert.equal(f.events.filter(x=>x==='RESERVE').length,1);
});
test('native permission is identity-bound and cannot upgrade an existing anonymous or revoked transport',async()=>{
 const f=acceptanceFixture(),before=new f.cas.CasHttps();grant(f);
 assert.throws(()=>before.authorizeIdentity(known()));await assert.rejects(before.request(f.cas.LOGIN,'POST','SYNTHETIC',''));
 const current=new f.cas.CasHttps();assert.throws(()=>current.authorizeIdentity({...known(),username:'other'}));
 current.authorizeIdentity(known());f.acceptance.revoke();grant(f);
 await assert.rejects(current.request(f.cas.LOGIN,'POST','SYNTHETIC',''));
 assert.equal(await f.store.reserve({...known(),id:'other'},f.store.generation()),undefined);
 assert.equal(f.state.posts,0);before.close();current.close();
});
test('native enrollment page opening grants nothing and requires explicit checkbox plus manually entered password',async()=>{
 const f=acceptanceFixture(),{p}=uiFixture(f,['openCredentialDialog','openNativeAcceptance','enrollCredential']);
 p.demo=false;p.credentialEpoch=0;p.makeCredentialFlow=()=>f.coordinator;
 p.openNativeAcceptance();assert.equal(p.credentialTest,true);assert.equal(p.credentialConsent,false);
 assert.equal(p.credentialPassword,'');assert.equal(f.acceptance.enabled(),false);assert.equal(f.state.rcp,0);
 p.credentialUser=typed().username;p.credentialPassword=typed().password;await p.enrollCredential();
 assert.equal(f.state.posts,0);assert.equal(f.acceptance.enabled(),false);
 p.credentialConsent=true;await p.enrollCredential();
 assert.equal(f.state.posts,1);assert.equal(f.row().attempts,0);assert.equal(p.credentialPassword,'');
 p.credentialConsent=true;p.credentialPassword=typed().password;await p.enrollCredential();assert.equal(f.state.posts,1);
});
test('offline/demo identity cannot grant native acceptance through the production UI',async()=>{
 const f=acceptanceFixture(),{p}=uiFixture(f,['openCredentialDialog','openNativeAcceptance','enrollCredential']);
 p.demo=true;p.openNativeAcceptance();assert.notEqual(p.credentialDialog,true);
 p.credentialDialog=true;p.credentialTest=true;p.credentialConsent=true;p.credentialUser=typed().username;p.credentialPassword=typed().password;
 await p.enrollCredential();assert.equal(f.acceptance.enabled(),false);assert.equal(f.state.posts,0);
});
test('restart/upgrade closes native permission even when saved passwords and consent survive',async()=>{
 const f=acceptanceFixture();grant(f);await enroll(f);
 const restarted=acceptanceFixture({records:f.records});
 assert.equal(restarted.acceptance.enabled(),false);assert.equal(restarted.row().attempts,0);
 await assert.rejects(restarted.coordinator.recover(true,known()),category(restarted,'DISABLED'));
 assert.equal(restarted.state.posts,0);assert.equal(restarted.state.rcp,0);
});
test('native permission revocation while reserving, adopting or confirming blocks late writes and never restores password quota',async()=>{
 for(const stage of ['reserve','adopt','account','confirm']){
  const f=acceptanceFixture();grant(f);await enroll(f);const gate=deferred(),entered=deferred();let blocked=false;
  f.state.beforeWrite=async(alias,bytes)=>{
   const row=alias==='zhiyun-official-login-v2'?JSON.parse(Buffer.from(bytes).toString()):null;
   if(!blocked&&((stage==='reserve'&&row?.attempts===1)||(stage==='adopt'&&alias==='zhiyun-official-session-v2')||
    (stage==='account'&&alias==='zhiyun-official-session-v2-account')||(stage==='confirm'&&row?.attempts===0))){
    blocked=true;entered.resolve();await gate.promise;
   }
  };
  const pending=f.coordinator.recover(true,known());await entered.promise;
  // Permission change itself invalidates both stores, independent of UI timing.
  f.acceptance.revoke();gate.resolve();await assert.rejects(pending);
  assert.equal(f.acceptance.enabled(),false);assert.equal(f.row().attempts,1);
  assert.equal(f.state.posts,stage==='reserve'?1:2);
  await assert.rejects(f.coordinator.recover(true,known()),category(f,'DISABLED'));
 }
});
test('background cancellation keeps spent reservation across return and restart instead of silently rearming it',async()=>{
 const f=acceptanceFixture();grant(f);await enroll(f);const {p}=uiFixture(f,['recoverNativeSession']);
 const gate=deferred(),entered=deferred();f.state.requestHook=async target=>{if(target.endsWith('/infosimple')){entered.resolve();await gate.promise}};
 const pending=p.recoverNativeSession();await entered.promise;p.foreground=false;p.authEpoch++;f.coordinator.cancel();
 gate.resolve();assert.equal(await pending,false);assert.equal(f.row().attempts,1);assert.equal(f.acceptance.enabled(),true);
 p.foreground=true;assert.equal(await f.coordinator.recover(true,known()),undefined);assert.equal(f.state.posts,2);
 const restarted=acceptanceFixture({records:f.records});assert.equal(restarted.acceptance.enabled(),false);
 assert.equal(restarted.row().attempts,1);
 f.acceptance.revoke();grant(f);assert.equal(await f.coordinator.recover(true,known()),undefined);assert.equal(f.row().attempts,1);
});
test('actual native dialog cancel/background revokes an in-flight grant and cannot save late credentials',async()=>{
 for(const background of [false,true]){
  const f=acceptanceFixture(),{p}=uiFixture(f,['enrollCredential','closeCredentialDialog']);
  Object.assign(p,{demo:false,credentialEpoch:0,credentialDialog:true,credentialTest:true,credentialConsent:true,
   credentialUser:typed().username,credentialPassword:typed().password,makeCredentialFlow:()=>f.coordinator});
  const gate=deferred(),entered=deferred();
  f.state.requestHook=async target=>{if(target.endsWith('/infosimple')){entered.resolve();await gate.promise}};
  const pending=p.enrollCredential();await entered.promise;
  if(background){p.foreground=false;p.authEpoch++}
  const closing=p.closeCredentialDialog();gate.resolve();await pending;await closing;
  assert.equal(f.acceptance.enabled(),false);assert.equal(p.credentialPassword,'');
  assert.equal(f.records.has('zhiyun-official-login-v2'),false);
  assert.equal(f.records.has('zhiyun-official-login-enrollment-rate-v1'),true);
  assert.equal(f.state.posts,1);
 }
});
test('actual logout/account-switch path revokes native permission before late recovery can update the new account',async()=>{
 const f=acceptanceFixture();grant(f);await enroll(f);
 const {p}=uiFixture(f,['recoverNativeSession','logout']);
 Object.assign(p,{credentialEpoch:0,collections:{bind(){}},web:{loadUrl(){}},closeMedia(){},stop(){}});
 p.api.usePermissionStorage=()=>{};
 const gate=deferred(),entered=deferred();
 f.state.requestHook=async target=>{if(target.endsWith('/infosimple')){entered.resolve();await gate.promise}};
 const pending=p.recoverNativeSession();await entered.promise;
 const leaving=p.logout();assert.equal(f.acceptance.enabled(),false);
 gate.resolve();await leaving;assert.equal(await pending,false);
 assert.equal(p.account,undefined);assert.equal(p.initializedScope,undefined);assert.equal(p.authCleanupFailed,false);
 assert.equal(f.records.has('zhiyun-official-login-v2'),false);assert.equal(f.events.includes('ADOPT'),false);
});
test('native acceptance menu is not a web switch, lifecycle revokes permission and startup resets it',()=>{
 const index=fs.readFileSync(path.join(root,'pages/Index.ets'),'utf8'),privacy=fs.readFileSync(path.join(root,'components/PrivacyPage.ets'),'utf8');
 const ability=fs.readFileSync(path.join(root,'entryability/EntryAbility.ets'),'utf8');
 const permission=fs.readFileSync(path.join(root,'services/NativeAccountAcceptance.ets'),'utf8');
 assert.match(privacy,/Button\('原生账号验收（测试）'\)/);assert.match(index,/Checkbox\(\{ name: 'native-account-acceptance'/);
 assert.match(index,/private async logout[\s\S]*?NativeAccountAcceptance\.revoke/);assert.match(ability,/onCreate[\s\S]*?NativeAccountAcceptance\.revoke/);
 assert.doesNotMatch(permission,/\basset\b|preferences|AppStorage\./);
 const bridgeStart=index.indexOf('private async assistantExecute(');assert.ok(bridgeStart>0);
 const bridge=index.slice(bridgeStart,index.indexOf('\n  }',bridgeStart)+4);
 assert.doesNotMatch(bridge,/NativeAccountAcceptance\.grant/);
 assert.equal((index.match(/NativeAccountAcceptance\.grant/g)||[]).length,1);
});

async function coldCookie(f){
 const cold=fixture({records:f.records});await cold.sessions.restore();
 return cold.sessions.cookie('https://classroom.zju.edu.cn');
}
test('successful recovery publishes current synchronously only after metadata, confirm and final manifest commit',async()=>{
 const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());f.events.length=0;
 const complete=f.sessionPort.completeAdoption.bind(f.sessionPort);
 f.sessionPort.completeAdoption=receipt=>{
  assert.equal(f.row().attempts,0);assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
  assert.equal(JSON.parse(Buffer.from(f.records.get('zhiyun-official-session-v2')).toString()).pending,false);
  assert.equal(JSON.parse(Buffer.from(f.records.get('zhiyun-official-session-v2-account')).toString()).id,known().id);
  complete(receipt);f.events.push('PUBLISH');
  assert.match(f.sessions.cookie('https://classroom.zju.edu.cn'),/session=fixture/);
 };
 await f.coordinator.recover(true,known());f.events.push('RETURN');
 let at=-1;for(const label of ['ADOPT','ACCOUNT','CONFIRM','PUBLISH','RETURN']){
  const next=f.events.indexOf(label);assert.ok(next>at,label);at=next;
 }
 assert.equal(JSON.parse(Buffer.from(f.records.get('zhiyun-official-session-v2')).toString()).pending,false);
 assert.match(await coldCookie(f),/session=fixture/);
});
for(const stage of ['account','confirm']){
 test('transaction cancellation during '+stage+' retracts persisted cookie and metadata, including a cold restore',async()=>{
  const f=fixture();await enroll(f);
  await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
  await f.sessions.rememberAccount({...known(),name:'prior metadata'});
  const gate=deferred(),entered=deferred();let blocked=false;
  f.state.beforeWrite=async(alias,bytes)=>{
   if(!blocked&&((stage==='account'&&alias==='zhiyun-official-session-v2-account')||
    (stage==='confirm'&&alias==='zhiyun-official-login-v2'&&JSON.parse(Buffer.from(bytes).toString()).attempts===0))){
    blocked=true;entered.resolve();await gate.promise;
   }
  };
  const pending=f.coordinator.recover(true,known());await entered.promise;
  assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior','no early publication');
  assert.equal(JSON.parse(Buffer.from(f.records.get('zhiyun-official-session-v2')).toString()).pending,true);
  assert.equal(await coldCookie(f),'','unfinalized manifest must never cold-restore');
  f.coordinator.cancel();gate.resolve();await assert.rejects(pending);
  assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
  assert.equal(await coldCookie(f),'session=prior');assert.equal((await f.sessions.savedAccount()).name,'prior metadata');
  assert.equal(f.row().attempts,1);
 });
}
for(const failure of ['account','confirm','publish']){
 test('transaction '+failure+' failure compensates the exact adoption and leaves credentials disarmed',async()=>{
  for(const previous of [false,true]){
   const f=fixture();await enroll(f);
   if(previous)await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
   const previousManifest=f.records.get('zhiyun-official-session-v2');
   const previousAdoption=previousManifest?JSON.parse(Buffer.from(previousManifest).toString()).adoption:'';
   f.state.failWrite=(alias,bytes)=>{
    if(failure==='account')return alias==='zhiyun-official-session-v2-account';
    if(failure==='confirm')return alias==='zhiyun-official-login-v2'&&JSON.parse(Buffer.from(bytes).toString()).attempts===0;
    if(alias!=='zhiyun-official-session-v2')return false;
    const manifest=JSON.parse(Buffer.from(bytes).toString());
    return manifest.pending===false&&manifest.adoption!==previousAdoption;
   };
   await assert.rejects(f.coordinator.recover(true,known()),category(f,'STORAGE'));
   assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),previous?'session=prior':'');
   assert.equal(await coldCookie(f),previous?'session=prior':'');assert.equal(f.row().attempts,1);
  }
 });
}
test('cancellation racing the final publication manifest undoes confirmed quota and never restores cancelled cookies',async()=>{
 const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
 const gate=deferred(),entered=deferred();let blocked=false;
 f.state.beforeWrite=async(alias,bytes)=>{
  if(!blocked&&alias==='zhiyun-official-session-v2'&&JSON.parse(Buffer.from(bytes).toString()).pending===false){
   blocked=true;entered.resolve();await gate.promise;
  }
 };
 const pending=f.coordinator.recover(true,known());await entered.promise;
 assert.equal(f.row().attempts,0,'confirm completed, publication is still pending');
 assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
 f.coordinator.cancel();gate.resolve();await assert.rejects(pending);
 assert.equal(f.row().attempts,1);assert.equal(await coldCookie(f),'session=prior');
});
test('cancellation after final durable commit but before success publication restores the manifest without publishing current',async()=>{
 const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
 const commit=f.sessionPort.commitAdoption.bind(f.sessionPort);
 f.sessionPort.commitAdoption=async receipt=>{
  await commit(receipt);assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
  f.coordinator.cancel();
 };
 await assert.rejects(f.coordinator.recover(true,known()));
 assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
 assert.equal(await coldCookie(f),'session=prior');assert.equal(f.row().attempts,1);
});
test('failure after a committed final cookie manifest compensates session, metadata and already-confirmed quota',async()=>{
 const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
 await f.sessions.rememberAccount({...known(),name:'prior metadata'});
 const commit=f.sessionPort.commitAdoption.bind(f.sessionPort);
 f.sessionPort.commitAdoption=async receipt=>{
  await commit(receipt);
  assert.equal(JSON.parse(Buffer.from(f.records.get('zhiyun-official-session-v2')).toString()).pending,false);
  assert.equal(f.row().attempts,0);assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=prior');
  throw Error('synthetic post-commit storage failure');
 };
 await assert.rejects(f.coordinator.recover(true,known()),category(f,'STORAGE'));
 assert.equal(await coldCookie(f),'session=prior');assert.equal((await f.sessions.savedAccount()).name,'prior metadata');
 assert.equal(f.row().attempts,1);
});
test('old recovery rollback cannot erase a newer account session or its metadata',async()=>{
 const f=fixture();await enroll(f);await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
 const gate=deferred(),entered=deferred();let blocked=false;
 f.state.beforeWrite=async(alias,bytes)=>{
  if(!blocked&&alias==='zhiyun-official-login-v2'&&JSON.parse(Buffer.from(bytes).toString()).attempts===0){
   blocked=true;entered.resolve();await gate.promise;
  }
 };
 const pending=f.coordinator.recover(true,known());await entered.promise;f.coordinator.cancel();
 await f.sessions.adoptVerifiedCookie('session=new-account',f.sessions.generation());
 await f.sessions.rememberAccount({...known(),id:'new-account',name:'new account metadata'});
 gate.resolve();await assert.rejects(pending);
 assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),'session=new-account');
 assert.equal(await coldCookie(f),'session=new-account');assert.equal((await f.sessions.savedAccount()).id,'new-account');
});
test('receipt manifest identity defeats slot ABA and logout wins over stale rollback',async()=>{
 for(const logout of [false,true]){
  const f=fixture();await f.sessions.adoptVerifiedCookie('session=prior',f.sessions.generation());
  const receipt=await f.sessions.stageVerifiedCookie('session=cancelled',f.sessions.generation());
  f.sessions.invalidate();
  if(logout)await f.sessions.clear();
  else{
   await f.sessions.adoptVerifiedCookie('session=next',f.sessions.generation());
   await f.sessions.adoptVerifiedCookie('session=newest',f.sessions.generation());
  }
  await f.sessions.rollbackAdoption(receipt);
  assert.equal(f.sessions.cookie('https://classroom.zju.edu.cn'),logout?'':'session=newest');
  assert.equal(await coldCookie(f),logout?'':'session=newest');
 }
});
test('failed old publication compensation cannot disarm freshly verified replacement credentials',async()=>{
 const f=fixture();await enroll(f);
 const reservation=await f.store.reserve(known(),f.store.generation());await f.store.confirm(known(),known(),reservation.generation);
 await f.store.saveVerified({username:typed().username,password:'FRESH-SYNTHETIC'},known(),known(),true,f.store.generation());
 await f.store.disarm(known(),reservation.attemptId);
 assert.equal(f.row().attempts,0);assert.equal(f.row().password,'FRESH-SYNTHETIC');
});
