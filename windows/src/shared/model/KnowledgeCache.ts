/** Source-addressed course indexes. Indexed text is evidence, not source text. */
import { Slide, Transcript } from './Timeline';
export interface KnowledgeRecord { t: number; order: number; text: string }
export interface KnowledgeChunk { from: number; to: number; text: string }
export interface KnowledgeIndex { version: 1; fingerprint: string; recognized: number; slides: number; chunks: KnowledgeChunk[] }
export function knowledgeRecords(slides: Slide[], lines: Transcript[], readings: Record<string, string>): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];
  slides.forEach((slide, index) => { const t = Math.max(0, Number(slide.t) || 0), text = readings[slide.id]; records.push({t,order:0,text:`课件第${index + 1}页${text ? '（已识别，可能有误）: ' + text : '（尚无识别结果）'}`}); });
  lines.forEach(line => { const text = String(line.text || '').trim(); if (text) records.push({t:Math.max(0,Number(line.t)||0),order:1,text:'转写：'+text}); });
  return records.sort((a,b) => a.t-b.t || a.order-b.order);
}
export function knowledgeChunks(records: KnowledgeRecord[], maximum = 12000): KnowledgeChunk[] {
  const limit = Math.max(64, Math.floor(maximum)), chunks: KnowledgeChunk[] = []; let current: KnowledgeChunk | undefined;
  for (const row of records) { const step = limit - 32; for (let offset=0;offset<row.text.length;) {
    let end = Math.min(row.text.length, offset + step); if (end < row.text.length && end > offset && /[\uD800-\uDBFF]/.test(row.text[end - 1]) && /[\uDC00-\uDFFF]/.test(row.text[end])) end--;
    const text = `[${Math.floor(row.t)}秒] ${row.text.slice(offset,end)}`; offset = end;
    if (!current || current.text.length + text.length + 1 > limit) { current={from:row.t,to:row.t,text:''}; chunks.push(current); }
    current.to=row.t;current.text+=(current.text?'\n':'')+text;
  } }
  return chunks;
}
export async function knowledgeFingerprint(records: KnowledgeRecord[], slides: Slide[], subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle, versions: Record<string, string> = {}): Promise<string> {
  if (!subtle) throw new Error('无法校验知识索引');
  const identities=slides.map(slide=>({id:slide.id||'',url:slide.url||'',t:slide.t,version:versions[slide.id]||''}));
  const bytes=new TextEncoder().encode(JSON.stringify({version:1,records,identities})), digest=await subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export function usableKnowledge(value: unknown, fingerprint: string, expected?: KnowledgeChunk[]): value is KnowledgeIndex {
  if (!value || typeof value !== 'object') return false; const index=value as KnowledgeIndex;
  return index.version===1 && index.fingerprint===fingerprint && Number.isInteger(index.recognized) && index.recognized>=0 && Number.isInteger(index.slides) && index.slides>=index.recognized && Array.isArray(index.chunks) && index.chunks.length>0 && index.chunks.every(chunk => Number.isFinite(chunk.from) && Number.isFinite(chunk.to) && chunk.from>=0 && chunk.to>=chunk.from && typeof chunk.text==='string' && !!chunk.text.trim()) && (!expected || (index.chunks.length===expected.length && index.chunks.every((chunk,i)=>chunk.from===expected[i].from && chunk.to===expected[i].to)));
}
/** Persist only complete, current indexes; cancellation never creates a partial cache. */
export async function createKnowledgeIndex(records: KnowledgeRecord[], slides: Slide[], readings: Record<string, string>, generate: (chunk: KnowledgeChunk) => Promise<string>, current: () => boolean, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle, versions: Record<string, string> = {}): Promise<KnowledgeIndex | null> {
  if (!current() || !records.length) return null;
  const fingerprint=await knowledgeFingerprint(records,slides,subtle,versions), parts=knowledgeChunks(records), chunks: KnowledgeChunk[]=[];
  for (const part of parts) { if (!current()) return null; const text=(await generate(part)).trim(); if (!current() || !text) return null; chunks.push({from:part.from,to:part.to,text}); }
  if (!current() || chunks.length!==parts.length) return null;
  const recognized=slides.filter(slide=>!!readings[slide.id]).length;
  return {version:1,fingerprint,recognized,slides:slides.length,chunks};
}
