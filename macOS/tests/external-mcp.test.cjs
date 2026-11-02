const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),readline=require('node:readline');
test('MCP stdio lists tools, exchanges a request with the app, and rejects disabled access',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'zhiyun-mcp-')),root=path.join(home,'Library/Application Support/智云助手 展示版/ExternalAgent');fs.mkdirSync(root,{recursive:true,mode:0o700});
 const child=spawn('/usr/bin/python3',['scripts/zhiyun_mcp.py'],{env:{...process.env,HOME:home}});const lines=readline.createInterface({input:child.stdout});const waiting=[];lines.on('line',line=>waiting.shift()?.(JSON.parse(line)));
 const send=(id,method,params={})=>new Promise(resolve=>{waiting.push(resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 try{
  assert.equal((await send(1,'initialize')).result.serverInfo.name,'zhiyun-assistant');assert.equal((await send(2,'tools/list')).result.tools.length,4);
  assert.equal((await send(3,'tools/call',{name:'zhiyun_state'})).result.isError,true);
  fs.writeFileSync(path.join(root,'enabled'),'');
  const responder=setInterval(()=>{for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.request'))){const request=JSON.parse(fs.readFileSync(path.join(root,name)));fs.unlinkSync(path.join(root,name));fs.writeFileSync(path.join(root,request.id+'.response'),JSON.stringify({result:{page:'fixture'},error:null}));}},10);
  const response=await send(4,'tools/call',{name:'zhiyun_state',arguments:{}});clearInterval(responder);assert.deepEqual(JSON.parse(response.result.content[0].text),{page:'fixture'});
 }finally{child.kill();lines.close();fs.rmSync(home,{recursive:true,force:true});}
});
test('web bridge enables via privacy, dispatches registered action, and disables cleanly',async()=>{
 const {runtime}=require('./runtime-helper.cjs');const r=runtime({extraTestingNames:['privacy','pollExternalAgent']});const original=r.win.native.call.bind(r.win.native),requests=[],replies=[];
 r.win.native.call=(action,params={})=>{if(action==='externalAgentStatus')return Promise.resolve(false);if(action==='externalAgentEnable')return Promise.resolve(true);if(action==='externalAgentNext')return Promise.resolve(requests.shift()||null);if(action==='externalAgentReply'){replies.push(params);return Promise.resolve(true)}return original(action,params)};
 const app=(await r.load('app.js')).testing;app.setup();app.privacy();await new Promise(resolve=>setTimeout(resolve,10));
 const find=label=>[...r.win.document.querySelectorAll('button')].find(n=>n.textContent===label);
 try{find('开启接口').click();await new Promise(resolve=>setTimeout(resolve,10));requests.push({id:'a'.repeat(32),method:'actions',params:{}});await app.pollExternalAgent();assert.ok(replies[0].result.some(a=>a.name==='list_lessons'));assert.equal(r.win.document.querySelector('#external-agent-status').textContent,'接口已开启');}
 finally{find('关闭接口').click();await new Promise(resolve=>setTimeout(resolve,10));app.cleanup();r.win.close();}
});
