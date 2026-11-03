import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { Slide, Transcript } from './Timeline';
export interface KnowledgeRecord { t: number; order: number; text: string }
export interface KnowledgeChunk { from: number; to: number; text: string }
export interface KnowledgeIndex { version: number; fingerprint: string; recognized: number; slides: number; chunks: KnowledgeChunk[] }
interface KnowledgeIdentity { id: string; url: string; t: number; version: string }
interface KnowledgeFingerprintSource { version: number; records: KnowledgeRecord[]; identities: KnowledgeIdentity[] }
export function knowledgeRecords(slides: Slide[], lines: Transcript[], readings: Record<string, string>): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];
  slides.forEach((slide: Slide, index: number) => { const t = Math.max(0, Number(slide.t) || 0), text = readings[slide.id]; records.push({ t: t, order: 0, text: `课件第${index + 1}页${text ? '（已识别，可能有误）: ' + text : '（尚无识别结果）'}` }); });
  lines.forEach((line: Transcript) => { const text = String(line.text || '').trim(); if (text) records.push({ t: Math.max(0, Number(line.t) || 0), order: 1, text: '转写：' + text }); });
  return records.sort((a: KnowledgeRecord, b: KnowledgeRecord) => a.t - b.t || a.order - b.order);
}
export function knowledgeChunks(records: KnowledgeRecord[], maximum: number = 12000): KnowledgeChunk[] {
  const limit = Math.max(64, Math.floor(maximum)), chunks: KnowledgeChunk[] = []; let current: KnowledgeChunk | undefined = undefined;
  for (const row of records) { const step = limit - 32; for (let offset = 0; offset < row.text.length;) {
    let end = Math.min(row.text.length, offset + step); if (end < row.text.length && end > offset && /[\uD800-\uDBFF]/.test(row.text[end - 1]) && /[\uDC00-\uDFFF]/.test(row.text[end])) end--;
    const text = `[${Math.floor(row.t)}秒] ${row.text.slice(offset, end)}`; offset = end;
    if (!current || current.text.length + text.length + 1 > limit) { current = { from: row.t, to: row.t, text: '' }; chunks.push(current); }
    current.to = row.t; current.text += (current.text ? '\n' : '') + text;
  } }
  return chunks;
}
export async function knowledgeFingerprint(records: KnowledgeRecord[], slides: Slide[], versions: Record<string, string> = {}): Promise<string> {
  const identities: KnowledgeIdentity[] = slides.map((slide: Slide): KnowledgeIdentity => { return { id: slide.id || '', url: slide.url || '', t: slide.t, version: versions[slide.id] || '' }; });
  const source: KnowledgeFingerprintSource = { version: 1, records: records, identities: identities };
  const digest = cryptoFramework.createMd('SHA256'); await digest.update({ data: new util.TextEncoder().encodeInto(JSON.stringify(source)) });
  const bytes = (await digest.digest()).data; return Array.from(bytes).map((n: number): string => n.toString(16).padStart(2, '0')).join('');
}
export function usableKnowledge(index: KnowledgeIndex | undefined, fingerprint: string, expected: KnowledgeChunk[]): boolean {
  return !!index && index.version === 1 && index.fingerprint === fingerprint && Number.isInteger(index.recognized) && index.recognized >= 0 && Number.isInteger(index.slides) && index.slides >= index.recognized && Array.isArray(index.chunks) && index.chunks.length > 0 && index.chunks.length === expected.length && index.chunks.every((chunk: KnowledgeChunk, i: number): boolean => Number.isFinite(chunk.from) && Number.isFinite(chunk.to) && chunk.from >= 0 && chunk.to >= chunk.from && typeof chunk.text === 'string' && !!chunk.text.trim() && chunk.from === expected[i].from && chunk.to === expected[i].to);
}
export async function createKnowledgeIndex(records: KnowledgeRecord[], slides: Slide[], readings: Record<string, string>, generate: (chunk: KnowledgeChunk) => Promise<string>, current: () => boolean, versions: Record<string, string> = {}): Promise<KnowledgeIndex | undefined> {
  if (!current() || !records.length) return undefined;
  const fingerprint = await knowledgeFingerprint(records, slides, versions), parts = knowledgeChunks(records), chunks: KnowledgeChunk[] = [];
  for (const part of parts) { if (!current()) return undefined; const text = (await generate(part)).trim(); if (!current() || !text) return undefined; chunks.push({ from: part.from, to: part.to, text: text }); }
  if (!current() || chunks.length !== parts.length) return undefined;
  return { version: 1, fingerprint: fingerprint, recognized: slides.filter((slide: Slide): boolean => !!readings[slide.id]).length, slides: slides.length, chunks: chunks };
}
