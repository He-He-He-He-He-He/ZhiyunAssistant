const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('./runtime-helper.cjs');
const load=()=>import('../web/smart-skip-local.js');
test('fragmented multi-utterance chatter is applied without requiring 95 percent confidence',async()=>{
 const {skipRangesForPage}=await load();
 const lines=[{id:'a',t:10,end:12,text:'那边放着。'},{id:'b',t:13,end:17,text:'我这不用。'},{id:'c',t:18,end:22,text:'嗯那个行吧。'}];
 const ranges=skipRangesForPage({slide:{id:'p',t:0},lines},25,{spans:[{ids:['a','b','c'],kind:'chatter',confidence:.78,reason:'课间零散口语，与课程无关'}]});
 assert.equal(ranges.length,1);assert.equal(ranges[0].start,10);assert.equal(ranges[0].end,25);
});
test('mixed spans retain useful instruction but remove confirmed chatter on each side',async()=>{
 const {skipRangesForPage}=await load();const lines=[{id:'a',t:0,end:5,text:'闲聊'},{id:'b',t:5,end:10,text:'作业周五提交'},{id:'c',t:10,end:15,text:'闲聊'}];
 const ranges=skipRangesForPage({slide:{id:'p',t:0},lines},20,{spans:[{ids:['a','b','c'],kind:'chatter',confidence:.99,reason:'课间闲聊'}]});
 assert.deepEqual(ranges.map(r=>[r.start,r.end,r.ids]),[[0,5,['a']],[10,20,['c']]]);
 assert.deepEqual(skipRangesForPage({slide:{id:'p',t:0},lines},20,{spans:[{ids:['a','c'],kind:'chatter',confidence:1,reason:'闲聊'}]}),[]);
});
test('short ambiguous replies are preserved and current playback is processed first',async()=>{
 const {skipRangesForPage,skipPageOrder}=await load();
 assert.deepEqual(skipRangesForPage({slide:{id:'p',t:0},lines:[{id:'a',t:0,end:10,text:'对的'}]},20,{spans:[{ids:['a'],kind:'noise',confidence:.8,reason:'零散口语'}]}),[]);
 assert.deepEqual(skipPageOrder([0,30,60,90].map(t=>({slide:{t}})),65),[2,3,0,1]);
});
test('cached current-page skip immediately filters transcript and seeks the actual player',async t=>{
 const r=runtime({extraTestingNames:['toggleSmartSkip','regroup','renderTranscript','renderSlides','buildVideo']});const app=(await r.load('app.js')).testing;app.setup();t.after(()=>{app.cleanup();r.dom.window.close()});await app.enter(r.current);
 const lines=[{id:'a',t:60,end:65,text:'那边放着。'},{id:'b',t:66,end:70,text:'我这不用。'},{id:'c',t:71,end:75,text:'嗯那个行吧。'}];
 app.put({slides:[{id:'p0',t:0,url:'https://cmc.zju.edu.cn/0.png'},{id:'p1',t:60,url:'https://cmc.zju.edu.cn/1.png'},{id:'p2',t:90,url:'https://cmc.zju.edu.cn/2.png'}],lines:[...lines,{id:'useful',t:90,end:3600,text:'这是概念讲解'}],at:65,index:1,apiReady:true,prefs:{duplicates:false,skip:false,count:1}});app.regroup();app.renderSlides();app.renderTranscript();const host=r.win.document.createElement('div');r.win.document.body.append(host);app.buildVideo(host);
 // The player belongs to the pane created by the builder.
 const player=r.win.document.querySelector('video');player.src='https://cmc.zju.edu.cn/test.mp4';Object.defineProperty(player,'duration',{value:3600});player.currentTime=65;
 const {skipAnalysisGroups}=await load();for(const g of skipAnalysisGroups(app.state().lines,3600)){const data=g.lines.some(l=>l.id==='a')?{spans:[{ids:lines.map(l=>l.id),kind:'chatter',confidence:.78,reason:'课间零散口语'}]}:{spans:[]};r.data.set('skip-course-lesson-'+g.slide.id+'.json',JSON.stringify({version:JSON.stringify(g.lines.map(l=>[l.id,l.t,l.end,l.text])),data}));}
 await app.toggleSmartSkip();
 assert.equal(r.win.document.querySelectorAll('.caption-line').length,0);assert.equal(player.currentTime,90);
 assert.equal(r.calls.filter(([a])=>a==='ai').length,0);
 await app.toggleSmartSkip();assert.equal(r.win.document.querySelectorAll('.caption-line').length,3);
});
test('timeline analysis includes opening speech before first PPT and lessons without PPT',async()=>{
 const {skipAnalysisGroups}=await load();
 const lines=[{id:'intro',t:16,end:30,text:'麦克风测试'},{id:'opening',t:181,end:200,text:'请打开投影'},{id:'teaching',t:324,end:340,text:'概念讲解'}];
 const groups=skipAnalysisGroups(lines,600);
 assert.equal(groups[0].slide.t,0);assert.deepEqual(groups.flatMap(g=>g.lines.map(l=>l.id)),['intro','opening','teaching']);
 assert.equal(groups[1].slide.t,181);assert.deepEqual(skipAnalysisGroups([],600),[]);
});
test('confirmed opening chatter skips the player even when no screenshot existed yet',async t=>{
 const r=runtime({extraTestingNames:['toggleSmartSkip','regroup','renderTranscript','buildVideo']});const app=(await r.load('app.js')).testing;app.setup();t.after(()=>{app.cleanup();r.dom.window.close()});await app.enter(r.current);
 const lines=[{id:'setup1',t:16,end:33,text:'麦克风测试'},{id:'setup2',t:40,end:55,text:'投影好了'}, {id:'lesson',t:324,end:3600,text:'这是概念讲解'}];
 app.put({slides:[{id:'late',t:269,url:'https://cmc.zju.edu.cn/late.png'}],lines,at:9,index:0,apiReady:true,prefs:{duplicates:false,skip:false}});app.regroup();app.renderTranscript();
 assert.match(r.win.document.querySelector('#transcriptBody').textContent,/麦克风测试/);
 const host=r.win.document.createElement('div');r.win.document.body.append(host);app.buildVideo(host);const player=host.querySelector('video');player.src='https://cmc.zju.edu.cn/test.mp4';Object.defineProperty(player,'duration',{value:3600});player.currentTime=9;
 const {skipAnalysisGroups}=await load();for(const g of skipAnalysisGroups(lines,3600)){r.data.set('skip-course-lesson-'+g.slide.id+'.json',JSON.stringify({version:JSON.stringify(g.lines.map(l=>[l.id,l.t,l.end,l.text])),data:{spans:g.lines[0].id==='setup1'?[{ids:g.lines.map(l=>l.id),kind:'noise',confidence:.99,reason:'课前测试设备'}]:[]}}));}
 await app.toggleSmartSkip();assert.equal(player.currentTime,324);assert.equal(r.calls.filter(([a])=>a==='ai').length,0);
});

