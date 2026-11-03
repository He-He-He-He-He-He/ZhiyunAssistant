import { http } from '@kit.NetworkKit';
import { bundleManager, common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
interface ReleaseAsset { name: string; state: string; browser_download_url: string }
interface Release { draft: boolean; prerelease: boolean; html_url: string; assets: ReleaseAsset[] }
export interface ReleaseStatus { current: string; available: string; url: string; automatic: boolean; checkedAt: number; error: string }
const ROOT = 'https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/';
export function compareRelease(a: string, b: string): number {
  const x = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(a), y = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(b);
  if (!x || !y) throw new Error('无法识别版本号');
  for (let i = 1; i <= 3; i++) { const delta = Number(x[i]) - Number(y[i]); if (delta) return Math.sign(delta); }
  const rank = (value: string): number => value === 'alpha' ? 0 : value === 'beta' ? 1 : value === 'rc' ? 2 : 3;
  return Math.sign(rank(x[4]) - rank(y[4]) || Number(x[5] || 0) - Number(y[5] || 0));
}
export class ReleaseUpdates {
  private static pending: Promise<ReleaseStatus> | undefined = undefined;
  private static failedAt: number = 0;
  private context: common.UIAbilityContext;
  constructor(context: common.UIAbilityContext) { this.context = context; }
  status(): ReleaseStatus {
    let value: ReleaseStatus = { current: '', available: '', url: '', automatic: true, checkedAt: 0, error: '' };
    try { value = JSON.parse(fs.readTextSync(this.context.filesDir + '/release-updates-v1.json')) as ReleaseStatus; } catch (_) {}
    if (!value || typeof value !== 'object') value = { current: '', available: '', url: '', automatic: true, checkedAt: 0, error: '' };
    value.available = typeof value.available === 'string' ? value.available : ''; value.url = typeof value.url === 'string' ? value.url : ''; value.automatic = value.automatic !== false; value.checkedAt = Number.isFinite(value.checkedAt) && value.checkedAt > 0 && value.checkedAt <= Date.now() ? value.checkedAt : 0;
    value.current = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT).versionName;
    try { if (value.available && compareRelease(value.available, value.current) <= 0) { value.available = ''; value.url = ''; } } catch (_) { value.available = ''; value.url = ''; }
    if (!value.url.startsWith(ROOT + 'tag/')) { value.url = ''; value.available = ''; }
    value.error = ''; return value;
  }
  private save(value: ReleaseStatus): void { const f = fs.openSync(this.context.filesDir + '/release-updates-v1.json', fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC); try { fs.writeSync(f.fd, JSON.stringify(value)); } finally { fs.closeSync(f); } }
  automatic(enabled: boolean): void { const value = this.status(); value.automatic = enabled; this.save(value); }
  async check(manual: boolean): Promise<ReleaseStatus> {
    if (ReleaseUpdates.pending) return ReleaseUpdates.pending;
    const value = this.status(), now = Date.now();
    if (!manual && (!value.automatic || now - value.checkedAt < 86400000 || ReleaseUpdates.failedAt > 0 && now - ReleaseUpdates.failedAt < 3600000)) return value;
    const operation = this.fetch(value); ReleaseUpdates.pending = operation;
    try { return await operation; } finally { if (ReleaseUpdates.pending === operation) ReleaseUpdates.pending = undefined; }
  }
  private async fetch(value: ReleaseStatus): Promise<ReleaseStatus> {
    const req = http.createHttp();
    try {
      const response = await req.request('https://api.github.com/repos/He-He-He-He-He-He/ZhiyunAssistant/releases?per_page=100', { method: http.RequestMethod.GET, connectTimeout: 12000, readTimeout: 12000, header: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ZhiyunAssistant' }, usingCache: false });
      if (response.responseCode !== 200 || typeof response.result !== 'string' || response.result.length > 2097152) throw new Error('更新服务不可用');
      const releases = JSON.parse(response.result) as Release[]; if (!Array.isArray(releases)) throw new Error('版本数据无效');
      let available = '', url = '';
      for (const release of releases) {
        if (release.draft || !release.html_url?.startsWith(ROOT + 'tag/') || !Array.isArray(release.assets)) continue;
        for (const asset of release.assets) {
          if (asset.state !== 'uploaded' || !asset.browser_download_url?.startsWith(ROOT + 'download/') || !/HarmonyOS-\d+\.\d+\.\d+-unsigned\.hap$/.test(asset.name)) continue;
          const version = asset.name.match(/\d+\.\d+\.\d+/)?.[0] || '';
          if (version && compareRelease(version, value.current) > 0 && (!available || compareRelease(version, available) > 0)) { available = version; url = release.html_url; }
        }
      }
      value.available = available; value.url = url; value.checkedAt = Date.now(); value.error = ''; value.automatic = this.status().automatic; this.save(value); ReleaseUpdates.failedAt = 0;
    } catch (_) { value.error = '暂时无法检查更新，请检查网络后重试'; ReleaseUpdates.failedAt = Date.now(); }
    finally { req.destroy(); }
    return value;
  }
  async open(url: string): Promise<void> { if (!url.startsWith(ROOT + 'tag/')) return; await this.context.startAbility({ action: 'ohos.want.action.viewData', uri: url, entities: ['entity.system.browsable'] }); }
}
