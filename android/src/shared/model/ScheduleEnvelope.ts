export function normalizeScheduleEnvelope(data:any):{days:any[];authoritative:boolean} {
  if(!data || typeof data!=='object')throw new Error("课表服务暂时不可用，本机记录已保留");
  let result=data.result??data.data;
  // Some service gateways serialize the nested JSON payload as a string.
  // Decode only valid JSON; an empty or unrecognized value cannot erase cache.
  const hasServiceError = result?.err != null && ![false, 0, '0', ''].includes(result.err);
  if (typeof result?.data === 'string' && !hasServiceError) {
    const raw=result.data.trim();
    if (!raw) throw new Error('课表服务返回空内容，本机记录已保留');
    try { const decoded=JSON.parse(raw); if (decoded && typeof decoded === 'object') result={...result,data:decoded}; }
    catch { if (/^<!doctype|^<html/i.test(raw)) throw new Error('课程会话未恢复，请恢复登录后重试'); }
  }
  // Some official endpoints nest their service status beside the list.
  // Never let an error carrying list:[] authorize deleting cached courses.
  const codes=[data.code,result?.code,result?.data?.code].filter(code=>code!=null).map(Number);
  const authMessage=[data,result,result?.data].some(row=>row && typeof row==='object' && row.err && /请先登录|未登录|登录已过期|登录失效|会话已过期|token expired|authentication required/i.test(String(row.errMsg || '')));
  if (!codes.includes(403) && authMessage) throw new Error("课程会话未恢复，请恢复登录后重试");
  if(codes.includes(401))throw new Error("课程会话未恢复，请恢复登录后重试");
  if(hasServiceError)throw new Error("课表服务暂时不可用，本机记录已保留");
  // The live service returns {result:{code:400,msg:"课表为空"}} on
  // ordinary no-class dates. This is not an outage or an auth failure.
  if(codes.length && codes.every(code=>[0,200,400].includes(code)) && Number(result?.code)===400 && result?.msg==='课表为空' && !Array.isArray(result?.list))return{days:[],authoritative:false};
  if(codes.some(code=>![0,200].includes(code)))throw new Error("课表服务暂时不可用，本机记录已保留");
  const list=result?.list??(Array.isArray(result?.data)?result.data:result?.data?.list);
  if(Array.isArray(list))return{days:list,authoritative:list.length>0 || !Array.isArray(result?.data)};
  // Some successful no-class responses contain [] or an empty object rather
  // than list:[]. They are readable but cannot authorize cache removal.
  if(codes.length){
    if(result==null || (Array.isArray(result)&&result.length===0) || (typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).length===0) || (typeof result==='object'&&('list' in result)&&result.list==null))return{days:[],authoritative:false};
  }
  throw new Error("课表数据格式暂时无法识别，本机记录已保留");
}
