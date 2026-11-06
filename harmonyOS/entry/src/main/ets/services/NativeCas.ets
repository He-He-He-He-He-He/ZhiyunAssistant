import { url, util } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { rcp } from '@kit.RemoteCommunicationKit';
import { NativeAccountAcceptance } from './NativeAccountAcceptance';

// Production default stays off. Native-only per-launch acceptance is independent.
export const NATIVE_CAS_REAL_POST_ENABLED: boolean = false;
export const ENTRY = 'https://tgmedia.cmc.zju.edu.cn/index.php?r=auth/login&auType=&tenant_code=112&forward=https%3A%2F%2Fclassroom.zju.edu.cn%2F';
export const AUTHORIZE = 'https://zjuam.zju.edu.cn/cas/oauth2.0/authorize?response_type=code&client_id=ObXIv4FvjcC1e9hVcS&redirect_uri=https://tgmedia.cmc.zju.edu.cn/index.php?r=auth/get-info&url=https://classroom.zju.edu.cn/';
export const LOGIN = 'https://zjuam.zju.edu.cn/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize';
const KEY = 'https://zjuam.zju.edu.cn/cas/v2/getPubKey';
const CAPTCHA = 'https://zjuam.zju.edu.cn/cas/v2/getKaptchaStatus';
const ROOT = 'https://classroom.zju.edu.cn/';
const INFO = 'https://classroom.zju.edu.cn/userapi/v1/infosimple';
const LIMIT = 512 * 1024;
const CAS_PROTOCOL_MIN_BITS: number = 256;
// Advisory only; never a credential or compatibility gate.
const CAS_RSA_WEAK_BELOW_BITS: number = 2048;

export enum CasStage {
  INIT = 'INIT', ENTRY_GET = 'ENTRY_GET', ENTRY_REDIRECT = 'ENTRY_REDIRECT',
  AUTHORIZE_GET = 'AUTHORIZE_GET', AUTHORIZE_REDIRECT = 'AUTHORIZE_REDIRECT',
  FORM_GET = 'FORM_GET', FORM_PARSE = 'FORM_PARSE', SESSION_PIN = 'SESSION_PIN',
  KEY_GET = 'KEY_GET', KEY_PARSE = 'KEY_PARSE', RSA_CHECK = 'RSA_CHECK', CAPTCHA_GET = 'CAPTCHA_GET',
  CAPTCHA_PARSE = 'CAPTCHA_PARSE', FINAL_CAPTCHA_GET = 'FINAL_CAPTCHA_GET',
  FINAL_CAPTCHA_PARSE = 'FINAL_CAPTCHA_PARSE', FINAL_SESSION = 'FINAL_SESSION',
  RSA_ENCRYPT = 'RSA_ENCRYPT', ATTEMPT_RESERVE = 'ATTEMPT_RESERVE', LOGIN_POST = 'LOGIN_POST',
  CALLBACK_CHECK = 'CALLBACK_CHECK', CALLBACK_GET = 'CALLBACK_GET', EXCHANGE_CHECK = 'EXCHANGE_CHECK',
  EXCHANGE_GET = 'EXCHANGE_GET', LANDING_GET = 'LANDING_GET', USER_INFO_GET = 'USER_INFO_GET',
  IDENTITY_CHECK = 'IDENTITY_CHECK',
  CLEANUP = 'CLEANUP', COMPLETE = 'COMPLETE'
}
export enum CasError {
  DNS = 'DNS', TLS = 'TLS', TIMEOUT = 'TIMEOUT', CONNECT = 'CONNECT',
  HTTP_PROTOCOL = 'HTTP_PROTOCOL', NETWORK = 'NETWORK', PERMISSION = 'PERMISSION',
  CANCELLED = 'CANCELLED', INIT = 'INIT', REQUEST_CONFIG = 'REQUEST_CONFIG', HTTP_STATUS = 'HTTP_STATUS',
  RESPONSE_TYPE = 'RESPONSE_TYPE', RESPONSE_LIMIT = 'RESPONSE_LIMIT', BODY_DECODE = 'BODY_DECODE',
  HEADERS_TYPE = 'HEADERS_TYPE', REDIRECT_STATUS = 'REDIRECT_STATUS',
  REDIRECT_MISSING = 'REDIRECT_MISSING', REDIRECT_AMBIGUOUS = 'REDIRECT_AMBIGUOUS',
  REDIRECT_TARGET = 'REDIRECT_TARGET', REDIRECT_FOLLOWED = 'REDIRECT_FOLLOWED',
  FORM_PARSE = 'FORM_PARSE', KEY_PARSE = 'KEY_PARSE', KEY_JSON_SHAPE = 'KEY_JSON_SHAPE',
  KEY_MODULUS_FORMAT = 'KEY_MODULUS_FORMAT', KEY_MODULUS_STRENGTH = 'KEY_MODULUS_STRENGTH',
  KEY_EXPONENT = 'KEY_EXPONENT', RSA_UNSUPPORTED = 'RSA_UNSUPPORTED', RSA_CONFIG = 'RSA_CONFIG',
  RSA_KEY_IMPORT = 'RSA_KEY_IMPORT', RSA_ENCRYPT = 'RSA_ENCRYPT', RSA_RESULT = 'RSA_RESULT',
  CAPTCHA_PARSE = 'CAPTCHA_PARSE', CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  CONSENT = 'CONSENT', CREDENTIALS = 'CREDENTIALS', IDENTITY = 'IDENTITY',
  CALLBACK_PARAMS = 'CALLBACK_PARAMS', EXCHANGE_PARAMS = 'EXCHANGE_PARAMS',
  COOKIE_PARSE = 'COOKIE_PARSE', COOKIE_COMBINED = 'COOKIE_COMBINED',
  COOKIE_MISSING = 'COOKIE_MISSING', COOKIE_SCOPE = 'COOKIE_SCOPE', COOKIE_CHANGED = 'COOKIE_CHANGED',
  SESSION_TRANSPORT = 'SESSION_TRANSPORT', ALREADY_USED = 'ALREADY_USED',
  CLEANUP = 'CLEANUP', INTERNAL = 'INTERNAL'
}
export interface CasDiagnostic { stage: CasStage; category: CasError; httpStatus: number; nativeCode: number }
interface NativeCode { code?: number }
function httpStatus(value: number): number { return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0; }
function safeNativeCode(error: Object): number {
  if (!error || typeof error !== 'object') return 0;
  try { return safeCodeNumber((error as NativeCode).code); } catch (_) { return 0; }
}
function safeCodeNumber(code: number | undefined): number {
  // Only documented SDK code numbers; never parse a message or numeric string.
  const allowed = [201, 401, 1007900001, 1007900002, 1007900003, 1007900005, 1007900006,
    1007900007, 1007900008, 1007900009, 1007900016, 1007900018, 1007900023, 1007900025,
    1007900026, 1007900027, 1007900028, 1007900035, 1007900037, 1007900042, 1007900045,
    1007900047, 1007900049, 1007900052, 1007900055, 1007900056, 1007900058, 1007900059,
    1007900060, 1007900061, 1007900063, 1007900065, 1007900070, 1007900073, 1007900077,
    1007900078, 1007900089, 1007900090, 1007900092, 1007900094, 1007900095, 1007900097,
    1007900100, 1007900999, 1007900998, 1007900997, 1007900996, 1007900995, 1007900993,
    1007900992, 1007900991, 1007900990, 1007900988, 1007900987, 1007900986, 1007900201];
  return typeof code === 'number' && allowed.includes(code) ? code : 0;
}
export class CasFailure extends Error {
  readonly stage: CasStage; readonly category: CasError; readonly httpStatus: number; readonly nativeCode: number;
  constructor(category: CasError, stage: CasStage = CasStage.INIT, status: number = 0, code: number = 0) {
    super('CAS_PREFLIGHT_FAILURE');
    this.stage = Object.values(CasStage).includes(stage) ? stage : CasStage.INIT;
    this.category = Object.values(CasError).includes(category) ? category : CasError.INTERNAL;
    this.httpStatus = httpStatus(status); this.nativeCode = safeCodeNumber(code);
  }
}
function networkFailure(error: Object): CasFailure {
  const code = safeNativeCode(error); let category = CasError.NETWORK;
  if ([1007900005, 1007900006].includes(code)) category = CasError.DNS;
  else if ([1007900035, 1007900058, 1007900059, 1007900060, 1007900077, 1007900090].includes(code)) category = CasError.TLS;
  else if (code === 1007900028) category = CasError.TIMEOUT;
  else if ([1007900007, 1007900045, 1007900055, 1007900056, 1007900097, 1007900986].includes(code)) category = CasError.CONNECT;
  else if ([1007900008, 1007900016, 1007900018, 1007900052, 1007900061, 1007900092, 1007900095].includes(code)) category = CasError.HTTP_PROTOCOL;
  else if ([1007900042, 1007900992, 1007900993].includes(code)) category = CasError.CANCELLED;
  else if (code === 201) category = CasError.PERMISSION;
  else if ([401, 1007900001, 1007900003, 1007900049, 1007900998, 1007900996].includes(code)) category = CasError.REQUEST_CONFIG;
  return new CasFailure(category, CasStage.INIT, 0, code);
}
export function casDiagnostic(error: Object): CasDiagnostic {
  // Treat only our own fixed enum error as a report. Unknown messages/objects are never serialized.
  if (error instanceof CasFailure) return {
    stage: Object.values(CasStage).includes(error.stage) ? error.stage : CasStage.INIT,
    category: Object.values(CasError).includes(error.category) ? error.category : CasError.INTERNAL,
    httpStatus: httpStatus(error.httpStatus), nativeCode: safeCodeNumber(error.nativeCode) };
  const failure = networkFailure(error);
  return { stage: CasStage.INIT, category: failure.nativeCode ? failure.category : CasError.INTERNAL,
    httpStatus: 0, nativeCode: failure.nativeCode };
}
export function casDiagnosticText(error: Object): string {
  const d = casDiagnostic(error);
  return '匿名预检未通过 [CAS-PREFLIGHT-1]\n阶段：' + d.stage + '\n类别：' + d.category +
    '\nHTTP：' + (d.httpStatus ? String(d.httpStatus) : '无') +
    '\nRCP：' + (d.nativeCode ? String(d.nativeCode) : '无') +
    '\n真实认证 POST：关闭；未提交账号密码。';
}
export function casProgressText(stage: CasStage): string {
  return '正在执行匿名 HTTPS GET 预检…\n阶段：' + (Object.values(CasStage).includes(stage) ? stage : CasStage.INIT);
}

