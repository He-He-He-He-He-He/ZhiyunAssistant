const test=require('node:test'),assert=require('node:assert/strict');
test('per-lesson calibration interpolates local drift without accumulating on cache reload',async()=>{
 const {syncTranscriptLines,syncTranscriptTime}=await import('../web/transcript-sync.js');
 const points=[{source:0,target:0},{source:100,target:110},{source:120,target:135},{source:180,target:190}];
 const rows=[{id:'fixture-a',t:110,end:120,text:'Synthetic explanation A'},{id:'fixture-b',t:120,end:130,text:'Synthetic explanation B'}];
 const aligned=syncTranscriptLines(rows,points);assert.equal(aligned[0].t,122.5);assert.equal(aligned[1].t,135);assert.equal(aligned.findLast(l=>l.t<=130).id,'fixture-a');
 assert.deepEqual(syncTranscriptLines(aligned,points),aligned);assert.equal(syncTranscriptLines(aligned,[])[0].t,110);
 assert.equal(syncTranscriptTime(50,[{source:30,target:60},{source:60,target:30}]),50);
});
