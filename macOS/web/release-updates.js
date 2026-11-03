const UPDATE_FEED = "https://api.github.com/repos/He-He-He-He-He-He/ZhiyunAssistant/releases?per_page=100";
const UPDATE_ROOT = "https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/";
function compareVersions(a, b) {
  const parse = (v) => /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(v);
  const x = parse(a), y = parse(b);
  if (!x || !y) throw Error("\u65E0\u6CD5\u8BC6\u522B\u7248\u672C\u53F7");
  for (let i = 1; i <= 3; i++) {
    const d = Number(x[i]) - Number(y[i]);
    if (d) return Math.sign(d);
  }
  const rank = (s) => s === "alpha" ? 0 : s === "beta" ? 1 : s === "rc" ? 2 : 3;
  return Math.sign(rank(x[4]) - rank(y[4]) || Number(x[5] || 0) - Number(y[5] || 0));
}
function selectUpdate(feed, info) {
  if (!Array.isArray(feed)) throw Error("\u66F4\u65B0\u670D\u52A1\u8FD4\u56DE\u683C\u5F0F\u65E0\u6548");
  let best = null;
  const platform = info.platform === "darwin" ? "Mac" : info.platform === "android" ? "Android" : info.platform === "harmony" ? "HarmonyOS" : "Windows";
  for (const release of feed) {
    if (!release || release.draft || typeof release.html_url !== "string" || !release.html_url.startsWith(UPDATE_ROOT + "tag/")) continue;
    for (const asset of Array.isArray(release.assets) ? release.assets : []) {
      const name = String(asset.name || ""), url = String(asset.browser_download_url || "");
      if (asset.state !== "uploaded" || !url.startsWith(UPDATE_ROOT + "download/") || !name.includes(platform) || /source|debug|tests|sha256/i.test(name)) continue;
      if (platform === "Mac" && !/\.dmg$/i.test(name) || platform === "Android" && !/\.apk$/i.test(name) || platform === "HarmonyOS" && !/-unsigned\.hap$/i.test(name) || platform === "Windows" && (!/\.zip$/i.test(name) || !name.includes(info.arch === "arm64" ? "arm64" : "x64"))) continue;
      const version = name.match(/\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?/)?.[0];
      if (!version) continue;
      if (compareVersions(version, info.version) > 0 && (!best || compareVersions(version, best.version) > 0)) best = { version, url: release.html_url, assetUrl: url, preview: !!release.prerelease };
    }
  }
  return best;
}
class UpdateChecker {
  constructor(options) {
    this.options = options;
    try {
      const value = JSON.parse(this.storage()?.getItem("release-updates-v1") || "null");
      if (value) {
        this.state.automatic = value.automatic !== false;
        this.state.checkedAt = Number(value.checkedAt) || 0;
        if (value.candidate?.url?.startsWith(UPDATE_ROOT + "tag/")) this.state.candidate = value.candidate;
      }
    } catch {
    }
  }
  state = { info: null, candidate: null, checking: false, error: "", automatic: true, checkedAt: 0 };
  listeners = /* @__PURE__ */ new Set();
  pending = null;
  started = false;
  failedAt = 0;
  storage() {
    try {
      return this.options.storage || globalThis.localStorage;
    } catch {
      return void 0;
    }
  }
  now() {
    return (this.options.clock || Date.now)();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  changed() {
    for (const f of this.listeners) f();
  }
  save() {
    try {
      this.storage()?.setItem("release-updates-v1", JSON.stringify({ automatic: this.state.automatic, checkedAt: this.state.checkedAt, candidate: this.state.candidate }));
    } catch {
    }
  }
  setAutomatic(value) {
    this.state.automatic = value;
    this.save();
    this.changed();
    if (value) void this.check(false);
  }
  async start() {
    if (this.started) return;
    this.started = true;
    try {
      this.state.info = await this.options.info();
      if (this.state.candidate && compareVersions(this.state.candidate.version, this.state.info.version) <= 0) this.state.candidate = null;
      this.changed();
    } catch {
      return;
    }
    if (this.state.automatic) await this.check(false);
  }
  check(manual = true) {
    if (this.pending) return this.pending;
    if (!manual && (!this.state.automatic || this.now() - this.state.checkedAt < 864e5 || this.failedAt && this.now() - this.failedAt < 36e5)) return Promise.resolve();
    this.pending = (async () => {
      this.state.checking = true;
      this.state.error = "";
      this.changed();
      try {
        const info = await this.options.info(), text = await this.options.feed();
        if (text.length > 2097152) throw Error("\u66F4\u65B0\u6570\u636E\u8FC7\u5927");
        const candidate = selectUpdate(JSON.parse(text), info);
        this.state.info = info;
        this.state.candidate = candidate;
        this.state.checkedAt = this.now();
        this.failedAt = 0;
        this.save();
        if (candidate) this.options.found?.(candidate);
      } catch {
        this.failedAt = this.now();
        this.state.error = "\u6682\u65F6\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
      } finally {
        this.state.checking = false;
        this.pending = null;
        this.changed();
      }
    })();
    return this.pending;
  }
  async open() {
    const url = this.state.candidate?.url;
    if (url?.startsWith(UPDATE_ROOT + "tag/")) await this.options.open(url);
  }
}
export {
  UPDATE_FEED,
  UPDATE_ROOT,
  UpdateChecker,
  compareVersions,
  selectUpdate
};