export interface CasResponse { status: number; body: string; location: string; cookies: string[] }
export interface CasTransport {
  request(target: string, method: string, body: string, cookie: string): Promise<CasResponse>;
  // Local transport lifetime, NOT proof of immutable server-side captcha state.
  binding(): string;
  close(): void;
}
export interface CasRsa { encrypt(password: string, modulus: string, exponent: string): Promise<string> }
export interface CasExpected { id: string; tenantId: number; username: string }
export interface CasResult { cookie: string; identity: CasExpected }
export interface CasPreflight {
  formReady: boolean; publicKeyReady: boolean; sessionContinuous: boolean;
  publicKeyBits: number; publicKeyWeak: boolean; publicKeyCryptoReady: boolean;
  captchaRequired: boolean; realPostEnabled: boolean;
}
interface Cookie { name: string; value: string; domain: string; path: string; hostOnly: boolean; secure: boolean; expires: number; order: number }
interface SessionCookiePin { value: string; domain: string; path: string; hostOnly: boolean; secure: boolean; expires: number; generation: number }
interface Fields { execution: string; ys: string }
interface PublicKey { modulus: string; exponent: string; bits: number }
interface SessionPin { binding: string; cookie: SessionCookiePin }
interface Preparation { fields: Fields; key: PublicKey; pin: SessionPin; captchaRequired: boolean }
interface IdentityRaw { id?: string | number; tenant_id?: number; account?: string }
interface IdentityResponse { params?: IdentityRaw }

