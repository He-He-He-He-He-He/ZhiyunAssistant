import test from 'node:test';import assert from 'node:assert/strict';import {AiClient} from '../src/shared/services/AiClient';
const course:any={courseId:'c',subId:'one',title:'测试课',teacher:'老师',room:'教室',start:1000,end:4600,status:'3'};
const slides:any[]=[{id:'p1',t:0,url:'https://example.invalid/slide.png'}], lines:any[]=[{id:'t1',t:3,text:'真实课堂原文'}];
function fakeStore(){const files=new Map<string,string>();let enabled=false,rev=0;return {activeCourse:course,imageVersion:()=>'',cache:{enabled:(kind:string)=>kind==='knowledge'?enabled:true,setEnabled:(_kind:string,value:boolean)=>{enabled=value;rev++},revision:()=>rev,read:(kind:string,c:any,name:string)=>files.get(kind+':'+c.subId+':'+name)||'',save:(kind:string,c:any,name:string,text:string,revision:number)=>{if(enabled&&revision===rev)files.set(kind+':'+c.subId+':'+name,text)},clear:()=>{rev++;files.clear()}}};}
test('knowledge cache is opt-in, reuses only matching source, and stops after a clear',async()=>{
 const original=AiClient.savedKey;AiClient.savedKey=async()=> 'synthetic-only';try{const store:any=fakeStore(),client:any=new AiClient(), material={course,slides,lines,gaps:[]};let calls=0;client.stream=async()=>{calls++;return {answer:'摘要：课堂知识',finishReason:'stop',calls:[]}};
 assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true),false);assert.equal(calls,0);
 store.cache.setEnabled('knowledge',true);assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true),true);assert.equal(calls,1);assert.match((await client.cachedKnowledge(store,material)).chunks[0].text,/摘要/);
 assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true),false);assert.equal(calls,1);assert.equal(await client.cachedKnowledge(store,{...material,lines:[{...lines[0],text:'改动原文'}]}),null);
 let release!:()=>void;client.stream=async()=>{await new Promise<void>(resolve=>{release=resolve});return {answer:'过期摘要',finishReason:'stop',calls:[]}};const pending=client.buildKnowledge(store,{...material,lines:[{...lines[0],text:'另一个版本'}]},'deepseek-flash',()=>true);while(!release)await new Promise(resolve=>setTimeout(resolve,0));store.cache.clear();release();assert.equal(await pending,false);assert.equal(await client.cachedKnowledge(store,material),null);
 }finally{AiClient.savedKey=original}
});
test('course answers reuse an index and can request original transcript; forced text-only does not use image-derived indexes',async()=>{
 const original=AiClient.savedKey;AiClient.savedKey=async()=> 'synthetic-only';try{const store:any=fakeStore(),client:any=new AiClient(),material={course,slides,lines,gaps:[]};store.cache.setEnabled('knowledge',true);client.stream=async()=>({answer:'索引摘要',finishReason:'stop',calls:[]});assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true),true);
 let requests:any[]=[];client.stream=async(_key:any,body:any)=>{requests.push(JSON.parse(JSON.stringify(body)));if(requests.length===1)return {answer:'',calls:[{id:'original',function:{name:'read_course_context',arguments:'{"scope":"whole"}'}}],finishReason:'tool_calls'};return {answer:'回答',calls:[],finishReason:'stop'}};
 await client.ask(store,slides,lines,'概括整节课',100,true,'deepseek-flash',[],()=>{},'auto','p1',()=>{},[],undefined,async()=>({slides,lines}));assert.match(JSON.stringify(requests[0].messages),/索引摘要/);assert.doesNotMatch(JSON.stringify(requests[0].messages),/真实课堂原文/);assert.match(JSON.stringify(requests[1].messages),/真实课堂原文/);
 requests=[];client.stream=async(_key:any,body:any)=>{requests.push(JSON.parse(JSON.stringify(body)));return {answer:'回答',calls:[],finishReason:'stop'}};await client.ask(store,slides,lines,'概括整节课',100,true,'deepseek-flash',[],()=>{},'never','p1');assert.match(JSON.stringify(requests[0].messages),/真实课堂原文/);assert.doesNotMatch(JSON.stringify(requests[0].messages),/索引摘要/);
 }finally{AiClient.savedKey=original}
});
test('cross-lesson indexes keep lesson numbering and can retrieve the original time-aligned transcript',async()=>{
 const original=AiClient.savedKey;AiClient.savedKey=async()=> 'synthetic-only';try{const store:any=fakeStore(),client:any=new AiClient(),previous={...course,subId:'earlier',start:100,end:900},priorLines=[{id:'old',t:5,text:'前序课原始详细讲解'}],material={course:previous,slides,lines:priorLines,gaps:[]};store.cache.setEnabled('knowledge',true);client.stream=async()=>({answer:'前序索引',finishReason:'stop',calls:[]});assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true),true);
 let sent:any[]=[];client.stream=async(_key:any,body:any)=>{sent.push(JSON.parse(JSON.stringify(body)));return sent.length===1?{answer:'',calls:[{id:'read',function:{name:'read_prior_transcript',arguments:'{"lesson":1,"pages":[1]}'}}],finishReason:'tool_calls'}:{answer:'回答',calls:[],finishReason:'stop'}};
 await client.ask(store,slides,lines,'联系前序课',20,false,'deepseek-flash',[],()=>{},'auto','p1',()=>{},[],{lessons:[material],gaps:[]});assert.match(JSON.stringify(sent[0].messages),/前序索引/);assert.doesNotMatch(JSON.stringify(sent[0].messages),/前序课原始详细讲解/);assert.match(JSON.stringify(sent[1].messages),/前序课原始详细讲解/);
 }finally{AiClient.savedKey=original}
});
test('transcript-only and vision-backed indexes stay separate and do not trigger unwanted image use',async()=>{
 const original=AiClient.savedKey;AiClient.savedKey=async()=> 'synthetic-only';try{const {key}=await import('../src/shared/services/LocalStore');const store:any=fakeStore(),client:any=new AiClient(),material={course,slides,lines,gaps:[]};store.cache.setEnabled('knowledge',true);store.imageVersion=()=> 'v1';store.cache.save('vision',course,'page-'+key(slides[0].url)+'.json',JSON.stringify({text:'图片中的图表',version:'v1'}),store.cache.revision());const inputs:string[]=[];
 client.stream=async(_key:any,body:any)=>{inputs.push(JSON.stringify(body.messages));return {answer:'摘要',finishReason:'stop',calls:[]}};
 assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true,false),true);assert.doesNotMatch(inputs[0],/图片中的图表/);
 assert.equal(await client.buildKnowledge(store,material,'deepseek-flash',()=>true,true),true);assert.match(inputs[1],/图片中的图表/);
 assert.equal((await client.cachedKnowledge(store,material,false)).recognized,0);assert.equal((await client.cachedKnowledge(store,material,true)).recognized,1);
 }finally{AiClient.savedKey=original}
});
