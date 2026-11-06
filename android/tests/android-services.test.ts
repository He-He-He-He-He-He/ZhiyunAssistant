import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import JSZip from 'jszip';
import { fs as androidFs } from '../src/desktop/android-tools';
import { installNativeBridge } from '../src/desktop/android-native';
import { createAndroidSession, fileIo, http, util } from '../src/desktop/compat';
import { createServices } from '../src/desktop/services';
import { installAndroidServices } from '../src/desktop/android-bootstrap';
import { LocalStore, key } from '../src/shared/services/LocalStore';
import { Zhiyun } from '../src/shared/services/Zhiyun';
import { AiClient } from '../src/shared/services/AiClient';
import { SessionStore } from '../src/shared/services/SessionStore';
import { blackBorderRegion } from '../src/shared/model/BlackBorders';
import { disposeImageJobs } from '../src/desktop/image-jobs';
import type { Course } from '../src/shared/model/Timeline';

function harness() {
 const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'zhiyun-android-')), cache = nodePath.join(root, 'cache'), temp = nodePath.join(cache, 'temp'); fs.mkdirSync(temp, { recursive: true });
 const secrets = new Map<string, string>(), registered = new Map<string, any>(), descriptorPaths = new Map<number, string>(), canceled: string[] = [], exports: Uint8Array[] = [], calls: Array<{ method: string; payload: any }> = [];
 let custom: ((method: string, payload: any) => Promise<{ handled: boolean; value?: any }>) | undefined;
 let network = true, serial = 0, exportDelay: Promise<void> | undefined, exportEntered: (() => void) | undefined, zipDelay: Promise<void> | undefined, zipEntered: (() => void) | undefined, secretDelay: Promise<void> | undefined, secretEntered: (() => void) | undefined, streaming: ((payload: any) => any) | undefined;
 const target: any = {};
 const syncOperation = (method: string, p: any): any => {
  if (method === 'app.paths') return { root, filesDir: root, cacheDir: cache, tempDir: temp };
  if (method === 'cookies.get') return [];
  if (method === 'fs.exists') return fs.existsSync(p.path);
  if (method === 'fs.mkdir') return fs.mkdirSync(p.path, { recursive: p.recursive });
  if (method === 'fs.list') return fs.readdirSync(p.path);
  if (method === 'fs.readText') return fs.readFileSync(p.path, 'utf8');
  if (method === 'fs.readBytes') return fs.readFileSync(p.path).toString('base64');
  if (method === 'fs.writeBytes') return fs.writeFileSync(p.path, Buffer.from(p.base64, 'base64'));
  if (method === 'fs.open') { const fd = fs.openSync(p.path, p.flags); descriptorPaths.set(fd, p.path); return { fd }; }
  if (method === 'fs.fdPath') return descriptorPaths.get(p.fd);
  if (method === 'fs.close') { descriptorPaths.delete(p.fd); return fs.closeSync(p.fd); }
  if (method === 'fs.write') return fs.writeSync(p.fd, Buffer.from(p.base64, 'base64'));
  if (method === 'fs.read') { const bytes = Buffer.alloc(p.length), n = fs.readSync(p.fd, bytes); return bytes.subarray(0, n).toString('base64'); }
  if (method === 'fs.stat') { const stat = p.fd ? fs.fstatSync(p.fd) : fs.statSync(p.path); return { size: stat.size, mtime: stat.mtimeMs, directory: stat.isDirectory() }; }
  if (method === 'fs.rename') return fs.renameSync(p.from, p.to);
  if (method === 'fs.remove') return fs.rmSync(p.path, { recursive: p.recursive, force: true });
  if (method === 'fs.copy') return fs.copyFileSync(typeof p.from === 'number' ? descriptorPaths.get(p.from)! : p.from, typeof p.to === 'number' ? descriptorPaths.get(p.to)! : p.to);
  if (method === 'fs.truncate') return fs.ftruncateSync(p.fd, p.length);
  if (method === 'resource.clear') { registered.clear(); return; }
  if (method === 'resource.local' || method === 'resource.remote') { const url = 'https://appassets.androidplatform.net/resource/token-' + (++serial) + '/asset'; registered.set(url, p); return url; }
  if (method === 'resource.resolve') return registered.get(p.url) || null;
  throw new Error('unsupported sync ' + method);
 };
 const operation = async (method: string, p: any): Promise<any> => {
  calls.push({ method, payload: p });
  const override = await custom?.(method, p); if (override?.handled) return override.value;
  if (method === 'app.clearOfficialCredentials') { for (const alias of ['zhiyun-official-login-v2', 'zhiyun-official-login-v1', 'zhiyun-official-login-state-v1']) secrets.delete(alias); return true; }
  if (method === 'app.revokeNativeCredentials' || method === 'app.cancelSilentLogin' || method === 'app.cancelLogin' || method === 'app.invalidateSession' || method === 'app.cleanupLoginProfiles' || method === 'app.checkLoginProfiles') return true;
  if (method === 'secret.get') return secrets.get(p.alias) || null;
  if (method === 'secret.set') { secretEntered?.(); if (secretDelay) await secretDelay; secrets.set(p.alias, p.value); return; }
  if (method === 'secret.remove') { secrets.delete(p.alias); return; }
  if (method.startsWith('cookies.')) return method === 'cookies.get' ? [] : undefined;
  if (method === 'image.info') return { width: 3000, height: 2000 };
  if (method === 'image.pixels') { const width = p.width, height = p.height, bytes = new Uint8Array(width * height * 4); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (x >= 40 && x < width - 40) bytes[i] = bytes[i + 1] = bytes[i + 2] = 255; bytes[i + 3] = 255; } return { width, height, stride: width * 4, base64: Buffer.from(bytes).toString('base64') }; }
  if (method === 'image.crop') { fs.writeFileSync(p.destination, 'full resolution crop'); return p.destination; }
  if (method === 'http.request') { if (!network) throw new Error('network unavailable'); return { status: 200, headers: { 'Content-Type': 'application/json' }, base64: false, body: JSON.stringify({ params: { id: 'test-student', name: 'Test', tenant_id: 112 } }) }; }
  if (method === 'http.stream') return streaming?.(p);
  if (method === 'http.ack') return;
  if (method === 'http.cancel') { canceled.push(p.requestId); return; }
  if (method.startsWith('websocket.')) return;
  if (method === 'app.cacheInfo') return [];
  if (method === 'app.cacheClear' || method === 'app.cachePolicy' || method === 'app.downloads') return;
  if (method === 'zip.create') { zipEntered?.(); if (zipDelay) await zipDelay; const zip = new JSZip(); const add = (directory: string) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = nodePath.join(directory, entry.name); if (entry.isDirectory()) add(file); else zip.file(nodePath.relative(p.folder, file), fs.readFileSync(file)); } }; add(p.folder); fs.writeFileSync(p.destination, await zip.generateAsync({ type: 'nodebuffer' })); return; }
  if (method === 'export.share') { exportEntered?.(); if (exportDelay) await exportDelay; exports.push(fs.readFileSync(p.path)); return 'content://documents/exported/' + encodeURIComponent(p.name); }
  throw new Error('unsupported async ' + method);
 };
 target.NativeBridge = { sync(method: string, data: string) { try { return JSON.stringify({ value: syncOperation(method, JSON.parse(data)) }); } catch (error) { return JSON.stringify({ error: (error as Error).message }); } }, post(id: string, method: string, data: string) { void operation(method, JSON.parse(data)).then(value => target.__androidReceive({ id, value }), error => target.__androidReceive({ id, error: error.message })); } };
 (globalThis as any).window = target; const bridge = installNativeBridge(target);
 return { root, cache, temp, bridge, target, secrets, registered, canceled, exports, calls, setHandler(value: typeof custom) { custom = value; }, setNetwork(value: boolean) { network = value; }, setStream(value: typeof streaming) { streaming = value; }, delayExport() { let release!: () => void; const entered = new Promise<void>(resolve => { exportEntered = resolve; }); exportDelay = new Promise<void>(resolve => { release = resolve; }); return { entered, release }; }, delayZip() { let release!: () => void; const entered = new Promise<void>(resolve => { zipEntered = resolve; }); zipDelay = new Promise<void>(resolve => { release = resolve; }); return { entered, release }; }, delaySecretSet() { let release!: () => void; const entered = new Promise<void>(resolve => { secretEntered = resolve; }); secretDelay = new Promise<void>(resolve => { release = resolve; }); return { entered, release }; }, event(name: string, value: any) { target.__androidEvent({ name, value }); }, dispose() { fs.rmSync(root, { recursive: true, force: true }); } };
}
const course: Course = { subId: 'lecture-1', courseId: 'course-1', title: 'Example', teacher: 'Teacher', room: 'Room', status: '3', start: 1000, end: 4600 };

