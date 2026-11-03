import{test}from'node:test';import assert from'node:assert/strict';
import{classroomRange,classroomRows}from'../src/shared/model/ClassroomSchedule';
import{normalizeScheduleEnvelope}from'../src/shared/model/ScheduleEnvelope';
const at=(s:string)=>Date.parse(s+'+08:00')/1000;
const row=(id:string,t:string)=>({subId:id,courseId:'c',title:id,teacher:'',room:'',term:'',status:'6',start:at(t),end:at(t)+3600});
test('recent is the fourteen Shanghai dates before today, even across year and leap boundaries',()=>{
 assert.deepEqual(classroomRange('recent',at('2026-11-03T00:01:00')),{start:'2026-10-20',end:'2026-11-02'});
 assert.deepEqual(classroomRange('recent',at('2026-01-01T23:59:00')),{start:'2025-12-18',end:'2025-12-31'});
 assert.deepEqual(classroomRange('recent',at('2024-03-01T12:00:00')),{start:'2024-02-16',end:'2024-02-29'});
});
test('recent excludes today, tomorrow and older rows and places newest lesson first',()=>{
 const rows=[row('old','2026-10-19T18:00:00'),row('boundary','2026-10-20T08:00:00'),row('yesterday','2026-11-02T08:00:00'),row('today','2026-11-03T08:00:00'),row('future','2026-11-04T08:00:00')];
 assert.deepEqual(classroomRows(rows,'recent',at('2026-11-03T12:00:00')).map(c=>c.subId),['yesterday','boundary']);
});
test('today is chronological and independent of device timezone',()=>{
 const rows=[row('late','2026-11-03T18:00:00'),row('early','2026-11-03T08:00:00'),row('other','2026-11-02T18:00:00')];assert.deepEqual(classroomRows(rows,'today',at('2026-11-03T00:00:00')).map(c=>c.subId),['early','late']);
});
test('Mac-compatible schedule envelopes read nested serialized lists but surface login and service errors',()=>{
 const days=[{course:[]}];assert.deepEqual(normalizeScheduleEnvelope({result:{err:0,data:JSON.stringify({list:days})}}).days,days);
 assert.deepEqual(normalizeScheduleEnvelope({result:{code:400,msg:'课表为空'}}).days,[]);
 assert.throws(()=>normalizeScheduleEnvelope({code:401,result:{list:[]}}),/登录/);
 assert.throws(()=>normalizeScheduleEnvelope({result:{err:1,data:{list:[]}}}),/不可用/);
 assert.throws(()=>normalizeScheduleEnvelope({code:0,result:{list:'bad'}}),/格式/);
});
