import React, { useEffect, useRef, useState } from 'react';
import { api, Course, LessonNote } from '../shared/bridge';
import { AppActions } from '../shared/model/AppActions';
import { ApiSettings } from './AiPane';
import { AppAssistantRunner, AssistantMessage, AssistantReply, AssistantTransport } from '../shared/model/AppAssistant';
import './appAssistant.css';

type Props = { accountId: string; page: string; courseName?: string; onNavigate: (page: string) => void; onBack: () => void; onEnter: (course: Course, offline?: boolean, noteId?: string) => void; onCollections: () => void };
type Turn = { role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; turns: Turn[]; updated: number };
type Rect = { x: number; y: number; w: number; h: number };
type Drag = { x: number; y: number; rect: Rect; edge: string };
const initialRect = (): Rect => { const w = Math.min(380, Math.max(240, innerWidth - 24)), h = Math.min(560, Math.max(220, innerHeight - 80)); return { x: Math.max(0, innerWidth - w - 18), y: Math.max(0, innerHeight - h - 18), w, h }; };
const conversationId = () => 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const pageNames: Record<string, string> = { classroom: '我的课堂', favorites: '课程收藏', later: '稍后再看', offline: '离线课程', notes: '笔记管理', cache: '缓存设置', plaza: '课程广场' };
function allowed(node: Element): boolean {
  if (node.closest('[data-app-assistant], .api-setup, .welcome, [hidden], [aria-hidden="true"]')) return false;
  const label = [node.getAttribute('aria-label'), node.getAttribute('placeholder'), node.getAttribute('name'), node.getAttribute('autocomplete')].join(' ');
  if (/密码|口令|密钥|验证码|password|token|secret/i.test(label) || node.matches('input[type="password"]')) return false;
  const style = getComputedStyle(node), box = node.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
}
export function AppAssistant(props: Props) {
  const current = useRef(props); current.current = props;
  const [open, setOpen] = useState(false), [question, setQuestion] = useState(''), [turns, setTurns] = useState<Turn[]>([]), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false), [configKnown, setConfigKnown] = useState(false), [setup, setSetup] = useState(false);
  const [rect, setRect] = useState<Rect>(initialRect), [editing, setEditing] = useState(false), drag = useRef<Drag | null>(null), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const down = (event: PointerEvent) => { if (panel.current && !panel.current.contains(event.target as Node)) setEditing(false); };
    const move = (event: PointerEvent) => { const work = drag.current; if (!work) return; const dx = event.clientX - work.x, dy = event.clientY - work.y, start = work.rect; let { x, y, w, h } = start;
      if (work.edge === 'move') { x = Math.max(0, Math.min(innerWidth - w, start.x + dx)); y = Math.max(0, Math.min(innerHeight - h, start.y + dy)); }
      else { const minW = Math.min(260, innerWidth), minH = Math.min(240, innerHeight); if (work.edge.includes('e')) w = Math.max(minW, Math.min(innerWidth - x, start.w + dx)); if (work.edge.includes('s')) h = Math.max(minH, Math.min(innerHeight - y, start.h + dy)); if (work.edge.includes('w')) { x = Math.max(0, Math.min(start.x + start.w - minW, start.x + dx)); w = start.w + start.x - x; } if (work.edge.includes('n')) { y = Math.max(0, Math.min(start.y + start.h - minH, start.y + dy)); h = start.h + start.y - y; } }
      setRect({ x, y, w, h });
    };
    const up = () => { drag.current = null; };
    const resize = () => setRect(old => { const w = Math.min(old.w, innerWidth), h = Math.min(old.h, innerHeight); return { w, h, x: Math.max(0, Math.min(old.x, innerWidth - w)), y: Math.max(0, Math.min(old.y, innerHeight - h)) }; });
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('resize', resize); document.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('resize', resize); document.removeEventListener('pointerdown', down); };
  }, []);
  const beginDrag = (event: React.PointerEvent, edge: string) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); setEditing(true); drag.current = { x: event.clientX, y: event.clientY, rect, edge }; };

  const [conversations, setConversations] = useState<Conversation[]>([]), [chatId, setChatId] = useState(conversationId), [loaded, setLoaded] = useState(false);
  const conversationsRef = useRef<Conversation[]>([]); conversationsRef.current = conversations;
  const runner = useRef<AppAssistantRunner | undefined>(undefined), controls = useRef<Element[]>([]), output = useRef<HTMLDivElement>(null), textStream = useRef('');
  useEffect(() => { let active = true; api<any>('ai.settings').then(value => { if (active) { setEnabled(!!value?.configured); setConfigKnown(true); } }).catch(() => { if (active) setConfigKnown(true); }); const off = window.zhiyun.on('ai.settings', (value: any) => setEnabled(!!value?.configured)); return () => { active = false; off(); runner.current?.stop(); }; }, [props.accountId]);
  useEffect(() => {
    let active = true; setLoaded(false); setTurns([]); setConversations([]); setChatId(conversationId());
    void api<Conversation[]>('storage.get', { key: 'app-assistant-history-v1' }).then(rows => {
      if (!active) return; const saved = Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && Array.isArray(row.turns)).slice(0, 100) : [];
      setConversations(saved); if (saved.length) { setChatId(saved[0].id); setTurns(saved[0].turns); }
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); }); return () => { active = false; };
  }, [props.accountId]);
  useEffect(() => {
    if (!loaded || busy || !turns.some(turn => turn.role === 'assistant' && turn.content)) return;
    const owner = props.accountId, timer = setTimeout(() => {
      if (current.current.accountId !== owner) return;
      const item: Conversation = { id: chatId, title: (turns.find(turn => turn.role === 'user')?.content || '新对话').slice(0, 32), turns, updated: Date.now() };
      const next = [item, ...conversationsRef.current.filter(row => row.id !== chatId)].slice(0, 100); conversationsRef.current = next; setConversations(next);
      void api('storage.set', { key: 'app-assistant-history-v1', value: next }).catch(() => setError('助手对话未能保存'));
    }, 100); return () => clearTimeout(timer);
  }, [turns, busy, loaded, chatId, props.accountId]);
  useEffect(() => window.zhiyun.on('assistant.historyCleared', () => { runner.current?.stop(); setTurns([]); setConversations([]); conversationsRef.current = []; setChatId(conversationId()); setError(''); }), []);
  useEffect(() => { output.current?.scrollTo({ top: output.current.scrollHeight }); }, [turns, status]);
  const start = async () => {
    const task = question.trim(); if (!task || busy || !enabled) return;
    const prior = turns, actions = new AppActions(), knownCourses = new Map<string, Course>(), knownNotes = new Map<string, LessonNote>();
    const remember = (rows: Course[]) => { for (const row of rows) if (row?.subId) knownCourses.set(row.subId, row); };
    const showCourses = (rows: Course[]) => rows.map(row => ({ id: row.subId, title: row.title, teacher: row.teacher, start: row.start, end: row.end }));
    actions.register({ name: 'navigate', description: '打开应用页面。页面可选 classroom、favorites、later、offline、notes、cache、plaza', parameters: { type: 'object', properties: { page: { type: 'string', enum: Object.keys(pageNames) } }, required: ['page'] }, run: async (args) => { current.current.onNavigate(String(args.page)); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { opened: pageNames[String(args.page)] }; } });
    actions.register({ name: 'back', description: '返回上一级', parameters: { type: 'object' }, run: () => { current.current.onBack(); return { ok: true }; } });
    actions.register({ name: 'inspect', description: '读取当前页面的可见控件。每次检查会更新控件编号，界面变动后应重新检查。', parameters: { type: 'object' }, run: () => {
      controls.current = Array.from(document.querySelectorAll('.app-header button, main button, main input, main textarea, main select, main [contenteditable="true"], nav button, [role="dialog"] button, [role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select')).filter(allowed).slice(0, 160);
      const main = document.querySelector<HTMLElement>('main'); return { page: current.current.page, course: current.current.courseName || '', text: ['study', 'offlineStudy'].includes(current.current.page) ? '' : (main?.innerText || '').slice(0, 8000), controls: controls.current.map((node, id) => ({ id, label: (node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('placeholder') || node.textContent || '').trim().slice(0, 100), type: node instanceof HTMLElement && node.isContentEditable ? 'editor' : node.tagName.toLowerCase(), disabled: node.matches(':disabled'), options: node instanceof HTMLSelectElement ? Array.from(node.options).map(option => ({ label: option.label, value: option.value, disabled: option.disabled })).slice(0, 60) : undefined })) };
    } });
    actions.register({ name: 'activate', description: '点击 inspect 列出的当前可见控件', parameters: { type: 'object', properties: { id: { type: 'number', minimum: 0, maximum: 159 } }, required: ['id'] }, run: async (args) => {
      const node = controls.current[Number(args.id)]; if (!(node instanceof HTMLElement) || !node.isConnected || !allowed(node) || node.matches(':disabled') || !Number.isInteger(args.id)) throw new Error('控件已变化，请重新检查'); node.click(); controls.current = []; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { ok: true };
    } });
    actions.register({ name: 'fill', description: '在 inspect 列出的普通文本输入框中输入内容；不能操作密码或密钥', parameters: { type: 'object', properties: { id: { type: 'number', minimum: 0, maximum: 159 }, value: { type: 'string', maxLength: 4000 } }, required: ['id', 'value'] }, run: (args) => {
      const node = controls.current[Number(args.id)]; if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !node.isConnected || !allowed(node) || node.disabled || node.readOnly || !Number.isInteger(args.id)) throw new Error('输入框不可用，请重新检查');
      const proto = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(node, args.value); node.dispatchEvent(new Event('input', { bubbles: true })); node.focus(); return { ok: true };
    } });
    actions.register({ name: 'choose', description: '为 inspect 列出的下拉框选择选项，使用选项值或选项文字。', parameters: { type: 'object', properties: { id: { type: 'number', minimum: 0, maximum: 159 }, value: { type: 'string', maxLength: 200 } }, required: ['id', 'value'] }, run: args => {
      const node = controls.current[Number(args.id)]; if (!(node instanceof HTMLSelectElement) || !node.isConnected || !allowed(node) || node.disabled || !Number.isInteger(args.id)) throw new Error('下拉框不可用，请重新检查');
      const option = Array.from(node.options).find(item => !item.disabled && (item.value === args.value || item.label === args.value)); if (!option) throw new Error('没有找到该选项');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(node, option.value); node.dispatchEvent(new Event('change', { bubbles: true })); return { selected: option.label };
    } });
    actions.register({ name: 'insert_text', description: '在 inspect 列出的笔记编辑器当前光标处插入用户要求的文字。', parameters: { type: 'object', properties: { id: { type: 'number', minimum: 0, maximum: 159 }, text: { type: 'string', maxLength: 4000 } }, required: ['id', 'text'] }, run: args => {
      const node = controls.current[Number(args.id)]; if (!(node instanceof HTMLElement) || !node.isContentEditable || !node.isConnected || !allowed(node) || !Number.isInteger(args.id)) throw new Error('编辑器不可用，请重新检查');
      node.focus(); if (!document.execCommand('insertText', false, String(args.text))) throw new Error('无法插入文字，请在编辑器中手动操作'); return { inserted: true };
    } });
    const studyAction = (kind: string, payload: Record<string, unknown>) => {
      const request: { kind: string; payload: Record<string, unknown>; handled: boolean; result?: unknown; error?: string } = { kind, payload, handled: false };
      window.dispatchEvent(new CustomEvent('zhiyun-assistant-study', { detail: request }));
      if (!request.handled) throw new Error('请先进入已加载的课程'); if (request.error) throw new Error(request.error); return request.result;
    };
    actions.register({ name: 'study_state', description: '读取当前课次的学习时间、功能区状态和课件编号；nextSlide 非负时可分页。', parameters: { type: 'object', properties: { offset: { type: 'number', minimum: 0 } } }, run: args => studyAction('state', args) });
    actions.register({ name: 'seek', description: '跳转到当前课次的指定秒数。', parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0 } }, required: ['seconds'] }, run: args => studyAction('seek', args) });
    actions.register({ name: 'set_pane', description: '打开或关闭当前课次的功能区。', parameters: { type: 'object', properties: { pane: { type: 'string', enum: ['slides', 'transcript', 'video', 'notes', 'ai', 'summary'] }, enabled: { type: 'boolean' } }, required: ['pane', 'enabled'] }, run: args => studyAction('pane', args) });
    actions.register({ name: 'read_slide', description: '识别当前课次的一页课件；优先复用已有识别缓存，仅在缺失时调用 AI。先用 study_state 查询课件编号。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 200 } }, required: ['id'] }, run: async (args, guard) => {
      const requestId = 'assistant-slide-' + Date.now() + '-' + Math.random().toString(36).slice(2); const abort = () => { void api('ai.cancel', { requestId }).catch(() => {}); }; guard.signal?.addEventListener('abort', abort, { once: true });
      try { guard(); const result = await api<{ text: string }>('assistant.readSlide', { requestId, slideId: args.id }); guard(); return result; } finally { guard.signal?.removeEventListener('abort', abort); }
    } });
    actions.register({ name: 'read_transcript', description: '分批读取当前已授权课次的转写，next 非负时还有后续。', parameters: { type: 'object', properties: { offset: { type: 'number', minimum: 0 } } }, run: async (args, guard) => {
      const requestId = 'assistant-transcript-' + Date.now() + '-' + Math.random().toString(36).slice(2); const abort = () => { void api('ai.cancel', { requestId }).catch(() => {}); }; guard.signal?.addEventListener('abort', abort, { once: true });
      try { guard(); const result = await api('assistant.readTranscript', { requestId, offset: args.offset || 0 }); guard(); return result; } finally { guard.signal?.removeEventListener('abort', abort); }
    } });
    actions.register({ name: 'schedule', description: '读取用户的课程表，并记住课次编号供进入课程使用。', parameters: { type: 'object' }, run: async () => { const rows = await api<Course[]>('courses.schedule'); remember(rows); return { courses: showCourses(rows), total: rows.length }; } });
    actions.register({ name: 'course_history', description: '查询用户已上过的课程，按课程名筛选并分页；complete 为 false 时说明记录尚未全部扫描。', parameters: { type: 'object', properties: { query: { type: 'string', maxLength: 100 }, offset: { type: 'number', minimum: 0 }, limit: { type: 'number', minimum: 1, maximum: 50 } } }, run: async args => {
      const history = await api<{ courses: Course[]; complete: boolean; scanning?: boolean }>('assistant.cachedHistory', {}); const all = history.courses || []; remember(all);
      const query = String(args.query || '').trim().toLowerCase(), rows = query ? all.filter(row => row.title.toLowerCase().includes(query)) : all;
      const offset = Math.floor(Number(args.offset || 0)), limit = Math.floor(Number(args.limit || 20)); return { courses: showCourses(rows.slice(offset, offset + limit)), total: rows.length, complete: history.complete, scanning: !!history.scanning, next: offset + limit < rows.length ? offset + limit : -1 };
    } });
    actions.register({ name: 'refresh_history', description: '扫描更多已上课程；每次最多处理一批，结果不完整时不要反复扫描，除非用户要求继续。', parameters: { type: 'object' }, run: async (_args, guard) => {
      const requestId = 'history-' + Date.now() + '-' + Math.random().toString(36).slice(2); const abort = () => { void api('ai.cancel', { requestId }).catch(() => {}); };
      guard.signal?.addEventListener('abort', abort, { once: true });
      try { guard(); const result = await api<{ courses: Course[]; complete: boolean; failed: boolean }>('assistant.history', { requestId }); guard(); remember(result.courses || []); return { total: result.courses?.length || 0, complete: result.complete, failed: result.failed }; }
      finally { guard.signal?.removeEventListener('abort', abort); }
    } });
    actions.register({ name: 'notes_list', description: '查找本机课堂笔记，返回笔记标识和课次信息。', parameters: { type: 'object', properties: { query: { type: 'string', maxLength: 100 }, offset: { type: 'number', minimum: 0 } } }, run: async args => {
      const notes = await api<LessonNote[]>('notes.list'), query = String(args.query || '').trim().toLowerCase();
      for (const note of notes) knownNotes.set(note.course.subId + ':' + (note.id || 'default'), note);
      const rows = query ? notes.filter(note => (note.title || '').toLowerCase().includes(query) || note.course.title.toLowerCase().includes(query)) : notes, offset = Math.floor(Number(args.offset || 0));
      return { total: rows.length, next: offset + 30 < rows.length ? offset + 30 : -1, notes: rows.slice(offset, offset + 30).map(note => ({ id: note.course.subId + ':' + (note.id || 'default'), title: note.title || '课堂笔记', course: note.course.title, start: note.course.start, updated: note.openedAt || note.savedAt })) };
    } });
    actions.register({ name: 'read_note', description: '分批读取已查到的笔记文字及时间点，按 nextOffset 和 nextCharOffset 继续；图片不会自动识别。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 300 }, offset: { type: 'number', minimum: 0 }, charOffset: { type: 'number', minimum: 0 } }, required: ['id'] }, run: args => {
      const note = knownNotes.get(String(args.id)); if (!note) throw new Error('请先查询笔记并提供返回的标识'); let offset = Number(args.offset || 0), charOffset = Number(args.charOffset || 0), remaining = 10000;
      if (!Number.isInteger(offset) || !Number.isInteger(charOffset) || offset < 0 || charOffset < 0) throw new Error('笔记起点无效');
      const items: Array<{ kind: string; time: number; text: string; partial: boolean }> = [];
      while (offset < note.atoms.length && items.length < 30 && remaining > 0) { const atom = note.atoms[offset], text = atom.kind === 'image' ? '[图片，未识别]' : atom.value; if (charOffset > text.length) throw new Error('笔记字符起点无效'); const chunk = text.slice(charOffset, charOffset + remaining); remaining -= chunk.length; charOffset += chunk.length; const partial = charOffset < text.length; items.push({ kind: atom.kind, time: atom.at, text: chunk, partial }); if (partial) break; offset++; charOffset = 0; }
      return { title: note.title || '课堂笔记', course: note.course.title, total: note.atoms.length, nextOffset: offset < note.atoms.length ? offset : -1, nextCharOffset: charOffset, items };
    } });
    actions.register({ name: 'open_note', description: '打开已查到的课堂笔记，并进入对应课次。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 300 } }, required: ['id'] }, run: async args => {
      const note = knownNotes.get(String(args.id)); if (!note) throw new Error('请先查询笔记并提供返回的标识'); current.current.onEnter(note.course, false, note.id || 'default'); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { status: '正在打开笔记，请等待课程加载', title: note.title || '课堂笔记' };
    } });
    actions.register({ name: 'download_status', description: '查看离线下载任务和已下载课程。', parameters: { type: 'object' }, run: async () => { const result = await api<{ entries: Course[]; tasks: Array<{ id: string; course: Course; state: string; progress: number; message: string }> }>('download.list'); return { entries: result.entries?.length || 0, totalTasks: result.tasks?.length || 0, tasks: (result.tasks || []).slice(0, 50).map(task => ({ id: task.id, course: task.course.title, state: task.state, progress: task.progress, message: task.message })) }; } });
    actions.register({ name: 'download_lesson', description: '将查到的课次加入离线下载；未指定内容时下载视频、课件和转写。返回排队状态，不能说已下载成功。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 150 }, video: { type: 'boolean' }, slides: { type: 'boolean' }, transcript: { type: 'boolean' } }, required: ['id'] }, run: async (args, guard) => {
      const course = knownCourses.get(String(args.id)); if (!course) throw new Error('请先查询课程并提供课次编号'); const specified = ['video', 'slides', 'transcript'].some(key => Object.hasOwn(args, key));
      const parts = { video: specified ? args.video === true : true, slides: specified ? args.slides === true : true, transcript: specified ? args.transcript === true : true }; if (!Object.values(parts).some(Boolean)) throw new Error('请选择下载内容');
      guard(); await api('download.enqueue', { courses: [course], parts }); guard(); return { status: '已加入下载队列，完成前仍需确认权限和下载结果', course: course.title };
    } });
    actions.register({ name: 'control_download', description: '暂停、继续或重试指定下载任务。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 150 }, command: { type: 'string', enum: ['pause', 'resume', 'retry'] } }, required: ['id', 'command'] }, run: async (args, guard) => { guard(); await api('download.' + String(args.command), { subId: args.id }); guard(); return { status: '已请求更新下载任务' }; } });
    actions.register({ name: 'set_collection', description: '设置已查到课次的收藏或稍后再看状态；取消时由用户确认。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 150 }, kind: { type: 'string', enum: ['favorite', 'later'] }, enabled: { type: 'boolean' } }, required: ['id', 'kind', 'enabled'] }, run: async (args, guard) => {
      const course = knownCourses.get(String(args.id)); if (!course) throw new Error('请先查询课程并提供课次编号');
      const entries = await api<Array<{ course: { courseId: string }; whole: boolean; excluded: string[]; lessons: Course[] }>>('collection.get', { kind: args.kind }); guard();
      const entry = entries.find(item => item.course.courseId === course.courseId), selected = !!entry && (entry.whole ? !entry.excluded.includes(course.subId) : entry.lessons.some(item => item.subId === course.subId));
      if (selected !== args.enabled) { if (selected && !window.confirm(args.kind === 'later' ? '取消稍后再看？' : '取消收藏？')) return { status: '已取消操作', enabled: true }; guard(); await api('collection.toggle', { kind: args.kind, course }); guard(); current.current.onCollections(); }
      return { enabled: args.enabled, course: course.title };
    } });
    actions.register({ name: 'open_lesson', description: '进入已从课程表或课程历史查到的指定课次，必须提供课次编号。', parameters: { type: 'object', properties: { id: { type: 'string', maxLength: 150 } }, required: ['id'] }, run: async args => {
      const course = knownCourses.get(String(args.id)); if (!course) throw new Error('请先查询课程并提供返回的课次编号'); current.current.onEnter(course); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { status: '正在进入，请等待课程加载并确认权限', course: course.title };
    } });
    actions.register({ name: 'scroll', description: '在当前页面上下滚动以查看更多内容。', parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] }, run: async (args) => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('main *, [role="dialog"] *')).filter(node => allowed(node) && node.scrollHeight > node.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(node).overflowY));
      const target = candidates.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || document.querySelector<HTMLElement>('main');
      if (!target) throw new Error('当前页面无法滚动'); target.scrollBy({ top: (args.direction === 'up' ? -1 : 1) * Math.max(150, target.clientHeight * .7), behavior: 'instant' }); controls.current = []; await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); return { ok: true };
    } });
    const transport: AssistantTransport = { turn: async (messages, tools, signal, onText): Promise<AssistantReply> => {
      const requestId = 'assistant-' + Date.now() + '-' + Math.random().toString(36).slice(2); let previous = '';
      const off = window.zhiyun.on('ai.stream', (event: any) => { if (event?.requestId !== requestId || typeof event.text !== 'string') return; const next = event.text; onText(next.startsWith(previous) ? next.slice(previous.length) : next); previous = next; });
      const abort = () => { void api('ai.cancel', { requestId }).catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
      try { if (signal.aborted) throw new Error('已停止'); return await api<AssistantReply>('assistant.turn', { requestId, messages, tools }); } finally { off(); signal.removeEventListener('abort', abort); }
    } };
    textStream.current = ''; setBusy(true); setError(''); setStatus('正在处理'); setQuestion(''); setTurns([...prior, { role: 'user', content: task }, { role: 'assistant', content: '' }]);
    const instance = new AppAssistantRunner(actions, transport, () => current.current.accountId, (event) => {
      if (event.type === 'text') { textStream.current += event.text; const answer = textStream.current; setTurns(rows => rows.map((row, index) => index === rows.length - 1 ? { ...row, content: answer } : row)); }
      if (event.type === 'action') { textStream.current = ''; setStatus('正在操作'); }
      if (event.type === 'done') { setStatus(''); setTurns(rows => rows.map((row, index) => index === rows.length - 1 ? { ...row, content: event.text } : row)); }
    }); runner.current = instance;
    try { await instance.run(task, prior as AssistantMessage[]); } catch (cause) { setError(cause instanceof Error ? cause.message : '任务未完成'); } finally { if (runner.current === instance) runner.current = undefined; setBusy(false); setStatus(''); }
  };
  return <aside data-app-assistant className="app-assistant-root">{!open ? <button className="app-assistant-trigger" onClick={() => setOpen(true)}>应用助手</button> : <section ref={panel} className={"app-assistant-panel " + (editing ? "editing" : "")} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-label="应用助手"><div className="app-assistant-drag" onPointerDown={event => beginDrag(event, "move")} role="button" aria-label="移动和调整应用助手"><span /></div>{editing && ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(edge => <div key={edge} className={"app-assistant-resize edge-" + edge} onPointerDown={event => beginDrag(event, edge)} />)}<header><strong>应用助手</strong>{enabled && !setup && <button disabled={busy} onClick={() => setSetup(true)}>API 设置</button>}<button disabled={busy} onClick={() => { setTurns([]); setChatId(conversationId()); setError(''); }}>新对话</button><button onClick={() => setOpen(false)} aria-label="收起应用助手">收起</button></header>{conversations.length > 0 && <select aria-label="助手对话历史" disabled={busy} value={chatId} onChange={event => { const saved = conversations.find(row => row.id === event.target.value); if (saved) { setChatId(saved.id); setTurns(saved.turns); setError(''); } }}><option value={chatId}>{conversations.find(row => row.id === chatId)?.title || '新对话'}</option>{conversations.filter(row => row.id !== chatId).map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>}{!configKnown ? <p>正在读取 AI 设置…</p> : !enabled || setup ? <div className="app-assistant-settings"><ApiSettings configured={enabled} onDone={() => setSetup(false)} onRefresh={async () => { const value = await api<any>('ai.settings'); setEnabled(!!value?.configured); }} /></div> : <><div className="app-assistant-messages" ref={output}>{turns.length === 0 && <p>告诉我想在智云助手中做什么。</p>}{turns.map((turn, index) => <div key={index} className={'app-assistant-turn ' + turn.role}>{turn.content || (busy && index === turns.length - 1 ? status || '正在思考…' : '')}</div>)}{error && <p role="alert">{error}</p>}</div><form onSubmit={event => { event.preventDefault(); void start(); }}><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="告诉我你想做什么" aria-label="给应用助手发消息" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void start(); } }} /><div>{busy ? <button type="button" onClick={() => runner.current?.stop()}>停止</button> : <button type="submit" disabled={!question.trim()}>发送</button>}</div></form></>}</section>}</aside>;
}
