import {UpdateChecker} from './release-updates.js';
export function setupUpdates({native,el,button,toast}){
 const checker=new UpdateChecker({info:()=>native.call('applicationInfo'),feed:()=>native.call('updateFeed'),open:url=>native.call('openRelease',{url}),found:c=>toast('发现新版本 '+c.version+'，可在隐私与数据中查看更新')});
 const card=()=>{
  const box=el('section',{class:'privacy-card'}),status=el('p',{role:'status'}),current=el('p'),check=button('检查更新',()=>checker.check(true)),open=button('查看新版本',()=>checker.open()),toggle=el('input',{type:'checkbox'}),label=el('label',{},[toggle,document.createTextNode('每天自动检查更新')]);toggle.onchange=()=>checker.setAutomatic(toggle.checked);
  box.append(el('h4',{text:'版本更新'}),current,label,el('p',{text:'仅从 GitHub 获取公开版本信息，不上传账号或课程资料。更新需下载后自行安装。'}),el('div',{class:'toolbar'},[check,open]),status);
  const sync=()=>{const s=checker.state;current.textContent='当前版本 '+(s.info?.version||'读取中…');toggle.checked=s.automatic;check.disabled=s.checking;check.textContent=s.checking?'正在检查…':'检查更新';open.hidden=!s.candidate;open.textContent=s.candidate?'查看 '+s.candidate.version+(s.candidate.preview?' 预览版':''):'查看新版本';status.textContent=s.error||(s.candidate?'发现新版本 '+s.candidate.version:s.checkedAt?'当前已是最新可下载版本':'');};
  const off=checker.subscribe(()=>{if(box.isConnected)sync();else off()});sync();return box;
 };
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checker.check(false)});
 return{start:()=>checker.start(),card};
}
