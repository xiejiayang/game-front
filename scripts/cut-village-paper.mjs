// 村屋贴图「纸底抠透明」工具（资产后处理）。
//
// 背景：village-hut.png 由 Agnes.ai 生成，房屋/树漂浮在大片米黄宣纸底上。
// 游戏里村屋以「直立广告牌」叠在河岸（见 render/waterRenderer.ts），纸底会在房子
// 周围压出一圈淡方框。本脚本把与图像四边连通的纸色像素抠成透明，房屋白墙因被墨线
// 包围、靠连通性自动保留 → 只剩房舍+树+地影，无纸底、无方框。
//
// 用 Playwright(已装) 的 Chromium 在 canvas 里做边界 flood-fill，无需新增图像依赖。
//
// 用法（默认就地处理 src/assets/village-hut.png，先备份为 .village-hut.orig.png）：
//   node scripts/cut-village-paper.mjs
//   npm run assets:cut-village
// 或显式指定输入/输出：
//   node scripts/cut-village-paper.mjs <inPng> <outPng>
//
// ⚠️ 重要：重跑 scripts/gen-assets.mjs 会重新生成带纸底的 village-hut.png，
//    覆盖本次抠图结果 —— 重生成村屋贴图后，务必再跑一次本脚本。
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PNG = join(__dirname, '..', 'src', 'assets', 'village-hut.png');
const DEFAULT_BACKUP = join(__dirname, '..', 'src', 'assets', '.village-hut.orig.png');

const inPng = process.argv[2] ?? DEFAULT_PNG;
const outPng = process.argv[3] ?? DEFAULT_PNG;

// 就地处理时，首次运行先把原始带纸底图备份一份，便于以后调参重抠。
if (outPng === DEFAULT_PNG && inPng === DEFAULT_PNG && !existsSync(DEFAULT_BACKUP)) {
  copyFileSync(DEFAULT_PNG, DEFAULT_BACKUP);
  console.log('✓ 已备份原图 →', DEFAULT_BACKUP);
}

const dataUri = `data:image/png;base64,${readFileSync(inPng).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const outDataUrl = await page.evaluate(async (uri) => {
  /* global Image, document */ // 此回调由 Playwright 注入浏览器上下文执行，故有 DOM 全局
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // 纸底判定：足够亮、且偏色不大（米黄宣纸）。深墨线、深绿树、赭石地影都不算。
  const isPaper = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r < 200 || g < 195 || b < 178) return false; // 不够亮 → 内容
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min < 46; // 低饱和 → 纸底（白墙也满足，但靠连通性保护）
  };

  const visited = new Uint8Array(w * h);
  const stack = [];
  // 四边入栈
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + (w - 1)); }

  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!isPaper(i)) continue; // 边界：内容像素，不抠、不再扩散
    d[i + 3] = 0; // 抠成透明
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  // 边缘羽化一遍：与透明相邻、仍偏纸色的半亮像素降透明度，去白边光晕。
  const copy = d.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      if (copy[i + 3] === 0) continue;
      const r = copy[i], g = copy[i + 1], b = copy[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lightish = r > 195 && g > 190 && max - min < 52;
      if (!lightish) continue;
      // 邻域有透明 → 边缘光晕，按亮度压一点 alpha
      const neighborTransparent =
        copy[(p - 1) * 4 + 3] === 0 || copy[(p + 1) * 4 + 3] === 0 ||
        copy[(p - w) * 4 + 3] === 0 || copy[(p + w) * 4 + 3] === 0;
      if (neighborTransparent) d[i + 3] = Math.min(d[i + 3], 90);
    }
  }

  ctx.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}, dataUri);

await browser.close();
const b64 = outDataUrl.replace(/^data:image\/png;base64,/, '');
writeFileSync(outPng, Buffer.from(b64, 'base64'));
console.log('✓ 纸底已抠透明 →', outPng);
