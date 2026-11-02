import {themeFor} from './theme-catalog.js';
// Shanghai calendar date and hour, for the 晴空 greeting.
function shanghaiNow(){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',weekday:'long',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return {date:parts.month+'月'+parts.day+'日 '+parts.weekday,hour:Number(parts.hour)};
}
function greeting(hour){return hour<5?'夜深了，早点休息':(hour<11?'早上好':hour<13?'中午好':hour<18?'下午好':'晚上好')+'，开始今天的学习吧';}
// The 晴空 hero: date, greeting and a one-line summary of the real schedule; other schemes hide it.
function hero(rows,live,page,el){
 const n=rows.length,sub=page==='recent'?'近两周 '+n+' 节课，随时回看课件与讲解':page==='all'?'全部上课记录，按课程或日期整理':page==='chapters'?'这门课共 '+n+' 节，挑一节继续学习':n?'今天 '+n+' 节课'+(live?' · '+live+' 节进行中':'')+'，课件、讲解与笔记在同一条时间线上':'课件、讲解与笔记都在这里，随时可以回看';
 const {date,hour}=shanghaiNow();
 return [el('div',{class:'intro-hero'},[el('span',{class:'hero-eyebrow',text:date}),el('strong',{class:'hero-title',text:greeting(hour)}),el('span',{class:'hero-sub',text:sub})]),
  el('img',{class:'hero-art',src:'sky/hero.webp',alt:'','aria-hidden':'true'})];
}
// The classroom header: view switch on the left, the real schedule summary on the right.
export function makeClassroomIntro(rows,{el,page,tools=[]}){
 const now=Date.now()/1000,live=rows.filter(c=>c.start<=now&&c.end>now).length,count=el('span',{class:'intro-count',text:String(rows.length)});
 // An empty list explains itself below; the header only summarises real lessons.
 const summary=page==='all'||!rows.length?null:[page==='recent'?'近两周 ':'今天 ',count,' 节课',...(live?[el('span',{class:'intro-live',text:live+' 节进行中'})]:[])];
 return el('section',{class:'classroom-intro','aria-label':'课堂概览'},[
  ...hero(rows,live,page,el),
  el('div',{class:'intro-tools'},tools.filter(Boolean)),
  summary?el('div',{class:'intro-copy'},[el('h2',{},summary)]):null,
 ]);
}
export function composeClassroom(wrap,{el}){
 const t=themeFor(document.documentElement.dataset.theme),intro=wrap.querySelector('.classroom-intro');
 wrap.dataset.composition=t.layout;
 const browser=el('section',{class:'classroom-browser','aria-label':'课程列表'});
 for(const child of [...wrap.children])if(child!==intro)browser.append(child);
 wrap.append(browser);
}
