import { test, expect } from '@playwright/test';
test('in-app assistant performs an actual navigation through a synthetic model tool call', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?assistant');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  await page.getByLabel('给应用助手发消息').fill('打开离线课程');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已打开离线课程')).toBeVisible();
  await expect(page.locator('.main-nav button.active')).toHaveText('离线课程');
  const calls = await page.evaluate(() => (window as any).__calls.filter((x:any) => x.method === 'assistant.turn'));
  expect(calls).toHaveLength(2);
  const toolMessage = calls[1].p.messages.find((message:any) => message.role === 'tool');
  expect(toolMessage.content).toContain('离线课程');
  await expect.poll(() => page.evaluate(() => (window as any).__calls.some((x:any) => x.method === 'storage.set' && x.p.key === 'app-assistant-history-v1'))).toBe(true);
  await page.getByRole('button', { name: '新对话' }).click();
  await expect(page.getByText('已打开离线课程')).toHaveCount(0);
  await page.getByLabel('助手对话历史').selectOption({ label: '打开离线课程' });
  await expect(page.getByText('已打开离线课程')).toBeVisible();
});
test('assistant can find a known course and enter it using its verified identifier', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/?assistant-open');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  await page.getByLabel('给应用助手发消息').fill('进入示例课程');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('正在进入示例课程')).toBeVisible();
  await expect(page.getByRole('heading', { name: '课件', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls.filter((x:any) => x.method === 'lesson.open'));
  expect(calls).toHaveLength(1); expect(calls[0].p.course.subId).toBe('fixture-lesson');
});
test('assistant panel moves by its bar and resizes from a side without a visible corner control', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/?assistant');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  const panel = page.locator('.app-assistant-panel'), handle = page.getByRole('button', { name: '移动和调整应用助手' });
  const before = (await panel.boundingBox())!, bar = (await handle.boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2); await page.mouse.down(); await page.mouse.move(bar.x + bar.width / 2 - 70, bar.y + bar.height / 2 - 40); await page.mouse.up();
  const moved = (await panel.boundingBox())!; expect(moved.x).toBeLessThan(before.x - 50); expect(moved.y).toBeLessThan(before.y - 20);
  const edge = (await page.locator('.app-assistant-resize.edge-w').boundingBox())!;
  await page.mouse.move(edge.x + 3, edge.y + edge.height / 2); await page.mouse.down(); await page.mouse.move(edge.x - 27, edge.y + edge.height / 2); await page.mouse.up();
  const resized = (await panel.boundingBox())!; expect(resized.width).toBeGreaterThan(moved.width + 20);
  await page.locator('.brand').click(); await expect(panel).not.toHaveClass(/editing/);
});
test('assistant offers the existing API setup without requiring a course to be opened', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  await expect(page.getByRole('heading', { name: '启用 AI 辅助学习' })).toBeVisible();
  await expect(page.getByLabel('API 密钥')).toBeVisible();
});
test('assistant reads a course transcript, seeks and opens a pane through the actual study controls', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/?assistant-study');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  await page.getByLabel('给应用助手发消息').fill('进入课程并打开笔记'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已完成学习操作')).toBeVisible(); await expect(page.getByRole('heading', { name: '课堂笔记', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls.filter((x:any) => x.method === 'assistant.turn'));
  const results = calls.at(-1).p.messages.filter((item:any) => item.role === 'tool').map((item:any) => item.content).join(' ');
  expect(results).toContain('这是合成测试材料'); expect(results).toContain('80'); expect(results).not.toContain('课程仍在加载');
});
test('assistant finds, reads and opens the requested note without exposing image paths', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/?assistant-notes');
  await page.getByRole('button', { name: '应用助手', exact: true }).click();
  await page.getByLabel('给应用助手发消息').fill('打开合成笔记'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('正在打开合成笔记')).toBeVisible(); await expect(page.getByRole('heading', { name: '课堂笔记', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls.filter((x:any) => x.method === 'assistant.turn'));
  const results = calls.at(-1).p.messages.filter((item:any) => item.role === 'tool').map((item:any) => item.content).join(' ');
  expect(results).toContain('合成笔记正文'); expect(results).not.toContain('file://');
});
test('assistant adds a selected lesson to favorites and queues only requested download parts', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/?assistant-actions');
  await page.getByRole('button', { name: '应用助手', exact: true }).click(); await page.getByLabel('给应用助手发消息').fill('收藏这节课并下载课件和转写'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已收藏并加入下载队列')).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__calls); const mark = calls.find((x:any) => x.method === 'collection.toggle'), download = calls.find((x:any) => x.method === 'download.enqueue');
  expect(mark.p.course.subId).toBe('fixture-lesson'); expect(mark.p.kind).toBe('favorite'); expect(download.p.parts).toEqual({video:false,slides:true,transcript:true});
});
test('long note text can be read completely across chunk boundaries', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); await page.goto('/?assistant-long');
  await page.getByRole('button', { name: '应用助手', exact: true }).click(); await page.getByLabel('给应用助手发消息').fill('读取笔记'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('已读取全部笔记')).toBeVisible();
  const messages = await page.evaluate(() => (window as any).__calls.filter((x:any) => x.method === 'assistant.turn').at(-1).p.messages.filter((m:any) => m.role === 'tool'));
  const first = JSON.parse(messages[1].content), second = JSON.parse(messages[2].content);
  expect(first.nextOffset).toBe(0); expect(first.nextCharOffset).toBe(10000); expect(second.nextOffset).toBe(-1); expect(first.items[0].text.length + second.items[0].text.length).toBe(15001);
});
