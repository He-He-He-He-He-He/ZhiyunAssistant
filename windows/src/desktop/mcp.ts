/** MCP stdio bridge for the local Windows application. No data is read without app approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
const rootIndex = process.argv.indexOf('--root');
const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1] || '') : '';
const tools = [
  { name: 'zhiyun_state', description: '读取智云助手状态。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'zhiyun_actions', description: '查看应用可用操作及参数。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'zhiyun_interface', description: '读取当前界面的可操作控件。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'zhiyun_do', description: '执行应用操作。操作和读取需用户在应用中确认。', inputSchema: { type: 'object', properties: { action: { type: 'string' }, args: { type: 'object' } }, required: ['action', 'args'], additionalProperties: false } }
];
async function callApp(method: string, params: unknown): Promise<unknown> {
  if (!root) throw new Error('缺少应用接口目录，请从隐私页面复制配置');
  try { await fs.access(path.join(root, 'enabled')); } catch { throw new Error('请在智云助手隐私页面开启外部接口'); }
  const id = crypto.randomBytes(16).toString('hex'), request = path.join(root, id + '.request'), response = path.join(root, id + '.response'), temp = path.join(root, '.' + id + '.tmp');
  const payload = JSON.stringify({ id, method, params }); if (Buffer.byteLength(payload) > 262144) throw new Error('请求过大');
  try {
    await fs.writeFile(temp, payload, { mode: 0o600, flag: 'wx' }); await fs.rename(temp, request); const until = Date.now() + 90000;
    while (Date.now() < until) {
      try { await fs.access(path.join(root, 'enabled')); } catch { throw new Error('接口已关闭'); }
      try { const body = JSON.parse(await fs.readFile(response, 'utf8')) as { result?: unknown; error?: string }; await fs.rm(response, { force: true }); if (body.error) throw new Error(body.error); return body.result; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('应用未及时响应，请确认智云助手正在运行');
  } finally { await Promise.all([temp, request, response].map(file => fs.rm(file, { force: true }).catch(() => {}))); }
}
async function handle(message: any): Promise<unknown> {
  const id = message?.id, params = message?.params || {};
  if (message?.method?.startsWith('notifications/')) return null;
  let result: unknown;
  if (message?.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'zhiyun-assistant', version: '1.0.0' } };
  else if (message?.method === 'ping') result = {};
  else if (message?.method === 'tools/list') result = { tools };
  else if (message?.method === 'tools/call') {
    const mapping: Record<string, string> = { zhiyun_state: 'state', zhiyun_actions: 'actions', zhiyun_interface: 'interface', zhiyun_do: 'do' }, method = mapping[params.name]; if (!method) throw new Error('未知工具');
    try { result = { content: [{ type: 'text', text: JSON.stringify(await callApp(method, params.arguments || {})) }] }; }
    catch (error) { result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : '操作失败' }] }; }
  } else throw new Error('不支持的方法');
  return id === undefined ? null : { jsonrpc: '2.0', id, result };
}
let chain = Promise.resolve();
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => { chain = chain.then(async () => { let message: any; try { if (Buffer.byteLength(line) > 262144) throw new Error('请求过大'); message = JSON.parse(line); const response = await handle(message); if (response) process.stdout.write(JSON.stringify(response) + '\n'); } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32603, message: error instanceof Error ? error.message : '请求失败' } }) + '\n'); } }); });
