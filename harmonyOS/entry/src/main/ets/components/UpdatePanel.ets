import { common } from '@kit.AbilityKit';
import { ReleaseUpdates, ReleaseStatus } from '../services/ReleaseUpdates';
@Component
export struct UpdatePanel {
  @State value: ReleaseStatus = { current: '', available: '', url: '', automatic: true, checkedAt: 0, error: '' };
  @State checking: boolean = false;
  aboutToAppear(): void { this.value = this.service().status(); }
  private service(): ReleaseUpdates { return new ReleaseUpdates(this.getUIContext().getHostContext() as common.UIAbilityContext); }
  private async check(): Promise<void> { if (this.checking) return; this.checking = true; try { this.value = await this.service().check(true); } finally { this.checking = false; } }
  build() {
    Column({ space: 10 }) {
      Text('版本更新').fontSize(16).fontWeight(FontWeight.Medium).fontColor('#0F2340')
      Text('当前版本 ' + this.value.current).fontSize(13).fontColor('#566A85')
      Row({ space: 10 }) { Text('每天自动检查更新').fontSize(14).layoutWeight(1); Toggle({ type: ToggleType.Switch, isOn: this.value.automatic }).onChange((enabled: boolean) => { if (enabled === this.value.automatic) return; this.service().automatic(enabled); this.value = this.service().status(); if (enabled) this.check(); }) }.width('100%')
      Text('仅从 GitHub 获取公开版本信息，不上传账号或课程资料。鸿蒙公开包需要自行签名后安装。').fontSize(12).fontColor('#566A85').lineHeight(21)
      Row({ space: 10 }) { Button(this.checking ? '正在检查…' : '检查更新').fontSize(13).height(34).enabled(!this.checking).onClick(() => this.check()); if (this.value.available) { Button('查看 ' + this.value.available).fontSize(13).height(34).onClick(() => this.service().open(this.value.url).catch(() => this.getUIContext().getPromptAction().showToast({ message: '无法打开发布页', duration: 2000 }))) } }
      Text(this.value.error || (this.value.available ? '发现新版本 ' + this.value.available : this.value.checkedAt ? '当前已是最新可下载版本' : '')).fontSize(12).fontColor('#566A85')
    }.width('100%').alignItems(HorizontalAlign.Start).padding(16).backgroundColor('#E2F0FF').borderRadius(14)
  }
}
