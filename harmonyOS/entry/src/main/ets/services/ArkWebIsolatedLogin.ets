import { webview } from '@kit.ArkWeb';
import { LoginCredentials, LoginIdentity } from './OfficialLoginStore';
import { IsolatedLoginAdapter } from './IsolatedLogin';
import { Zhiyun } from './Zhiyun';
import { officialLoginUrl, inspectLoginScript, submitLoginScript, webString } from '../model/OfficialLogin';

const ENTRY: string = 'https://tgmedia.cmc.zju.edu.cn?forward=https%3A%2F%2Fclassroom.zju.edu.cn%2F&tenant_code=112';
const CLASSROOM: string = 'https://classroom.zju.edu.cn/';
// Web click and a later session do not prove that this password authenticated it.
// This independent gate must remain closed until a provenance-verified protocol exists.
const ISOLATED_WEB_SUBMISSION_ENABLED: boolean = false;
interface LoginStatus { ready: boolean; captcha: boolean; error: string }

// The host must mount exactly one new incognito Web at about:blank and return its
// attached controller. Detach must remove it; this adapter never touches normal cookies.
export interface IsolatedWebHost {
  attach(): Promise<webview.WebviewController>;
  detach(): Promise<void>;
}

export class CallbackIsolatedWebHost implements IsolatedWebHost {
  private doAttach: () => Promise<webview.WebviewController>;
  private doDetach: () => Promise<void>;
  constructor(attach: () => Promise<webview.WebviewController>, detach: () => Promise<void>) { this.doAttach = attach; this.doDetach = detach; }
  attach(): Promise<webview.WebviewController> { return this.doAttach(); }
  detach(): Promise<void> { return this.doDetach(); }
}

export class ArkWebIsolatedLogin implements IsolatedLoginAdapter {
  private host: IsolatedWebHost;
  private api: Zhiyun;
  private controller: webview.WebviewController | undefined = undefined;
  private epoch: number = 0;
  private submitted: boolean = false;
  private submittedUsername: string = '';
  private timeoutMs: number;
  constructor(host: IsolatedWebHost, api: Zhiyun, timeoutMs: number = 30000) {
    this.host = host; this.api = api; this.timeoutMs = timeoutMs;
  }
  private check(gen: number): void { if (gen !== this.epoch) throw new Error('登录验证已取消'); }
  private async pause(gen: number): Promise<void> {
    await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 200); });
    this.check(gen);
  }
  async prepareFresh(): Promise<boolean> {
    if (!ISOLATED_WEB_SUBMISSION_ENABLED) throw new Error('隔离密码验证暂不可用，请手动登录');
    const gen = this.epoch;
    const controller = await this.host.attach(); this.check(gen);
    this.controller = controller;
    if (!controller.isIncognitoMode() || controller.getUrl() !== 'about:blank') throw new Error('无法确认隔离环境');
    // The application's private-mode cookie store is global; this adapter must be the
    // only owner of an incognito Web while it is active.
    webview.WebCookieManager.clearAllCookiesSync(true);
    if (webview.WebCookieManager.existCookie(true)) throw new Error('无法确认隔离 Cookie 已清理');
    this.submitted = false; this.submittedUsername = '';
    controller.loadUrl(ENTRY);
    return true;
  }
  async submitOnce(credentials: LoginCredentials): Promise<string> {
    if (!ISOLATED_WEB_SUBMISSION_ENABLED) throw new Error('隔离密码验证暂不可用，请手动登录');
    const gen = this.epoch, deadline = Date.now() + this.timeoutMs;
    if (this.submitted) throw new Error('认证尝试已使用');
    while (Date.now() < deadline) {
      this.check(gen);
      const controller = this.controller;
      if (!controller) throw new Error('隔离页面不可用');
      if (officialLoginUrl(controller.getUrl())) {
        let status: LoginStatus;
        try { status = JSON.parse(webString(await controller.runJavaScript(inspectLoginScript))) as LoginStatus; }
        catch (_) { await this.pause(gen); continue; }
        this.check(gen);
        if (status.captcha || status.error) return 'verification';
        if (status.ready) {
          // Mark before the asynchronous call: an uncertain response is never retried.
          this.submitted = true;
          this.submittedUsername = credentials.username.trim();
          let result: string;
          try { result = webString(await controller.runJavaScript(submitLoginScript(credentials.username, credentials.password))); }
          catch (_) { throw new Error('学校认证提交未完成，请手动登录'); }
          this.check(gen);
          if (result !== 'submitted' && result !== 'verification') throw new Error('学校认证页面不可用，请手动登录');
          return result;
        }
      }
      await this.pause(gen);
    }
    throw new Error('学校登录页面未就绪');
  }
  async classroomCookie(): Promise<string> {
    const gen = this.epoch, deadline = Date.now() + this.timeoutMs;
    if (!this.submitted) throw new Error('尚未提交认证');
    while (Date.now() < deadline) {
      this.check(gen);
      const controller = this.controller;
      if (!controller) throw new Error('隔离页面不可用');
      const url = controller.getUrl();
      if (/^https:\/\/classroom\.zju\.edu\.cn(?:[\/?#]|$)/i.test(url)) {
        try { const cookie = webview.WebCookieManager.fetchCookieSync(CLASSROOM, true); if (cookie.trim()) return cookie; } catch (_) {}
      } else if (officialLoginUrl(url)) {
        try {
          const status = JSON.parse(webString(await controller.runJavaScript(inspectLoginScript))) as LoginStatus;
          this.check(gen);
          if (status.captcha || status.error) throw new Error('需要人工完成学校验证');
        } catch (err) {
          this.check(gen);
          if ((err as Error).message === '需要人工完成学校验证') throw new Error('需要人工完成学校验证');
        }
      }
      await this.pause(gen);
    }
    throw new Error('学校登录未完成，请手动登录');
  }
  async identify(cookie: string): Promise<LoginIdentity> {
    const gen = this.epoch;
    const account = await this.api.accountForIsolatedCookie(cookie); this.check(gen);
    if (!this.submittedUsername || !account.username || account.username !== this.submittedUsername) throw new Error('无法确认提交的校园账号与课堂身份一致');
    return { id: account.id, tenantId: account.tenantId };
  }
  cancel(): void {
    this.epoch++;
    try { this.controller?.stop(); } catch (_) {}
    this.api.cancel();
  }
  async closeAndClear(): Promise<void> {
    this.epoch++;
    try { this.controller?.stop(); } catch (_) {}
    this.controller = undefined; this.submittedUsername = '';
    let failed = false;
    try { await this.host.detach(); } catch (_) { failed = true; }
    try { webview.WebCookieManager.clearAllCookiesSync(true); if (webview.WebCookieManager.existCookie(true)) failed = true; } catch (_) { failed = true; }
    if (failed) throw new Error('无法清理隔离登录环境');
  }
}
