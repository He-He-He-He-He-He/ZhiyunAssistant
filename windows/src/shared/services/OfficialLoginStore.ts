import { asset, util } from '../../desktop/compat';

// Password-based auto-login is disabled: the classroom session alone cannot prove which
// submitted CAS password succeeded. Keep only removal of credentials from older builds.
const aliases = ['zhiyun-official-login-v1', 'zhiyun-official-login-state-v1']
  .map(name => new util.TextEncoder().encodeInto(name));

export class OfficialLoginStore {
  static async clear(): Promise<void> {
    let failed = false;
    for (const alias of aliases) {
      try { await asset.remove(new Map([[asset.Tag.ALIAS, alias]])); }
      catch (_) { failed = true; }
    }
    if (failed) throw new Error('无法删除旧版保存的校园账号，请检查本机文件权限后重试');
  }
}
