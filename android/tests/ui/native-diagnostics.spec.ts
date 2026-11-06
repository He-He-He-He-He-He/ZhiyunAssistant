import {test,expect} from '@playwright/test';

test.beforeEach(async({context})=>{
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  return url.hostname==='127.0.0.1'||url.hostname==='localhost'?route.continue():route.abort();
 });
});
test('safe report remains available before global privacy consent or account login',async({page})=>{
 await page.addInitScript(()=>{
  let current:any;
  Object.defineProperty(window,'zhiyun',{configurable:true,get:()=>current,set:(value:any)=>{
   const call=value.call.bind(value);
   value.call=(method:string,p:any)=>method==='storage.get'&&p?.key==='privacy-consent'?Promise.resolve(false):call(method,p);
   current=value;
  }});
 });
 await page.goto('/');
 await expect(page.getByRole('button',{name:'同意并继续',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'查看上次原生诊断',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.viewNativeDiagnostics').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>['app.nativeAnonymousPreflight','app.silentLogin','app.login'].includes(c.method)).length)).toBe(0);
});
test('privacy shows last safe report without triggering authentication or preflight',async({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'隐私',exact:true}).click();
 const report=page.getByRole('button',{name:'查看上次原生诊断',exact:true});
 await expect(report).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.nativeAnonymousPreflight').length)).toBe(0);
 await report.click();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.viewNativeDiagnostics').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>['app.nativeAnonymousPreflight','app.silentLogin','app.login'].includes(c.method)).length)).toBe(0);
});
test('anonymous preflight entry is explicit and invokes only the native confirmation route',async({page})=>{
 await page.goto('/'); await page.getByRole('button',{name:'隐私',exact:true}).click();
 const preflight=page.getByRole('button',{name:'匿名生产链预检（0 密码 POST）',exact:true});
 await expect(preflight).toBeVisible(); await preflight.click();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.nativeAnonymousPreflight').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>['app.nativeAccountSettings','app.silentLogin','app.login'].includes(c.method)).length)).toBe(0);
 await expect(preflight).toBeEnabled();
});
