import test from 'node:test';
import assert from 'node:assert/strict';
import { IsolatedVerification, type VerificationDriver } from '../src/desktop/isolatedVerification';

const identity = { params: { id: 'synthetic-id', tenant_id: 112, account: 'synthetic-user' } };
function fixture() {
  const calls: string[] = [];
  const controller = new AbortController();
  const options = { consent: true, username: 'synthetic-user', password: 'synthetic-password', expectedIdentity: identity, signal: controller.signal };
  const driver: VerificationDriver = {
    async openFresh() { calls.push('open'); },
    async isUnauthenticated() { calls.push('baseline'); return true; },
    async captchaStatus() { calls.push('captcha'); return 'clear'; },
    async reserveAttempt() { calls.push('reserve'); },
    async submitOnce(username, password) { calls.push('submit'); assert.equal(username, 'synthetic-user'); assert.equal(password, 'synthetic-password'); return 'submitted'; },
    async authenticatedIdentity() { calls.push('identity'); return identity; },
    async close() { calls.push('close'); },
  };
  return { calls, controller, options, driver };
}

test('consent, fresh baseline, captcha and durable reservation precede one synthetic attempt', async () => {
  const f = fixture(), verifier = new IsolatedVerification();
  assert.equal(await verifier.run(f.options, f.driver), 'verified');
  assert.deepEqual(f.calls, ['open', 'baseline', 'captcha', 'reserve', 'submit', 'identity', 'close']);
  await assert.rejects(verifier.run(f.options, f.driver), /只能使用一次/);
});

test('no consent or invalid expected identity starts a verification', async () => {
  for (const missing of ['consent', 'identity'] as const) {
    const f = fixture(); if (missing === 'consent') f.options.consent = false; else f.options.expectedIdentity = { params: { id: 'synthetic-id', tenant_id: 112, account: '' } };
    assert.equal(await new IsolatedVerification().run(f.options, f.driver), missing === 'consent' ? 'cancelled' : 'manual-required');
    assert.deepEqual(f.calls, []);
  }
});

test('existing authentication, captcha, unknown state and reservation failure never submit', async () => {
  for (const fault of ['authenticated', 'required', 'unknown', 'write-failure'] as const) {
    const f = fixture();
    if (fault === 'authenticated') f.driver.isUnauthenticated = async () => false;
    if (fault === 'required' || fault === 'unknown') f.driver.captchaStatus = async () => fault;
    if (fault === 'write-failure') f.driver.reserveAttempt = async () => { throw Error('synthetic storage failure'); };
    assert.equal(await new IsolatedVerification().run(f.options, f.driver), 'manual-required');
    assert.equal(f.calls.includes('submit'), false);
    assert.equal(f.calls.at(-1), 'close');
  }
});

test('unknown submission, missing identity or another account cannot verify', async () => {
  for (const fault of ['unknown', 'missing', 'mismatch'] as const) {
    const f = fixture();
    if (fault === 'unknown') f.driver.submitOnce = async () => 'unknown';
    if (fault === 'missing') f.driver.authenticatedIdentity = async () => null;
    if (fault === 'mismatch') f.driver.authenticatedIdentity = async () => ({ params: { ...identity.params, account: 'different-user' } });
    assert.equal(await new IsolatedVerification().run(f.options, f.driver), 'manual-required');
    assert.equal(f.calls.at(-1), 'close');
  }
});

test('abort after reservation prevents submission and cleanup failure never claims success', async () => {
  const f = fixture(); f.driver.reserveAttempt = async () => { f.calls.push('reserve'); f.controller.abort(); };
  assert.equal(await new IsolatedVerification().run(f.options, f.driver), 'cancelled');
  assert.equal(f.calls.includes('submit'), false);
  const other = fixture(); other.driver.close = async () => { throw Error('synthetic cleanup failure'); };
  await assert.rejects(new IsolatedVerification().run(other.options, other.driver), /cleanup failure/);
});