test('manual login clears old credentials and never saves unverified capture', async () => {
 const h = harness(); try { h.secrets.set('zhiyun-official-login-v1', JSON.stringify({ username: 'old', password: 'old-secret' })); h.setHandler(async (method) => method === 'app.login' ? { handled: true, value: { username: 'old', password: 'wrong-secret' } } : { handled: false }); installAndroidServices(); const account = await h.target.zhiyun.call('login.open'); assert.equal(account.id, 'test-student'); assert.equal(h.secrets.has('zhiyun-official-login-v1'), false); assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('renderer cannot save even a forged verified result', async () => {
 const h = harness(); try { installAndroidServices(); h.setHandler(async method => method === 'app.login' ? { handled: true, value: { verified: true, username: 'synthetic-user', password: 'synthetic-password', accountId: 'test-student' } } : { handled: false }); assert.equal((await h.target.zhiyun.call('login.open')).id, 'test-student'); assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); assert.equal(h.calls.some(c => c.method === 'secret.set' && c.payload.alias === 'zhiyun-official-login-v2'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('forged capture never causes credential writes regardless of identity', async () => {
 for (const params of [{ id: 'different', account: 'synthetic-user' }, { id: 'test-student', account: 'different' }, { id: 'test-student' }]) { const h = harness(); try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.login') return { handled: true, value: { verified: true, username: 'synthetic-user', password: 'synthetic-password', accountId: 'test-student' } }; if (method === 'http.request') return { handled: true, value: { status: 200, headers: {}, base64: false, body: JSON.stringify({ params }) } }; return { handled: false }; }); await h.target.zhiyun.call('login.open'); assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); } }
});
test('manual login never writes a password record', async () => {
 const h = harness(); try { installAndroidServices(); h.setHandler(async method => method === 'app.login' ? { handled: true, value: { verified: true, password: 'synthetic-password' } } : { handled: false }); await h.target.zhiyun.call('login.open'); assert.equal(h.calls.some(c => c.method === 'secret.set' && c.payload.alias.startsWith('zhiyun-official-login-')), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('logout tombstone precedes cleanup, failures still clear session, and manual login does not tombstone', async () => {
 const h = harness(); try {
  installAndroidServices();
  h.setHandler(async method => { if (method === 'app.revokeNativeCredentials') throw new Error('自动登录凭据撤销未确认，请重试退出；手动登录仍可用'); if (method === 'app.login') return { handled: true, value: {} }; return { handled: false }; });
  await assert.rejects(h.target.zhiyun.call('session.logout'), (error: any) => /撤销未确认/.test(error.message) && error.sessionCleared === true);
  const names = h.calls.map(c => c.method);
  assert.ok(names.indexOf('app.invalidateSession') < names.indexOf('app.revokeNativeCredentials'));
  assert.ok(names.indexOf('app.revokeNativeCredentials') < names.indexOf('app.cancelLogin'));
  assert.ok(names.indexOf('app.revokeNativeCredentials') < names.indexOf('cookies.clear'));
  const before = names.filter(n => n === 'app.revokeNativeCredentials').length;
  assert.equal((await h.target.zhiyun.call('login.open')).id, 'test-student');
  assert.equal(h.calls.filter(c => c.method === 'app.revokeNativeCredentials').length, before);
  await h.target.__zhiyunDispose();
 } finally { h.dispose(); }
});

test('logout clears old official credentials via dedicated native operation', async () => {
 const h = harness(); try { h.secrets.set('zhiyun-official-login-v2', 'synthetic'); installAndroidServices(); await h.target.zhiyun.call('session.logout'); assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); assert.ok(h.calls.some(c => c.method === 'app.clearOfficialCredentials')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('restore never retrieves password or invokes silent login', async () => {
 const h = harness(); try { h.secrets.set('zhiyun-official-login-v2', 'synthetic'); installAndroidServices(); await h.target.zhiyun.call('session.restore'); assert.equal(h.calls.some(c => c.method === 'app.silentLogin' || c.method === 'secret.get' && c.payload.alias === 'zhiyun-official-login-v2'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('manual login invalidates old session and clears cookies before opening', async () => {
 const h = harness(); try { installAndroidServices(); h.setHandler(async method => method === 'app.login' ? { handled: true, value: {} } : { handled: false }); await h.target.zhiyun.call('login.open'); const names = h.calls.map(c => c.method); assert.ok(names.indexOf('app.invalidateSession') < names.indexOf('cookies.clear')); assert.ok(names.indexOf('cookies.clear') < names.indexOf('app.login')); assert.equal(names.includes('app.cleanupLoginProfiles'), false); assert.equal(names.includes('app.checkLoginProfiles'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('cancelled manual login does not restore cleared prior session', async () => {
 const h = harness(); try { installAndroidServices(); await h.target.zhiyun.call('session.account'); assert.ok(h.secrets.has('zhiyun-last-account-v1')); h.setHandler(async method => method === 'app.login' ? {handled: true, value: {cancelled: true}} : {handled: false}); assert.equal(await h.target.zhiyun.call('login.open'), null); assert.equal(h.secrets.has('zhiyun-last-account-v1'), false); assert.equal(await h.target.zhiyun.call('session.restore'), null); assert.ok(h.calls.some(c => c.method === 'cookies.clear')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('privacy describes native explicit consent, default-off rollout and cancellation limitation', () => {
 const renderer = fs.readFileSync('src/renderer/App.tsx', 'utf8'), readme = fs.readFileSync('README.md', 'utf8');
 assert.match(renderer, /自动重登默认关闭/); assert.match(renderer, /取消也不会恢复/); assert.match(renderer, /取消后无法恢复/);
 assert.match(renderer, /密码不经过网页桥/); assert.match(renderer, /成功、失败、重启都不恢复/);
 assert.match(readme, /原生自动登录默认关闭/); assert.match(readme, /即使随后取消登录，也不会恢复/);
 assert.doesNotMatch(renderer, /验证账号与当前账号一致后，使用系统密钥加密保存以便自动登录/);
});
test('logout reports unknown isolated residue while clearing ordinary session and preserving marker', async () => {
 const h = harness(), marker = new Set(['zhiyun-verify-synthetic']); try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles' && marker.size) throw new Error('unknown profile'); return { handled: false }; }); const result = await h.target.zhiyun.call('session.logout'); assert.match(result.warning, /尚未确认清理/); assert.match(result.warning, /未删除隔离数据/); assert.deepEqual([...marker], ['zhiyun-verify-synthetic']); assert.ok(h.calls.some(c => c.method === 'cookies.clear')); assert.equal(h.calls.some(c => c.method === 'app.cleanupLoginProfiles'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('unknown profile marker does not block manual login or start verification', async () => {
 const h = harness(), marker = new Set(['zhiyun-verify-synthetic']); try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles' || method === 'app.cleanupLoginProfiles') throw new Error('unknown profile'); if (method === 'app.login') return { handled: true, value: {} }; return { handled: false }; }); assert.equal((await h.target.zhiyun.call('login.open')).id, 'test-student'); assert.deepEqual([...marker], ['zhiyun-verify-synthetic']); assert.equal(h.calls.some(c => ['app.cleanupLoginProfiles', 'app.checkLoginProfiles', 'app.silentLogin'].includes(c.method)), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('profile warning after logout does not block a later manual login', async () => {
 const h = harness(); try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles') throw new Error('unknown profile'); if (method === 'app.login') return { handled: true, value: {} }; return { handled: false }; }); const result = await h.target.zhiyun.call('session.logout'); assert.match(result.warning, /未确认清理/); assert.equal((await h.target.zhiyun.call('login.open')).id, 'test-student'); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('manual login queued during warning-producing logout can continue', async () => {
 const h = harness(); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
 try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles') { entered(); await gate; throw new Error('unknown profile'); } if (method === 'app.login') return { handled: true, value: {} }; return { handled: false }; }); const logout = h.target.zhiyun.call('session.logout'); await started; const login = h.target.zhiyun.call('login.open'); release(); assert.match((await logout).warning, /未确认清理/); assert.equal((await login).id, 'test-student'); assert.equal(h.calls.some(c => c.method === 'app.cleanupLoginProfiles' || c.method === 'app.silentLogin'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('profile warning does not hide other logout failure', async () => {
 const h = harness(); try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles') throw new Error('unknown profile'); if (method === 'app.clearOfficialCredentials') throw new Error('删除自动登录凭据失败'); return { handled: false }; }); await assert.rejects(h.target.zhiyun.call('session.logout'), /删除自动登录凭据失败.*隔离登录残留未确认清理/); assert.ok(h.calls.some(c => c.method === 'cookies.clear')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('offline session restore does not inspect or mutate isolated markers', async () => {
 const h = harness(); let services = createServices(createAndroidSession(h.cache), h.root, () => {}); try { await services.handle('session.account'); await services.dispose(); h.setNetwork(false); installAndroidServices(); h.setHandler(async method => { if (method === 'app.checkLoginProfiles' || method === 'app.cleanupLoginProfiles') throw new Error('unknown profile'); return { handled: false }; }); const restored = await h.target.zhiyun.call('session.restore'); assert.equal(restored.id, 'test-student'); assert.equal(restored.offline, true); assert.equal(h.calls.some(c => c.method === 'app.checkLoginProfiles' || c.method === 'app.cleanupLoginProfiles'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('credential deletion failure blocks manual login and is reported on logout', async () => {
 const h = harness(); try { installAndroidServices(); h.secrets.set('zhiyun-official-login-v1', 'synthetic old password'); h.setHandler(async (method) => { if (method === 'app.clearOfficialCredentials') throw new Error('删除自动登录凭据失败'); return { handled: false }; }); await assert.rejects(h.target.zhiyun.call('login.open'), /删除自动登录凭据失败/); assert.equal(h.calls.some(c => c.method === 'app.login'), false); await assert.rejects(h.target.zhiyun.call('session.logout'), /删除自动登录凭据失败/); assert.ok(h.calls.some(c => c.method === 'cookies.clear')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('legacy credential does not trigger a silent WebView', async () => {
 const h = harness(); try { installAndroidServices(); h.secrets.set('zhiyun-official-login-v2', 'synthetic'); await h.target.zhiyun.call('session.restore'); assert.equal(h.calls.some(c => c.method === 'app.silentLogin'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('logout still invalidates the session and clears legacy credentials', async () => {
 const h = harness(); try { installAndroidServices(); h.secrets.set('zhiyun-official-login-v2', 'synthetic'); await h.target.zhiyun.call('session.logout'); assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); assert.ok(h.calls.some(c => c.method === 'app.invalidateSession')); assert.ok(h.calls.some(c => c.method === 'app.cancelSilentLogin')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('logout cancels an in-flight manual verification before clearing credentials', async () => {
 const h = harness(); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => entered = r), canceled = new Promise<void>(r => release = r);
 try { installAndroidServices(); h.setHandler(async method => { if (method === 'app.login') { entered(); await canceled; return { handled: true, value: { verified: true, username: 'fixture', password: 'secret', accountId: 'test-student' } }; } if (method === 'app.cancelLogin') { release(); return { handled: true, value: true }; } return { handled: false }; }); const login = h.target.zhiyun.call('login.open'); await started; const logout = h.target.zhiyun.call('session.logout'); assert.equal(await login, null); await logout; assert.equal(h.secrets.has('zhiyun-official-login-v2'), false); assert.ok(h.calls.some(c => c.method === 'app.cancelLogin')); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('session restore does not submit credentials', async () => {
 const h = harness(); try { installAndroidServices(); h.secrets.set('zhiyun-official-login-v2', 'synthetic'); await h.target.zhiyun.call('session.restore'); assert.equal(h.calls.some(c => c.method === 'app.silentLogin'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('old mismatched account cannot trigger silent authentication', async () => {
 const h = harness(); try { installAndroidServices(); h.secrets.set('zhiyun-official-login-v2', JSON.stringify({username:'fixture', password:'secret', accountId:'other-id'})); await h.target.zhiyun.call('session.restore'); assert.equal(h.calls.some(c => c.method === 'app.silentLogin'), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});

test('legacy WebView verifier stays disabled while native CAS handles only real401 consented login', () => {
 const verifier = fs.readFileSync('app/src/main/java/cn/suike/slides/android/CredentialVerifier.java', 'utf8');
 assert.doesNotMatch(verifier, /evaluateJavascript\s*\(/);
 assert.doesNotMatch(verifier, /getKaptchaStatus|\.click\(\)|"checking"\.equals\(result\)/);
 const bridge = fs.readFileSync('app/src/main/java/cn/suike/slides/android/NativeIO.java', 'utf8');
 assert.match(bridge, /silentLoginAfter401\(loginPermit\)/);
 assert.match(bridge, /data\.put\("_nativeLoginPermit",nativeLogin==null\?-1:nativeLogin\.generation\(\)\)/);
 assert.match(bridge, /permit!=nativeLogin\.generation\(\)/);
 assert.match(bridge, /cancelNativeLogin\(\) \{ unauthorizedGeneration=-1;/);
 assert.match(bridge, /unauthorizedGeneration!=instanceGeneration/);
 assert.match(bridge, /NativeCasPrototype::newExplicitlyAuthorizedTransport/);
 assert.match(bridge, /method\.equals\("app\.cleanupLoginProfiles"\)\) throw new IOException/);
 const renderer = fs.readFileSync('src/renderer/App.tsx', 'utf8');
 assert.match(renderer, /if\(result\?\.warning\)show\(result\.warning\)/);
});
test('native acceptance is startup-off and its manual entry copy distinguishes opt-in verification', () => {
 const bridge=fs.readFileSync('app/src/main/java/cn/suike/slides/android/NativeIO.java','utf8');
 const activity=fs.readFileSync('app/src/main/java/cn/suike/slides/android/MainActivity.java','utf8');
 const manual=fs.readFileSync('app/src/main/java/cn/suike/slides/android/OfficialLoginActivity.java','utf8');
 assert.match(bridge,/private volatile boolean nativeValidationEnabled;/);
 assert.match(bridge,/!nativeForeground \|\| !nativeValidationEnabled \|\| unauthorizedGeneration!=instanceGeneration/);
 assert.match(activity,/原生账号验收（启动时默认关闭）/);
 assert.match(activity,/本次由你本人逐项明确同意后/);
 assert.match(activity,/此按钮本身不发送 CAS POST/);
 assert.match(manual,/本官方页面不捕获或保存密码，也不会自动提交/);
 assert.doesNotMatch(manual,/自动登录暂不可用/);
});
test('public Release signing refuses acceptance keys and does not skip release lint', () => {
 const script=fs.readFileSync('scripts/android-build.py','utf8');
 assert.match(script,/if kind == 'release' and actual != 'aa8632ac2a50e36214b77dee1dcd7029b56e8717dda020c40c334b73c1d750a8'/);
 assert.match(script,/Public Release must use the established production certificate/);
 assert.doesNotMatch(script,/skip-release-lint|lintVitalRelease/);
 assert.match(script,/--ks-pass','env:ZHIYUN_KEYSTORE_PASSWORD'/);
});
test('native report and anonymous preflight routes discard all renderer protocol and consent data', async () => {
 const h=harness(); try {
  h.setHandler(async method=>method==='app.viewNativeDiagnostics'||method==='app.nativeAnonymousPreflight'?{handled:true,value:false}:{handled:false});
  installAndroidServices();
  for(const method of ['app.viewNativeDiagnostics','app.nativeAnonymousPreflight']) {
   await h.target.zhiyun.call(method,{password:'synthetic-canary',consent:true,url:'https://invalid.example/'});
   assert.deepEqual(h.calls.find(c=>c.method===method)?.payload,{});
  }
  assert.equal(h.calls.some(c=>c.method==='app.silentLogin'||c.method==='app.login'||c.method==='http.request'),false);
  await h.target.__zhiyunDispose();
 } finally { h.dispose(); }
});
test('privacy diagnostics are read only and anonymous network needs a native positive button', () => {
 const view=fs.readFileSync('src/renderer/NativeDiagnostics.tsx','utf8');
 const activity=fs.readFileSync('app/src/main/java/cn/suike/slides/android/MainActivity.java','utf8');
 assert.match(view,/查看上次原生诊断/); assert.match(view,/0 密码 POST/);
 assert.doesNotMatch(view,/useEffect|fetch\(|XMLHttpRequest|error\.message/);
 assert.match(activity,/setPositiveButton\("仅运行匿名预检"/);
 assert.match(activity,/io\.nativeDiagnosticReport\(\)/);
 assert.match(activity,/不读取保存密码、不提交密码、不预留或恢复认证额度，不开启自动登录/);
});
test('acceptance signing has a separate filename, fixed device certificate and non-debuggable release guard', () => {
 const script=fs.readFileSync('scripts/android-build.py','utf8');
 assert.match(script,/ef7f41fb43f810a9eefa34848f3801c20f97554b1682abd546c99788d9d6b08b/);
 assert.match(script,/'-acceptance' if args\.acceptance/);
 assert.match(script,/Release\/acceptance APK must not be debuggable/);
 assert.match(script,/if args\.acceptance and \(args\.debug or args\.unsigned or args\.instrumentation\)/);
});
test('bridge propagates native errors and unsubscribed events do not fire', async () => {
 const h = harness(); try { await assert.rejects(h.bridge.call('unknown'), /unsupported async/); assert.throws(() => h.bridge.sync('unknown'), /unsupported sync/); let count = 0; const off = h.bridge.on('test', () => count++); h.event('test', {}); off(); h.event('test', {}); assert.equal(count, 1); } finally { h.dispose(); }
});
test('native account settings discard renderer credential and consent payload and refresh only after adoption', async () => {
 const h=harness(); try {
  h.setHandler(async method => method==='app.nativeAccountSettings'?{handled:true,value:true}:{handled:false});
  installAndroidServices(); const events:any[]=[]; h.target.zhiyun.on('session',(value:any)=>events.push(value));
  assert.equal(await h.target.zhiyun.call('app.nativeAccountSettings',{username:'forged',password:'never-forward',consent:true}),true);
  const native=h.calls.find(c=>c.method==='app.nativeAccountSettings'); assert.deepEqual(native?.payload,{});
  assert.equal(events.length,1); assert.equal(events[0].id,'test-student');
  assert.equal(h.calls.some(c=>c.method==='app.silentLogin'),false);
  await h.target.__zhiyunDispose();
 } finally { h.dispose(); }
});
test('cancelled native consent dialog cannot refresh identity or save credentials', async () => {
 const h=harness(); try {
  h.setHandler(async method => method==='app.nativeAccountSettings'?{handled:true,value:false}:{handled:false});
  installAndroidServices(); assert.equal(await h.target.zhiyun.call('app.nativeAccountSettings'),false);
  assert.equal(h.calls.some(c=>c.method==='http.request'||c.method==='secret.set'),false);
  await h.target.__zhiyunDispose();
 } finally { h.dispose(); }
});
test('late native success after logout cannot publish or query an account', async () => {
 const h=harness(); let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
 try {
  h.setHandler(async method=>{if(method==='app.nativeAccountSettings'){entered();await hold;return{handled:true,value:true};}return{handled:false};});
  installAndroidServices();let published=0;h.target.zhiyun.on('session',()=>published++);
  const pending=h.target.zhiyun.call('app.nativeAccountSettings');await started;
  await h.target.zhiyun.call('session.logout');release();await pending;
  assert.equal(published,0);assert.equal(h.calls.some(c=>c.method==='http.request'),false);
  await h.target.__zhiyunDispose();
 } finally { release?.();h.dispose(); }
});
test('HTTP403 and network errors never ask JavaScript to initiate automatic authentication', async () => {
 for(const status of [403,0]) {
  const h=harness(); try {
   h.setHandler(async method=>{if(method==='http.request'){if(status===0)throw new Error('offline');return{handled:true,value:{status,headers:{},body:'{}'}};}return{handled:false};});
   installAndroidServices();await assert.rejects(h.target.zhiyun.call('session.account'));
   assert.equal(h.calls.some(c=>c.method==='app.silentLogin'||c.method==='app.nativeAccountSettings'),false);
   await h.target.__zhiyunDispose();
  } finally {h.dispose();}
 }
});
test('Android descriptors preserve append, truncate, utf8 and chunked binary round trips', () => {
 const h = harness(); try { const file = nodePath.join(h.root, 'chunks.bin'), a = fileIo.openSync(file, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC); const expected = Buffer.alloc(700 * 1024, 133); assert.equal(fileIo.writeSync(a.fd, expected), expected.length); fileIo.closeSync(a); const reader = fileIo.openSync(file); const actual = new ArrayBuffer(expected.length); assert.equal(fileIo.readSync(reader.fd, actual), expected.length); assert.deepEqual(Buffer.from(actual), expected); fileIo.closeSync(reader); const append = fileIo.openSync(file, fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.APPEND); fileIo.truncateSync(append.fd, 0); fileIo.writeSync(append.fd, '课堂笔记 123'); fileIo.closeSync(append); assert.equal(fileIo.readTextSync(file), '课堂笔记 123'); } finally { h.dispose(); }
});
test('SSE/ASR byte stream preserves split UTF8, headers and early completion before native response', async () => {
 const h = harness(); const request = http.createHttp(); try { const data = new TextEncoder().encode('实时输出🌱'), decoder = new util.TextDecoder(), chunks: string[] = [], order: string[] = []; request.on('headersReceive', (headers: any) => { assert.equal(headers['content-length'], String(data.length)); order.push('headers'); }); request.on('dataReceive', (bytes: ArrayBuffer) => { chunks.push(decoder.decodeToString(new Uint8Array(bytes), { stream: true })); order.push('data'); }); request.on('dataEnd', () => order.push('end')); h.setStream(async p => { h.event('http.headers', { requestId: p.requestId, headers: { 'Content-Length': String(data.length) } }); let sequence = 0; assert.equal(p.backpressure, true); for (const bytes of [data.slice(0, 2), data.slice(2, 8), data.slice(8)]) h.event('http.data', { requestId: p.requestId, sequence: sequence++, base64: Buffer.from(bytes).toString('base64') }); h.event('http.end', { requestId: p.requestId }); return { status: 200 }; }); assert.equal(await request.requestInStream('https://api.deepseek.com/chat/completions'), 200); assert.equal(chunks.join(''), '实时输出🌱'); assert.equal(order[0], 'headers'); assert.equal(order.at(-1), 'end'); assert.deepEqual(h.calls.filter(call => call.method === 'http.ack').map(call => call.payload.sequence), [0, 1, 2]); } finally { request.destroy(); h.dispose(); }
});
test('video streams are not accidentally truncated at normal 12MiB JSON request bound', async () => {
 const h = harness(), request = http.createHttp(); try { let received = 0; request.on('dataReceive', (bytes: ArrayBuffer) => received += bytes.byteLength); h.setStream(async p => { assert.equal(p.maxBytes, 64 * 1024 * 1024 * 1024); const chunk = Buffer.alloc(64 * 1024).toString('base64'); h.event('http.headers', { requestId: p.requestId, headers: {} }); for (let index = 0; index < 220; index++) h.event('http.data', { requestId: p.requestId, base64: chunk }); h.event('http.end', { requestId: p.requestId }); return 200; }); assert.equal(await request.requestInStream('https://classroom.zju.edu.cn/video.mp4'), 200); assert.equal(received, 220 * 64 * 1024); } finally { request.destroy(); h.dispose(); }
});
test('canceled requests stop receiving late native bytes and limits report useful errors', async () => {
 const h = harness(), request = http.createHttp(); try { let count = 0; request.on('dataReceive', () => count++); h.setStream(async p => { h.event('http.data', { requestId: p.requestId, base64: Buffer.alloc(32).toString('base64') }); h.event('http.data', { requestId: p.requestId, base64: Buffer.alloc(1).toString('base64') }); h.event('http.end', { requestId: p.requestId }); return 200; }); await assert.rejects(request.requestInStream('https://classroom.zju.edu.cn/file', { maxLimit: 16 }), /资源超过允许大小|已取消/); assert.equal(count, 0); assert.ok(h.canceled.length); assert.throws(() => fileIo.openSync('https://bad.example'), /unsupported|ENOENT/); await assert.rejects(http.createHttp().request('https://evil.example'), /不属于课程服务/); } finally { request.destroy(); h.dispose(); }
});
test('secure sessions, progress, notes and course collections survive reopening without a network; logout hides account', async () => {
 const h = harness(); let services = createServices(createAndroidSession(h.cache), h.root, () => {}); try { await services.handle('session.account'); await services.handle('progress.set', { course, seconds: 733, slideId: 'p4', followVideo: false, transcriptAnchor: { id: 'line-1', t: 730, offset: -12, browsing: true } }); await services.handle('collection.toggle', { kind: 'favorite', course }); await services.handle('collection.toggle', { kind: 'later', course }); await services.handle('notes.save', { note: { id: 'default', title: '课堂笔记', course, atoms: [{ kind: 'text', value: '本地笔记 123', at: 733 }], anchors: [], savedAt: 1 } }); await services.dispose(); h.setNetwork(false); services = createServices(createAndroidSession(h.cache), h.root, () => {}); const account = await services.handle('session.restore'); assert.equal(account.id, 'test-student'); assert.equal(account.offline, true); assert.equal((await services.handle('progress.get', { course })).seconds, 733); assert.equal((await services.handle('notes.list', { course }))[0].atoms[0].value, '本地笔记 123'); const collections = await services.handle('collection.get'); assert.equal(collections.favorite.length, 1); assert.equal(collections.later.length, 1); assert.ok(h.secrets.has('zhiyun-last-account-v1')); assert.equal(fs.existsSync(nodePath.join(h.root, 'last-account.json')), false); await services.handle('session.logout'); await assert.rejects(services.handle('notes.list'), /请先登录/); assert.equal(await services.handle('session.restore'), null); } finally { await services.dispose(); h.dispose(); }
});
test('download tasks resume safely paused, offline snapshots and video resources stay available on relaunch', async () => {
 const h = harness(); let services = createServices(createAndroidSession(h.cache), h.root, () => {}); try { await services.handle('session.account'); await services.dispose(); const folder = nodePath.join(h.root, 'data', 'account-' + key('test-student')); const video = nodePath.join(folder, 'lecture.mp4'); fs.writeFileSync(video, Buffer.from('video fixture')); fs.writeFileSync(nodePath.join(folder, 'offline-v1.json'), JSON.stringify([{ course, options: { video: true, transcript: true, slides: false }, videoUri: 'file://' + video, videoOffset: 0, savedAt: 1, partial: false, bytes: 13 }])); fs.writeFileSync(nodePath.join(folder, 'offline-snapshot-' + key(course.subId) + '.json'), JSON.stringify({ course, slides: [], lines: [{ id: 'x', t: 2, end: 4, text: '离线转写' }], savedAt: 1 })); fs.writeFileSync(nodePath.join(folder, 'download-jobs-v1.json'), JSON.stringify([{ id: 'job', course, options: { video: true }, state: 'running', progress: .5, parts: [] }])); h.setNetwork(false); services = createServices(createAndroidSession(h.cache), h.root, () => {}); await services.handle('session.restore'); assert.equal((await services.handle('download.list')).tasks[0].state, 'paused'); const lesson = await services.handle('lesson.open', { course, offline: true }); assert.equal(lesson.lines[0].text, '离线转写'); assert.equal(lesson.offline, true); assert.ok(lesson.sources[0].url.startsWith('https://appassets.androidplatform.net/resource/')); assert.equal(h.registered.get(lesson.sources[0].url).path, video); } finally { await services.dispose(); h.dispose(); }
});
test('large note exports are prepared as native files and cleaned after system export without JSON byte arrays', async () => {
 const h = harness(); try { installAndroidServices(); await h.target.zhiyun.call('session.account'); const note = { id: 'default', title: '课堂笔记', course, atoms: [{ kind: 'text', value: '文字与格式', at: 3 }], anchors: [], savedAt: 1 }; await h.target.zhiyun.call('notes.save', { note }); const result = await h.target.zhiyun.call('notes.export', { notes: [note], format: 'html' }); assert.equal(result.saved, true); assert.match(Buffer.from(h.exports[0]).toString('utf8'), /文字与格式/); assert.equal(fs.readdirSync(h.cache).filter(name => name.startsWith('notes-export-')).length, 0); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});

test('late stream errors after status propagate rather than hanging until timeout', async () => {
 const h = harness(), request = http.createHttp(); try { h.setStream(async p => { queueMicrotask(() => h.event('http.error', { requestId: p.requestId, error: '连接中断' })); return 200; }); await assert.rejects(request.requestInStream('https://classroom.zju.edu.cn/file'), /连接中断/); } finally { request.destroy(); h.dispose(); }
});
test('high-resolution border detection analyzes a bounded preview and crops the original resolution natively', async () => {
 const h = harness(), originalWorker = (globalThis as any).Worker;
 class WorkerMock { onmessage?: (event: any) => void; onerror?: () => void; constructor(_url: string) {} postMessage(job: any) { queueMicrotask(() => this.onmessage?.({ data: { id: job.id, value: blackBorderRegion(new Uint8Array(job.a), job.width, job.height, job.strideA) } })); } terminate() {} }
 (globalThis as any).Worker = WorkerMock;
 try { const local = new LocalStore({ filesDir: nodePath.join(h.root, 'data'), cacheDir: h.cache, tempDir: h.temp }, 'crop-test'); local.useCourse(course); const url = 'https://classroom.zju.edu.cn/slide.png', directory = nodePath.join(local.dataFolder, 'resource-cache/slides/assets'), source = nodePath.join(directory, key(url) + '.png'); fs.writeFileSync(source, 'original resolution fixture'); fs.writeFileSync(nodePath.join(directory, key(url) + '.meta.json'), JSON.stringify({ path: source, checkedAt: Date.now() })); const result = await local.trimmedImage(url, course); assert.notEqual(result, 'file://' + source); const read = h.calls.find(call => call.method === 'image.pixels')!.payload; assert.ok(read.width * read.height <= 1440 * 1440); const crop = h.calls.find(call => call.method === 'image.crop')!.payload; assert.equal(crop.path, source); assert.equal(crop.height, 2000); assert.equal(crop.x, 83); assert.equal(crop.width, 2834); assert.equal(fs.readFileSync(new URL(result), 'utf8'), 'full resolution crop'); } finally { await disposeImageJobs(); (globalThis as any).Worker = originalWorker; h.dispose(); }
});

test('logout serializes behind in-flight secure writes so an old account cannot reappear afterward', async () => {
 const h = harness(), services = createServices(createAndroidSession(h.cache), h.root, () => {});
 try { await services.handle('session.account'); const blocked = h.delaySecretSet(), remember = SessionStore.rememberAccount({ id: 'old-account', name: 'Old', tenantId: 112 }); await blocked.entered; const logout = services.handle('session.logout'); blocked.release(); await Promise.all([remember, logout]); assert.equal(await SessionStore.savedAccount(), undefined); assert.equal(h.secrets.size, 0); assert.equal(await services.handle('session.restore'), null); } finally { await services.dispose(); h.dispose(); }
});

test('large gallery data is written atomically through bounded chunks rather than exceeding bridge message limits', () => {
 const h = harness(); try { const file = nodePath.join(h.root, 'photo.png'), bytes = new Uint8Array(20 * 1024 * 1024); bytes[0] = 137; bytes[bytes.length - 1] = 99; androidFs.writeFileSync(file, bytes); assert.equal(fs.statSync(file).size, bytes.length); const fd = fs.openSync(file, 'r'), first = Buffer.alloc(1), last = Buffer.alloc(1); fs.readSync(fd, first, 0, 1, 0); fs.readSync(fd, last, 0, 1, bytes.length - 1); fs.closeSync(fd); assert.equal(first[0], 137); assert.equal(last[0], 99); assert.equal(fs.readdirSync(h.root).some(name => name.includes('.write-')), false); } finally { h.dispose(); }
});
test('HTML notes with images export named separate resources in a ZIP instead of giant base64 strings', async () => {
 const h = harness(); try { installAndroidServices(); await h.target.zhiyun.call('session.account'); const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]); const image = await h.target.zhiyun.call('notes.saveImage', { data: 'data:image/png;base64,' + png.toString('base64') }); const note = { id: 'default', title: '我的笔记', course: { ...course, term: '2026 秋' }, atoms: [{ kind: 'image', value: image.uri, at: 3 }, { kind: 'text', value: '图像说明', at: 4 }], anchors: [], savedAt: 1 }; await h.target.zhiyun.call('notes.save', { note }); const result = await h.target.zhiyun.call('notes.export', { notes: [note], format: 'html' }); assert.equal(result.saved, true); const zip = await JSZip.loadAsync(h.exports[0]), names = Object.keys(zip.files), htmlName = names.find(name => name.endsWith('.html'))!, imageName = names.find(name => /我的笔记_图片1\.png$/.test(name))!; assert.ok(htmlName); assert.ok(imageName); const html = await zip.file(htmlName)!.async('string'); assert.ok(html.includes('images/' + encodeURIComponent('我的笔记_图片1.png'))); assert.equal(html.includes('data:image/'), false); assert.ok(html.includes('图像说明')); assert.deepEqual(await zip.file(imageName)!.async('uint8array'), new Uint8Array(png)); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});

test('an account probe finishing after logout cannot emit or return a logged-in stale account', async () => {
 const h = harness(), services = createServices(createAndroidSession(h.cache), h.root, () => {});
 try { await services.handle('session.account'); const blocked = h.delaySecretSet(), accountProbe = services.handle('session.account'); const rejected = assert.rejects(accountProbe, /登录操作已取消/); await blocked.entered; const logout = services.handle('session.logout'); blocked.release(); await Promise.all([logout, rejected]); assert.equal(await SessionStore.savedAccount(), undefined); assert.equal(await services.handle('session.restore'), null); } finally { await services.dispose(); h.dispose(); }
});

test('future live lessons retain prepared resources, avoid premature polling/socket traffic and start seamlessly on schedule', async t => {
 const h = harness(), services = createServices(createAndroidSession(h.cache), h.root, () => {}), now = Date.UTC(2026, 9, 13, 12), start = now / 1000 + 3.8 * 86400;
 const prototype = Zhiyun.prototype, originals = { permission: prototype.checkCurrentPermission, slides: prototype.slides, transcripts: prototype.transcripts, info: prototype.info, address: prototype.liveCaptionAddress };
 let infoCalls = 0, transcriptCalls = 0; const events: Array<{name: string; value: any}> = [];
 const future = { ...course, status: '2', start, end: start + 3600 }, slide = { id: 'prepared', t: 0, url: 'https://classroom.zju.edu.cn/prepared.png', thumb: '', note: '' };
 t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
 prototype.checkCurrentPermission = async () => {}; prototype.slides = async () => [slide]; prototype.transcripts = async () => { transcriptCalls++; return []; }; prototype.info = async () => { infoCalls++; return {}; }; prototype.liveCaptionAddress = async () => 'wss://classroom.zju.edu.cn/glue/ws';
 try { await services.handle('session.account'); const prepared = new LocalStore({ filesDir: nodePath.join(h.root, 'data'), cacheDir: h.cache, tempDir: h.cache }, 'test-student'); prepared.useCourse(future); prepared.save({ course: future, slides: [slide], lines: [], savedAt: now }); prepared.cache.flush(); const opened = await services.handle('lesson.open', { course: future }); assert.equal(opened.slides[0].id, 'prepared'); const initial = await services.handle('lesson.refresh'); assert.match(initial.historyStatus, /课程尚未开始/); const before = transcriptCalls; t.mock.timers.tick(7000); for (let i = 0; i < 20; i++) await Promise.resolve(); assert.equal(infoCalls, 0); assert.equal(transcriptCalls, before); await services.lifecycle(false); await services.lifecycle(true); assert.equal(infoCalls, 0); assert.equal(transcriptCalls, before); t.mock.timers.tick(start * 1000 - Date.now() - 1); assert.equal(infoCalls, 0); t.mock.timers.tick(1); for (let i = 0; i < 40; i++) await Promise.resolve(); assert.equal(infoCalls, 1); assert.ok(transcriptCalls > before); assert.ok(h.calls.some(call => call.method === 'websocket.connect')); const started = await services.handle('lesson.refresh'); assert.equal(started.historyStatus.includes('尚未开始'), false); assert.equal(started.slides[0].id, 'prepared'); } finally { await services.dispose(); prototype.checkCurrentPermission = originals.permission; prototype.slides = originals.slides; prototype.transcripts = originals.transcripts; prototype.info = originals.info; prototype.liveCaptionAddress = originals.address; t.mock.timers.reset(); h.dispose(); }
});

test('runtime cache clearing protects a prepared note file throughout the SAF save dialog and releases it afterward', async () => {
 const h = harness(); try { installAndroidServices(); await h.target.zhiyun.call('session.account'); const blocked = h.delayExport(), note = { id: 'default', title: '导出保护', course: { ...course, term: '2026 秋' }, atoms: [{ kind: 'text', value: '不能被缓存清理删除', at: 3 }], anchors: [], savedAt: 1 }; const saving = h.target.zhiyun.call('notes.export', { notes: [note], format: 'txt' }); await blocked.entered; const source = h.calls.find(call => call.method === 'export.share')!.payload.path, details = await h.target.zhiyun.call('cache.detail', { kind: 'runtime' }), entry = details.find((row: any) => row.id === source); assert.equal(entry.protected, true); assert.match(entry.title, /正在导出/); await h.target.zhiyun.call('cache.clear', { kind: 'runtime', ids: [source] }); await h.target.zhiyun.call('cache.clearAll'); assert.equal(fs.existsSync(source), true); blocked.release(); const result = await saving; assert.equal(result.saved, true); assert.match(Buffer.from(h.exports[0]).toString('utf8'), /不能被缓存清理删除/); assert.equal(fs.existsSync(source), false); assert.equal((await h.target.zhiyun.call('cache.detail', { kind: 'runtime' })).some((row: any) => row.id === source), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('a note export staging folder remains protected while the native ZIP job is still processing', async () => {
 const h = harness(); try { installAndroidServices(); await h.target.zhiyun.call('session.account'); const blocked = h.delayZip(), note = { id: 'default', title: '打包保护', course: { ...course, term: '2026 秋' }, atoms: [{ kind: 'text', value: '正在准备的笔记', at: 3 }], anchors: [], savedAt: 1 }; const saving = h.target.zhiyun.call('notes.export', { notes: [note], format: 'md' }); await blocked.entered; const folder = h.calls.find(call => call.method === 'zip.create')!.payload.folder, entry = (await h.target.zhiyun.call('cache.detail', { kind: 'runtime' })).find((row: any) => row.id === folder); assert.equal(entry.protected, true); await h.target.zhiyun.call('cache.clearAll'); assert.equal(fs.existsSync(folder), true); blocked.release(); assert.equal((await saving).saved, true); const zip = await JSZip.loadAsync(h.exports[0]); assert.ok(Object.keys(zip.files).some(name => name.endsWith('.md'))); assert.equal(fs.existsSync(folder), false); await h.target.__zhiyunDispose(); } finally { h.dispose(); }
});
test('lazy video sources survive a lesson refresh that began before the sources request finished', async () => {
 const h = harness(), events: any[] = [], services = createServices(createAndroidSession(h.cache), h.root, (name, value) => { if (name === 'lesson') events.push(value); });
 const prototype = Zhiyun.prototype, original = { permission: prototype.checkCurrentPermission, slides: prototype.slides, transcripts: prototype.transcripts, videos: prototype.videos }; let release!: () => void, entered!: () => void, delayed = false; const gate = new Promise<void>(resolve => release = resolve), started = new Promise<void>(resolve => entered = resolve);
 const source = { id: 'camera-1', title: '课程录像', url: 'https://classroom.zju.edu.cn/lesson.mp4', live: false };
 prototype.checkCurrentPermission = async () => {}; prototype.slides = async () => { if (delayed) { entered(); await gate; } return []; }; prototype.transcripts = async () => []; prototype.videos = async () => [source];
 try { await services.handle('session.account'); await services.handle('lesson.open', { course }); delayed = true; const refresh = services.handle('lesson.refresh'); await started; assert.deepEqual(await services.handle('video.sources', { course }), [source]); release(); const refreshed = await refresh; assert.deepEqual(refreshed.sources, [source]); assert.deepEqual(events.at(-1).sources, [source]); assert.deepEqual((await services.handle('lesson.refresh')).sources, [source]); } finally { await services.dispose(); prototype.checkCurrentPermission = original.permission; prototype.slides = original.slides; prototype.transcripts = original.transcripts; prototype.videos = original.videos; h.dispose(); }
});
test('a late camera request for a previous lesson cannot populate the new lesson video sources', async () => {
 const h = harness(), services = createServices(createAndroidSession(h.cache), h.root, () => {}), prototype = Zhiyun.prototype, original = { permission: prototype.checkCurrentPermission, slides: prototype.slides, transcripts: prototype.transcripts, videos: prototype.videos }; let release!: () => void, entered!: () => void; const gate = new Promise<void>(resolve => release = resolve), started = new Promise<void>(resolve => entered = resolve); const source = { id: 'old', title: '旧课程录像', url: 'https://classroom.zju.edu.cn/old.mp4', live: false }, next = { ...course, subId: 'lecture-2', title: 'Next' };
 prototype.checkCurrentPermission = async () => {}; prototype.slides = async () => []; prototype.transcripts = async () => []; prototype.videos = async () => { entered(); await gate; return [source]; };
 try { await services.handle('session.account'); await services.handle('lesson.open', { course }); const pending = services.handle('video.sources', { course }); await started; await services.handle('lesson.open', { course: next }); release(); assert.deepEqual(await pending, [source]); const refreshed = await services.handle('lesson.refresh'); assert.equal(refreshed.course.subId, next.subId); assert.deepEqual(refreshed.sources, []); } finally { await services.dispose(); prototype.checkCurrentPermission = original.permission; prototype.slides = original.slides; prototype.transcripts = original.transcripts; prototype.videos = original.videos; h.dispose(); }
});

test('runtime cache policy reaches WebView and video buffer has no misleading persistence switch', async () => { const h=harness(), services=createServices(createAndroidSession(h.cache),h.root,()=>{}); try { await services.handle('session.account'); await services.handle('cache.toggle',{kind:'runtime',enabled:false}); assert.ok(h.calls.some(c=>c.method==='app.cachePolicy' && c.payload.enabled===false)); const rows=await services.handle('cache.list'); assert.equal(rows.find((r:any)=>r.kind==='runtime').enabled,false); assert.equal(rows.find((r:any)=>r.kind==='video').controllable,false); } finally { await services.dispose();h.dispose(); } });
test('assistant history is listed, controllable and removed with all caches', async () => {
 const h=harness(), events:string[]=[]; const services=createServices(createAndroidSession(h.cache),h.root,(name)=>events.push(name));
 try { await services.handle('session.account'); const value=[{id:'synthetic',turns:[]}]; await services.handle('storage.set',{key:'app-assistant-history-v1',value});
  assert.deepEqual(await services.handle('storage.get',{key:'app-assistant-history-v1'}),value);
  assert.equal((await services.handle('cache.list')).find((row:any)=>row.kind==='assistant')?.count,1);
  await services.handle('cache.clear',{kind:'assistant'}); assert.equal(await services.handle('storage.get',{key:'app-assistant-history-v1'}),null); assert.ok(events.includes('assistant.historyCleared'));
  await services.handle('cache.toggle',{kind:'assistant',enabled:false}); await services.handle('storage.set',{key:'app-assistant-history-v1',value}); assert.equal(await services.handle('storage.get',{key:'app-assistant-history-v1'}),null);
  await services.handle('cache.toggle',{kind:'assistant',enabled:true}); await services.handle('storage.set',{key:'app-assistant-history-v1',value}); await services.handle('cache.clearAll'); assert.equal(await services.handle('storage.get',{key:'app-assistant-history-v1'}),null);
 } finally { await services.dispose(); h.dispose(); }
});
test('assistant requests cancelled before dispatch never start model or history work', async () => {
 const h=harness(), services=createServices(createAndroidSession(h.cache),h.root,()=>{});
 try { await services.handle('session.account'); await services.handle('ai.cancel',{requestId:'assistant-before'}); await assert.rejects(services.handle('assistant.turn',{requestId:'assistant-before',messages:[],tools:[]}),/任务已停止/);
  await services.handle('ai.cancel',{requestId:'history-before'}); await assert.rejects(services.handle('assistant.history',{requestId:'history-before'}),/任务已停止/);
 } finally { await services.dispose(); h.dispose(); }
});

test('assistant slide recognition respects a newly revoked course permission', async () => {
 const h=harness(), services=createServices(createAndroidSession(h.cache),h.root,()=>{}), prototype=Zhiyun.prototype; let allowed=true, reads=0;
 const original={permission:prototype.checkCurrentPermission,slides:prototype.slides,transcripts:prototype.transcripts,read:AiClient.prototype.assistantReadSlide};
 prototype.checkCurrentPermission=async()=>{if(!allowed)throw new Error('没有访问权限');}; prototype.slides=async()=>[{id:'fixture-slide',t:0,url:'https://classroom.zju.edu.cn/fixture.png',thumb:'',note:''}]; prototype.transcripts=async()=>[]; AiClient.prototype.assistantReadSlide=async()=>{reads++;return 'synthetic';};
 try { await services.handle('session.account'); await services.handle('lesson.open',{course}); allowed=false;
  await assert.rejects(services.handle('assistant.readSlide',{requestId:'assistant-slide-test',slideId:'fixture-slide'}),/访问权限/); assert.equal(reads,0); await assert.rejects(services.handle('assistant.readTranscript',{requestId:'assistant-transcript-test',offset:0}),/访问权限/);
 } finally { prototype.checkCurrentPermission=original.permission; prototype.slides=original.slides; prototype.transcripts=original.transcripts; AiClient.prototype.assistantReadSlide=original.read; await services.dispose(); h.dispose(); }
});

test('stopping assistant history scanning prevents late cache writes', async () => {
 const h=harness(), services=createServices(createAndroidSession(h.cache),h.root,()=>{}); const original=Zhiyun.prototype.attendanceHistory; let release!:()=>void, started!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve), entered=new Promise<void>(resolve=>started=resolve);
 Zhiyun.prototype.attendanceHistory=async()=>{started();await gate;return {courses:[],cursor:'',emptyWindows:0,complete:true,windowsDone:1,failed:false};};
 try {await services.handle('session.account');const pending=services.handle('assistant.history',{requestId:'history-running'});await entered;await services.handle('ai.cancel',{requestId:'history-running'});release();await assert.rejects(pending,/任务已停止/);const cached=await services.handle('assistant.cachedHistory');assert.equal(cached.complete,false);}
 finally {Zhiyun.prototype.attendanceHistory=original;await services.dispose();h.dispose();}
});
test('assistant uses the real streaming transport for thinking and tool calls', async () => {
 const h=harness(), saved=AiClient.savedKey;AiClient.savedKey=async()=> 'synthetic-only'; const client=new AiClient();let request:any;
 try {h.setStream(async p=>{request=p;const content=[
  'data: {"choices":[{"delta":{"reasoning_content":"reason"}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call1","type":"function","function":{"name":"app_do","arguments":"{\\"action\\":\\"back\\",\\"args\\":{}}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n'
 ].join('');h.event('http.data',{requestId:p.requestId,sequence:0,base64:Buffer.from(content).toString('base64')});h.event('http.end',{requestId:p.requestId});return {status:200};});
 const result=await client.assistantTurn({} as any,'deepseek-flash',[{role:'user',content:'返回'}],[],()=>{});assert.equal(result.reasoning_content,'reason');assert.equal(result.calls[0].function.name,'app_do');assert.equal(JSON.parse(result.calls[0].function.arguments).action,'back');assert.equal(request.url,'https://api.deepseek.com/chat/completions');
 } finally {client.cancel();AiClient.savedKey=saved;h.dispose();}
});
