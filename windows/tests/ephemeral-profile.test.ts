import test from 'node:test';
import assert from 'node:assert/strict';
import { closeEphemeralProfile, openEphemeralProfile } from '../src/desktop/ephemeralProfile';

function mock(storage: string | null = null, cookies: unknown[] = []) {
  const calls: string[] = [];
  const session = {
    getStoragePath: () => storage,
    cookies: { get: async () => cookies },
    setPermissionRequestHandler: () => { calls.push('permissions'); },
    setPermissionCheckHandler: () => { calls.push('permission-check'); },
    closeAllConnections: async () => { calls.push('connections'); },
    clearStorageData: async () => { calls.push('storage'); },
    clearCache: async () => { calls.push('cache'); },
  };
  return { session: session as any, calls };
}

test('each synthetic verification uses a distinct memory-only empty profile', async () => {
  const partitions: string[] = [];
  for (let i = 0; i < 2; i++) {
    const fake = mock();
    const profile = await openEphemeralProfile((partition, options) => { partitions.push(partition); assert.equal(options.cache, false); return fake.session; });
    assert.equal(profile, fake.session);
    assert.deepEqual(fake.calls, ['permissions', 'permission-check']);
    await closeEphemeralProfile(profile);
    assert.deepEqual(fake.calls.slice(2), ['connections', 'storage', 'cache']);
  }
  assert.notEqual(partitions[0], partitions[1]);
  assert.ok(partitions.every(partition => partition.startsWith('zhiyun-verify-') && !partition.startsWith('persist:')));
});

test('persistent or nonempty profiles fail closed and are cleaned', async () => {
  for (const fake of [mock('/synthetic/persistent'), mock(null, [{ name: 'synthetic' }])]) {
    await assert.rejects(openEphemeralProfile(() => fake.session));
    assert.deepEqual(fake.calls, ['connections', 'storage', 'cache']);
  }
});

test('cleanup failure is reported and remaining cleanup is still attempted', async () => {
  const fake = mock();
  fake.session.closeAllConnections = async () => { fake.calls.push('connections'); throw Error('synthetic'); };
  await assert.rejects(closeEphemeralProfile(fake.session), /无法完全清除/);
  assert.deepEqual(fake.calls, ['connections', 'storage', 'cache']);
});
