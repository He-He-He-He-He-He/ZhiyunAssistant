import { sameClassroomIdentity } from './classroomIdentity';

// Protocol only. A production adapter must provide an actually fresh non-persistent
// Electron partition, tie the supplied password to the ONE CAS POST, and observe the
// official async RSA and captcha status. No adapter is enabled until those properties
// can be established. This module never stores or returns a password.
export interface VerificationDriver {
  openFresh(): Promise<void>;
  // Must prove this profile has no pre-existing authentication, not just an empty page.
  isUnauthenticated(): Promise<boolean>;
  captchaStatus(): Promise<'clear' | 'required' | 'unknown'>;
  // Atomically persist that an attempt has been consumed before any CAS POST can occur.
  reserveAttempt(): Promise<void>;
  // Must block all further CAS POSTs, including those initiated by the page itself,
  // and synchronously disarm interception when the signal aborts.
  submitOnce(username: string, password: string, signal: AbortSignal): Promise<'submitted' | 'cancelled' | 'unknown'>;
  authenticatedIdentity(): Promise<unknown>;
  close(): Promise<void>;
}
export type VerificationResult = 'verified' | 'cancelled' | 'manual-required';

export class IsolatedVerification {
  private used = false;
  async run(options: { consent: boolean; username: string; password: string; expectedIdentity: unknown; signal: AbortSignal }, driver: VerificationDriver): Promise<VerificationResult> {
    if (this.used) throw new Error('验证实例只能使用一次');
    this.used = true;
    if (!options.consent || options.signal.aborted) return 'cancelled';
    if (!options.username || !options.password || !sameClassroomIdentity(options.expectedIdentity, options.expectedIdentity)) return 'manual-required';
    const cancelled = () => options.signal.aborted;
    try {
      await driver.openFresh();
      if (cancelled()) return 'cancelled';
      if (!await driver.isUnauthenticated()) return 'manual-required';
      if (cancelled()) return 'cancelled';
      if (await driver.captchaStatus() !== 'clear') return 'manual-required';
      if (cancelled()) return 'cancelled';
      await driver.reserveAttempt();
      if (cancelled()) return 'cancelled';
      if (await driver.submitOnce(options.username, options.password, options.signal) !== 'submitted') return cancelled() ? 'cancelled' : 'manual-required';
      if (cancelled()) return 'cancelled';
      const actualIdentity = await driver.authenticatedIdentity();
      if (cancelled()) return 'cancelled';
      return sameClassroomIdentity(options.expectedIdentity, actualIdentity) ? 'verified' : 'manual-required';
    } catch (_) {
      return cancelled() ? 'cancelled' : 'manual-required';
    } finally {
      // Cleanup failure cannot turn an unsuccessful verification into success, and should
      // prevent success if profile destruction itself could not be confirmed.
      await driver.close();
    }
  }
}
