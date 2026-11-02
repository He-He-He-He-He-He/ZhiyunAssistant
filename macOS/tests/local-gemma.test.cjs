const test=require('node:test');const assert=require('node:assert/strict');const {runtime}=require('./runtime-helper.cjs');
test('selecting local Gemma only reads metadata; inference keeps its own model and history path',async()=>{
 const r=runtime();try{const {AIConnection}=await r.load('ai-connection.js');const prefs={aiProvider:'local'},calls=[];
 const c=new AIConnection({call:async action=>{calls.push(action);if(action==='aiStatus')return{personalReady:true};if(action==='localAIStatus')return{localReady:true,localModels:['qwen3.8:27b']};throw Error('unexpected inference');}},()=>prefs);
 assert.equal(await c.refresh(),true);assert.equal(c.effective(),'local');assert.deepEqual(calls,['aiStatus','localAIStatus']);assert.equal(c.request().localModel,'qwen3.8:27b');assert.match(c.description(),/5 分钟/);
 prefs.aiProvider='personal';assert.equal(c.effective(),'personal');assert.equal(c.request().localModel,undefined);
 }finally{r.win.close();}
});
test('local choices remain available while the service is off and metadata preserves unknown legacy preferences',async()=>{
 const r=runtime();try{const {AIConnection}=await r.load('ai-connection.js'),prefs={aiProvider:'retired-provider',agentModel:'deepseek-v4-pro'},calls=[];
 const c=new AIConnection({call:async action=>{calls.push(action);if(action==='aiStatus')return{personalReady:true};if(action==='localAIStatus')return{localReady:true,localModels:[]};throw Error('unexpected operation');}},()=>prefs);
 const before=JSON.stringify(prefs);await c.refresh();assert.equal(JSON.stringify(prefs),before);assert.equal(c.request().provider,'auto');assert.equal(c.request().localModel,undefined);
 assert.deepEqual(Array.from(c.localModels(),row=>row[0]),['qwen3.8:27b','qwen3.8-uncensored:27b']);assert.equal(c.localModel(),'qwen3.8:27b');assert.equal(prefs.localModel,undefined);
 prefs.aiProvider='local';await c.refresh();assert.deepEqual(calls,['aiStatus','aiStatus','localAIStatus']);assert.equal(c.request().localModel,'qwen3.8:27b');assert.equal(prefs.localModel,undefined);
 c.status.localModels=['qwen3.8:27b','gemma3:12b','unrelated:7b','qwen3.8:27b'];assert.equal(c.localModels().filter(row=>row[0]==='qwen3.8:27b').length,1);assert.ok(c.localModels().some(row=>row[0]==='gemma3:12b'));assert.ok(!c.localModels().some(row=>row[0]==='unrelated:7b'));
 }finally{r.win.close();}
});
test('course and agent selectors persist only an explicit local choice and share the submitted model',async t=>{
 const r=runtime({extraTestingNames:['aiProviderChoices','aiConnection','streamAI','getGlobalAssistant'],replies:{aiStatus:{personalReady:true},localAIStatus:{localReady:true,localModels:[]},ai:{answer:'synthetic'}}});
 const a=(await r.load('app.js')).testing;a.setup();a.put({prefs:{aiProvider:'local',agentModel:'deepseek-v4-pro'}});const assistant=a.getGlobalAssistant();t.after(()=>{assistant.reset();a.cleanup();r.win.close();});
 const course=a.aiProviderChoices();r.win.document.body.append(course);assert.equal(course.querySelector('[aria-label="本地模型"]').value,'qwen3.8:27b');assert.equal(a.state().prefs.localModel,undefined);assert.equal(r.calls.filter(([action])=>action==='write').length,0);
 const courseModel=course.querySelector('[aria-label="本地模型"]');courseModel.value='qwen3.8:27b';courseModel.dispatchEvent(new r.win.Event('change'));await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(JSON.parse(r.data.get('prefs.json')).localModel,'qwen3.8:27b');assert.equal(a.state().prefs.agentModel,'deepseek-v4-pro');assert.equal(r.calls.filter(([action])=>action==='ai').length,0);
 await a.streamAI([{role:'user',content:'synthetic course'}],()=>{});await assistant.options.stream([{role:'user',content:'synthetic agent'}],()=>{},[],()=>{});
 const requests=r.calls.filter(([action])=>action==='ai').map(([,payload])=>payload);assert.equal(requests.length,2);assert.ok(requests.every(row=>row.provider==='local'&&row.localModel==='qwen3.8:27b'));
 await assistant.show();await assistant.settings();const local=assistant.log.querySelector('[aria-label="本地模型"]');assert.equal(local.value,'qwen3.8:27b');assert.equal(local.closest('label').hidden,false);local.value='qwen3.8-uncensored:27b';local.dispatchEvent(new r.win.Event('change'));await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(JSON.parse(r.data.get('prefs.json')).localModel,'qwen3.8-uncensored:27b');assert.equal(a.aiConnection.request().localModel,'qwen3.8-uncensored:27b');assert.equal(r.calls.filter(([action])=>action==='ai').length,2);
 const source=assistant.log.querySelector('[aria-label="AI服务来源"]');source.value='personal';source.dispatchEvent(new r.win.Event('change'));await new Promise(resolve=>setTimeout(resolve,5));assert.equal(local.closest('label').hidden,true);assert.equal(a.aiConnection.request().localModel,undefined);assert.equal(assistant.log.querySelector('[aria-label="助手模型"]').value,'deepseek-v4-pro');
});
