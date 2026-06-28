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

async function toolbar(page: Page) {
  return page.evaluate(() => window.__game.toolbarPage());
}
async function worldPage(page: Page, x: number, y: number) {
  return page.evaluate(([wx, wy]) => window.__game.worldToPage(wx, wy), [x, y]);
}

// 从工具栏真实拖拽一个石墙到目标世界坐标
async function dragWallTo(page: Page, wx: number, wy: number) {
  const from = await toolbar(page);
  const to = await worldPage(page, wx, wy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
}

test.describe('拖拽放置全流程', () => {
  test('拖入合法点 → 放置成功、库存-1、金钱-10', async ({ page }) => {
    await ready(page);
    await dragWallTo(page, 10, 5);
    const blocks = await page.evaluate(() => window.__game.getBlocks());
    expect(blocks.length).toBe(1);
    expect(await page.evaluate(() => window.__game.getInventory())).toBe(4);
    expect(await page.evaluate(() => window.__game.getMoney().current)).toBe(40);
    await page.screenshot({ path: 'e2e/__screenshots__/drag-placed.png' });
  });

  test('拖到河道外（岸上）→ 回弹、不放置、库存金钱不变', async ({ page }) => {
    await ready(page);
    await dragWallTo(page, 10, 0.5); // y=0.5 在上岸之上、河道外
    expect(await page.evaluate(() => window.__game.getBlocks())).toHaveLength(0);
    expect(await page.evaluate(() => window.__game.getInventory())).toBe(5);
    expect(await page.evaluate(() => window.__game.getMoney().current)).toBe(50);
  });

  test('点击已放置构件 → 旋转 +1（45°）', async ({ page }) => {
    await ready(page);
    await dragWallTo(page, 10, 5);
    const b0 = (await page.evaluate(() => window.__game.getBlocks()))[0];
    await page.mouse.click(b0.x, b0.y);
    const b1 = (await page.evaluate(() => window.__game.getBlocks()))[0];
    expect(b1.rotStep).toBe((b0.rotStep + 1) % 8);
  });

  test('点选构件高亮 → 点拆除按钮 → 删除、库存金钱返还', async ({ page }) => {
    await ready(page);
    await dragWallTo(page, 10, 5);
    const b0 = (await page.evaluate(() => window.__game.getBlocks()))[0];

    // 先点空白取消选中，再点石墙将其选中（高亮）
    const empty = await worldPage(page, 5, 4);
    await page.mouse.click(empty.x, empty.y);
    expect(await page.evaluate(() => window.__game.getSelected())).toBeNull();
    await page.mouse.click(b0.x, b0.y);
    expect(await page.evaluate(() => window.__game.getSelected())).toBe(b0.id);

    // 点拆除按钮
    const dz = await page.evaluate(() => window.__game.deletePage());
    await page.mouse.click(dz.x, dz.y);

    expect(await page.evaluate(() => window.__game.getBlocks())).toHaveLength(0);
    expect(await page.evaluate(() => window.__game.getInventory())).toBe(5);
    expect(await page.evaluate(() => window.__game.getMoney().current)).toBe(50);
  });

  test('与已有构件重叠 → 拒绝放置', async ({ page }) => {
    await ready(page);
    await dragWallTo(page, 10, 5);
    await dragWallTo(page, 10.1, 5); // 几乎同位
    expect(await page.evaluate(() => window.__game.getBlocks())).toHaveLength(1);
  });
});
