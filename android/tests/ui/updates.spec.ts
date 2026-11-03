import {test,expect} from '@playwright/test';
test('detects update once, exposes manual check and opens only the release page on request',async({page})=>{
 await page.goto('/?update-fixture');await page.getByRole('button',{name:'隐私',exact:true}).click();
 await expect(page.getByRole('button',{name:'查看 0.1.0-beta.9 预览版',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.updateFeed').length)).toBe(1);
 await page.getByRole('button',{name:'检查更新',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.updateFeed').length)).toBe(2);
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.external').length)).toBe(0);
 await page.getByRole('button',{name:'查看 0.1.0-beta.9 预览版',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='app.external').at(-1).p.url)).toBe('https://github.com/He-He-He-He-He-He/ZhiyunAssistant/releases/tag/update-fixture');
 await page.getByLabel('每天自动检查更新').uncheck();await expect(page.getByLabel('每天自动检查更新')).not.toBeChecked();
});
