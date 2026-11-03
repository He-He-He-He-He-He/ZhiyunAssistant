import { CourseCollections } from '../model/CourseCollections';
import { CollectionActions } from './CollectionActions';
import { notStarted } from '../model/CollectionView';
import { Course, phase, shanghaiDate, clockTime } from '../model/Timeline';

@Component
export struct CourseList {
  collections: CourseCollections = new CourseCollections();
  @Prop collectionRevision: number = 0;
  @Prop separateUpcoming: boolean = false;
  @Prop chronological: boolean = false;
  @Prop descending: boolean = false;
  @Prop courses: Course[] = [];
  @Prop permissions: Record<string, string> = {};
  @Prop now: number = Date.now() / 1000;
  @Prop busy: boolean = false;
  @Prop emptyText: string = '暂无课程';
  onVisible: (course: Course, visible: boolean) => void = () => {};
  onEnter: (course: Course) => void = () => {};
  private inSection(state: string): Course[] {
    if (state === 'all') return this.courses.slice().sort((a: Course, b: Course) => this.descending ? b.start - a.start : a.start - b.start);
    const rows = this.courses.filter((c: Course) => (state === 'upcoming' ? notStarted(c, this.now) : (!this.separateUpcoming || !notStarted(c, this.now)) && (this.permissions[c.subId] || 'unknown') === state)); return this.separateUpcoming ? rows.sort((a: Course, b: Course) => state === 'upcoming' ? a.start - b.start : b.start - a.start) : rows;
  }
  private sectionTitle(state: string): string {
    return state === 'upcoming' ? '尚未开始' : state === 'allowed' ? '可访问' : state === 'denied' ? '需申请权限' : '待确认';
  }
  private buttonTitle(c: Course, state: string): string {
    if (state === 'denied') return '需申请';
    if (state === 'unknown') return '待确认';
    if (c.status === '1') return '进入学习';
    const p = phase(c, this.now);
    return p === 'live' ? '进入学习' : p === 'soon' ? '准备上课' : p === 'later' ? '尚未开始' : '进入学习';
  }
  build() {
    List({ space: 10 }) {
      ForEach(this.chronological ? ['all'] : this.separateUpcoming ? ['allowed', 'denied', 'unknown', 'upcoming'] : ['allowed', 'denied', 'unknown'], (state: string) => {
        if (this.inSection(state).length) {
          if (state !== 'all') { ListItem() {
            Text(`${this.sectionTitle(state)} · ${this.inSection(state).length}`).fontSize(14).fontWeight(FontWeight.Medium)
              .fontColor(state === 'allowed' ? '#1F7BFF' : '#566A85').width('100%').padding({ top: 10, bottom: 3, left: 4 })
          } }
          ForEach(this.inSection(state), (c: Course, index: number) => {
            ListItem() {
              Column({ space: 12 }) {
                if (this.chronological && (index === 0 || shanghaiDate(this.inSection(state)[index - 1].start) !== shanghaiDate(c.start))) { Text(shanghaiDate(c.start)).fontSize(16).fontWeight(FontWeight.Medium).fontColor('#0F2340').padding({ left: 4, top: 12 }).width('100%') }
              Row({ space: 12 }) {
                Column({ space: 8 }) {
                  Text(c.title).fontSize(18).fontWeight(FontWeight.Medium).fontColor('#0F2340').maxLines(2)
                  Text(`${shanghaiDate(c.start)}  ${clockTime(c.start)}–${clockTime(c.end)}`).fontSize(12).fontColor('#566A85')
                  Text(`${c.teacher}  ${c.room}`).fontSize(12).fontColor('#566A85')
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                Row({ space: 4 }) {
                CollectionActions({ collections: this.collections, revision: this.collectionRevision, course: c, lesson: true })
                Button(this.buttonTitle(c, this.permissions[c.subId] || 'unknown')).height(38).fontSize(12)
                  .backgroundColor(this.permissions[c.subId] === 'allowed' && c.status === '1' ? '#1F7BFF' : '#E2F0FF')
                  .fontColor(this.permissions[c.subId] === 'allowed' && c.status === '1' ? '#FFFFFF' : '#1F7BFF')
                  .enabled(this.permissions[c.subId] === 'allowed' && (c.status === '1' || phase(c, this.now) !== 'later')).onClick((event: ClickEvent) => { this.onEnter(c); })
                }.alignItems(VerticalAlign.Center)
              }.width('100%').padding(20).backgroundColor('#FFFFFF').borderRadius(16).border({ width: 1, color: '#D6E5F5' }).onClick(() => { if (this.permissions[c.subId] === 'allowed' && (c.status === '1' || phase(c, this.now) !== 'later')) this.onEnter(c); })
              }.width('100%').alignItems(HorizontalAlign.Start)
            }.onVisibleAreaChange([0.1], (visible: boolean) => this.onVisible(c, visible))
          }, (c: Course) => state + ':' + c.subId + ':' + c.status + ':' + phase(c, this.now))
        }
      }, (state: string) => state)
      if (!this.courses.length && !this.busy) { ListItem() { Text(this.emptyText).fontSize(14).fontColor('#566A85').padding(24) } }
    }.layoutWeight(1).width('100%').padding({ right: 12, bottom: 20 }).scrollBar(BarState.Auto)
  }
}
