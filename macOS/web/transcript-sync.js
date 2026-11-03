// Calibration is per lesson and reversible. Keep the platform timestamps so
// cached material can be refreshed or recalibrated without accumulating drift.
export function syncTranscriptTime(time, points = []) {
  const valid = points.filter(p => Number.isFinite(p.source) && Number.isFinite(p.target) && p.source >= 0 && p.target >= 0).sort((a,b)=>a.source-b.source);
  if (!valid.length || valid.some((p,i)=>i && (p.source<=valid[i-1].source || p.target<=valid[i-1].target))) return time;
  const right=valid.findIndex(p=>p.source>time);
  if(right===0)return Math.max(0,time+valid[0].target-valid[0].source);
  if(right<0){const p=valid.at(-1);return Math.max(0,time+p.target-p.source);}
  const a=valid[right-1],b=valid[right];return a.target+(time-a.source)*(b.target-a.target)/(b.source-a.source);
}
export function syncTranscriptLines(rows, points=[]) {
 return rows.map(l=>{const sourceT=l.sourceT??l.t,sourceEnd=l.sourceEnd??l.end;
 return {...l,sourceT,sourceEnd,t:syncTranscriptTime(sourceT,points),end:Number.isFinite(sourceEnd)?syncTranscriptTime(sourceEnd,points):sourceEnd};}).sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id));
}
