@Component
export struct InsertNoteAction {
  onInsert: () => void = () => {};
  build() {
    Button() { Row({ space: 4 }) { Text('＋').fontSize(16).fontColor('#1F7BFF'); Text('插入笔记').fontSize(12).fontWeight(FontWeight.Medium).fontColor('#1F7BFF').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1) }.width('100%').height('100%').alignItems(VerticalAlign.Center).justifyContent(FlexAlign.Center).padding({ left: 12, right: 12 }) }.width('100%').height(34).padding(0).borderRadius(17).backgroundColor('#E2F0FF').shadow({ radius: 8, color: '#0F234025' }).clip(true).onClick(() => this.onInsert())
  }
}
