const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = () => import(pathToFileURL(path.join(__dirname, '../web/knowledge-cache.js')));

test('indexes transcript and available slide readings in time order, explicitly marking missing slides', async () => {
  const {knowledgeRecords, knowledgeChunks} = await load();
  const rows = knowledgeRecords({slides:[{id:'a',t:0},{id:'b',t:50}],lines:[{t:53,text:'后文'},{t:4,text:'正文'}]}, {a:'识别的公式'});
  assert.deepEqual(rows.map(r=>r.t), [0,4,50,53]);
  assert.match(rows[0].text, /识别的公式/); assert.match(rows[2].text, /尚无识别结果/);
  const chunks = knowledgeChunks(rows, 40); assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c=>c.text.length <= 40)); assert.equal(chunks[0].from, 0);
});
test('source changes invalidate index and partial indexes are not accepted', async () => {
  const {knowledgeRecords,knowledgeFingerprint,usableKnowledge} = await load();
  const a = knowledgeRecords({lines:[{t:2,text:'原始转写'}]}, {}), b=knowledgeRecords({lines:[{t:2,text:'修改后的转写'}]}, {});
  const one=await knowledgeFingerprint(a,webcrypto.subtle),two=await knowledgeFingerprint(b,webcrypto.subtle);
  assert.notEqual(one,two);
  const index={version:1,fingerprint:one,chunks:[{from:2,to:2,text:'摘要'}]};
  assert.ok(usableKnowledge(index,one));assert.ok(!usableKnowledge(index,two));assert.ok(!usableKnowledge({...index,chunks:[]},one));
});
test('long source text is split without loss',async()=>{
  const {knowledgeChunks}=await load(), text='知识'.repeat(200),chunks=knowledgeChunks([{t:3,text}],120);
  assert.equal(chunks.map(c=>c.text.replace(/(?:^|\n)\[3秒\] /g,'')).join(''),text);
});
test('app stores a complete index and invalidates it when captions or OCR change',async t=>{
  const {runtime}=require('./runtime-helper.cjs');
  const r=runtime({replies:{ai:{answer:'有时间依据的课堂摘要'}} ,extraTestingNames:['buildKnowledgeInBackground','getKnowledge']});
  Object.defineProperty(r.win.crypto,'subtle',{value:webcrypto.subtle});
  const app=(await r.load('app.js')).testing;app.setup();t.after(()=>{app.cleanup();r.dom.window.close()});
  const material={course:r.current,slides:[{id:'p1',url:'https://fixture/page',t:0}],lines:[{t:3,text:'第一句话'}]};
  r.data.set('vision-p1.json',JSON.stringify({url:'https://fixture/page',text:'已识别课件'}));
  await app.buildKnowledgeInBackground([material],0,'fixture');
  assert.ok((await app.getKnowledge(material)).chunks[0].text.includes('课堂摘要'));
  material.lines[0].text='修改后的转写'; assert.equal(await app.getKnowledge(material),null);
  material.lines[0].text='第一句话';r.data.set('vision-p1.json',JSON.stringify({url:'https://fixture/page',text:'更新的识别结果'}));
  assert.equal(await app.getKnowledge(material),null);
});
test('truncated AI output is never saved as a complete index',async t=>{
  const {runtime}=require('./runtime-helper.cjs');
  const r=runtime({replies:{ai:{answer:'只生成了一部分',finish_reason:'length'}},extraTestingNames:['buildKnowledgeInBackground','getKnowledge']});
  Object.defineProperty(r.win.crypto,'subtle',{value:webcrypto.subtle});
  const app=(await r.load('app.js')).testing;app.setup();t.after(()=>{app.cleanup();r.win.close()});
  const material={course:r.current,slides:[],lines:[{t:3,text:'资料'}]};
  await app.buildKnowledgeInBackground([material],0,'fixture');
  assert.equal(await app.getKnowledge(material),null);
});
