import React, { useEffect, useState } from 'react';
import { api } from '../shared/bridge';
type Status = { enabled: boolean; root: string; command: string; script: string };
export function ExternalAgentSettings() {
  const [status, setStatus] = useState<Status | null>(null), [message, setMessage] = useState('');
  const refresh = () => api<Status>('external.status').then(setStatus).catch(() => setMessage('无法读取接口状态'));
  useEffect(() => { void refresh(); }, []);
  const toggle = async () => { if (!status) return; try { await api('external.enable', { enabled: !status.enabled }); await refresh(); setMessage(''); } catch { setMessage('接口设置失败'); } };
  const copy = async () => { if (!status) return; const config = {mcpServers:{zhiyun:{command:status.command,args:[status.script,'--root',status.root],env:{ELECTRON_RUN_AS_NODE:'1'}}}}; try { await api('clipboard.write',{text:'请将以下 MCP 配置添加到你的客户端，然后重启客户端：\n'+JSON.stringify(config,null,2)}); setMessage('安装说明已复制，发给支持 MCP 的 AI 即可'); } catch { setMessage('复制失败'); } };
  return <section className="privacy-card"><h3>外部应用接口</h3><p>让支持 MCP 的 AI 协助操作智云助手。读取和操作需逐次确认。</p><button onClick={() => void toggle()}>{status?.enabled ? '关闭接口' : '开启接口'}</button> <button onClick={() => void copy()} disabled={!status}>AI 帮你安装</button>{message && <p role="status">{message}</p>}</section>;
}
