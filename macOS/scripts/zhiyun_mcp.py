#!/usr/bin/env python3
"""Local MCP stdio adapter. All application actions are executed by the app."""
import sys,json,os,time,uuid,tempfile
from pathlib import Path
ROOT=Path.home()/'Library/Application Support/智云助手 展示版/ExternalAgent'
TOOLS=[
 {'name':'zhiyun_state','description':'读取智云助手当前状态。','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'zhiyun_actions','description':'读取应用动作目录及参数。','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'zhiyun_interface','description':'读取当前界面及可操作控件；敏感输入不提供。','inputSchema':{'type':'object','properties':{'offset':{'type':'integer'},'limit':{'type':'integer'}},'additionalProperties':False}},
 {'name':'zhiyun_do','description':'调用应用动作。先查询 zhiyun_actions；需要显式确认的操作遵守动作说明。','inputSchema':{'type':'object','properties':{'action':{'type':'string'},'args':{'type':'object'}},'required':['action','args'],'additionalProperties':False}}]
def call_app(method,params):
 if not (ROOT/'enabled').is_file():raise RuntimeError('请打开智云助手，在隐私与数据中开启外部 Agent 接口。')
 ident=uuid.uuid4().hex;request=ROOT/(ident+'.request');reply=ROOT/(ident+'.response')
 payload=json.dumps({'id':ident,'method':method,'params':params},ensure_ascii=False).encode()
 if len(payload)>262144:raise ValueError('请求过大')
 fd,tmp=tempfile.mkstemp(prefix='.request-',dir=ROOT)
 try:
  os.fchmod(fd,0o600)
  with os.fdopen(fd,'wb') as out:out.write(payload)
  os.replace(tmp,request)
  deadline=time.monotonic()+90
  while time.monotonic()<deadline:
   if not (ROOT/'enabled').is_file():raise RuntimeError('接口已关闭')
   if reply.exists():
    data=json.loads(reply.read_text());reply.unlink(missing_ok=True)
    if data.get('error'):raise RuntimeError(data['error'])
    return data.get('result')
   time.sleep(.1)
  raise TimeoutError('应用没有响应，请确认智云助手正在运行。')
 finally:
  request.unlink(missing_ok=True);reply.unlink(missing_ok=True)
def handle(message):
 method=message.get('method');params=message.get('params') or {};ident=message.get('id')
 if method=='initialize':result={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'zhiyun-assistant','version':'1.0.0'}}
 elif method=='ping':result={}
 elif method=='tools/list':result={'tools':TOOLS}
 elif method=='tools/call':
  name=params.get('name','');mapping={'zhiyun_state':'state','zhiyun_actions':'actions','zhiyun_interface':'interface','zhiyun_do':'do'}
  if name not in mapping:raise ValueError('未知工具')
  try:result={'content':[{'type':'text','text':json.dumps(call_app(mapping[name],params.get('arguments') or {}),ensure_ascii=False)}]}
  except Exception as error:result={'isError':True,'content':[{'type':'text','text':str(error)}]}
 elif method and method.startswith('notifications/'):return None
 else:raise ValueError('不支持的方法')
 return {'jsonrpc':'2.0','id':ident,'result':result} if ident is not None else None
for line in sys.stdin:
 try:
  msg=json.loads(line);result=handle(msg)
  if result is not None:print(json.dumps(result,ensure_ascii=False),flush=True)
 except Exception as error:
  print(json.dumps({'jsonrpc':'2.0','id':msg.get('id') if isinstance(locals().get('msg'),dict) else None,'error':{'code':-32603,'message':str(error)}},ensure_ascii=False),flush=True)
