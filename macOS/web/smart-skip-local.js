import { conservativeRanges } from './models/SmartSkip.js';

// Keep the shared model conservative; split mixed spans before applying its
// validation so one protected sentence does not disable an entire break.
const protectedText = /作业|考试|定义|公式|概念|案例|例如|举例|总结|下节课|下次课|思考|讨论|提问|回答|所以|因此|测验|考核|截止|提交|课程安排|评分|学分/;
export function skipRangesForPage(group, end, decision) {
  if (!decision || !Array.isArray(decision.spans)) return [];
  const spans = [];
  for (const span of decision.spans) {
    if (/教学视频|宣传视频|媒体音频|视频内容|课堂播放|英文原声|视频播放|课堂组织|任务安排|分组规则|文档填报/.test(span?.reason || '')) continue;
    if (!span || !Array.isArray(span.ids) || new Set(span.ids).size !== span.ids.length) continue;
    const selected = group.lines.filter(l => span.ids.includes(l.id));
    if (selected.length !== span.ids.length || !selected.length) continue;
    const first = group.lines.indexOf(selected[0]);
    if (!group.lines.slice(first, first + selected.length).every(l => span.ids.includes(l.id))) continue;
    // Apply each classified fragment, including a single short utterance. The
    // score is a model heuristic, not a calibrated probability; do not require .95.
    const reason = String(span.reason || '');
    const ambiguousReply = selected.length === 1 && /^(好|对的?|是的?|嗯|啊|哦|可以|谢谢)[。！!?？\s]*$/.test(selected[0].text.trim()) &&
      !/课前|课间|旁人|环境|无关|设备|调试/.test(reason);
    const acceptable = Number.isFinite(span.confidence) && span.confidence >= .65 && span.confidence <= 1 &&
      ['chatter','break','noise'].includes(span.kind) && !!reason.trim() &&
      !/无法判断|无法确定|不能确定|不确定是否|可能是(?:知识|课程|教学)/.test(reason) && !ambiguousReply;
    if (!acceptable) continue;
    let run = [];
    const flush = () => { if (run.length) spans.push({...span, confidence: Math.max(.95, span.confidence), ids: run}); run = []; };
    for (const line of selected) { if (protectedText.test(line.text)) flush(); else run.push(line.id); }
    flush();
  }
  return conservativeRanges(group, end, {...decision, spans}, true, false);
}
export function skipPageOrder(groups, time) {
  let current = 0;
  groups.forEach((g, i) => { if (g.slide.t <= time) current = i; });
  return [...groups.keys()].sort((a,b) => (a < current ? groups.length + a : a-current) - (b < current ? groups.length + b : b-current));
}

// Analyze the recording, not just PPT pages: the first slide may appear minutes
// after recording starts, and some lessons have no slides at all. Split only at
// sentence starts so a sentence is never classified twice or lost between pages.
export function skipAnalysisGroups(lines, end, spanSeconds = 180) {
  const ordered = lines.filter(l => Number.isFinite(l.t) && l.t >= 0 && l.t < end)
    .slice().sort((a,b) => a.t-b.t || a.id.localeCompare(b.id));
  const result = [];
  for (const line of ordered) {
    let current = result.at(-1);
    if (!current || (line.t > current.slide.t && (line.t-current.slide.t >= spanSeconds || current.lines.length >= 60))) {
      const start = current ? line.t : 0;
      current = {slide:{id:'timeline-v3-'+start,t:start},lines:[]};
      result.push(current);
    }
    current.lines.push(line);
  }
  return result;
}

// Integer sentence positions avoid invented ASR IDs; only expand valid closed ranges.
export function decodeSkipDecision(decision, lines) {
  if (!decision || !Array.isArray(decision.spans)) throw new Error("AI 未返回有效的片段范围");
  const spans = decision.spans.map(span => {
    if (!span || !Number.isInteger(span.first) || !Number.isInteger(span.last) ||
      span.first < 0 || span.last < span.first || span.last >= lines.length)
      throw new Error("AI 返回了无效的句子范围，请重试");
    return {...span, ids: lines.slice(span.first, span.last + 1).map(line => line.id)};
  });
  return {...decision, spans};
}

export function automaticSegmentSkip(at, end, ranges) {
  if (!Number.isFinite(at) || !Number.isFinite(end) || end <= 0) return undefined;
  return ranges.find(range => Number.isFinite(range.start) && Number.isFinite(range.end) &&
    at >= range.start && at < range.end - .15 && range.end <= end && range.end - range.start >= .5);
}
