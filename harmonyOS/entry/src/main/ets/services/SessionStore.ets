import { Account } from '../model/Timeline';
import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';
import { BusinessError } from '@kit.BasicServicesKit';
import { NativeAccountAcceptance } from './NativeAccountAcceptance';

const CLASSROOM = 'https://classroom.zju.edu.cn';
const INTERACTIVE = 'https://interactivemeta.cmc.zju.edu.cn';
const PREFIX = 'zhiyun-official-session-v2';
const PIECE_SIZE = 960;
interface SavedSession { classroom: string; interactive: string; savedAt: number }
interface SessionManifest { slot: number; count: number; adoption?: string; pending?: boolean }
export interface SessionAdoptionReceipt { id: string; generation: number }
interface PendingSessionAdoption {
  receipt: SessionAdoptionReceipt; manifest: Uint8Array; committed?: Uint8Array; ready?: boolean;
  previous?: Uint8Array; previousAccount?: Uint8Array; writtenAccount?: Uint8Array;
  previousCurrent?: SavedSession; previousSlot: number; session: SavedSession; slot: number;
}
export class SessionStore {
  private static current: SavedSession | undefined = undefined;
  private static restoring: Promise<void> | undefined = undefined;
  private static queue: Promise<void> = Promise.resolve();
  private static epoch: number = 0;
  private static activeSlot: number = 1;
  private static sequence: number = 0;
  private static adoptions: Map<string, PendingSessionAdoption> = new Map();
  private static encode(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value); }
  private static decode(value: Uint8Array): string { return util.TextDecoder.create('utf-8').decodeToString(value); }
  private static async read(alias: string): Promise<Uint8Array | undefined> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, SessionStore.encode(alias)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const records = await asset.query(query);
      return records[0]?.get(asset.Tag.SECRET) as Uint8Array;
    } catch (_) { return undefined; }
  }
  private static async readForCommit(alias: string): Promise<Uint8Array | undefined> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, SessionStore.encode(alias)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const records = await asset.query(query);
      if (!records.length) return undefined;
      const secret = records[0].get(asset.Tag.SECRET) as Uint8Array;
      if (!secret) throw new Error('会话索引损坏');
      return secret;
    } catch (err) {
      if ((err as BusinessError).code === 24000002) return undefined;
      throw new Error('无法读取会话索引');
    }
  }
  private static async write(alias: string, bytes: Uint8Array): Promise<void> {
    const attrs: asset.AssetMap = new Map();
    attrs.set(asset.Tag.ALIAS, SessionStore.encode(alias)); attrs.set(asset.Tag.SECRET, bytes);
    attrs.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
    attrs.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    attrs.set(asset.Tag.DATA_LABEL_NORMAL_LOCAL_1, SessionStore.encode(PREFIX));
    await asset.add(attrs);
  }
  static async rememberAccount(account: Account): Promise<void> {
    const gen = SessionStore.epoch, bytes = SessionStore.encode(JSON.stringify(account));
    if (bytes.length > PIECE_SIZE) throw new Error('账户信息过长');
    const task = SessionStore.queue.catch(() => {}).then(async () => {
      if (gen !== SessionStore.epoch) throw new Error('登录已取消');
      const alias = PREFIX + '-account', previous = await SessionStore.readForCommit(alias);
      if (gen !== SessionStore.epoch) throw new Error('登录已取消');
      await SessionStore.write(alias, bytes);
      if (gen !== SessionStore.epoch) {
        // Account metadata must not survive a cancelled native adoption either.
        if (previous) await SessionStore.write(alias, previous);
        else {
          const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, SessionStore.encode(alias));
          try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('已取消但无法撤销账号写入'); }
        }
        throw new Error('登录已取消');
      }
    });
    SessionStore.queue = task; await task;
  }
  static async savedAccount(): Promise<Account | undefined> { const gen = SessionStore.epoch; const bytes = await SessionStore.read(PREFIX + '-account'); if (!bytes || gen !== SessionStore.epoch) return undefined; try { const value = JSON.parse(SessionStore.decode(bytes)) as Account; return value && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && Number.isFinite(value.tenantId) ? value : undefined; } catch (_) { return undefined; } }
  static async restore(): Promise<void> {
    if (SessionStore.current) return;
    if (!SessionStore.restoring) SessionStore.restoring = SessionStore.load();
    const job = SessionStore.restoring;
    try { await job; } finally { if (SessionStore.restoring === job) SessionStore.restoring = undefined; }
  }
  private static async load(): Promise<void> {
    const gen = SessionStore.epoch;
    try {
      const manifestBytes = await SessionStore.read(PREFIX);
      let value: Uint8Array | undefined;
      if (manifestBytes) {
        const manifest = JSON.parse(SessionStore.decode(manifestBytes)) as SessionManifest;
        if (manifest.pending || (manifest.slot !== 0 && manifest.slot !== 1) || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 64) return;
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (let i = 0; i < manifest.count; i++) {
          const piece = await SessionStore.read(`${PREFIX}-${manifest.slot}-${i}`);
          if (!piece || piece.length > PIECE_SIZE) return;
          chunks.push(piece); length += piece.length;
        }
        value = new Uint8Array(length);
        let offset = 0;
        chunks.forEach((chunk: Uint8Array) => { value!.set(chunk, offset); offset += chunk.length; });
        SessionStore.activeSlot = manifest.slot;
      } else {
        try { value = await SessionStore.read('zhiyun-official-session-v1'); } catch (_) {}
      }
      if (!value || gen !== SessionStore.epoch) return;
      const session = JSON.parse(SessionStore.decode(value)) as SavedSession;
      if (typeof session.classroom !== 'string' || typeof session.interactive !== 'string' || /[\r\n]/.test(session.classroom + session.interactive) || !Number.isFinite(session.savedAt) || Date.now() - session.savedAt > 30 * 86400000) return;
      SessionStore.current = session;
    } catch (_) {}
  }
  private static webCookie(origin: string): string {
    try { return webview.WebCookieManager.fetchCookieSync(origin); } catch (_) { return ''; }
  }
  static cookie(origin: string): string {
    const saved = origin === CLASSROOM ? SessionStore.current?.classroom : origin === INTERACTIVE ? SessionStore.current?.interactive : '';
    // Guest-page preloading must never replace a restored, authenticated cookie.
    return saved || SessionStore.webCookie(origin);
  }
  // A legacy session may exist without a separately persisted account. Only use it
  // to ask the official account endpoint; it is not itself proof of identity.
  static hasRecoverableSession(): boolean {
    const cookie = SessionStore.cookie(CLASSROOM);
    return !!cookie.trim() && !/[\r\n]/.test(cookie);
  }
  static beginLogin(): void { SessionStore.epoch++; SessionStore.current = undefined; }
  // After a silent re-login the browser holds a newer classroom session than the saved one.
  static async adoptWebSession(): Promise<void> { SessionStore.current = undefined; await SessionStore.saveCurrent(); }
  static generation(): number { return SessionStore.epoch; }
  // Cancel pending native adoption without deleting a previously valid session.
  static invalidate(): void { SessionStore.epoch++; }
  // Called only with a cookie independently checked against the expected account and tenant.
  // The cookie remains isolated from normal Web storage. Do not replace the active session
  // until all encrypted chunks and the manifest are committed successfully.
  static async adoptVerifiedCookie(cookie: string, gen: number): Promise<void> {
    await SessionStore.adoptCookie(cookie, gen, false);
  }
  static stageVerifiedCookie(cookie: string, gen: number): Promise<SessionAdoptionReceipt> {
    return SessionStore.adoptCookie(cookie, gen, true);
  }
  private static async adoptCookie(cookie: string, gen: number, staged: boolean): Promise<SessionAdoptionReceipt> {
    if (!cookie.trim() || /[\r\n]/.test(cookie)) throw new Error('没有可保存的有效课堂会话');
    if (gen !== SessionStore.epoch) throw new Error('登录已取消');
    const session: SavedSession = { classroom: cookie, interactive: '', savedAt: Date.now() };
    const bytes = SessionStore.encode(JSON.stringify(session));
    if (bytes.length > PIECE_SIZE * 64) throw new Error('会话凭据过长');
    const receipt: SessionAdoptionReceipt = {
      id: String(Date.now()) + '-' + String(gen) + '-' + String(++SessionStore.sequence) + '-' + Math.random().toString(36).slice(2),
      generation: gen
    };
    const job = SessionStore.queue.catch(() => {}).then(async () => {
      if (gen !== SessionStore.epoch) throw new Error('登录已取消');
      const previous = await SessionStore.readForCommit(PREFIX);
      const previousAccount = staged ? await SessionStore.readForCommit(PREFIX + '-account') : undefined;
      if (gen !== SessionStore.epoch) throw new Error('登录已取消');
      let previousSlot = SessionStore.activeSlot;
      if (previous) {
        let old: SessionManifest;
        try { old = JSON.parse(SessionStore.decode(previous)) as SessionManifest; } catch (_) { throw new Error('会话索引损坏'); }
        if (!old || (old.slot !== 0 && old.slot !== 1) || !Number.isInteger(old.count) || old.count < 1 || old.count > 64) throw new Error('会话索引损坏');
        previousSlot = old.slot;
      }
      const slot = previousSlot === 0 ? 1 : 0;
      const count = Math.ceil(bytes.length / PIECE_SIZE);
      for (let i = 0; i < count; i++) {
        if (gen !== SessionStore.epoch) throw new Error('登录已取消');
        await SessionStore.write(`${PREFIX}-${slot}-${i}`, bytes.slice(i * PIECE_SIZE, (i + 1) * PIECE_SIZE));
      }
      if (gen !== SessionStore.epoch) throw new Error('登录已取消');
      const manifest: SessionManifest = { slot, count, adoption: receipt.id, pending: staged };
      const manifestBytes = SessionStore.encode(JSON.stringify(manifest));
      await SessionStore.write(PREFIX, manifestBytes);
      if (gen !== SessionStore.epoch) {
        // Cancellation can happen while the manifest write is in flight. Restore the old
        // commit before releasing the queue, otherwise a restart could revive this session.
        if (previous) await SessionStore.write(PREFIX, previous);
        else {
          const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, SessionStore.encode(PREFIX));
          try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('已取消但无法撤销会话写入'); }
        }
        throw new Error('登录已取消');
      }
      if (staged) {
        const pending: PendingSessionAdoption = { receipt, manifest: manifestBytes, previous, previousAccount,
          previousCurrent: SessionStore.current, previousSlot, session, slot };
        SessionStore.adoptions.set(receipt.id, pending);
      } else {
        SessionStore.activeSlot = slot; SessionStore.current = session;
      }
    });
    SessionStore.queue = job; await job;
    return receipt;
  }
  private static equal(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
    return !!a && !!b && a.length === b.length && a.every((value: number, index: number) => value === b[index]);
  }
  private static adoption(receipt: SessionAdoptionReceipt): PendingSessionAdoption {
    const row = SessionStore.adoptions.get(receipt.id);
    if (!row || row.receipt.generation !== receipt.generation) throw new Error('没有待确认的会话采用');
    return row;
  }
  static async rememberAdoptedAccount(account: Account, receipt: SessionAdoptionReceipt): Promise<void> {
    const bytes = SessionStore.encode(JSON.stringify(account));
    if (bytes.length > PIECE_SIZE) throw new Error('账户信息过长');
    const task = SessionStore.queue.catch(() => {}).then(async () => {
      const row = SessionStore.adoption(receipt);
      if (receipt.generation !== SessionStore.epoch) throw new Error('登录已取消');
      const manifest = await SessionStore.readForCommit(PREFIX);
      if (receipt.generation !== SessionStore.epoch || !SessionStore.equal(manifest, row.manifest)) throw new Error('会话采用已被替换');
      row.writtenAccount = bytes;
      await SessionStore.write(PREFIX + '-account', bytes);
      if (receipt.generation !== SessionStore.epoch) throw new Error('登录已取消');
    });
    SessionStore.queue = task; await task;
  }
  static async commitAdoption(receipt: SessionAdoptionReceipt): Promise<void> {
    const task = SessionStore.queue.catch(() => {}).then(async () => {
      const row = SessionStore.adoption(receipt);
      if (receipt.generation !== SessionStore.epoch) throw new Error('登录已取消');
      const current = await SessionStore.readForCommit(PREFIX);
      if (receipt.generation !== SessionStore.epoch || !SessionStore.equal(current, row.manifest)) throw new Error('会话采用已被替换');
      const manifest = JSON.parse(SessionStore.decode(row.manifest)) as SessionManifest;
      manifest.pending = false;
      row.committed = SessionStore.encode(JSON.stringify(manifest));
      await SessionStore.write(PREFIX, row.committed);
      if (receipt.generation !== SessionStore.epoch) throw new Error('登录已取消');
      row.ready = true;
    });
    SessionStore.queue = task; await task;
  }
  static completeAdoption(receipt: SessionAdoptionReceipt): void {
    const row = SessionStore.adoption(receipt);
    // Publish synchronously only after the coordinator's final cross-store check.
    // No await may separate this publication from successful completion.
    if (!row.ready || receipt.generation !== SessionStore.epoch || SessionStore.current !== row.previousCurrent) throw new Error('登录已取消');
    SessionStore.activeSlot = row.slot; SessionStore.current = row.session;
    SessionStore.adoptions.delete(receipt.id);
  }
  private static async restoreRecord(alias: string, previous: Uint8Array | undefined): Promise<void> {
    if (previous) { await SessionStore.write(alias, previous); return; }
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, SessionStore.encode(alias));
    try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('无法撤销本次会话采用'); }
  }
  static async rollbackAdoption(receipt: SessionAdoptionReceipt): Promise<void> {
    const task = SessionStore.queue.catch(() => {}).then(async () => {
      const row = SessionStore.adoptions.get(receipt.id);
      if (!row || row.receipt.generation !== receipt.generation) return;
      try {
        if (SessionStore.current === row.session) {
          SessionStore.current = row.previousCurrent; SessionStore.activeSlot = row.previousSlot;
        }
        const manifest = await SessionStore.readForCommit(PREFIX);
        // Compare the exact manifest/receipt, not just epoch or slot (which can ABA).
        // A newer account/session commit or logout always wins over this rollback.
        if (!SessionStore.equal(manifest, row.manifest) && !SessionStore.equal(manifest, row.committed)) return;
        await SessionStore.restoreRecord(PREFIX, row.previous);
        if (row.writtenAccount) {
          const account = await SessionStore.readForCommit(PREFIX + '-account');
          if (SessionStore.equal(account, row.writtenAccount)) await SessionStore.restoreRecord(PREFIX + '-account', row.previousAccount);
        }
        SessionStore.activeSlot = row.previousSlot;
      } finally { SessionStore.adoptions.delete(receipt.id); }
    });
    SessionStore.queue = task; await task;
  }
  static async saveCurrent(): Promise<void> {
    // Only called after the school's account endpoint confirms authentication.
    const classroom = SessionStore.cookie(CLASSROOM);
    if (!classroom.trim() || /[\r\n]/.test(classroom)) throw new Error('没有可保存的有效课堂会话');
    const session: SavedSession = { classroom, interactive: SessionStore.cookie(INTERACTIVE), savedAt: Date.now() };
    const gen = SessionStore.epoch;
    SessionStore.current = session;
    const bytes = SessionStore.encode(JSON.stringify(session));
    if (bytes.length > PIECE_SIZE * 64) throw new Error('会话凭据过长');
    const job = SessionStore.queue.catch(() => {}).then(async () => {
      if (gen !== SessionStore.epoch) return;
      // A cold save must consult the committed manifest, not the default in-memory slot.
      // Otherwise an interrupted write could destroy the currently committed session.
      const previous = await SessionStore.readForCommit(PREFIX);
      if (gen !== SessionStore.epoch) return;
      let previousSlot = SessionStore.activeSlot;
      if (previous) {
        let old: SessionManifest;
        try { old = JSON.parse(SessionStore.decode(previous)) as SessionManifest; } catch (_) { throw new Error('会话索引损坏'); }
        if (!old || (old.slot !== 0 && old.slot !== 1) || !Number.isInteger(old.count) || old.count < 1 || old.count > 64) throw new Error('会话索引损坏');
        previousSlot = old.slot;
      }
      const slot = previousSlot === 0 ? 1 : 0;
      const count = Math.ceil(bytes.length / PIECE_SIZE);
      // Asset secrets are limited to 1024 bytes. Commit the manifest after every encrypted piece is saved.
      for (let i = 0; i < count; i++) {
        if (gen !== SessionStore.epoch) return;
        await SessionStore.write(`${PREFIX}-${slot}-${i}`, bytes.slice(i * PIECE_SIZE, (i + 1) * PIECE_SIZE));
      }
      if (gen !== SessionStore.epoch) return;
      const manifest: SessionManifest = { slot, count };
      await SessionStore.write(PREFIX, SessionStore.encode(JSON.stringify(manifest)));
      if (gen !== SessionStore.epoch) {
        if (previous) await SessionStore.write(PREFIX, previous);
        else {
          const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, SessionStore.encode(PREFIX));
          try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('已取消但无法撤销会话写入'); }
        }
        return;
      }
      SessionStore.activeSlot = slot;
    });
    SessionStore.queue = job; await job;
  }
  static async clear(): Promise<void> {
    SessionStore.epoch++; SessionStore.current = undefined; SessionStore.restoring = undefined;
    const job = SessionStore.queue.catch(() => {}).then(async () => {
      const query: asset.AssetMap = new Map(); query.set(asset.Tag.DATA_LABEL_NORMAL_LOCAL_1, SessionStore.encode(PREFIX));
      let failed = false;
      try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) failed = true; }
      const legacy: asset.AssetMap = new Map(); legacy.set(asset.Tag.ALIAS, SessionStore.encode('zhiyun-official-session-v1'));
      try { await asset.remove(legacy); } catch (err) { if ((err as BusinessError).code !== 24000002) failed = true; }
      if (failed) throw new Error('无法删除已保存的登录会话');
    });
    SessionStore.queue = job; await job;
  }
}
NativeAccountAcceptance.onChange(() => SessionStore.invalidate());
