import { Account } from '../model/Timeline';
import { NativeCas, CasExpected, CasResponse, CasTransport, CasRsa, ENTRY, AUTHORIZE, LOGIN } from './NativeCas';
import { LoginCredentials, LoginIdentity, ReservedLogin } from './OfficialLoginStore';
import { NativeLoginCoordinator, NativeCredentialPort, NativeSessionPort, NativeRunnerFactory, NativeRunner, nativeLoginMessage } from './NativeLogin';
import { SessionAdoptionReceipt } from './SessionStore';

// Never accepts a user identity/password, constructs RCP, or touches asset/WebView.
// This is an explicit offline UI exercise, not an alternate production login.
const DEMO_ACCOUNT: Account = { id: 'offline-demo-id', name: '离线合成账号', tenantId: 112, username: 'offline-canonical' };
const DEMO_CALLBACK = 'https://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize?ticket=opaque.demo~%2f%26';
const DEMO_EXCHANGE = 'https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Fget-info&url=https%3A%2F%2Fclassroom.zju.edu.cn%2F&code=opaque.demo~%2B%3D';
interface DemoIdentityParams { id: string; tenant_id: number; account: string; }
interface DemoIdentityBody { params: DemoIdentityParams; }
class DemoCredentials implements NativeCredentialPort {
  private epoch: number = 0;
  private row: LoginCredentials | undefined = undefined;
  private spent: boolean = false;
  private events: string[];
  constructor(events: string[]) { this.events = events; }
  enabled(): boolean { return true; }
  beginEnrollment(account: CasExpected): void {}
  generation(): number { return this.epoch; }
  invalidate(): void { this.epoch++; }
  async reserveEnrollment(gen: number): Promise<void> { this.check(gen); this.events.push('ENROLL_RESERVE'); }
  async saveVerified(credentials: LoginCredentials, expected: LoginIdentity, verified: LoginIdentity, consent: boolean, gen: number): Promise<void> {
    this.check(gen);
    if (!consent || expected.id !== verified.id || expected.tenantId !== verified.tenantId) throw new Error('DEMO_IDENTITY');
    this.row = { username: credentials.username, password: credentials.password }; this.spent = false;
    this.epoch++; this.events.push('SAVE');
  }
  async reserve(expected: LoginIdentity, gen: number): Promise<ReservedLogin | undefined> {
    this.check(gen);
    if (expected.id !== DEMO_ACCOUNT.id || expected.tenantId !== DEMO_ACCOUNT.tenantId || !this.row || this.spent) return undefined;
    this.spent = true; this.epoch++; this.events.push('RECOVER_RESERVE');
    return { username: this.row.username, password: this.row.password, generation: this.epoch };
  }
  async confirm(expected: LoginIdentity, verified: LoginIdentity, gen: number): Promise<void> {
    this.check(gen);
    if (!this.spent || expected.id !== verified.id || expected.tenantId !== verified.tenantId) throw new Error('DEMO_IDENTITY');
    this.spent = false; this.epoch++; this.events.push('CONFIRM');
  }
  async disarm(expected: LoginIdentity, attemptId: string | undefined): Promise<void> { this.spent = true; }
  private check(gen: number): void { if (gen !== this.epoch) throw new Error('DEMO_CANCELLED'); }
  clear(): void { if (this.row) { this.row.password = ''; this.row.username = ''; } this.row = undefined; }
}
class DemoSessions implements NativeSessionPort {
  private epoch: number = 0;
  private events: string[];
  constructor(events: string[]) { this.events = events; }
  generation(): number { return this.epoch; }
  invalidate(): void { this.epoch++; }
  async adoptVerifiedCookie(cookie: string, gen: number): Promise<SessionAdoptionReceipt> {
    if (gen !== this.epoch || !cookie.includes('session=offline-demo')) throw new Error('DEMO_SESSION');
    this.events.push('ADOPT');
    return { id: 'offline-adoption', generation: gen };
  }
  async rememberAccount(account: Account, receipt: SessionAdoptionReceipt): Promise<void> {
    if (account.id !== DEMO_ACCOUNT.id || account.tenantId !== DEMO_ACCOUNT.tenantId) throw new Error('DEMO_IDENTITY');
    this.events.push('ACCOUNT');
  }
  async commitAdoption(receipt: SessionAdoptionReceipt): Promise<void> {
    if (receipt.generation !== this.epoch) throw new Error('DEMO_CANCELLED');
    this.events.push('COMMIT');
  }
  completeAdoption(receipt: SessionAdoptionReceipt): void { this.events.push('PUBLISH'); }
  async rollbackAdoption(receipt: SessionAdoptionReceipt): Promise<void> { this.events.push('ROLLBACK'); }
}
class DemoRsa implements CasRsa {
  async encrypt(password: string, modulus: string, exponent: string): Promise<string> { return 'offline-synthetic-cipher'; }
}
class DemoTransport implements CasTransport {
  private closed: boolean = false;
  private events: string[];
  private captcha: boolean;
  constructor(events: string[], captcha: boolean) { this.events = events; this.captcha = captcha; }
  binding(): string { if (this.closed) throw new Error('DEMO_CLOSED'); return 'offline-private-transport'; }
  close(): void { this.closed = true; }
  async request(target: string, method: string, body: string, cookie: string): Promise<CasResponse> {
    if (this.closed) throw new Error('DEMO_CLOSED');
    if (target === ENTRY) return this.response(302, '', AUTHORIZE);
    if (target === AUTHORIZE) return this.response(302, '', LOGIN, ['JSESSIONID=offline-demo; Secure; Path=/cas']);
    if (target === LOGIN && method === 'GET') return this.response(200, '<form id="fm1" method="post" action="/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize"><input type="hidden" name="execution" value="offline"><input type="hidden" name="_eventId" value="submit"></form>');
    if (target === 'https://zjuam.zju.edu.cn/cas/v2/getPubKey') return this.response(200, JSON.stringify({ modulus: 'c1'.repeat(64), exponent: '10001' }));
    if (target === 'https://zjuam.zju.edu.cn/cas/v2/getKaptchaStatus') return this.response(200, this.captcha ? 'true' : 'false');
    if (target === LOGIN && method === 'POST') { this.events.push('POST'); return this.response(302, '', DEMO_CALLBACK); }
    if (target === DEMO_CALLBACK) return this.response(302, '', DEMO_EXCHANGE);
    if (target === DEMO_EXCHANGE) return this.response(302, '', 'https://classroom.zju.edu.cn/', [
      'session=offline-demo; Secure; Domain=zju.edu.cn; Path=/',
      '_token=' + encodeURIComponent('{i:1;s:6:"_token";i:1;s:3:"abc";}') + '; Secure; Domain=zju.edu.cn; Path=/'
    ]);
    if (target === 'https://classroom.zju.edu.cn/') return this.response(200, 'offline');
    if (target === 'https://classroom.zju.edu.cn/userapi/v1/infosimple') {
      const identity: DemoIdentityBody = {
        params: { id: DEMO_ACCOUNT.id, tenant_id: DEMO_ACCOUNT.tenantId, account: DEMO_ACCOUNT.username || '' }
      };
      return this.response(200, JSON.stringify(identity));
    }
    throw new Error('DEMO_UNEXPECTED_TARGET');
  }
  private response(status: number, body: string = '', location: string = '', cookies: string[] = []): CasResponse {
    return { status, body, location, cookies };
  }
}
class DemoFactory implements NativeRunnerFactory {
  captcha: boolean = false;
  private events: string[];
  constructor(events: string[]) { this.events = events; }
  enabled(): boolean { return true; }
  create(): NativeRunner { return new NativeCas(new DemoTransport(this.events, this.captcha), new DemoRsa()); }
}
export class NativeLoginDemo {
  private coordinator: NativeLoginCoordinator | undefined = undefined;
  cancel(): void { this.coordinator?.cancel(); }
  async exercise(captchaAfterSave: boolean = false): Promise<string> {
    const events: string[] = [], credentials = new DemoCredentials(events), sessions = new DemoSessions(events), factory = new DemoFactory(events);
    const coordinator = new NativeLoginCoordinator(credentials, sessions, factory); this.coordinator = coordinator;
    try {
      await coordinator.enroll(true, { username: 'offline-alias@example.invalid', password: 'OFFLINE-SYNTHETIC-ONLY' }, DEMO_ACCOUNT);
      factory.captcha = captchaAfterSave;
      const account = await coordinator.recover(true, DEMO_ACCOUNT);
      if (!account || events.filter((event: string) => event === 'RECOVER_RESERVE').length !== 1 ||
        events.indexOf('ADOPT') > events.indexOf('CONFIRM') || !events.includes('CONFIRM')) throw new Error('DEMO_ORDER');
      return '纯离线演练通过：验证保存 + 一次 401 协调器重登；输入别名与官方 canonical 身份分别核验。\n' +
        events.join(' → ') + '\n模拟传输和加密，不证明真机网络、SDK 或真实认证能力。';
    } catch (error) {
      return nativeLoginMessage(error) + '\n纯离线事件：' + events.join(' → ') + '\n没有联网或读取已有资产。';
    } finally { credentials.clear(); this.coordinator = undefined; }
  }
}
