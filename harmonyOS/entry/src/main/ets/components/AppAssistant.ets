import { AiClient, AiMessage } from '../services/AiClient';
import { ApiKeySetup } from './ApiKeySetup';
import { LocalStore } from '../services/LocalStore';
import { AppAssistantRunner, AssistantMessage } from '../model/AppAssistant';
import { AiStream } from '../model/AiStream';
import { KeyCode } from '@kit.InputKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { SelectionKeys } from '../model/SelectionKeys';
import { physicalDigit } from '../model/KeyboardInput';

interface AssistantTurn { role: string; content: string }
interface AssistantConversation { id: string; title: string; turns: AssistantTurn[]; updated: number }
@Component
export struct AppAssistant {
  @Link open: boolean;
  @Prop @Watch('ownerChanged') accountId: string = '';
  @Prop @Watch('historyCleared') clearRevision: number = 0;
  store: LocalStore | undefined = undefined;
  onExecute: (action: string, argument: string) => Promise<string> = async () => { return '{"error":"操作不可用"}'; };
  onStop: () => void = () => {};
  onEditingFocus: (focused: boolean) => void = () => {};
  @State question: string = '';
  @State turns: AssistantTurn[] = [];
  @State conversations: AssistantConversation[] = [];
  @State conversationId: string = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  @State busy: boolean = false;
  @State configured: boolean = false;
  @State status: string = '';
  @State error: string = '';
  private inputController: TextAreaController = new TextAreaController();
  private shiftDown: boolean = false;
  private controlDown: boolean = false;
  private selectionStart: number = 0;
  private selectionEnd: number = 0;
  private suppressSubmitUntil: number = 0;
  private client: AiClient = new AiClient();
  private runner: AppAssistantRunner = new AppAssistantRunner();
  private requestGeneration: number = 0;
  aboutToAppear(): void { this.restoreHistory(); this.refreshKey(); }
  aboutToDisappear(): void { this.stop(); }
  private newConversationId(): string { return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }
  private historyCleared(): void { if (this.clearRevision > 0) { this.stop(); this.turns = []; this.conversations = []; this.conversationId = this.newConversationId(); this.error = ''; } }
  private ownerChanged(): void { this.stop(); this.turns = []; this.conversations = []; this.conversationId = this.newConversationId(); this.question = ''; this.restoreHistory(); this.refreshKey(); }
  private restoreHistory(): void { try { if (!this.store?.belongsTo(this.accountId) || !this.store.assistantCacheEnabled()) return; const saved = JSON.parse(this.store.readJson('app-assistant-history-v1.json') || '[]') as AssistantConversation[]; if (Array.isArray(saved)) { this.conversations = saved.filter((row: AssistantConversation): boolean => !!row.id && Array.isArray(row.turns)).slice(0, 100); if (this.conversations.length) { this.conversationId = this.conversations[0].id; this.turns = this.conversations[0].turns; } } } catch (_) {} }
  private saveHistory(): void { try { if (!this.store?.belongsTo(this.accountId) || !this.turns.some((turn: AssistantTurn): boolean => turn.role === 'assistant' && !!turn.content)) return; const first = this.turns.find((turn: AssistantTurn): boolean => turn.role === 'user'); const row: AssistantConversation = { id: this.conversationId, title: (first?.content || '新对话').slice(0, 32), turns: this.turns.slice(-100), updated: Date.now() }; this.conversations = [row].concat(this.conversations.filter((item: AssistantConversation): boolean => item.id !== row.id)).slice(0, 100); if (this.store.assistantCacheEnabled()) this.store.saveJson('app-assistant-history-v1.json', JSON.stringify(this.conversations)); } catch (_) { this.error = '助手对话未能保存'; } }
  private newConversation(): void { if (this.busy) return; this.saveHistory(); this.turns = []; this.question = ''; this.conversationId = this.newConversationId(); this.error = ''; }

