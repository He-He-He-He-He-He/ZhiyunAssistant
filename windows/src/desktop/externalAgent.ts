import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

type Request = { id: string; method: string; params: Record<string, unknown> };
const idPattern = /^[a-f0-9]{32}$/;
export class ExternalAgentBroker {
  readonly root: string;
  private enabled = false;
  constructor(userData: string) { this.root = path.join(userData, 'ExternalAgent'); }
  async start(): Promise<void> { await fs.mkdir(this.root, { recursive: true, mode: 0o700 }); try { this.enabled = (await fs.stat(path.join(this.root, 'enabled'))).isFile(); } catch { this.enabled = false; } }
  status(): boolean { return this.enabled; }
  async setEnabled(value: boolean): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    if (value) { const marker = path.join(this.root, 'enabled'), temp = path.join(this.root, '.enable-' + crypto.randomBytes(16).toString('hex')); await fs.writeFile(temp, '', { mode: 0o600, flag: 'wx' }); try { await fs.rm(marker, { force: true }); await fs.rename(temp, marker); this.enabled = true; } finally { await fs.rm(temp, { force: true }); } }
    else { this.enabled = false; await fs.rm(path.join(this.root, 'enabled'), { force: true }); const names = await fs.readdir(this.root); await Promise.all(names.filter(name => /^[a-f0-9]{32}\.(request|response)$/.test(name)).map(name => fs.rm(path.join(this.root, name), { force: true }))); }
  }
  async next(confirm: (request: Request) => Promise<boolean>): Promise<Request | null> {
    if (!this.enabled) return null;
    const names = (await fs.readdir(this.root)).sort();
    for (const name of names) {
      if (!/^[a-f0-9]{32}\.request$/.test(name)) continue;
      const file = path.join(this.root, name); let row: Request | undefined;
      try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 262144 || Date.now() - stat.mtimeMs > 90000) throw new Error('invalid'); const raw = await fs.readFile(file, 'utf8'); row = JSON.parse(raw) as Request; if (!row || row.id + '.request' !== name || !['state', 'actions', 'interface', 'do'].includes(row.method) || !row.params || typeof row.params !== 'object' || Array.isArray(row.params)) throw new Error('invalid'); }
      catch { await fs.rm(file, { force: true }); continue; }
      await fs.rm(file, { force: true });
      if (!this.enabled) return null;
      if (row.method !== 'actions' && !await confirm(row)) { await this.reply(row.id, null, '用户未允许本次外部操作'); continue; }
      if (!this.enabled) return null;
      return row;
    }
    return null;
  }
  async reply(id: string, result: unknown, error?: string): Promise<void> {
    if (!this.enabled || !idPattern.test(id)) throw new Error('接口已关闭或请求无效');
    const data = JSON.stringify({ result: result ?? null, error: error || null }); if (Buffer.byteLength(data) > 4 * 1024 * 1024) throw new Error('响应过大');
    const temporary = path.join(this.root, '.' + id + '.tmp'); await fs.writeFile(temporary, data, { mode: 0o600 }); await fs.rename(temporary, path.join(this.root, id + '.response'));
  }
}
