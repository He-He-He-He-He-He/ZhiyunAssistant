import {test,expect} from '@playwright/test';
for (const size of [{name:'phone',width:390,height:844},{name:'tablet',width:1280,height:800}]) {
  test(`${size.name} adapts navigation and classroom without horizontal overflow`,async({page})=>{
    await page.setViewportSize({width:size.width,height:size.height});
    await page.goto('/');
    await expect(page.locator('.classroom-hero')).toBeVisible();
    await expect(page.locator('.hero-art')).toHaveJSProperty('complete',true);
    expect(await page.locator('.hero-art').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.main-nav .nav-icon')).toHaveCount(7);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    const direction=await page.locator('.main-nav').evaluate(el=>getComputedStyle(el).flexDirection);
    expect(direction).toBe(size.width>=840?'column':'row');
    await page.getByRole('button',{name:'所有课程',exact:true}).click();
    await expect(page.locator('.course-grid')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  });
}
test('phone hides decorative art and places assistant in the header without a capsule overlay',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('.hero-art')).toBeHidden();
 await expect(page.locator('.app-header').getByRole('button',{name:'应用助手',exact:true})).toBeVisible();
 await expect(page.locator('.app-assistant-trigger')).toHaveCount(0);
 await expect(page.locator('.app-assistant-entry svg')).toHaveCount(0);
 await expect(page.locator('.app-assistant-entry span')).toBeVisible();
 const box=await page.locator('.app-header').boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(391);
 await page.getByRole('button',{name:'应用助手',exact:true}).click();await expect(page.locator('.app-assistant-panel')).toBeVisible();
 await page.getByRole('button',{name:'收起应用助手'}).click();await expect(page.locator('.app-assistant-panel')).toHaveCount(0);
});
test('tablet shows the entire hero art within its own column',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/');
 const hero=(await page.locator('.classroom-hero').boundingBox())!,art=(await page.locator('.hero-art').boundingBox())!,copy=(await page.locator('.hero-copy').boundingBox())!;
 expect(art.x).toBeGreaterThanOrEqual(copy.x+copy.width);expect(art.x+art.width).toBeLessThanOrEqual(hero.x+hero.width);expect(art.y).toBeGreaterThanOrEqual(hero.y);expect(art.y+art.height).toBeLessThanOrEqual(hero.y+hero.height);
});
