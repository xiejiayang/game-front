import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __game: any;
  }
}

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game.enterLevel('L1'));
}

async function placeWall(page: Page, wx: number, wy: number): Promise<string> {
  const from = await page.evaluate(() => window.__game.toolbarPage());
  const to = await page.evaluate(([x, y]) => window.__game.worldToPage(x, y), [wx, wy]);
  const before = await page.evaluate(() => window.__game.getBlocks().map((b: any) => b.id));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__game.getBlocks());
  const created = after.find((b: any) => !before.includes(b.id));
  expect(created, '放置应成功').toBeTruthy();
  return created.id;
}

async function rotateTo(page: Page, id: string, target: number) {
  // 点击构件旋转 45°/次（首次点击若未选中则先选中，循环自适应）
  for (let i = 0; i < 12; i++) {
    const b = (await page.evaluate(() => window.__game.getBlocks())).find((x: any) => x.id === id);
    if (b.rotStep === target) return;
    await page.mouse.click(b.x, b.y);
    if (i === 0 && (await page.evaluate(() => window.__game.getSelected())) !== id) {
      // 首点仅选中、未旋转：再点一次进入旋转
      continue;
    }
  }
}

async function release(page: Page) {
  const r = await page.evaluate(() => window.__game.releasePage());
  await page.mouse.click(r.x, r.y);
  await page.evaluate(() => window.__game.finishSim());
}

test('斜向导流：2 道斜墙 → 成功且节俭，再重试回到编辑', async ({ page }) => {
  await ready(page);
  const a = await placeWall(page, 14.5, 7);
  await rotateTo(page, a, 7);
  const b = await placeWall(page, 14.5, 5);
  await rotateTo(page, b, 7);

  await release(page);
  await page.waitForFunction(() => window.__game.getState() === 'settling');
  const result = await page.evaluate(() => window.__game.getResult());
  expect(result.isSuccess).toBe(true);
  expect(result.isFrugal).toBe(true);
  await page.screenshot({ path: 'e2e/__screenshots__/win-frugal.png' });

  // 重试回到编辑
  const retry = await page.evaluate(() => window.__game.retryPage());
  await page.mouse.click(retry.x, retry.y);
  await expect.poll(() => page.evaluate(() => window.__game.getState())).toBe('editing');
});

test('选关：开局停在选关界面，L2 置灰；胜后「下一关」回选关（检查点 C4）', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true);
  // 开局停在选关界面
  expect(await page.evaluate(() => window.__game.getScreen())).toBe('select');
  await page.screenshot({ path: 'e2e/__screenshots__/level-select.png' });

  // 点 L2（置灰）不进入游戏
  const l2 = await page.evaluate(() => window.__game.levelCardPage('L2'));
  await page.mouse.click(l2.x, l2.y);
  expect(await page.evaluate(() => window.__game.getScreen())).toBe('select');

  // 点 L1 进入游戏
  const l1 = await page.evaluate(() => window.__game.levelCardPage('L1'));
  await page.mouse.click(l1.x, l1.y);
  expect(await page.evaluate(() => window.__game.getScreen())).toBe('game');

  // 快速通关（节俭斜墙解）→ 结算
  const a = await placeWall(page, 14.5, 7);
  await rotateTo(page, a, 7);
  const b = await placeWall(page, 14.5, 5);
  await rotateTo(page, b, 7);
  await release(page);
  await page.waitForFunction(() => window.__game.getState() === 'settling');

  // 「下一关」回到选关界面
  const next = await page.evaluate(() => window.__game.nextPage());
  await page.mouse.click(next.x, next.y);
  await expect.poll(() => page.evaluate(() => window.__game.getScreen())).toBe('select');
});

test('硬堵：横排筑墙挡满河道 → 墙垮决堤 → 失败', async ({ page }) => {
  await ready(page);
  for (const y of [3, 5, 7]) {
    const id = await placeWall(page, 12, y);
    await rotateTo(page, id, 2); // 横断河道
  }
  await release(page);
  await page.waitForFunction(() => window.__game.getState() === 'settling');
  const result = await page.evaluate(() => window.__game.getResult());
  expect(result.isSuccess).toBe(false);
  await page.screenshot({ path: 'e2e/__screenshots__/fail-dam.png' });
});
