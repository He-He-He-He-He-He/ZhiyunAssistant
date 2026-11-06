import { Account } from '../model/Timeline';
import { NativeCas, CasExpected, CasResult, NATIVE_CAS_REAL_POST_ENABLED, CasFailure, CasError, casDiagnostic } from './NativeCas';
import { OfficialLoginStore, LoginCredentials, LoginIdentity, ReservedLogin, CREDENTIAL_FEATURE_ENABLED } from './OfficialLoginStore';
import { SessionStore, SessionAdoptionReceipt } from './SessionStore';
import { NativeAccountAcceptance } from './NativeAccountAcceptance';

export enum NativeLoginError {
  DISABLED = 'DISABLED', CONSENT = 'CONSENT', IDENTITY = 'IDENTITY', CREDENTIALS = 'CREDENTIALS',
  BUSY = 'BUSY', CANCELLED = 'CANCELLED', CAS = 'CAS', STORAGE = 'STORAGE', CAPTCHA = 'CAPTCHA'
}
export class NativeLoginFailure extends Error {
  readonly category: NativeLoginError;
  readonly detail: string;
  constructor(category: NativeLoginError, detail: string = '') {
    super('NATIVE_LOGIN_FAILURE'); this.category = category; this.detail = detail;
  }
}
export function nativeLoginMessage(error: Object): string {
  if (!(error instanceof NativeLoginFailure)) return '原生验证未完成；请使用官方页面手动登录。';
  if (error.category === NativeLoginError.DISABLED) return '生产默认开关关闭，本次原生账号验收尚未授权；未发送认证。请从原生隐私页开启“原生账号验收（测试）”，或使用官方页面。';
  if (error.category === NativeLoginError.CONSENT) return '需要明确同意验证并保存，未提交认证。';
  if (error.category === NativeLoginError.IDENTITY) return '无法匹配当前已验证账号的学号、身份及租户；请先在官方页面手动登录，不猜测账号别名。';
  if (error.category === NativeLoginError.CREDENTIALS) return '账号或密码格式无效；未保存，请手动登录。';
  if (error.category === NativeLoginError.CANCELLED) return '验证已取消；迟到结果不会重新登录或重新启用凭据。';
  if (error.category === NativeLoginError.BUSY) return '已有一次原生验证进行中，请等待或取消。';
  if (error.category === NativeLoginError.CAPTCHA) return '学校要求验证码，请使用官方页面手动登录；不会自动再次提交密码。';
  if (error.category === NativeLoginError.STORAGE) return '安全存储或会话采用未完成；不会重新武装本次凭据，请手动登录或重新验证保存。';
  return '原生认证未完成；请使用官方页面手动登录，不自动重试。' + error.detail;
}
export function nativeLoginEnabled(): boolean {
  return (NATIVE_CAS_REAL_POST_ENABLED || NativeAccountAcceptance.enabled()) && OfficialLoginStore.enabled();
}
export interface NativeCredentialPort {
  enabled(): boolean;
  beginEnrollment(account: CasExpected): void;
  generation(): number;
  invalidate(): void;
  reserveEnrollment(gen: number): Promise<void>;
  saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void>;
  reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined>;
  confirm(expected: LoginIdentity, verified: LoginIdentity, gen: number): Promise<void>;
  disarm(expected: LoginIdentity, attemptId: string | undefined): Promise<void>;
}
export interface NativeSessionPort {
  generation(): number;
  invalidate(): void;
  adoptVerifiedCookie(cookie: string, gen: number): Promise<SessionAdoptionReceipt>;
  rememberAccount(account: Account, receipt: SessionAdoptionReceipt): Promise<void>;
  commitAdoption(receipt: SessionAdoptionReceipt): Promise<void>;
  completeAdoption(receipt: SessionAdoptionReceipt): void;
  rollbackAdoption(receipt: SessionAdoptionReceipt): Promise<void>;
}
export interface NativeRunner {
  run(consent: boolean, username: string, password: string, expected: CasExpected,
    reserve: () => Promise<void>, guard: () => void): Promise<CasResult>;
  cancel(): void;
}
export interface NativeRunnerFactory { enabled(): boolean; create(): NativeRunner }
export class OfficialNativeCredentials implements NativeCredentialPort {
  enabled(): boolean { return OfficialLoginStore.enabled(); }
  beginEnrollment(account: CasExpected): void {
    if (!CREDENTIAL_FEATURE_ENABLED) NativeAccountAcceptance.consumeEnrollment(account.id, account.tenantId, account.username);
  }
  generation(): number { return OfficialLoginStore.generation(); }
  invalidate(): void { OfficialLoginStore.invalidate(); }
  reserveEnrollment(gen: number): Promise<void> { return OfficialLoginStore.reserveEnrollment(gen); }
  saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void> {
    return OfficialLoginStore.saveVerified(credentials, expected, verified, consent, gen);
  }
  reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined> { return OfficialLoginStore.reserve(expected, gen); }
  confirm(expected: LoginIdentity, verified: LoginIdentity, gen: number): Promise<void> { return OfficialLoginStore.confirm(expected, verified, gen); }
  disarm(expected: LoginIdentity, attemptId: string | undefined): Promise<void> { return OfficialLoginStore.disarm(expected, attemptId); }
}
export class OfficialNativeSessions implements NativeSessionPort {
  generation(): number { return SessionStore.generation(); }
  invalidate(): void { SessionStore.invalidate(); }
  adoptVerifiedCookie(cookie: string, gen: number): Promise<SessionAdoptionReceipt> { return SessionStore.stageVerifiedCookie(cookie, gen); }
  rememberAccount(account: Account, receipt: SessionAdoptionReceipt): Promise<void> { return SessionStore.rememberAdoptedAccount(account, receipt); }
  commitAdoption(receipt: SessionAdoptionReceipt): Promise<void> { return SessionStore.commitAdoption(receipt); }
  completeAdoption(receipt: SessionAdoptionReceipt): void { SessionStore.completeAdoption(receipt); }
  rollbackAdoption(receipt: SessionAdoptionReceipt): Promise<void> { return SessionStore.rollbackAdoption(receipt); }
}
export class OfficialNativeRunnerFactory implements NativeRunnerFactory {
  enabled(): boolean { return NATIVE_CAS_REAL_POST_ENABLED || NativeAccountAcceptance.enabled(); }
  create(): NativeRunner { return new NativeCas(); }
}
function snapshotAccount(account: Account): Account {
  // canonical username is official infosimple.account, never derived from a typed alias.
  if (!account || !account.id || account.id !== account.id.trim() || account.id.length > 256 ||
    !Number.isSafeInteger(account.tenantId) || account.tenantId <= 0 || !account.username ||
    account.username !== account.username.trim() || account.username.length > 128) throw new NativeLoginFailure(NativeLoginError.IDENTITY);
  return { id: account.id, name: account.name, tenantId: account.tenantId, username: account.username };
}
function credentialsCopy(value: LoginCredentials): LoginCredentials {
  if (!value || typeof value.username !== 'string' || !value.username.trim() || value.username.trim().length > 128 ||
    typeof value.password !== 'string' || !value.password || value.password.length > 400) throw new NativeLoginFailure(NativeLoginError.CREDENTIALS);
  return { username: value.username.trim(), password: value.password };
}
function expectedFor(account: Account): CasExpected {
  return { id: account.id, tenantId: account.tenantId, username: account.username || '' };
}
function loginIdentity(id: string, tenantId: number): LoginIdentity { return { id, tenantId }; }
function verifyResult(result: CasResult, expected: CasExpected): void {
  if (!result || !result.identity || result.identity.id !== expected.id || result.identity.tenantId !== expected.tenantId ||
    result.identity.username !== expected.username || !result.cookie || !result.cookie.trim() || /[\r\n]/.test(result.cookie)) throw new NativeLoginFailure(NativeLoginError.IDENTITY);
}

