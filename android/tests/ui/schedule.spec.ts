import {test,expect} from '@playwright/test';
test('recent requests prior fourteen days, excludes current and future days and groups dates',async({page})=>{
 await page.goto('/?schedule-range');
 await expect(page.getByRole('heading',{name:'昨日课程',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'未来课程',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'今日晚课',exact:true})).toHaveCount(0);
 await expect(page.locator('.classroom-day')).toHaveCount(1);
 const ranges=await page.evaluate(()=>(window as any).__calls.filter((c:any)=>c.method==='courses.schedule').map((c:any)=>c.p));
 expect(ranges.some((r:any)=>Math.round((Date.parse(r.end)-Date.parse(r.start))/86400000)===13)).toBe(true);
});
test('switching to today while recent is pending keeps today ordered and never restores stale recent rows',async({page})=>{
 await page.goto('/?schedule-range');await page.getByRole('button',{name:'今日课表',exact:true}).click();
 await expect(page.locator('.course-card h3')).toHaveText(['今日早课','今日晚课']);
 await page.waitForTimeout(400);
 await expect(page.locator('.course-card h3')).toHaveText(['今日早课','今日晚课']);
 await expect(page.locator('.classroom-day')).toHaveCount(1);
});
