import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { NativeAccountAcceptance } from './NativeAccountAcceptance';

// The v1 secret has no authenticated identity binding. Never load or migrate it.
const LEGACY_CREDENTIAL = 'zhiyun-official-login-v1';
const LEGACY_STATE = 'zhiyun-official-login-state-v1';
const CREDENTIAL = 'zhiyun-official-login-v2';
const ENROLLMENT_RATE = 'zhiyun-official-login-enrollment-rate-v1';
const CREDENTIAL_STATE = 'zhiyun-official-login-consent-state-v1';
const ENROLLMENT_INTERVAL = 10 * 60 * 1000;
// No password may be written or released until revocation and fresh-login proof are established.
export const CREDENTIAL_FEATURE_ENABLED: boolean = false;

export interface LoginIdentity { id: string; tenantId: number }
export interface LoginCredentials { username: string; password: string }
export interface ReservedLogin { username: string; password: string; generation: number; attemptId?: string }
interface LoginRecord { version: number; username: string; password: string; accountId: string; tenantId: number; attempts: number; attemptId?: string }

function validIdentity(value: LoginIdentity): boolean {
  return !!value && typeof value.id === 'string' && !!value.id && value.id === value.id.trim() && value.id.length <= 256 && Number.isSafeInteger(value.tenantId) && value.tenantId > 0;
}
function sameIdentity(a: LoginIdentity, b: LoginIdentity): boolean {
  return validIdentity(a) && validIdentity(b) && a.id === b.id && a.tenantId === b.tenantId;
}
function validRecord(row: LoginRecord): boolean {
  return !!row && row.version === 2 && typeof row.username === 'string' && !!row.username && row.username === row.username.trim() && row.username.length <= 128 && typeof row.password === 'string' && !!row.password && row.password.length <= 400 && validIdentity({ id: row.accountId, tenantId: row.tenantId }) && (row.attempts === 0 || row.attempts === 1);
}