function hasUserInfo(value: string): boolean {
  // URL normalization drops an empty userinfo marker; reject it before resolving.
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^/?#]*@/.test(value);
}
function trusted(value: string): url.URL {
  if (!value || value.length > 8192 || /[\x00-\x20\\]/.test(value) || value.includes('#') || hasUserInfo(value)) throw new Error('不可信地址');
  let u: url.URL;
  try { u = new url.URL(value); } catch (_) { throw new Error('不可信地址'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443') ||
    !(u.hostname === 'zjuam.zju.edu.cn' || u.hostname === 'classroom.zju.edu.cn' || (u.hostname === 'tgmedia.cmc.zju.edu.cn' && u.pathname === '/index.php'))) throw new Error('不可信地址');
  return u;
}
export function casRedirect(from: string, location: string): string {
  trusted(from);
  if (!location || location.length > 8192 || /[\x00-\x20\\]/.test(location) || location.includes('#') || hasUserInfo(location)) throw new Error('无效跳转');
  let target: string;
  try {
    target = new url.URL(location, from).toString();
    // Resolve origin/path, but preserve the server's raw query spelling. In
    // particular, URL serialization must not rewrite quotes, + or % escapes.
    const queryAt = location.indexOf('?');
    if (queryAt >= 0) {
      const resolvedQueryAt = target.indexOf('?');
      target = (resolvedQueryAt >= 0 ? target.slice(0, resolvedQueryAt) : target) + location.slice(queryAt);
    }
  } catch (_) { throw new Error('无效跳转'); }
  trusted(target); return target;
}
function domainMatches(host: string, domain: string): boolean { return host === domain || host.endsWith('.' + domain); }
function pathMatches(path: string, prefix: string): boolean { return path === prefix || (path.startsWith(prefix) && (prefix.endsWith('/') || path.charAt(prefix.length) === '/')); }
function sameSessionCookie(a: SessionCookiePin, b: SessionCookiePin): boolean {
  return a.value === b.value && a.domain === b.domain && a.path === b.path &&
    a.hostOnly === b.hostOnly && a.secure === b.secure && a.expires === b.expires && a.generation === b.generation;
}

// Per-instance only: no browser cookies, default/global jar, files or asset records.
export class CasCookieJar {
  private entries: Cookie[] = [];
  private sequence: number = 0;
  private revision: number = 0;
  private sessionRevision: number = 0;
  private isCasSession(cookie: Cookie): boolean { return cookie.name === 'JSESSIONID' && domainMatches('zjuam.zju.edu.cn', cookie.domain); }
  private purge(now: number): void {
    const expired = this.entries.filter((c: Cookie) => c.expires <= now);
    if (expired.length) this.revision++;
    if (expired.some((c: Cookie) => this.isCasSession(c))) this.sessionRevision++;
    this.entries = this.entries.filter((c: Cookie) => c.expires > now);
  }
  receive(source: string, line: string, now: number = Date.now()): void {
    const u = trusted(source);
    if (!line || line.length > 4096 || /[\r\n]/.test(line)) throw new Error('无效 Cookie');
    const parts = line.split(';'); const first = parts[0].indexOf('=');
    if (first < 1) throw new Error('无效 Cookie');
    const name = parts[0].slice(0, first).trim(), value = parts[0].slice(first + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || !/^[\x21-\x2b\x2d-\x3a\x3c-\x7e]{0,2048}$/.test(value)) throw new Error('无效 Cookie');
    let domain = u.hostname, hostOnly = true, path = '', secure = false, expires = Number.MAX_SAFE_INTEGER;
    let age = '', expiry = ''; const seen: Set<string> = new Set();
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim(); if (!part) continue;
      const at = part.indexOf('='); const key = (at < 0 ? part : part.slice(0, at)).trim().toLowerCase(); const val = at < 0 ? '' : part.slice(at + 1).trim();
      if (['domain', 'path', 'secure', 'max-age', 'expires'].includes(key)) { if (seen.has(key)) throw new Error('Cookie 属性重复'); seen.add(key); }
      if (key === 'domain') { domain = val.replace(/^\./, '').toLowerCase(); hostOnly = false; if (!domainMatches(u.hostname, domain) || !(domain === u.hostname || domain === 'zju.edu.cn' || domain === 'cmc.zju.edu.cn')) throw new Error('Cookie 域不可信'); }
      else if (key === 'path') { if (!val.startsWith('/') || /[\s\x00-\x1f]/.test(val)) throw new Error('Cookie 路径无效'); path = val; }
      else if (key === 'secure') { if (at >= 0) throw new Error('Cookie 属性无效'); secure = true; }
      else if (key === 'max-age') age = val;
      else if (key === 'expires') expiry = val;
    }
    if (!path) { const pos = u.pathname.lastIndexOf('/'); path = pos <= 0 ? '/' : u.pathname.slice(0, pos); }
    if (seen.has('max-age')) { if (!/^-?[0-9]{1,12}$/.test(age)) throw new Error('Cookie 时效无效'); expires = now + Number(age) * 1000; }
    else if (seen.has('expires')) { expires = Date.parse(expiry); if (!Number.isFinite(expires)) throw new Error('Cookie 时效无效'); }
    if ((name.startsWith('__Secure-') && !secure) || (name.startsWith('__Host-') && (!secure || !hostOnly || path !== '/'))) throw new Error('Cookie 前缀无效');
    const old = this.entries.find((c: Cookie) => c.name === name && c.domain === domain && c.path === path);
    // The general jar revision tracks effective changes for non-session consumers.
    // CAS session generation records EVERY accepted JSESSIONID write, including an
    // identical reissue, deletion of an absent cookie, and delete/recreate ABA.
    this.purge(now);
    if (name === 'JSESSIONID' && domainMatches('zjuam.zju.edu.cn', domain)) this.sessionRevision++;
    const expired = this.entries.some((c: Cookie) => c.expires <= now);
    if (expired || (expires <= now ? !!old : !old || old.value !== value || old.hostOnly !== hostOnly ||
      old.secure !== secure || old.expires !== expires)) this.revision++;
    this.entries = this.entries.filter((c: Cookie) => c.expires > now && !(c.name === name && c.domain === domain && c.path === path));
    if (expires <= now) return;
    if (this.entries.length >= 64) throw new Error('Cookie 数量超限');
    this.entries.push({ name, value, domain, path, hostOnly, secure, expires, order: old ? old.order : this.sequence++ });
  }
  header(target: string, now: number = Date.now()): string {
    const u = trusted(target); this.purge(now);
    const matches = this.entries.filter((c: Cookie) => (c.hostOnly ? c.domain === u.hostname : domainMatches(u.hostname, c.domain)) && pathMatches(u.pathname, c.path));
    matches.sort((a: Cookie, b: Cookie) => b.path.length - a.path.length || a.order - b.order);
    const result = matches.map((c: Cookie) => c.name + '=' + c.value).join('; '); if (result.length > 16384) throw new Error('Cookie 超限'); return result;
  }
  generation(): number { return this.revision; }
  sessionGeneration(): number { this.purge(Date.now()); return this.sessionRevision; }
  hasCasSession(): boolean { this.purge(Date.now()); return this.entries.some((c: Cookie) => this.isCasSession(c)); }
  casSession(target: string): string {
    return this.casSessionPin(target).value;
  }
  casSessionPin(target: string): SessionCookiePin {
    // header() removes expired entries before examining the effective scope.
    this.header(target); const u = trusted(target);
    const all = this.entries.filter((c: Cookie) => this.isCasSession(c));
    const matches = all.filter((c: Cookie) =>
      (c.hostOnly ? c.domain === u.hostname : domainMatches(u.hostname, c.domain)) && pathMatches(u.pathname, c.path));
    if (matches.length === 0 || (matches.length === 1 && !matches[0].value)) throw new CasFailure(CasError.COOKIE_MISSING);
    if (all.length !== 1 || matches.length !== 1 || matches[0].domain !== 'zjuam.zju.edu.cn') throw new CasFailure(CasError.COOKIE_SCOPE);
    const c = matches[0];
    return { value: c.value, domain: c.domain, path: c.path, hostOnly: c.hostOnly,
      secure: c.secure, expires: c.expires, generation: this.sessionRevision };
  }
  clear(): void { this.revision++; this.sessionRevision++; this.entries = []; }
}

