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
