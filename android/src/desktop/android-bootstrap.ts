import { installNativeBridge } from './android-native';
import { createAndroidSession, fileIo } from './compat';
import { LocalStore } from '../shared/services/LocalStore';
import { createServices } from './services';
import { fs, path, crypto } from './android-tools';

/** Install before React mounts. Services and renderer communicate without an Electron process. */
export function installAndroidServices(): void {
 const native = installNativeBridge(), paths = native.sync<any>('app.paths');
 const events = new Map<string, Set<(value: any) => void>>();
 let lastDownloadsActive = false, lastDownloadCount = 0;
 const downloadTasks = new Map<string, any>();
 const emit = (name: string, value: any) => {
  if (name === 'downloads') { if (value.tasks) { downloadTasks.clear(); value.tasks.forEach((row: any) => downloadTasks.set(row.id, row)); } else (value.taskUpdates || []).forEach((row: any) => downloadTasks.set(row.id, { ...downloadTasks.get(row.id), ...row })); const rows = Array.from(downloadTasks.values()), active = rows.some((row: any) => row.state === 'running' || row.state === 'queued'), count = rows.filter((row: any) => row.state === 'running').length; if (active !== lastDownloadsActive || count !== lastDownloadCount) { lastDownloadsActive = active; lastDownloadCount = count; void native.call('app.downloads', { active, count }).catch(() => {}); } }
  for (const listener of Array.from(events.get(name) || [])) { try { listener(value); } catch (error) { console.error('Study event listener failed', error); } }
 };
 const services = createServices(createAndroidSession(paths.cacheDir), paths.root || paths.filesDir, emit);
 let login: Promise<any> | undefined, logout: Promise<any> | undefined, loginEpoch = 0;
 const callWithSession = async (method: string, payload: any): Promise<any> => {
  const gen = loginEpoch;
  const value = await services.handle(method, payload);
  if (gen !== loginEpoch) { if (method === 'session.restore') return null; throw new Error('登录操作已取消'); }
  return value;
 };
 window.zhiyun = {
  async call<T = any>(method: string, payload: any = {}): Promise<T> {
   if (method === 'session.logout') {
    if (!logout) {
     ++loginEpoch;
     logout = (async () => {
      let failure: unknown;
      try { await native.call('app.invalidateSession'); } catch (error) { failure = error; }
      // Tombstone precedes cleanup. Continue clearing the ordinary session even on failure.
      try { await native.call('app.revokeNativeCredentials'); } catch (error) { failure ||= error; }
      try { await native.call('app.cancelSilentLogin'); } catch (error) { failure ||= error; }
      try { await native.call('app.cancelLogin'); } catch (error) { failure ||= error; }
      let profileWarning = false;
      try { await native.call('app.checkLoginProfiles'); } catch (_) { profileWarning = true; }
      try { await login; } catch (error) { failure ||= error; }
      let sessionCleared = false;
      try { await services.handle('session.logout'); sessionCleared = true; } catch (error) { failure ||= error; }
      if (failure) {
       const message = ((failure as Error)?.message || '退出登录未完成') + (profileWarning ? '；隔离登录残留未确认清理' : '');
       const error = new Error(message) as Error & { sessionCleared?: boolean };
       error.sessionCleared = sessionCleared;
       throw error;
      }
      return profileWarning ? { warning: '隔离登录残留尚未确认清理；本次未删除隔离数据。原生私有登录不读取这些隔离数据。' } : null;
     })().finally(() => { logout = undefined; });
    }
    return logout as Promise<T>;
   }
   if (method === 'login.open' || method === 'app.login') {
    if (logout) await logout;
    if (!login) {
     const gen = ++loginEpoch;
     login = (async () => {
      await native.call('app.invalidateSession');
      await native.call('app.cancelSilentLogin');
      // NativeIO revokes saved-account consent before the manual page opens.
      // Unrelated isolated WebView profiles/markers are not read or adopted.
      await services.handle('session.logout');
      if (gen !== loginEpoch) return null;
      let result: any; try { result = await native.call<any>('app.login'); } catch (error) { if (/已取消登录/.test((error as Error).message)) return null; throw error; }
      if (gen !== loginEpoch || result === false || result?.cancelled) return null;
      const account = await services.handle('session.account');
      if (gen !== loginEpoch) return null;
      emit('session', account); return account;
     })().finally(() => { login = undefined; });
    }
    return login as Promise<T>;
   }
   if (method === 'app.nativeAccountSettings') {
    if (logout) await logout;
    if (login) await login;
    const gen = loginEpoch;
    const adopted = await native.call<boolean>('app.nativeAccountSettings');
    if (adopted && gen === loginEpoch) {
     const account = await services.handle('session.account');
     if (gen === loginEpoch) emit('session', account);
    }
    return adopted as T;
   }
   if (method === 'app.viewNativeDiagnostics' || method === 'app.nativeAnonymousPreflight') return native.call(method);
   if (method === 'app.info' || method === 'app.updateFeed') return native.call(method,payload);
   if (method === 'app.external') return native.call('app.openExternal', payload);
   if (method === 'clipboard.write') return native.call('app.clipboard', payload);
   if (method === 'clipboard.read') return native.call('app.clipboardRead');
   if (method === 'app.fullscreen') return native.call('app.fullscreen', payload);
   if (method === 'notes.pickImage') { const filePath = await native.call<string | null>('picker.image', payload); if (!filePath) return null as T; try { return await services.handle(method, { ...payload, filePath }); } finally { if (filePath.startsWith(path.join(paths.filesDir, 'imports') + '/')) fs.rmSync(filePath, { force: true }); } }
   if (method === 'notes.export') {
    const result = await services.handle(method, payload); if (!result?.data && !result?.path) return result;
    const destination = result.path || path.join(paths.tempDir, 'export-' + crypto.randomBytes(10).toString('hex') + '.' + result.extension);
    LocalStore.protectExport(destination);
    try {
     if (!result.path) { const file = fileIo.openSync(destination, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC); try { fileIo.writeSync(file.fd, result.data); } finally { fileIo.closeSync(file); } }
     const saved = await native.call<any>('export.share', { path: destination, name: result.filename }); return (saved ? { saved: true, path: saved } : { cancelled: true }) as T;
    } finally { LocalStore.releaseExport(destination); fs.rmSync(destination, { force: true }); }
   }
   if (method === 'resource.drag') { const result = await services.handle(method, payload); const started = await native.call('app.drag', result); if (!started) await native.call('export.share', { path: result.path, name: path.basename(result.path) }); return true as T; }
   return callWithSession(method, payload);
  },
  on(name, listener) { let listeners = events.get(name); if (!listeners) { listeners = new Set(); events.set(name, listeners); } listeners.add(listener); return () => { listeners!.delete(listener); if (!listeners!.size) events.delete(name); }; }
 };
 native.on('app.lifecycle', value => { void services.lifecycle(value.active === true).catch(() => {}); if (value.active === false) { const flush = (window as any).__zhiyunFlush; if (typeof flush === 'function') void Promise.resolve(flush()).catch(() => {}); } });
 native.on('app.manualLoginRequested', () => { void window.zhiyun.call('login.open').catch(error => emit('notice', (error as Error).message)); });
 (window as any).__zhiyunDispose = () => services.dispose();
}