test('model ranges map to actual sentence IDs and invalid ranges fail explicitly',async()=>{
 const {decodeSkipDecision}=await load();const lines=[{id:'real-a'},{id:'real-c'},{id:'real-x'}];
 assert.deepEqual(decodeSkipDecision({spans:[{first:0,last:2,kind:'noise',confidence:1}]},lines).spans[0].ids,['real-a','real-c','real-x']);
 for(const span of [{first:0,last:3},{first:2,last:1},{first:-1,last:0},{first:0.5,last:1}])assert.throws(()=>decodeSkipDecision({spans:[span]},lines));
});
test('classroom media remains instructional even if the classifier labels it noise',async()=>{
 const {skipRangesForPage}=await load();const lines=[{id:'a',t:0,end:30,text:'English audio'}];
 assert.deepEqual(skipRangesForPage({slide:{t:0},lines},30,{spans:[{ids:['a'],kind:'noise',confidence:.99,reason:'教师播放教学视频英文原声'}]}),[]);
});

test('individual irrelevant utterances skip at moderate confidence without minimum sentence count',async()=>{
 const {skipRangesForPage,automaticSegmentSkip}=await load();const group={slide:{t:600},lines:[{id:'a',t:600,end:602,text:'帮我拿一下包'}, {id:'b',t:602,end:620,text:'这个概念的定义'}]};
 const decision={spans:[{ids:['a'],kind:'chatter',confidence:.7,reason:'旁人的无关闲聊'}]};
 const ranges=skipRangesForPage(group,620,decision);
 assert.equal(ranges.length,1);assert.equal(ranges[0].end,602);assert.equal(automaticSegmentSkip(600,620,ranges)?.end,602);
 assert.equal(automaticSegmentSkip(602,620,ranges),undefined);
 assert.equal(automaticSegmentSkip(600,601,ranges),undefined);
 assert.deepEqual(skipRangesForPage(group,620,{spans:[{...decision.spans[0],reason:'不确定是否是课程相关内容'}]}),[]);
});
