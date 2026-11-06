import { LoginCredentials, LoginIdentity, ReservedLogin, OfficialLoginStore } from './OfficialLoginStore';

// This coordinator is deliberately not wired to production UI. Its adapter must implement
// a fresh isolated Web context and cancel in-flight navigation before it can be used.
export interface IsolatedLoginAdapter {
  prepareFresh(): Promise<boolean>;
  submitOnce(credentials: LoginCredentials): Promise<string>;
  classroomCookie(): Promise<string>;
  identify(cookie: string): Promise<LoginIdentity>;
  cancel(): void;
  closeAndClear(): Promise<void>;
}
export class IsolatedCleanupError extends Error {
  constructor() { super('隔离登录环境清理失败'); }
}
export interface VerifiedIsolatedSession { cookie: string; identity: LoginIdentity }

export class IsolatedLogin {
  private active: boolean = false;
  private generation: number = 0;
  private adapter: IsolatedLoginAdapter;
  constructor(adapter: IsolatedLoginAdapter) { this.adapter = adapter; }
  cancel(): void { this.generation++; this.adapter.cancel(); }
  private check(generation: number): void {
    if (generation !== this.generation) throw new Error('登录验证已取消');
  }
  // Consent must be obtained before creating a fresh context or submitting credentials.
  // The caller must persistently reserve a single attempt before invoking this for re-login.
  async verifyOnce(consent: boolean, credentials: LoginCredentials, expected: LoginIdentity): Promise<VerifiedIsolatedSession> {
    if (!consent) throw new Error('未同意额外验证');
    if (this.active) throw new Error('已有登录验证正在进行');
    if (typeof credentials.username !== 'string' || !credentials.username.trim() || typeof credentials.password !== 'string' || !credentials.password || typeof expected.id !== 'string' || !expected.id || expected.id !== expected.id.trim() || !Number.isSafeInteger(expected.tenantId) || expected.tenantId <= 0) throw new Error('账号或身份无效');
    const username = credentials.username.trim(), password = credentials.password;
    const accountId = expected.id, tenantId = expected.tenantId;
    this.active = true;
    const gen = this.generation;
    let verified: VerifiedIsolatedSession | undefined = undefined;
    try {
      const fresh = await this.adapter.prepareFresh(); this.check(gen);
      if (!fresh) throw new Error('无法确认隔离环境');
      const submission: LoginCredentials = { username, password };
      const result = await this.adapter.submitOnce(submission); this.check(gen);
      if (result !== 'submitted') throw new Error('验证未提交或需要人工处理');
      const cookie = await this.adapter.classroomCookie(); this.check(gen);
      if (!cookie.trim() || /[\r\n]/.test(cookie)) throw new Error('没有有效课堂会话');
      const identity = await this.adapter.identify(cookie); this.check(gen);
      if (!identity || identity.id !== accountId || identity.tenantId !== tenantId) throw new Error('验证账号与当前账号不一致');
      verified = { cookie, identity: { id: accountId, tenantId } };
    } finally {
      try { await this.adapter.closeAndClear(); } catch (_) { throw new IsolatedCleanupError(); } finally { this.active = false; }
    }
    this.check(gen);
    if (!verified) throw new Error('登录验证未完成');
    return verified;
  }
}

// A separately injectable persistence interface makes ordering testable without devices.
export interface GuardedLoginStore {
  generation(): number;
  saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void>;
  reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined>;
}
export class OfficialGuardedLoginStore implements GuardedLoginStore {
  generation(): number { return OfficialLoginStore.generation(); }
  saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void> { return OfficialLoginStore.saveVerified(credentials, expected, verified, consent, gen); }
  reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined> { return OfficialLoginStore.reserve(expected, gen); }
}
export interface ReservedVerifiedSession { session: VerifiedIsolatedSession; reservationGeneration: number }

// Not wired to the UI: an ArkWeb adapter must prove isolation, cancel navigation, and
// atomically adopt only a verified session before its reservation can be confirmed.
export class GuardedLoginFlow {
  private verifier: IsolatedLogin;
  private store: GuardedLoginStore;
  private active: boolean = false;
  private epoch: number = 0;
  constructor(verifier: IsolatedLogin, store: GuardedLoginStore) { this.verifier = verifier; this.store = store; }
  cancel(): void { this.epoch++; this.verifier.cancel(); }
  private check(gen: number): void { if (gen !== this.epoch) throw new Error('登录验证已取消'); }
  async enroll(consent: boolean, credentials: LoginCredentials, expected: LoginIdentity): Promise<void> {
    if (!consent) throw new Error('未同意保存及额外验证');
    if (this.active) throw new Error('已有登录验证正在进行');
    const submitted: LoginCredentials = { username: credentials.username, password: credentials.password };
    const identity: LoginIdentity = { id: expected.id, tenantId: expected.tenantId };
    this.active = true; const gen = this.epoch; const storeGen = this.store.generation();
    try {
      const verified = await this.verifier.verifyOnce(true, submitted, identity); this.check(gen);
      await this.store.saveVerified(submitted, identity, verified.identity, true, storeGen); this.check(gen);
    } finally { this.active = false; }
  }
  // Reservation is durable before credentials are exposed. Nothing here confirms the
  // reservation: the caller must first safely adopt the matching verified session.
  async recover(consent: boolean, expected: LoginIdentity): Promise<ReservedVerifiedSession | undefined> {
    if (!consent) throw new Error('未同意自动登录');
    if (this.active) throw new Error('已有登录验证正在进行');
    const identity: LoginIdentity = { id: expected.id, tenantId: expected.tenantId };
    this.active = true; const gen = this.epoch;
    try {
      const reservation = await this.store.reserve(identity, this.store.generation()); this.check(gen);
      if (!reservation) return undefined;
      const credentials: LoginCredentials = { username: reservation.username, password: reservation.password };
      const session = await this.verifier.verifyOnce(true, credentials, identity); this.check(gen);
      return { session, reservationGeneration: reservation.generation };
    } finally { this.active = false; }
  }
}
