import {Course,shanghaiDate} from './Timeline';
export function classroomRange(tab:string,now=Date.now()/1000):{start:string;end:string}{
 const today=shanghaiDate(now);
 return tab==='today'?{start:today,end:today}:{start:shanghaiDate(now-14*86400),end:shanghaiDate(now-86400)};
}
export function classroomRows(rows:Course[],tab:string,now=Date.now()/1000):Course[]{
 const range=classroomRange(tab,now);
 return rows.filter(row=>tab==='all'||(shanghaiDate(row.start)>=range.start&&shanghaiDate(row.start)<=range.end))
 .slice().sort((a,b)=>(tab==='today'?a.start-b.start:b.start-a.start)||a.subId.localeCompare(b.subId));
}