// Persistence and attempt reservation only. The caller must independently prove that the
// submitted credentials produced verifiedIdentity in a fresh isolated authentication context.
// NativeLoginCoordinator supplies isolated CAS proof and cancellation-aware adoption.
export class OfficialLoginStore {
  private static epoch: number = 0;
  private static blocked: boolean = false;
  private static queue: Promise<void> = Promise.resolve();
  private static encode(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value); }
  private static async read(): Promise<LoginRecord | undefined> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, OfficialLoginStore.encode(CREDENTIAL)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    let rows: asset.AssetMap[];
    try { rows = await asset.query(query); } catch (err) {
      if ((err as BusinessError).code === 24000002) return undefined;
      throw new Error('无法读取校园账号凭据');
    }
    if (rows.length === 0) return undefined;
    const secret = rows[0].get(asset.Tag.SECRET) as Uint8Array;
    if (!secret) throw new Error('校园账号凭据损坏');
    let row: LoginRecord;
    try { row = JSON.parse(util.TextDecoder.create('utf-8').decodeToString(secret)) as LoginRecord; } catch (_) { throw new Error('校园账号凭据损坏'); }
    if (!validRecord(row)) throw new Error('校园账号凭据损坏');
    return row;
  }
  private static async write(row: LoginRecord): Promise<void> {
    const bytes = OfficialLoginStore.encode(JSON.stringify(row));
    if (bytes.length > 1024) throw new Error('校园账号凭据过长');
    const attrs: asset.AssetMap = new Map();
    attrs.set(asset.Tag.ALIAS, OfficialLoginStore.encode(CREDENTIAL)); attrs.set(asset.Tag.SECRET, bytes);
    attrs.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
    attrs.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    await asset.add(attrs);
  }
  // A missing or unreadable consent marker never enables legacy credentials.
  private static async consentActive(): Promise<boolean> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, OfficialLoginStore.encode(CREDENTIAL_STATE));
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const rows = await asset.query(query);
      const bytes = rows[0]?.get(asset.Tag.SECRET) as Uint8Array;
      return !!bytes && util.TextDecoder.create('utf-8').decodeToString(bytes) === 'active-v1';
    } catch (err) {
      if ((err as BusinessError).code === 24000002) return false;
      throw new Error('无法读取校园账号授权状态');
    }
  }
  private static async setConsent(active: boolean): Promise<void> {
    const attrs: asset.AssetMap = new Map();
    attrs.set(asset.Tag.ALIAS, OfficialLoginStore.encode(CREDENTIAL_STATE));
    attrs.set(asset.Tag.SECRET, OfficialLoginStore.encode(active ? 'active-v1' : 'revoked-v1'));
    attrs.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
    attrs.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
    await asset.add(attrs);
  }
  private static async remove(alias: string): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, OfficialLoginStore.encode(alias));
    try { await asset.remove(query); } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('无法删除校园账号凭据'); }
  }
  static generation(): number { return OfficialLoginStore.epoch; }
  static invalidate(): void { OfficialLoginStore.epoch++; }
  static enabled(expected: LoginIdentity | undefined = undefined): boolean {
    return CREDENTIAL_FEATURE_ENABLED || (expected ? NativeAccountAcceptance.matches(expected.id, expected.tenantId) : NativeAccountAcceptance.enabled());
  }
  static async status(expected: LoginIdentity): Promise<string> {
    if (!OfficialLoginStore.enabled(expected)) return '生产默认关闭；本次原生账号验收尚未授权，旧凭据不会自动使用';
    const gen = OfficialLoginStore.epoch;
    try {
      if (OfficialLoginStore.blocked || !await OfficialLoginStore.consentActive()) return '未保存或已撤销自动登录同意';
      const row = await OfficialLoginStore.read();
      if (gen !== OfficialLoginStore.epoch) return '账号状态已变化，请重新打开';
      if (!row || !sameIdentity(expected, { id: row.accountId, tenantId: row.tenantId })) return '当前账号未保存凭据';
      return row.attempts === 0 ? '已加密保存；确定的课堂 401 时允许一次原生重登' : '本次重登已消耗；请手动登录或重新验证保存';
    } catch (_) { return '安全存储状态读取失败；请使用官方页面手动登录'; }
  }
  // Enrollment also performs a school login; reserve it durably before navigating.
  // The timestamp contains no identity or password and is intentionally not deleted on logout.
  static async reserveEnrollment(gen: number): Promise<void> {
    if (!OfficialLoginStore.enabled()) throw new Error('本次原生账号验收尚未授权');
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      const query: asset.AssetMap = new Map();
      query.set(asset.Tag.ALIAS, OfficialLoginStore.encode(ENROLLMENT_RATE)); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
      let previous = 0;
      try {
        const rows = await asset.query(query);
        if (rows.length) {
          const secret = rows[0].get(asset.Tag.SECRET) as Uint8Array;
          if (!secret) throw new Error('验证限流状态损坏');
          const raw = util.TextDecoder.create('utf-8').decodeToString(secret);
          if (!/^[0-9]{1,16}$/.test(raw)) throw new Error('验证限流状态损坏');
          previous = Number(raw);
          if (!Number.isSafeInteger(previous) || previous <= 0) throw new Error('验证限流状态损坏');
        }
      } catch (err) { if ((err as BusinessError).code !== 24000002) throw new Error('无法读取验证限流状态'); }
      const now = Date.now();
      if (previous && (now < previous || now - previous < ENROLLMENT_INTERVAL)) throw new Error('验证过于频繁，请稍后再试');
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消');
      const attrs: asset.AssetMap = new Map();
      attrs.set(asset.Tag.ALIAS, OfficialLoginStore.encode(ENROLLMENT_RATE));
      attrs.set(asset.Tag.SECRET, OfficialLoginStore.encode(String(now)));
      attrs.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
      attrs.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
      await asset.add(attrs);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消');
    });
    OfficialLoginStore.queue = task; await task;
  }
  static async saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void> {
    if (!OfficialLoginStore.enabled(expected)) throw new Error('校园账号保存暂不可用');
    if (!consent || !sameIdentity(expected, verified)) throw new Error('未同意或认证身份不匹配');
    const row: LoginRecord = { version: 2, username: credentials.username.trim(), password: credentials.password, accountId: verified.id, tenantId: verified.tenantId, attempts: 0 };
    if (!validRecord(row)) throw new Error('校园账号凭据无效');
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      // Revoke before replacing the record. A crash between writes stays disabled.
      await OfficialLoginStore.setConsent(false);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      await OfficialLoginStore.write(row);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      await OfficialLoginStore.setConsent(true);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) {
        await OfficialLoginStore.setConsent(false);
        throw new Error('登录已取消或凭据清理未完成');
      }
      OfficialLoginStore.epoch++;
    });
    OfficialLoginStore.queue = task; await task;
  }
  // Persist the single allowed attempt before returning the password. A failed write, crash,
  // timeout or school rejection cannot silently create another attempt on restart.
  static async reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined> {
    if (!OfficialLoginStore.enabled(expected)) return undefined;
    let result: ReservedLogin | undefined = undefined;
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      const active = await OfficialLoginStore.consentActive();
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      if (!active) return;
      const row = await OfficialLoginStore.read();
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      if (!row || row.attempts !== 0 || !sameIdentity(expected, { id: row.accountId, tenantId: row.tenantId })) return;
      row.attemptId = String(Date.now()) + '-' + String(gen) + '-' + Math.random().toString(36).slice(2);
      row.attempts = 1; await OfficialLoginStore.write(row);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      OfficialLoginStore.epoch++;
      result = { username: row.username, password: row.password, generation: OfficialLoginStore.epoch, attemptId: row.attemptId };
    });
    OfficialLoginStore.queue = task; await task; return result;
  }
  // Reset the reservation only after the isolated classroom identity is confirmed.
  static async confirm(expected: LoginIdentity, verified: LoginIdentity, gen: number): Promise<void> {
    if (!OfficialLoginStore.enabled(expected)) throw new Error('自动登录暂不可用');
    if (!sameIdentity(expected, verified)) throw new Error('认证身份不匹配');
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      const active = await OfficialLoginStore.consentActive();
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked || !active) throw new Error('校园账号授权已撤销');
      const row = await OfficialLoginStore.read();
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) throw new Error('登录已取消或凭据清理未完成');
      if (!row || row.attempts !== 1 || !sameIdentity(expected, { id: row.accountId, tenantId: row.tenantId })) throw new Error('没有可确认的登录尝试');
      row.attempts = 0; await OfficialLoginStore.write(row);
      if (gen !== OfficialLoginStore.epoch || OfficialLoginStore.blocked) {
        // Background/logout can race the final asset write. Never leave an
        // unconfirmed attempt re-armed merely because cancellation arrived late.
        row.attempts = 1;
        try { await OfficialLoginStore.write(row); }
        catch (_) { await OfficialLoginStore.setConsent(false); }
        throw new Error('登录已取消或凭据清理未完成');
      }
      OfficialLoginStore.epoch++;
    });
    OfficialLoginStore.queue = task; await task;
  }
  static async clear(): Promise<void> {
    OfficialLoginStore.blocked = true;
    const gen = ++OfficialLoginStore.epoch;
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      let failed = false;
      // This independent tombstone blocks recovery after restart even if deleting the
      // password fails. If both writes and deletion fail, revocation is unknowable.
      try { await OfficialLoginStore.setConsent(false); } catch (_) { failed = true; }
      for (const alias of [CREDENTIAL, LEGACY_CREDENTIAL, LEGACY_STATE]) {
        try { await OfficialLoginStore.remove(alias); } catch (_) {
          failed = true;
          // If deletion is unavailable, persistently disarm the v2 record when possible.
          // Failure of both removal and overwrite cannot guarantee safety after restart.
          if (alias === CREDENTIAL) {
            try { const row = await OfficialLoginStore.read(); if (row) { row.attempts = 1; await OfficialLoginStore.write(row); } } catch (_) {}
          }
        }
      }
      if (failed) throw new Error('无法删除校园账号凭据');
      if (gen === OfficialLoginStore.epoch) OfficialLoginStore.blocked = false;
    });
    OfficialLoginStore.queue = task; await task;
  }
  // Compensation after confirm succeeded but final session publication failed.
  // Cleanup is allowed after permission revocation; never disarm a replacement record.
  static async disarm(expected: LoginIdentity, attemptId: string | undefined): Promise<void> {
    if (!attemptId) return;
    const task = OfficialLoginStore.queue.catch(() => {}).then(async () => {
      const row = await OfficialLoginStore.read();
      if (!row || row.attemptId !== attemptId || !sameIdentity(expected, { id: row.accountId, tenantId: row.tenantId })) return;
      row.attempts = 1;
      try { await OfficialLoginStore.write(row); }
      catch (_) { OfficialLoginStore.blocked = true; await OfficialLoginStore.setConsent(false); throw new Error('无法撤销本次确认'); }
      OfficialLoginStore.epoch++;
    });
    OfficialLoginStore.queue = task; await task;
  }
}
// Changing/revoking an in-memory permission also invalidates queued Asset writes.
NativeAccountAcceptance.onChange(() => OfficialLoginStore.invalidate());