function attrs(raw: string): Map<string, string> {
  const out: Map<string, string> = new Map(); const re = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(["'])(.*?)\2/gs; let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) { const k = m[1].toLowerCase(); if (out.has(k)) throw new Error('表单属性重复'); out.set(k, m[3]); }
  return out;
}
export function casForm(html: string): Fields {
  if (html.length > LIMIT) throw new Error('表单过大');
  const forms = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi; let match: RegExpExecArray | null; let found: Fields | undefined;
  while ((match = forms.exec(html)) !== null) {
    const a = attrs(match[1]); if (a.get('id') !== 'fm1') continue;
    if (found || (a.get('method') || '').toLowerCase() !== 'post' || a.get('action') !== '/cas/login?service=http%3A%2F%2Fzjuam.zju.edu.cn%2Fcas%2Foauth2.0%2FcallbackAuthorize') throw new Error('表单不可信');
    const fields: Map<string, string> = new Map(); const inputs = /<input\b([^>]*)>/gi; let input: RegExpExecArray | null;
    while ((input = inputs.exec(match[2])) !== null) {
      const v = attrs(input[1]); const name = v.get('name') || ''; const type = (v.get('type') || '').toLowerCase();
      if (type === 'hidden' && !['execution', '_eventId', 'ys'].includes(name)) throw new Error('表单字段不可信');
      if (['execution', '_eventId', 'ys'].includes(name)) { if (type !== 'hidden' || !v.has('value') || fields.has(name) || /\bdisabled\b/i.test(input[1])) throw new Error('表单字段不可信'); fields.set(name, v.get('value') || ''); }
    }
    const execution = fields.get('execution') || '', ys = fields.get('ys') || '';
    if (!/^[A-Za-z0-9_=\-]{1,8192}$/.test(execution) || fields.get('_eventId') !== 'submit' || (ys && !/^[0-9]{1,8}$/.test(ys))) throw new Error('表单字段不可信');
    found = { execution, ys };
  }
  if (!found) throw new Error('未找到认证表单'); return found;
}
export function casKey(text: string): PublicKey {
  // Recognize only the official two-string JSON shape, in either field order.
  // Shape/hex/strength/exponent failures stay distinguishable without echoing input.
  if (text.length > LIMIT) throw new CasFailure(CasError.KEY_JSON_SHAPE);
  const m = /^\s*\{\s*"(modulus|exponent)"\s*:\s*"([^"\\\x00-\x1f]*)"\s*,\s*"(modulus|exponent)"\s*:\s*"([^"\\\x00-\x1f]*)"\s*\}\s*$/.exec(text);
  if (!m || m[1] === m[3]) throw new CasFailure(CasError.KEY_JSON_SHAPE);
  const modulus = m[1] === 'modulus' ? m[2] : m[4], exponent = m[1] === 'exponent' ? m[2] : m[4];
  if (!/^[0-9a-fA-F]+$/.test(modulus) || !/[13579bdf]$/i.test(modulus)) throw new CasFailure(CasError.KEY_MODULUS_FORMAT);
  if (modulus.length > 1024) throw new CasFailure(CasError.KEY_MODULUS_STRENGTH);
  const stripped = modulus.replace(/^0+/, '');
  const bits = stripped ? (stripped.length - 1) * 4 + Math.floor(Math.log2(parseInt(stripped[0], 16))) + 1 : 0;
  // Official protocol validity, matching the verified Android implementation.
  if (bits < CAS_PROTOCOL_MIN_BITS || bits > 4096) throw new CasFailure(CasError.KEY_MODULUS_STRENGTH);
  if (!/^[0-9a-fA-F]{1,8}$/.test(exponent) || parseInt(exponent, 16) < 3 ||
    parseInt(exponent, 16) % 2 !== 1) throw new CasFailure(CasError.KEY_EXPONENT);
  return { modulus, exponent, bits };
}
function derLength(n: number): number[] { if (n < 128) return [n]; if (n < 256) return [0x81, n]; return [0x82, n >> 8, n & 255]; }
function der(tag: number, bytes: number[]): number[] { return [tag, ...derLength(bytes.length), ...bytes]; }
function integer(hex: string): number[] {
  let h = hex.replace(/^0+/, ''); if (!h) h = '0'; if (h.length % 2) h = '0' + h;
  const bytes: number[] = []; for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  if (bytes[0] & 0x80) bytes.unshift(0); return der(2, bytes);
}
export function casSpki(modulus: string, exponent: string): Uint8Array {
  const rsa = der(0x30, [...integer(modulus), ...integer(exponent)]);
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  return new Uint8Array(der(0x30, [...algorithm, ...der(3, [0, ...rsa])]));
}
// JS security.js packs reversed ASCII into 16-bit words; output uses 4-hex-digit words,
// not a modulus-wide zero-padded string. Split longer passwords exactly as the frontend does.
function rsaFailure(error: Object, fallback: CasError): CasFailure {
  // 801 is CryptoFramework's documented NOT_SUPPORT. Crypto errors are not RCP
  // errors: never put arbitrary SDK codes/messages in the RCP diagnostic field.
  let unsupported = false;
  try { unsupported = !!error && typeof error === 'object' && (error as NativeCode).code === 801; } catch (_) {}
  return new CasFailure(unsupported ? CasError.RSA_UNSUPPORTED : fallback);
}
export class CasCryptoRsa implements CasRsa {
  async encrypt(password: string, modulus: string, exponent: string): Promise<string> {
    if (!/^[\x20-\x7e]{1,1024}$/.test(password)) throw new Error('不支持的密码字符');
    const publicKey = casKey('{"modulus":"' + modulus + '","exponent":"' + exponent + '"}');
    const bits = publicKey.bits;
    const blockSize = Math.ceil(bits / 8), chunk = 2 * (Math.ceil(bits / 16) - 1);
    let generator: cryptoFramework.AsyKeyGenerator;
    let cipher: cryptoFramework.Cipher;
    try {
      generator = cryptoFramework.createAsyKeyGenerator('RSA' + String(bits));
      cipher = cryptoFramework.createCipher('RSA|ECB|NoPadding');
    } catch (error) { throw rsaFailure(error, CasError.RSA_CONFIG); }
    let key: cryptoFramework.KeyPair;
    try { key = await generator.convertKey({ data: casSpki(modulus, exponent) }, null); }
    catch (error) { throw rsaFailure(error, CasError.RSA_KEY_IMPORT); }
    try { await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, key.pubKey, null); }
    catch (error) { throw rsaFailure(error, CasError.RSA_ENCRYPT); }
    const reversed = password.split('').reverse().join(''); const encrypted: string[] = [];
    for (let off = 0; off < reversed.length; off += chunk) {
      const block = new Uint8Array(blockSize);
      for (let j = 0; j < chunk && off + j < reversed.length; j++) block[block.length - 1 - j] = reversed.charCodeAt(off + j);
      try {
        const result = await cipher.doFinal({ data: block }); if (!result || !result.data || result.data.length !== blockSize) throw new CasFailure(CasError.RSA_RESULT);
        let hex = ''; for (const b of result.data) hex += b.toString(16).padStart(2, '0');
        hex = hex.replace(/^0+/, '') || '0'; encrypted.push(hex.padStart(Math.ceil(hex.length / 4) * 4, '0'));
      } catch (error) {
        if (error instanceof CasFailure) throw error;
        throw rsaFailure(error, CasError.RSA_ENCRYPT);
      } finally { block.fill(0); }
    }
    return encrypted.join(' ');
  }
}

export function casBearer(cookie: string): string {
  const all = cookie.split(';').map((v: string) => v.trim()).filter((v: string) => v.startsWith('_token='));
  if (all.length !== 1) throw new Error('课堂令牌缺失或不明确');
  let raw: string; try { raw = decodeURIComponent(all[0].slice(7)); } catch (_) { throw new Error('课堂令牌无效'); }
  const m = /\{i:\d+;s:\d+:"_token";i:\d+;s:(\d+):"([A-Za-z0-9._~+\/=\-]{1,4096})";\}/g;
  const token = m.exec(raw); if (!token || Number(token[1]) !== token[2].length || m.exec(raw)) throw new Error('课堂令牌无效');
  return token[2];
}

function responseHeader(headers: rcp.ResponseHeaders, name: string): string[] {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new CasFailure(CasError.HEADERS_TYPE);
  const values: string[] = [];
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value) && value.every((v: string) => typeof v === 'string')) values.push(...value);
    else if (value !== undefined) throw new CasFailure(CasError.HEADERS_TYPE);
  }
  return values;
}
export function casDecodeBody(body: ArrayBuffer | Uint8Array | string | undefined): string {
  if (body === undefined) return '';
  if (typeof body === 'string') {
    if (body.length > LIMIT) throw new CasFailure(CasError.RESPONSE_LIMIT);
    return body;
  }
  if (!(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)) throw new CasFailure(CasError.RESPONSE_TYPE);
  if (body.byteLength > LIMIT) throw new CasFailure(CasError.RESPONSE_LIMIT);
  try {
    return util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(body instanceof Uint8Array ? body : new Uint8Array(body));
  } catch (_) { throw new CasFailure(CasError.BODY_DECODE); }
}
// RCP explicitly supports autoRedirect=false; NetworkKit http declarations do not expose
// such a switch. No cookieRepository is configured; the caller supplies its private jar.
export class CasHttps implements CasTransport {
  private static sequence: number = 0;
  private lifetime: string = 'private-rcp-' + String(++CasHttps.sequence);
  private session: rcp.Session;
  private closed: boolean = false;
  private acceptanceGen: number = NativeAccountAcceptance.generation();
  private boundIdentity: boolean = false;
  constructor() {
    try {
      this.session = rcp.createSession({ requestConfiguration: { transfer: { autoRedirect: false, timeout: { connectMs: 8000, transferMs: 30000 } }, proxy: 'no-proxy' } });
    } catch (error) {
      const failure = networkFailure(error);
      throw new CasFailure(failure.category === CasError.NETWORK ? CasError.INIT : failure.category,
        CasStage.INIT, 0, failure.nativeCode);
    }
  }
  binding(): string { if (this.closed) throw new Error('会话已关闭'); return this.lifetime; }
  authorizeIdentity(expected: CasExpected): void {
    if (!NATIVE_CAS_REAL_POST_ENABLED && (!NativeAccountAcceptance.current(this.acceptanceGen) ||
      !NativeAccountAcceptance.matches(expected.id, expected.tenantId, expected.username))) throw new CasFailure(CasError.CONSENT);
    this.boundIdentity = true;
  }
  async request(target: string, method: string, body: string, cookie: string): Promise<CasResponse> {
    trusted(target); if (this.closed || !['GET', 'POST'].includes(method)) throw new Error('请求不可用');
    if (method === 'POST' && !NATIVE_CAS_REAL_POST_ENABLED &&
      (!this.boundIdentity || !NativeAccountAcceptance.current(this.acceptanceGen))) throw new CasFailure(CasError.CONSENT);
    if (method === 'POST' && target !== LOGIN) throw new Error('提交地址不可信');
    if (/[\r\n]/.test(cookie) || cookie.length > 16384 || body.length > 32768) throw new Error('请求无效');
    // Fixed application identity only: never include account, device or session identifiers.
    const headers: rcp.RequestHeaders = { 'accept': '*/*', 'cache-control': 'no-store',
      'user-agent': 'ZhiyunAssistant/0.7 (HarmonyOS; NativeCAS)' };
    if (cookie) headers['cookie'] = cookie;
    if (target === INFO) headers['authorization'] = 'Bearer ' + casBearer(cookie);
    if (method === 'POST') { headers['content-type'] = 'application/x-www-form-urlencoded'; headers['origin'] = 'https://zjuam.zju.edu.cn'; headers['referer'] = LOGIN; }
    let response: rcp.Response;
    try {
      const request = new rcp.Request(target, method === 'POST' ? 'POST' : 'GET', headers, method === 'POST' ? body : undefined);
      request.destination = 'array-buffer';
      request.configuration = { transfer: { autoRedirect: false } };
      response = await this.session.fetch(request);
    } catch (error) { throw networkFailure(error); }
    if (this.closed) throw new CasFailure(CasError.CANCELLED);
    if (!response || !httpStatus(response.statusCode)) throw new CasFailure(CasError.RESPONSE_TYPE);
    try {
      // Normalize HTTP header names, but never comma-split Set-Cookie (Expires contains commas).
      const locations = responseHeader(response.headers, 'location'), cookies = responseHeader(response.headers, 'set-cookie');
      if (locations.length > 1) throw new CasFailure(CasError.REDIRECT_AMBIGUOUS);
      if (cookies.length > 64) throw new CasFailure(CasError.RESPONSE_LIMIT);
      if (cookies.some((line: string) => /,\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+\s*=/.test(line))) throw new CasFailure(CasError.COOKIE_COMBINED);
      if (response.effectiveUrl && response.effectiveUrl.toString() !== new url.URL(target).toString()) throw new CasFailure(CasError.REDIRECT_FOLLOWED);
      return { status: response.statusCode, body: casDecodeBody(response.body), location: locations[0] || '', cookies };
    } catch (error) {
      const d = casDiagnostic(error);
      throw new CasFailure(d.category, CasStage.INIT, response.statusCode, d.nativeCode);
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    // RCP exposes explicit in-flight cancellation separately from resource cleanup.
    try { this.session.cancel(); } finally { this.session.close(); }
  }
}

function redirected(r: CasResponse, from: string): string {
  if (r.status !== 302 && r.status !== 303) throw new CasFailure(r.status >= 400 ? CasError.HTTP_STATUS : CasError.REDIRECT_STATUS);
  if (!r.location) throw new CasFailure(CasError.REDIRECT_MISSING);
  try { return casRedirect(from, r.location); } catch (_) { throw new CasFailure(CasError.REDIRECT_TARGET); }
}
function requireOk(r: CasResponse): void {
  if (r.status !== 200) throw new CasFailure(CasError.HTTP_STATUS);
  if (r.body.length > LIMIT) throw new CasFailure(CasError.RESPONSE_LIMIT);
}
function params(target: string): Map<string, string> {
  trusted(target); const out: Map<string, string> = new Map();
  // Split the original query before decoding. No URLSearchParams (+ is not a
  // form space), query rebuilding, or second decode of an opaque value.
  const queryAt = target.indexOf('?'), query = queryAt < 0 ? '' : target.slice(queryAt + 1);
  if (!query || query.length > 4096) throw new Error('跳转参数无效');
  for (const item of query.split('&')) {
    const p = item.indexOf('='); if (p < 1) throw new Error('跳转参数无效');
    let k: string, v: string;
    try { k = decodeURIComponent(item.slice(0, p)); v = decodeURIComponent(item.slice(p + 1)); }
    catch (_) { throw new Error('跳转参数无效'); }
    if (/[\x00-\x20\x7f-\x9f]/.test(k + v)) throw new Error('跳转参数无效');
    if (out.has(k)) throw new Error('跳转参数重复');
    out.set(k, v);
  }
  return out;
}
function opaqueProtocolValue(value: string | undefined, limit: number): boolean {
  return value !== undefined && value.length > 0 && value.length <= limit && !/[\x00-\x20\x7f-\x9f]/.test(value);
}
function requireCallback(target: string): void { const u = trusted(target), p = params(target); if (u.hostname !== 'zjuam.zju.edu.cn' || u.pathname !== '/cas/oauth2.0/callbackAuthorize' || p.size !== 1 || !opaqueProtocolValue(p.get('ticket'), 2048)) throw new Error('未知认证回跳'); }
function requireExchange(target: string): void {
  const u = trusted(target), p = params(target);
  // The official authorize URL carries url at its top level, so exchange may
  // contain only r + code. An optional url must still be the exact fixed root.
  if (u.hostname !== 'tgmedia.cmc.zju.edu.cn' || u.pathname !== '/index.php' ||
    (p.size !== 2 && p.size !== 3) ||
    Array.from(p.keys()).some((key: string) => !['r', 'code', 'url'].includes(key)) ||
    p.get('r') !== 'auth/get-info' || (p.has('url') && p.get('url') !== ROOT) ||
    !opaqueProtocolValue(p.get('code'), 2048)) throw new Error('未知服务回跳');
}
// Validate actual JSON structure before JSON.parse can discard duplicate keys.
// Each object owns its key set; decoded keys catch escaped structural aliases,
// while Unicode/string escapes in values (including names) remain ordinary data.
class UniqueIdentityJson {
  private text: string;
  private pos: number = 0;
  private values: number = 0;
  constructor(text: string) { this.text = text; }
  validate(): void {
    if (this.text.length > LIMIT) throw new Error('身份响应过长');
    this.ws();
    if (this.text.charAt(this.pos) !== '{') throw new Error('身份响应不是对象');
    this.value(0); this.ws();
    if (this.pos !== this.text.length) throw new Error('身份响应尾部无效');
  }
  private ws(): void { while (' \t\r\n'.includes(this.text.charAt(this.pos)) && this.pos < this.text.length) this.pos++; }
  private take(token: string): boolean {
    this.ws(); if (this.text.charAt(this.pos) !== token) return false;
    this.pos++; return true;
  }
  private string(): string {
    this.ws(); const start = this.pos;
    if (this.text.charAt(this.pos++) !== '"') throw new Error('无效 JSON 字符串');
    let escaped = false;
    while (this.pos < this.text.length) {
      const c = this.text.charAt(this.pos++);
      if (!escaped && c === '"') return JSON.parse(this.text.slice(start, this.pos)) as string;
      if (!escaped && c === '\\') escaped = true;
      else escaped = false;
    }
    throw new Error('未结束的 JSON 字符串');
  }
  private value(depth: number): void {
    if (depth > 32 || ++this.values > 20000) throw new Error('身份响应结构过大');
    this.ws(); const c = this.text.charAt(this.pos);
    if (c === '"') { this.string(); return; }
    if (c === '{') {
      this.pos++; const keys: Set<string> = new Set();
      if (this.take('}')) return;
      do {
        const key = this.string();
        if (keys.has(key) || !this.take(':')) throw new Error('身份响应键重复或无效');
        keys.add(key); this.value(depth + 1);
        if (this.take('}')) return;
      } while (this.take(','));
      throw new Error('无效 JSON 对象');
    }
    if (c === '[') {
      this.pos++; if (this.take(']')) return;
      do { this.value(depth + 1); if (this.take(']')) return; } while (this.take(','));
      throw new Error('无效 JSON 数组');
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(this.text.slice(this.pos));
    if (!token) throw new Error('无效 JSON 值');
    this.pos += token[0].length;
  }
}
function identity(body: string, expected: CasExpected): void {
  new UniqueIdentityJson(body).validate();
  let parsed: IdentityResponse; try { parsed = JSON.parse(body) as IdentityResponse; } catch (_) { throw new Error('身份响应无效'); }
  if (!Object.keys(parsed).includes('params')) throw new Error('身份响应缺少字段');
  const p = parsed.params;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('认证身份不匹配');
  const keys = Object.keys(p);
  if (!['id', 'account', 'tenant_id'].every((key: string) => keys.includes(key)) ||
    (typeof p.id !== 'string' && typeof p.id !== 'number') || (typeof p.id === 'number' && !Number.isSafeInteger(p.id)) ||
    String(p.id) !== expected.id || p.account !== expected.username || p.tenant_id !== expected.tenantId) throw new Error('认证身份不匹配');
}

// One-shot, offline-testable orchestration. Reserve callback must durably spend the single
// attempt before POST; neither fake success nor this result publishes to any app session.
export class NativeCas {
  private jar: CasCookieJar = new CasCookieJar(); private used: boolean = false; private cancelled: boolean = false;
  private stage: CasStage = CasStage.INIT;
  private lastStatus: number = 0;
  private progress: (stage: CasStage) => void = () => {};
  private transport: CasTransport;
  private rsa: CasRsa;
  constructor(transport: CasTransport = new CasHttps(), rsa: CasRsa = new CasCryptoRsa()) { this.transport = transport; this.rsa = rsa; }
  cancel(): void { this.cancelled = true; this.jar.clear(); this.transport.close(); }
  private at(stage: CasStage): void { this.stage = stage; this.progress(stage); }
  private check(): void { if (this.cancelled) throw new CasFailure(CasError.CANCELLED); }
  private async request(target: string, method: string = 'GET', body: string = '', pin?: SessionPin): Promise<CasResponse> {
    this.lastStatus = 0; this.check(); const cookie = this.jar.header(target);
    // No await between this final local continuity check and handing POST to RCP.
    if (pin) this.checkPin(pin);
    const r = await this.transport.request(target, method, body, cookie); this.check();
    if (!r || !httpStatus(r.status) || typeof r.body !== 'string' || !Array.isArray(r.cookies)) throw new CasFailure(CasError.RESPONSE_TYPE);
    this.lastStatus = r.status;
    if (r.body.length > LIMIT || r.cookies.length > 64) throw new CasFailure(CasError.RESPONSE_LIMIT);
    for (const c of r.cookies) {
      try { this.jar.receive(target, c); } catch (_) { throw new CasFailure(CasError.COOKIE_PARSE); }
    }
    return r;
  }
  private pin(): SessionPin {
    let binding: string;
    try { binding = this.transport.binding(); } catch (_) { throw new CasFailure(CasError.SESSION_TRANSPORT); }
    if (!binding) throw new CasFailure(CasError.SESSION_TRANSPORT);
    const targets = [LOGIN, KEY, CAPTCHA], cookie = this.jar.casSessionPin(LOGIN);
    for (const target of targets) if (!sameSessionCookie(this.jar.casSessionPin(target), cookie)) throw new CasFailure(CasError.COOKIE_SCOPE);
    return { binding, cookie };
  }
  private checkPin(pin: SessionPin): void {
    this.check();
    // Check the monotonic write generation first: a removed/rebuilt or shadowed
    // session must not pass just because its final value happens to match.
    if (pin.cookie.generation !== this.jar.sessionGeneration()) throw new CasFailure(CasError.COOKIE_CHANGED);
    const current = this.pin();
    if (pin.binding !== current.binding) throw new CasFailure(CasError.SESSION_TRANSPORT);
    if (!sameSessionCookie(pin.cookie, current.cookie)) throw new CasFailure(CasError.COOKIE_CHANGED);
  }
  private async captcha(pin: SessionPin, final: boolean = false): Promise<boolean> {
    this.at(final ? CasStage.FINAL_CAPTCHA_GET : CasStage.CAPTCHA_GET);
    const response = await this.request(CAPTCHA, 'GET', '', pin); this.checkPin(pin); requireOk(response);
    this.at(final ? CasStage.FINAL_CAPTCHA_PARSE : CasStage.CAPTCHA_PARSE);
    const value = response.body.trim();
    if (value !== 'true' && value !== 'false') throw new CasFailure(CasError.CAPTCHA_PARSE);
    return value === 'true';
  }
  private async prepare(): Promise<Preparation> {
    this.at(CasStage.ENTRY_GET); const entry = await this.request(ENTRY); this.at(CasStage.ENTRY_REDIRECT);
    if (redirected(entry, ENTRY) !== AUTHORIZE) throw new CasFailure(CasError.REDIRECT_TARGET);
    this.at(CasStage.AUTHORIZE_GET); const authorize = await this.request(AUTHORIZE); this.at(CasStage.AUTHORIZE_REDIRECT);
    if (redirected(authorize, AUTHORIZE) !== LOGIN) throw new CasFailure(CasError.REDIRECT_TARGET);
    this.at(CasStage.FORM_GET); let binding: string;
    try { binding = this.transport.binding(); } catch (_) { throw new CasFailure(CasError.SESSION_TRANSPORT); }
    // Authorize normally establishes the session. If it does, freeze it before
    // the form; otherwise allow the form to establish the first JSESSIONID.
    const initial = this.jar.hasCasSession() ? this.pin() : undefined;
    const page = await this.request(LOGIN); requireOk(page);
    this.at(CasStage.FORM_PARSE); let fields: Fields;
    try { fields = casForm(page.body); } catch (_) { throw new CasFailure(CasError.FORM_PARSE); }
    // Auxiliary form cookies are not a CAS session change.
    this.at(CasStage.SESSION_PIN);
    if (initial) this.checkPin(initial);
    const pin = initial || this.pin(); if (!binding || binding !== pin.binding) throw new CasFailure(CasError.SESSION_TRANSPORT);
    this.at(CasStage.KEY_GET);
    const response = await this.request(KEY, 'GET', '', pin); this.checkPin(pin); requireOk(response);
    this.at(CasStage.KEY_PARSE);
    const key = casKey(response.body);
    const captchaRequired = await this.captcha(pin);
    return { fields, key, pin, captchaRequired };
  }
  // Never accepts credentials, sends POST, returns session material or publishes an app login.
  // A successful result proves local cookie continuity, not an immutable server session.
  async preflight(progress: (stage: CasStage) => void = () => {}): Promise<CasPreflight> {
    if (this.used) throw new CasFailure(CasError.ALREADY_USED); this.used = true;
    this.progress = progress; let failed = false;
    try {
      const prepared = await this.prepare();
      // Fixed public synthetic plaintext, never a password or authentication.
      // Parsing a key alone must not be presented as native SDK compatibility.
      this.at(CasStage.RSA_CHECK); this.lastStatus = 0; this.check();
      await this.rsa.encrypt('CAS-PREFLIGHT-PROBE', prepared.key.modulus, prepared.key.exponent);
      this.checkPin(prepared.pin);
      const latest = await this.captcha(prepared.pin, true); this.at(CasStage.FINAL_SESSION); this.checkPin(prepared.pin);
      return { formReady: true, publicKeyReady: true, sessionContinuous: true,
        publicKeyBits: prepared.key.bits, publicKeyWeak: prepared.key.bits < CAS_RSA_WEAK_BELOW_BITS, publicKeyCryptoReady: true,
        captchaRequired: prepared.captchaRequired || latest, realPostEnabled: NATIVE_CAS_REAL_POST_ENABLED };
    } catch (error) {
      failed = true; const d = casDiagnostic(error);
      throw new CasFailure(d.category, this.stage, d.httpStatus || this.lastStatus, d.nativeCode);
    } finally {
      try {
        if (!failed) this.at(CasStage.CLEANUP);
        this.cancel();
        if (!failed) this.at(CasStage.COMPLETE);
      } catch (_) { if (!failed) throw new CasFailure(CasError.CLEANUP, CasStage.CLEANUP); }
      this.progress = () => {};
    }
  }
  async run(consent: boolean, username: string, password: string, expected: CasExpected, reserve: () => Promise<void>, guard: () => void = () => {}): Promise<CasResult> {
    if (this.used) throw new CasFailure(CasError.ALREADY_USED); this.used = true;
    let failed = false;
    try {
      const authorize = (): void => { try { guard(); } catch (_) { throw new CasFailure(CasError.CANCELLED); } };
      // Do not let caller-owned objects change the identity after asynchronous work starts.
      const snapshot: CasExpected = { id: expected.id, tenantId: expected.tenantId, username: expected.username };
      if (!consent) throw new CasFailure(CasError.CONSENT);
      if (this.transport instanceof CasHttps) this.transport.authorizeIdentity(snapshot);
      // A typed alias need not equal canonical infosimple.account. The returned
      // id, tenant AND official canonical account must still match the snapshot.
      if (!username || username !== username.trim() || username.length > 128 || !snapshot.username ||
        snapshot.username !== snapshot.username.trim() || snapshot.username.length > 128 ||
        !snapshot.id || snapshot.id !== snapshot.id.trim() || !Number.isSafeInteger(snapshot.tenantId) ||
        snapshot.tenantId <= 0 || !password) throw new CasFailure(CasError.CREDENTIALS);
      authorize();
      const prepared = await this.prepare(), f = prepared.fields, pub = prepared.key, pin = prepared.pin;
      if (prepared.captchaRequired) throw new CasFailure(CasError.CAPTCHA_REQUIRED);
      this.at(CasStage.RSA_ENCRYPT);
      this.lastStatus = 0;
      const encrypted = await this.rsa.encrypt(password, pub.modulus, pub.exponent); this.checkPin(pin);
      this.at(CasStage.ATTEMPT_RESERVE);
      this.lastStatus = 0;
      await reserve(); this.checkPin(pin);
      if (await this.captcha(pin, true)) throw new CasFailure(CasError.CAPTCHA_REQUIRED);
      const body = 'username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(encrypted) + '&authcode=&execution=' + encodeURIComponent(f.execution) + '&_eventId=submit' + (f.ys ? '&ys=' + encodeURIComponent(f.ys) : '');
      // The server remains authoritative if captcha changes after this last GET.
      // No await between this app/store/session generation guard and POST dispatch.
      this.at(CasStage.LOGIN_POST); this.lastStatus = 0; authorize();
      const response = await this.request(LOGIN, 'POST', body, pin); const callback = redirected(response, LOGIN);
      this.at(CasStage.CALLBACK_CHECK);
      try { requireCallback(callback); } catch (_) { throw new CasFailure(CasError.CALLBACK_PARAMS); }
      this.at(CasStage.CALLBACK_GET);
      const exchange = redirected(await this.request(callback), callback);
      this.at(CasStage.EXCHANGE_CHECK);
      try { requireExchange(exchange); } catch (_) { throw new CasFailure(CasError.EXCHANGE_PARAMS); }
      this.at(CasStage.EXCHANGE_GET);
      const home = redirected(await this.request(exchange), exchange); if (home !== ROOT) throw new CasFailure(CasError.REDIRECT_TARGET);
      this.at(CasStage.LANDING_GET);
      const landing = await this.request(ROOT); requireOk(landing);
      // Identity must use exactly one valid classroom bearer token from this jar.
      casBearer(this.jar.header(INFO));
      this.at(CasStage.USER_INFO_GET);
      const account = await this.request(INFO); requireOk(account);
      this.at(CasStage.IDENTITY_CHECK);
      try { identity(account.body, snapshot); } catch (_) { throw new CasFailure(CasError.IDENTITY); }
      const cookie = this.jar.header(ROOT); if (!cookie) throw new Error('缺少课堂会话'); this.check();
      authorize();
      return { cookie, identity: snapshot };
    } catch (error) {
      failed = true; const d = casDiagnostic(error);
      throw new CasFailure(d.category, this.stage, d.httpStatus || this.lastStatus, d.nativeCode);
    } finally {
      try { this.cancel(); } catch (_) { if (!failed) throw new CasFailure(CasError.CLEANUP, CasStage.CLEANUP); }
    }
  }
}
