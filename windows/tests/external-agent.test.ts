import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExternalAgentBroker } from '../src/desktop/externalAgent';

test('external access defaults off, asks before reading, and rejects denied operations', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyun-agent-test-'));
  try {
    const broker = new ExternalAgentBroker(tmp); await broker.start(); assert.equal(broker.status(), false);
    await broker.setEnabled(true); const id = 'a'.repeat(32);
    await fs.writeFile(path.join(broker.root,id+'.request'), JSON.stringify({id,method:'state',params:{}}));
    let called = 0; assert.equal(await broker.next(async () => { called++; return false; }), null); assert.equal(called,1);
    const denied = JSON.parse(await fs.readFile(path.join(broker.root,id+'.response'),'utf8')); assert.equal(denied.result,null); assert.match(denied.error,/未允许/);
    const id2 = 'b'.repeat(32); await fs.writeFile(path.join(broker.root,id2+'.request'),JSON.stringify({id:id2,method:'interface',params:{}}));
    const allowed = await broker.next(async () => true); assert.equal(allowed?.id,id2); await broker.reply(id2,{page:'test'});
    assert.equal(JSON.parse(await fs.readFile(path.join(broker.root,id2+'.response'),'utf8')).result.page,'test');
    await broker.setEnabled(false); assert.equal(await broker.next(async()=>true),null); await assert.rejects(broker.reply(id2,{}));
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});

test('external requests reject invalid data and do not follow request symlinks', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyun-agent-test-'));
  try { const broker = new ExternalAgentBroker(tmp); await broker.start(); await broker.setEnabled(true);
    const id='c'.repeat(32), target=path.join(tmp,'target'); await fs.writeFile(target,'untouched');
    await fs.symlink(target,path.join(broker.root,id+'.request')); assert.equal(await broker.next(async()=>true),null); assert.equal(await fs.readFile(target,'utf8'),'untouched');
    await fs.writeFile(path.join(broker.root,id+'.request'),'{invalid'); assert.equal(await broker.next(async()=>true),null);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});

test('MCP stdio bridge exchanges a confirmed request with the running application', async () => {
  const { spawn } = await import('node:child_process'); const readline = await import('node:readline');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyun-mcp-test-')); const broker = new ExternalAgentBroker(tmp);
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await broker.start(); await broker.setEnabled(true);
    const built = path.join(tmp, 'mcp.cjs'); await (await import('esbuild')).build({entryPoints:['src/desktop/mcp.ts'], bundle:true, platform:'node', target:'node22', outfile:built});
    child = spawn(process.execPath, [built,'--root',broker.root], {stdio:['pipe','pipe','pipe']});
    const lines = readline.createInterface({input:child.stdout!})[Symbol.asyncIterator]();
    child.stdin!.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n');
    const init=JSON.parse((await lines.next()).value as string); assert.equal(init.result.serverInfo.name,'zhiyun-assistant');
    child.stdin!.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'zhiyun_state',arguments:{}}})+'\n');
    let request: Awaited<ReturnType<typeof broker.next>> = null; for(let i=0;i<60&&!request;i++){ request=await broker.next(async()=>true); if(!request)await new Promise(resolve=>setTimeout(resolve,25)); }
    assert.equal(request?.method,'state'); await broker.reply(request!.id,{page:'classroom'});
    const response=JSON.parse((await lines.next()).value as string); assert.equal(JSON.parse(response.result.content[0].text).page,'classroom');
  } finally { child?.kill(); await fs.rm(tmp,{recursive:true,force:true}); }
});