// The same coordinator is used by Index and the explicitly labelled in-memory demo.
// No WebView adapter, global cookie publication, implicit retries or credential logging.
export class NativeLoginCoordinator {
  private epoch: number = 0;
  private active: boolean = false;
  private runner: NativeRunner | undefined = undefined;
  private credentials: NativeCredentialPort;
  private sessions: NativeSessionPort;
  private factory: NativeRunnerFactory;
  constructor(credentials: NativeCredentialPort = new OfficialNativeCredentials(),
    sessions: NativeSessionPort = new OfficialNativeSessions(), factory: NativeRunnerFactory = new OfficialNativeRunnerFactory()) {
    this.credentials = credentials; this.sessions = sessions; this.factory = factory;
  }
  isActive(): boolean { return this.active; }
  cancel(): void {
    this.epoch++;
    if (!this.active) return;
    // Synchronous generation changes invalidate in-flight asset and manifest writes too.
    this.credentials.invalidate(); this.sessions.invalidate();
    try { this.runner?.cancel(); } catch (_) {}
  }
  private start(consent: boolean): number {
    if (!consent) throw new NativeLoginFailure(NativeLoginError.CONSENT);
    if (this.active) throw new NativeLoginFailure(NativeLoginError.BUSY);
    if (!this.credentials.enabled() || !this.factory.enabled()) throw new NativeLoginFailure(NativeLoginError.DISABLED);
    this.active = true; return this.epoch;
  }
  private check(epoch: number, storeGen: number, sessionGen: number, current: () => boolean): void {
    if (epoch !== this.epoch || storeGen !== this.credentials.generation() ||
      sessionGen !== this.sessions.generation() || !current()) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
  }
  private failed(error: Object, storage: boolean): NativeLoginFailure {
    if (error instanceof NativeLoginFailure) return error;
    if (storage) return new NativeLoginFailure(NativeLoginError.STORAGE);
    const d = casDiagnostic(error);
    if (error instanceof CasFailure && d.category === CasError.CANCELLED) return new NativeLoginFailure(NativeLoginError.CANCELLED);
    if (error instanceof CasFailure && d.category === CasError.CAPTCHA_REQUIRED) return new NativeLoginFailure(NativeLoginError.CAPTCHA);
    return new NativeLoginFailure(NativeLoginError.CAS, '\n阶段 ' + d.stage + ' / ' + d.category +
      ' / HTTP ' + (d.httpStatus ? String(d.httpStatus) : '无'));
  }
  private finish(): void {
    try { this.runner?.cancel(); } catch (_) {}
    this.runner = undefined; this.active = false;
  }
  async enroll(consent: boolean, input: LoginCredentials, account: Account, current: () => boolean = () => true): Promise<void> {
    const epoch = this.start(consent), storeGen = this.credentials.generation(), sessionGen = this.sessions.generation();
    let typed: LoginCredentials | undefined = undefined, storage = false;
    try {
      const known = snapshotAccount(account), expected = expectedFor(known);
      typed = credentialsCopy(input); this.check(epoch, storeGen, sessionGen, current);
      this.credentials.beginEnrollment(expected);
      this.runner = this.factory.create(); let reserved = false;
      const result = await this.runner.run(true, typed.username, typed.password, expected, async () => {
        this.check(epoch, storeGen, sessionGen, current);
        if (reserved) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
        reserved = true; storage = true;
        await this.credentials.reserveEnrollment(storeGen);
        this.check(epoch, storeGen, sessionGen, current); storage = false;
      }, () => this.check(epoch, storeGen, sessionGen, current));
      this.check(epoch, storeGen, sessionGen, current);
      if (!reserved) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
      verifyResult(result, expected); storage = true;
      await this.credentials.saveVerified(typed, loginIdentity(known.id, known.tenantId),
        loginIdentity(result.identity.id, result.identity.tenantId), true, storeGen);
      this.check(epoch, storeGen + 1, sessionGen, current);
    } catch (error) { throw this.failed(error, storage); }
    finally { if (typed) { typed.password = ''; typed.username = ''; } this.finish(); }
  }
  async recover(consent: boolean, account: Account, current: () => boolean = () => true): Promise<Account | undefined> {
    const epoch = this.start(consent), sessionGen = this.sessions.generation();
    let storeGen = this.credentials.generation(), reservation: ReservedLogin | undefined = undefined, storage = false;
    let receipt: SessionAdoptionReceipt | undefined = undefined;
    let reservedIdentity: LoginIdentity | undefined = undefined;
    try {
      const known = snapshotAccount(account), expected = expectedFor(known);
      reservedIdentity = loginIdentity(known.id, known.tenantId);
      this.check(epoch, storeGen, sessionGen, current); storage = true;
      reservation = await this.credentials.reserve(loginIdentity(known.id, known.tenantId), storeGen);
      if (!reservation) { this.check(epoch, storeGen, sessionGen, current); return undefined; }
      // reserve has already spent exactly one attempt before releasing the password.
      if (reservation.generation !== storeGen + 1) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
      storeGen = reservation.generation; this.check(epoch, storeGen, sessionGen, current);
      storage = false;
      this.runner = this.factory.create(); let checked = false;
      const result = await this.runner.run(true, reservation.username, reservation.password, expected, async () => {
        if (checked) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
        checked = true; this.check(epoch, storeGen, sessionGen, current);
      }, () => this.check(epoch, storeGen, sessionGen, current));
      this.check(epoch, storeGen, sessionGen, current);
      if (!checked) throw new NativeLoginFailure(NativeLoginError.CANCELLED);
      verifyResult(result, expected); storage = true;
      receipt = await this.sessions.adoptVerifiedCookie(result.cookie, sessionGen);
      this.check(epoch, storeGen, sessionGen, current);
      await this.sessions.rememberAccount(known, receipt);
      this.check(epoch, storeGen, sessionGen, current);
      await this.credentials.confirm(loginIdentity(known.id, known.tenantId),
        loginIdentity(result.identity.id, result.identity.tenantId), storeGen);
      this.check(epoch, storeGen + 1, sessionGen, current);
      await this.sessions.commitAdoption(receipt);
      this.check(epoch, storeGen + 1, sessionGen, current);
      this.sessions.completeAdoption(receipt);
      receipt = undefined;
      return known;
    } catch (error) {
      let cleanupFailed = false;
      if (receipt) {
        try { await this.sessions.rollbackAdoption(receipt); } catch (_) { cleanupFailed = true; }
        if (reservation && reservedIdentity) {
          try { await this.credentials.disarm(reservedIdentity, reservation.attemptId); }
          catch (_) { cleanupFailed = true; }
        }
      }
      if (cleanupFailed) throw new NativeLoginFailure(NativeLoginError.STORAGE);
      throw this.failed(error, storage);
    }
    finally { if (reservation) { reservation.password = ''; reservation.username = ''; } this.finish(); }
  }
}
