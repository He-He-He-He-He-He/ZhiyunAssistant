import { NativeLoginDemo } from '../services/NativeLoginDemo';

@Entry
@Component
struct NativeLoginExercisePage {
  @State busy: boolean = false;
  @State result: string = '尚未演练。打开此页面不会联网、读取凭据或执行认证。';
  @StorageProp('safeTop') safeTop: number = 0;
  @StorageProp('safeBottom') safeBottom: number = 0;
  private epoch: number = 0;
  private demo: NativeLoginDemo | undefined = undefined;
  private cancel(): void {
    this.epoch++; this.demo?.cancel(); this.demo = undefined; this.busy = false;
  }
  onPageHide(): void { this.cancel(); }
  aboutToDisappear(): void { this.cancel(); }
  onBackPress(): boolean { this.cancel(); return false; }
  private async start(captcha: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true; const epoch = ++this.epoch, demo = new NativeLoginDemo(); this.demo = demo;
    this.result = '正在运行纯内存合成链路…';
    try {
      const result = await demo.exercise(captcha);
      if (epoch === this.epoch) this.result = result;
    } catch (_) { if (epoch === this.epoch) this.result = '离线演练未完成；未联网或读取已有资产。'; }
    finally { if (epoch === this.epoch) { this.busy = false; this.demo = undefined; } }
  }
  build() {
    Column({ space: 16 }) {
      Button('返回').onClick(() => { this.cancel(); this.getUIContext().getRouter().back(); })
      Text('开发测试：原生保存与重登离线演练').fontSize(22).fontWeight(FontWeight.Bold)
      Text('使用与首页相同的 NativeLoginCoordinator 和 NativeCas.run。仅使用固定合成身份、内存凭据库、模拟传输与加密；不使用真实密码、不读 Asset/浏览器、不发任何网络。生产默认开关仍关闭；此演练不会授予本次真实验收许可，真实验收须在原生风险页面另行手动勾选。').fontSize(14).lineHeight(24)
      Button('演练：验证保存 → 一次重登 → 会话采用 → 确认').enabled(!this.busy).onClick(() => this.start(false))
      Button('演练：验证码转人工，不重试').enabled(!this.busy).onClick(() => this.start(true))
      if (this.busy) { Button('取消演练').onClick(() => { this.cancel(); this.result = '演练已取消；迟到结果不会更新页面。'; }) }
      Scroll() { Text(this.result).fontSize(14).lineHeight(24).width('100%') }.layoutWeight(1)
    }.padding({ top: this.safeTop + 20, bottom: this.safeBottom + 20, left: 20, right: 20 }).width('100%').height('100%').backgroundColor('#EEF6FF')
  }
}
