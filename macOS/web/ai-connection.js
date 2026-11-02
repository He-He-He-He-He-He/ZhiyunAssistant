const LOCAL_MODELS = [
  ['qwen3.8:27b', 'Qwen3.8 27B · 本地加速'],
  ['qwen3.8-uncensored:27b', 'Qwen3.8 27B · 低拒答加速'],
];
export class AIConnection {
  constructor(native, preferences) { this.native = native; this.preferences = preferences; this.status = { personalReady: false }; }
  async refresh() {
    const status = await this.native.call('aiStatus');
    this.status = status && typeof status.personalReady === 'boolean' ? status : { personalReady: !!(await this.native.call('secret')) };
    if (this.provider() === 'local') Object.assign(this.status, await this.native.call('localAIStatus'));
    return this.available();
  }
  provider() { return ['personal', 'local'].includes(this.preferences().aiProvider) ? this.preferences().aiProvider : 'auto'; }
  effective() { return this.provider() === 'auto' ? 'personal' : this.provider(); }
  available() { return this.effective() === 'local' ? !!this.status.localReady : this.status.personalReady; }
  localModels() {
    const models = new Map(LOCAL_MODELS);
    for (const name of this.status.localModels || []) if (typeof name === 'string' && name.toLowerCase().includes('gemma') && !models.has(name)) models.set(name, name + ' · 本地');
    return [...models];
  }
  localModel() { const selected = this.preferences().localModel; return this.localModels().some(([name]) => name === selected) ? selected : 'qwen3.8:27b'; }
  request() { return { provider: this.provider(), ...(this.effective() === 'local' ? {localModel: this.localModel()} : {}) }; }
  description() { return this.effective() === 'local' ? this.localModels().find(([name]) => name === this.localModel())[1] + ' · 发消息时加载，空闲 5 分钟后释放内存；对话保留在本机' : '个人 DeepSeek API'; }
}