  private async refreshKey(): Promise<void> { const owner = this.accountId; const value = await AiClient.savedKey(); if (owner === this.accountId) this.configured = !!value; }
  private stop(): void { this.requestGeneration++; this.runner.stop(); this.client.cancel(); this.onStop(); this.busy = false; this.status = ''; }
  private async pasteQuestion(): Promise<void> {
    const owner = this.accountId, previous = this.question;
    try { const data = await pasteboard.getSystemPasteboard().getData(), value = data.getPrimaryText(); if (!value || owner !== this.accountId || previous !== this.question) return;
      const range = this.inputController.getSelection(), start = Math.max(0, Math.min(previous.length, range?.start ?? this.selectionStart)), end = Math.max(start, Math.min(previous.length, range?.end ?? this.selectionEnd));
      this.inputController.clearPreviewText(); if (end > start) this.inputController.deleteText({ start, end }); this.inputController.addText(value, { offset: start }); this.question = previous.slice(0, start) + value + previous.slice(end); this.selectionStart = this.selectionEnd = start + value.length; this.inputController.caretPosition(start + value.length);
    } catch (_) { this.error = '无法读取剪贴板，请重试'; }
  }
  private questionKey(event: KeyEvent): boolean {
    SelectionKeys.update(event);
    if (event.keyCode === KeyCode.KEYCODE_SHIFT_LEFT || event.keyCode === KeyCode.KEYCODE_SHIFT_RIGHT) { this.shiftDown = event.type === KeyType.Down; return false; }
    if (event.keyCode === KeyCode.KEYCODE_CTRL_LEFT || event.keyCode === KeyCode.KEYCODE_CTRL_RIGHT) { this.controlDown = event.type === KeyType.Down; return false; }
    const shortcut = SelectionKeys.command(event);
    if (shortcut === 'a') { this.inputController.setTextSelection(0, this.question.length); this.selectionStart = 0; this.selectionEnd = this.question.length; return true; }
    if (shortcut === 'c') { const range = this.inputController.getSelection(); if (range && (range.end ?? 0) > (range.start ?? 0)) pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.question.slice(range.start, range.end))).catch(() => {}); return true; }
    if (shortcut === 'v') { this.pasteQuestion(); return true; }
    const modified = this.shiftDown || this.controlDown || !!event.getModifierKeyState?.(['Ctrl']) || !!event.getModifierKeyState?.(['Alt']) || !!event.getModifierKeyState?.(['Shift']);
    const digit = physicalDigit(event.keyCode, modified, event.keyText);
    if (digit) { if (event.type === KeyType.Down) { this.inputController.clearPreviewText(); const range = this.inputController.getSelection(), start = Math.max(0, Math.min(this.question.length, range?.start ?? this.selectionStart)), end = Math.max(start, Math.min(this.question.length, range?.end ?? this.selectionEnd)); const next = this.question.slice(0, start) + digit + this.question.slice(end); if (end > start) this.inputController.deleteText({ start, end }); this.inputController.addText(digit, { offset: start }); this.question = next; this.selectionStart = this.selectionEnd = start + 1; this.inputController.caretPosition(start + 1); } return true; }
    const enter = event.keyCode === KeyCode.KEYCODE_ENTER || event.keyCode === KeyCode.KEYCODE_NUMPAD_ENTER || event.keyText === 'Enter' || event.keyText === 'NumpadEnter';
    if (!enter) return false;
    if (event.type === KeyType.Down) {
      this.suppressSubmitUntil = Date.now() + 400;
      if (!this.shiftDown && !event.getModifierKeyState?.(['Shift'])) setTimeout(() => { if (!this.busy) this.send(); }, 0);
      else { this.inputController.clearPreviewText(); const range = this.inputController.getSelection(), start = Math.max(0, Math.min(this.question.length, range?.start ?? this.selectionStart)), end = Math.max(start, Math.min(this.question.length, range?.end ?? this.selectionEnd)); if (end > start) this.inputController.deleteText({ start, end }); this.inputController.addText('\n', { offset: start }); this.question = this.question.slice(0, start) + '\n' + this.question.slice(end); this.selectionStart = this.selectionEnd = start + 1; this.inputController.caretPosition(start + 1); }
    }
    return true;
  }
  private async send(): Promise<void> {
    const text = this.question.trim(), store = this.store, owner = this.accountId;
    if (!text || this.busy || !store || !store.belongsTo(owner)) return;
    await this.refreshKey(); if (!this.configured || owner !== this.accountId) { this.error = '请先在课程问答中设置 DeepSeek API 密钥'; return; }
    const history: AssistantMessage[] = this.turns.filter((turn: AssistantTurn): boolean => !!turn.content).map((turn: AssistantTurn): AssistantMessage => { return { role: turn.role, content: turn.content }; });
    const gen = ++this.requestGeneration; this.question = ''; this.error = ''; this.busy = true; this.status = '正在处理';
    const user: AssistantTurn = { role: 'user', content: text }, answer: AssistantTurn = { role: 'assistant', content: '' };
    this.turns = this.turns.concat([user, answer]); const index = this.turns.length - 1;
    try {
      const model = store.readJson('ai-model.txt') || 'deepseek-flash';
      const result = await this.runner.run(text, owner, (): string => this.accountId,
        async (messages: AssistantMessage[], changed: (value: string) => void): Promise<AiStream> => await this.client.assistantTurn(store, model, messages as AiMessage[], changed),
        async (action: string, argument: string): Promise<string> => await this.onExecute(action, argument),
        (value: string): void => { if (gen !== this.requestGeneration) return; const next = this.turns.slice(); next[index] = { role: 'assistant', content: value }; this.turns = next; },
        (_action: string): void => { if (gen === this.requestGeneration) this.status = '正在操作'; }, history);
      if (gen === this.requestGeneration) { const next = this.turns.slice(); next[index] = { role: 'assistant', content: result }; this.turns = next; }
    } catch (error) { if (gen === this.requestGeneration) this.error = error instanceof Error ? error.message : '任务未完成'; }
    finally { if (gen === this.requestGeneration) { this.busy = false; this.status = ''; this.saveHistory(); } }
  }
  build() {
    Column() {
      if (!this.open) {
        Button('应用助手').fontSize(14).height(44).backgroundColor('#2873DA').fontColor('#FFFFFF').onClick(() => { this.open = true; this.refreshKey(); })
      } else {
        Row() {
          Text('应用助手').fontSize(16).fontWeight(FontWeight.Medium).layoutWeight(1)
          if (this.conversations.length) { Button('历史').fontSize(12).height(32).enabled(!this.busy).backgroundColor('#F2F6FB').fontColor('#536B86').bindMenu(this.conversations.map((item: AssistantConversation): MenuElement => { return { value: item.title, action: () => { if (!this.busy) { this.saveHistory(); this.conversationId = item.id; this.turns = item.turns.slice(); this.error = ''; } } }; })) }
          Button('新对话').fontSize(12).height(32).enabled(!this.busy).backgroundColor('#F2F6FB').fontColor('#536B86').onClick(() => this.newConversation())
          Button('收起').fontSize(12).height(32).backgroundColor('#F2F6FB').fontColor('#536B86').onClick(() => { this.open = false; this.onEditingFocus(false); })
        }.width('100%').padding(12)
        if (!this.configured) { ApiKeySetup({ onEnabled: () => this.refreshKey() }).layoutWeight(1).width('100%').padding(12) }
        else {
          Scroll() {
            Column({ space: 10 }) {
              if (!this.turns.length) { Text('告诉我想在智云助手中做什么。').fontSize(13).fontColor('#667B96') }
              ForEach(this.turns, (turn: AssistantTurn, index: number) => {
                Text(turn.content || (this.busy && index === this.turns.length - 1 ? this.status || '正在思考…' : ''))
                  .fontSize(14).fontColor('#183152').padding(10).borderRadius(10)
                  .backgroundColor(turn.role === 'user' ? '#E6F0FF' : '#F4F7FA').width('100%')
              }, (_turn: AssistantTurn, index: number) => index.toString())
              if (this.error) { Text(this.error).fontSize(12).fontColor('#B44747') }
            }.width('100%').padding(12)
          }.layoutWeight(1).width('100%')
          Column({ space: 6 }) {
            TextArea({ controller: this.inputController, text: this.question, placeholder: '告诉我你想做什么' }).height(72).fontSize(14).enterKeyType(EnterKeyType.Send).onSubmit(() => { if (Date.now() > this.suppressSubmitUntil) this.send(); }).onChange((value: string) => this.question = value).onTextSelectionChange((start: number, end: number) => { this.selectionStart = start; this.selectionEnd = end; }).onFocus(() => this.onEditingFocus(true)).onBlur(() => { this.shiftDown = false; this.controlDown = false; this.onEditingFocus(false); }).onKeyPreIme((event: KeyEvent): boolean => this.questionKey(event))
            Row() {
              Blank()
              if (this.busy) { Button('停止').height(34).onClick(() => this.stop()) }
              else { Button('发送').height(34).enabled(!!this.question.trim()).onClick(() => this.send()) }
            }.width('100%')
          }.width('100%').padding(10)
        }
      }
    }.width('100%').height('100%').backgroundColor(this.open ? '#FFFFFF' : '#00000000').borderRadius(16).clip(true).shadow(this.open ? { radius: 20, color: '#1D355233' } : { radius: 0, color: '#00000000' })
  }
}
