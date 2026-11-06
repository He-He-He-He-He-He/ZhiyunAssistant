import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asset, configureCompat, util } from '../src/desktop/compat';
import { OfficialLoginStore } from '../src/shared/services/OfficialLoginStore';
import { SessionStore } from '../src/shared/services/SessionStore';
import { SessionGate } from '../src/desktop/sessionGate';
import { classroomIdentity, sameClassroomIdentity } from '../src/desktop/classroomIdentity';

const key = Buffer.alloc(32, 7);
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]); },
  decryptString: (value: Buffer) => { const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'); },
};
function fresh(): string { const root = fs.mkdtempSync(path.join(process.env.ZHIYUN_TEST_TMP || os.tmpdir(), 'zhiyun-official-login-')); configureCompat({} as any, root, { safeStorage }); return root; }
async function legacy(name: string, value: unknown): Promise<void> { await asset.add(new Map([[asset.Tag.ALIAS, new util.TextEncoder().encodeInto(name)], [asset.Tag.SECRET, new util.TextEncoder().encodeInto(JSON.stringify(value))]])); }

test('legacy credentials are removed and no password save or auto-login interface remains', async () => {
  const root = fresh();
  try {
    await legacy('zhiyun-official-login-v1', { username: 'synthetic-user', password: 'synthetic-password' });
    await legacy('zhiyun-official-login-state-v1', { failures: 1, rejected: false });
    fs.writeFileSync(path.join(root, 'secrets', 'zhiyun-official-login-v1.bin.tmp'), 'synthetic encrypted remnant');
    assert.equal('usable' in OfficialLoginStore, false);
    assert.equal('save' in OfficialLoginStore, false);
    await OfficialLoginStore.clear();
    assert.deepEqual(fs.readdirSync(path.join(root, 'secrets')), []);
    await OfficialLoginStore.clear();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('legacy deletion failure is reported while other files are still removed', async () => {
  const root = fresh();
  try {
    await legacy('zhiyun-official-login-state-v1', { failures: 2, rejected: false });
    const blocked = path.join(root, 'secrets', 'zhiyun-official-login-v1.bin');
    fs.mkdirSync(blocked);
    fs.writeFileSync(path.join(blocked, 'synthetic'), 'x');
    await assert.rejects(OfficialLoginStore.clear(), /无法删除旧版保存的校园账号/);
    assert.equal(fs.existsSync(blocked), true);
    assert.equal(fs.existsSync(path.join(root, 'secrets', 'zhiyun-official-login-state-v1.bin')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('session cleanup continues after locked credentials, failed cookie removal and failed origin clearing', async () => {
  const root = fresh(), calls: string[] = [];
  try {
    await legacy('zhiyun-official-session-v3', { cookies: [] });
    await legacy('zhiyun-last-account-v1', { id: 'synthetic' });
    const blocked = path.join(root, 'secrets', 'zhiyun-official-session-v3.bin');
    fs.rmSync(blocked);
    fs.mkdirSync(blocked);
    fs.writeFileSync(path.join(blocked, 'synthetic'), 'x');
    configureCompat({
      cookies: {
        get: async () => [{ domain: '.zju.edu.cn', name: 'first', path: '/' }, { domain: 'classroom.zju.edu.cn', name: 'second', path: '/' }, { domain: 'unrelated.test', name: 'untouched' }],
        remove: async (_url: string, name: string) => { calls.push(name); if (name === 'first') throw Error('synthetic remove failure'); },
        flushStore: async () => { calls.push('flush'); },
      },
      clearStorageData: async ({ origin }: { origin: string }) => { calls.push(origin); if (origin.includes('classroom')) throw Error('synthetic clear failure'); },
    } as any, root, { safeStorage });
    await assert.rejects(SessionStore.clear(), /无法删除/);
    assert.deepEqual(calls, ['first', 'second', 'https://classroom.zju.edu.cn', 'https://interactivemeta.cmc.zju.edu.cn', 'flush']);
    assert.equal(fs.existsSync(path.join(root, 'secrets', 'zhiyun-last-account-v1.bin')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('session save and restore include parent-domain campus cookies but exclude lookalike domains', async () => {
  const root = fresh(), restored: string[] = [];
  try {
    configureCompat({
      cookies: {
        get: async () => [
          { domain: '.zju.edu.cn', name: 'parent', value: 'synthetic-parent', path: '/' },
          { domain: '.classroom.zju.edu.cn', name: 'classroom', value: 'synthetic-child', path: '/' },
          { domain: 'notzju.edu.cn', name: 'unrelated', value: 'synthetic-other', path: '/' },
        ],
        set: async (cookie: { name: string }) => { restored.push(cookie.name); },
        flushStore: async () => {},
      },
    } as any, root, { safeStorage });
    await SessionStore.saveCurrent();
    await SessionStore.restore();
    assert.deepEqual(restored, ['parent', 'classroom']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('logout invalidates and waits for an in-flight session before clearing', async () => {
  const gate = new SessionGate(); let release!: () => void;
  const generation = gate.current(); const events: string[] = [];
  const pending = gate.run(async () => { events.push('started'); await new Promise<void>(resolve => { release = resolve; }); events.push('finished'); });
  await Promise.resolve();
  const logout = gate.logout(() => events.push('cancelled'), async () => { events.push('cleared'); });
  assert.equal(gate.valid(generation), false);
  await assert.rejects(gate.run(async () => {}), /正在退出登录/);
  assert.deepEqual(events, ['started', 'cancelled']);
  release(); await pending; await logout;
  assert.deepEqual(events, ['started', 'cancelled', 'finished', 'cleared']);
  assert.equal(gate.valid(generation), false);
  assert.equal(gate.valid(gate.current()), true);
});

test('deletion errors propagate from logout and do not make the old generation valid again', async () => {
  const gate = new SessionGate(); const old = gate.current();
  await assert.rejects(gate.logout(() => {}, async () => { throw Error('synthetic delete failure'); }), /synthetic delete failure/);
  assert.equal(gate.valid(old), false);
});

test('strict identity matching requires exact account id, username and tenant', () => {
  const identity = { params: { id: 'synthetic-id', tenant_id: 112, account: 'synthetic-user' } };
  assert.deepEqual(classroomIdentity(identity), { id: 'synthetic-id', tenantId: 112, username: 'synthetic-user' });
  assert.equal(sameClassroomIdentity(identity, { params: { id: 'synthetic-id', tenant_id: 112, account: 'synthetic-user' } }), true);
  for (const other of [null, {}, { params: { id: 'synthetic-id' } }, { params: { id: 'synthetic-id', tenant_id: 112 } }, { params: { id: 'synthetic-id', tenant_id: 112, account: '' } }, { params: { id: 'synthetic-id', tenant_id: 112, account: 'other-user' } }, { params: { id: 'synthetic-id', tenant_id: 112, account: ' synthetic-user' } }, { params: { id: 'synthetic-id', tenant_id: 112, account: 'synthetic-user\0' } }, { params: { id: 'synthetic-id', tenant_id: '112', account: 'synthetic-user' } }, { params: { id: 'synthetic-id', tenant_id: 113, account: 'synthetic-user' } }, { params: { id: 'other-id', tenant_id: 112, account: 'synthetic-user' } }, { params: { id: ' synthetic-id', tenant_id: 112, account: 'synthetic-user' } }, { params: { id: 'synthetic-id', tenant_id: 0, account: 'synthetic-user' } }]) {
    assert.equal(sameClassroomIdentity(identity, other), false);
  }
});

test('logout prevents a queued session operation from starting afterwards', async () => {
  const gate = new SessionGate(); let started = false;
  const pending = gate.run(async () => { started = true; });
  const logout = gate.logout(() => {}, async () => {});
  await assert.rejects(pending, /登录操作已取消/);
  await logout;
  assert.equal(started, false);
});

test('desktop integration neither captures nor submits passwords and clears old session before manual login', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/desktop/main.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(process.cwd(), 'src/desktop/login-preload.ts'), 'utf8');
  const model = fs.readFileSync(path.join(process.cwd(), 'src/shared/model/OfficialLogin.ts'), 'utf8');
  assert.doesNotMatch(main, /runSilentLogin|login-capture|askToRememberLogin|submitLoginScript/);
  assert.doesNotMatch(preload, /ipcRenderer|password|\.value/);
  assert.doesNotMatch(model, /submitLoginScript/);
  assert.match(main, /method==='login\.open'\)\{await callWithSession\('session\.logout',\{\}\);return openLogin\(\);/);
});
