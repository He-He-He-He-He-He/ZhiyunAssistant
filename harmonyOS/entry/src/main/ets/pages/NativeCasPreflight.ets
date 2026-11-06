import { NativeCas, CasStage, casProgressText, casDiagnosticText } from '../services/NativeCas';

// Explicit developer entry in Privacy & Data. Never runs on page load.
@Entry
@Component
struct NativeCasPreflightPage {
  @StorageProp('safeTop') private safeTop: number = 0;
  @StorageProp('safeBottom') private safeBottom: number = 0;
  @StorageProp('safeLeft') private safeLeft: number = 0;
  @StorageProp('safeRight') private safeRight: number = 0;
  @State private running: boolean = false;
  @State private result: string = '尚未运行';
  private probe: NativeCas | undefined = undefined;

  private stop(): void {
    const probe = this.probe;
    this.probe = undefined;
    if (this.running) this.result = '已取消匿名预检，会话已销毁。';
    this.running = false;
    if (probe) { try { probe.cancel(); } catch (_) {} }
  }

  aboutToDisappear(): void { this.stop(); }
  onPageHide(): void { this.stop(); }
  onBackPress(): boolean { this.stop(); return false; }

  private back(): void {
    this.stop();
    this.getUIContext().getRouter().back();
  }

  private async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.result = '正在执行匿名 HTTPS GET 预检…';
    let probe: NativeCas | undefined = undefined;
    try {
      probe = new NativeCas();
      this.probe = probe;
      const result = await probe.preflight((stage: CasStage) => {
        if (this.probe === probe) this.result = casProgressText(stage);
      });
      if (this.probe !== probe) return;
      this.result = '表单：可解析\n公钥 JSON 格式：可解析\n应用层 RSA：' +
        String(result.publicKeyBits) + ' 位' +
        (result.publicKeyWeak ? '（传统弱 RSA；官方协议兼容警告）' : '（位数提示，不代表协议安全验收）') +
        '\n本机加密实现：' + (result.publicKeyCryptoReady ? '合成文本测试通过；未认证' : '未确认兼容') +
        '\n私有会话：连续\n验证码：' +
        (result.captchaRequired ? '服务端要求验证码' : '最近检查未要求') +
        '\n真实认证 POST：关闭\n预检完成，会话已销毁；未登录。';
    } catch (error) {
      if (this.probe === probe) this.result = casDiagnosticText(error);
    } finally {
      if (probe) { try { probe.cancel(); } catch (_) {} }
      if (this.probe === probe) {
        this.probe = undefined;
        this.running = false;
      }
    }
  }

  build() {
    Scroll() {
      Column({ space: 18 }) {
      Button('返回').onClick(() => this.back())
      Text('原生 CAS 匿名预检').fontSize(24).fontWeight(FontWeight.Bold)
      Text('仅向官方 HTTPS 端点发送匿名 GET，并用固定合成文本在本机测试公钥加密。每次使用独立内存 Cookie，会话结束立即销毁；不读取已有登录，不保存凭据，不执行认证 POST。')
        .fontSize(16)
      Button(this.running ? '预检中…' : '手动开始匿名预检')
        .enabled(!this.running)
        .onClick(() => { this.start(); })
      Button('取消预检').enabled(this.running).onClick(() => this.stop())
      Text(this.result).fontSize(16).width('100%')
      Text('验证码可以随时由服务端改变。本结果不保证之后能够免验证码登录。')
        .fontSize(14).fontColor('#666666')
      Text('官方 512 位裸 RSA 不提供现代独立保密保护，与 HTTPS 证书密钥不是一回事。传输安全依赖正确验证的端到端 TLS；兼容官方 RSA 不需要改用 HTTP 或弱化 TLS。真实 POST 默认关闭。')
        .fontSize(14).fontColor('#666666')
      }.width('100%').padding(24).alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').align(Alignment.TopStart)
      .padding({ top: this.safeTop, bottom: this.safeBottom, left: this.safeLeft, right: this.safeRight })
      .backgroundColor('#EEF6FF')
  }
}
