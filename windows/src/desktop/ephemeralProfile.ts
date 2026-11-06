import { randomUUID } from 'node:crypto';
import type { Session } from 'electron';

// Separate non-persistent partitions have isolated cookies/cache and never use persist:.
// This helper is not yet connected to authentication: a separate adapter must enforce
// a single CAS POST and prove its password was the one authenticated.
export async function openEphemeralProfile(factory: (partition: string, options: { cache: boolean }) => Session): Promise<Session> {
  const partition = 'zhiyun-verify-' + randomUUID();
  const isolated = factory(partition, { cache: false });
  try {
    if (isolated.getStoragePath() !== null) throw Error('隔离验证会话不是内存会话');
    if ((await isolated.cookies.get({})).length !== 0) throw Error('隔离验证会话不是空会话');
    isolated.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    return isolated;
  } catch (error) {
    await closeEphemeralProfile(isolated);
    throw error;
  }
}

export async function closeEphemeralProfile(isolated: Session): Promise<void> {
  let failure: unknown;
  for (const clear of [() => isolated.closeAllConnections(), () => isolated.clearStorageData(), () => isolated.clearCache()]) {
    try { await clear(); } catch (error) { failure ||= error; }
  }
  if (failure) throw new Error('隔离验证会话无法完全清除');
}
