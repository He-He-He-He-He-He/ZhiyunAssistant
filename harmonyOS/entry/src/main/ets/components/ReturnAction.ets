@Component
export struct ReturnAction {
  @Prop owner: string = '';
  onReturn: () => void = () => {};
  build() {
    Button('回到刚刚').id('study-return-' + this.owner).height(30).fontSize(12).fontColor('#1F7BFF').backgroundColor('#E2F0FF')
      .onTouch((event: TouchEvent) => event.stopPropagation()).onMouse((event: MouseEvent) => event.stopPropagation()).onClick(() => this.onReturn())
  }
}
