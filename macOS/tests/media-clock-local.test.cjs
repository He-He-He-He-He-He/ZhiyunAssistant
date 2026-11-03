const test=require('node:test'),assert=require('node:assert/strict');
test('recording clock aligns timestamped PPT, absolute captions and relative recording captions',async()=>{
 const {MacZhiyun}=await import('../web/mac-api.js');const api=new MacZhiyun(),start=1790000000,begin=start-104;let infos=0;
 api.request=async p=>{if(p.includes('get-sub-info')){infos++;return JSON.stringify({code:0,data:{begin_time:begin}})}if(p.includes('search-ppt'))return JSON.stringify({code:0,total:1,list:[{created_sec:297,content:JSON.stringify({pptimgurl:'https://video.cmc.zju.edu.cn/ai3/ppt/'+((begin+205)*1000)+'.jpg'})}]});if(p.includes('search-trans-result'))return JSON.stringify({code:0,list:[{all_content:[{BeginSec:205,EndSec:211,Text:'Relative'},{BeginSec:(begin+212)*1000,EndSec:(begin+218)*1000,Text:'Absolute'}]}]});throw Error(p)};
 const course={courseId:'test',subId:'test',start};const [slides,lines]=await Promise.all([api.slidesFrom(course,'https://classroom.zju.edu.cn'),api.transcriptsFrom(course,'https://classroom.zju.edu.cn')]);assert.equal(infos,1);assert.equal(slides[0].t,205);assert.deepEqual(lines.map(x=>x.t),[205,212]);
});
