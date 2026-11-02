// Reusable, source-addressed lesson indexes. The caller owns storage and model access.
export function knowledgeRecords(material, readings = {}) {
  const records = [];
  for (const [i, slide] of (material.slides || []).entries()) {
    const t = Math.max(0, Number(slide.t) || 0), reading = readings[slide.id];
    records.push({t, order:0, text:`课件第${i + 1}页${reading ? '（已识别，可能有误）: ' + reading : '（尚无识别结果）'}`});
  }
  for (const line of material.lines || []) if (String(line.text || '').trim())
    records.push({t:Math.max(0, Number(line.t) || 0), order:1, text:'转写：' + String(line.text).trim()});
  return records.sort((a,b)=>a.t-b.t||a.order-b.order);
}
export function knowledgeChunks(records, max = 12000) {
  const chunks = []; let current = null;
  for (const row of records) {
    // Never silently truncate a long caption or OCR output.
    const step = Math.max(1, max - 32);
    for (let offset = 0; offset < row.text.length; offset += step) {
      const text = `[${Math.floor(row.t)}秒] ${row.text.slice(offset, offset + step)}`;
      if (!current || current.text.length + text.length + 1 > max) {
        current = {from:row.t, to:row.t, text:''}; chunks.push(current);
      }
      current.to = row.t; current.text += (current.text ? '\n' : '') + text;
    }
  }
  return chunks;
}
export async function knowledgeFingerprint(records, subtle, identities = []) {
  if (!subtle) throw new Error('无法校验知识缓存');
  const bytes = new TextEncoder().encode(JSON.stringify({version:1,records,identities}));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join('');
}
export function usableKnowledge(value, fingerprint) {
  return value?.version === 1 && value.fingerprint === fingerprint && Array.isArray(value.chunks) && value.chunks.length && value.chunks.every(c=>typeof c.text === 'string' && c.text.trim());
}
