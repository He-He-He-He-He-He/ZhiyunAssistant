@CustomDialog
export struct PageJumpDialog {
  controller: CustomDialogController;
  initialPage: number = 1;
  pages: number = 1;
  onJump: (page: number) => void = () => {};
  @State picked: number = 0;
  aboutToAppear(): void { this.picked = Math.max(0, Math.min(this.pages - 1, this.initialPage - 1)); }
  private values(): string[] { const values: string[] = []; for (let i = 0; i < Math.max(1, this.pages); i++) values.push(`第 ${i + 1} 页`); return values; }
  build() {
    Column({ space: 18 }) {
      Text('跳转页数').fontSize(20).fontWeight(FontWeight.Medium).fontColor('#0F2340')
      TextPicker({ range: this.values(), selected: this.picked }).height(180).width('100%')
        .selectedTextStyle({ color: '#1F7BFF', font: { size: 20 } }).onChange((value: string | string[], index: number | number[]) => { this.picked = index as number; })
      Row({ space: 12 }) {
        Button('取消').layoutWeight(1).height(38).backgroundColor('#E2F0FF').fontColor('#1F7BFF').onClick(() => this.controller.close())
        Button('跳转').layoutWeight(1).height(38).backgroundColor('#1F7BFF').fontColor('#FFFFFF').onClick(() => { this.onJump(this.picked + 1); this.controller.close(); })
      }.width('100%')
    }.padding(24).width('100%')
  }
}
