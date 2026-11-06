import React, {useState} from 'react';
import {api} from '../shared/bridge';

/** No report data or protocol parameters in the renderer; both windows are native. */
export function NativeDiagnostics() {
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const open=async(method:string)=>{
  setBusy(true); setNotice('');
  try { await api(method); }
  catch { setNotice('无法打开原生诊断窗口；请稍后再查看。'); }
  finally { setBusy(false); }
 };
 return <section>
  <Button onClick={()=>void open('app.viewNativeDiagnostics')} disabled={busy}>查看上次原生诊断</Button>
  <Button onClick={()=>void open('app.nativeAnonymousPreflight')} disabled={busy}>匿名生产链预检（0 密码 POST）</Button>
  <p>查看报告只读、不联网。匿名预检需在原生窗口另行确认，仅使用全新私有会话 GET，不读取密码、不消耗或恢复认证额度；成功不代表登录成功。</p>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
function Button(props:React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props}/>; }
