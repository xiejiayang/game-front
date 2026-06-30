// 通用「纸底抠透明」资产后处理工具（用于卵石堰立体贴图等）。
//
// 流程：① 从四边 flood-fill 键出与边框连通的米黄纸色像素 → 透明（遇墨线/深色停，
// 靠连通性保护被墨线包围的浅色顶面）；② 可选 --level：用 PCA 测出主体长轴角度并把它
// 「转正成水平」（按墨色深度加权，避免被柔和投影阴影带偏），这样运行时纯靠计算的投影角
// 旋转即可精确贴合河道方向；③ 裁到不透明内容包围盒，缩小贴图。
//
// 用法：
//   node scripts/cut-paper.mjs <inPng> <outPng> [--level]
//   npm run assets:cut-walls            # 对 4 张 stone-wall-iso-*.png 就地抠图+转正
//
// ⚠️ 重跑 scripts/gen-assets.mjs 会重新生成带纸底/带斜角的原图 → 须再跑本脚本。
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'src', 'assets');

// --walls：批量就地处理 4 张 stone-wall-iso-*.png（抠纸底 + 转正长轴 + 统一尺寸）。
// 统一尺寸：抠图转正后强制缩放到相同画布，保证 4 道墙在游戏里大小一致。
const WALL_W = 1000;
const WALL_H = 300;
let jobs;
if (process.argv.includes('--walls')) {
  jobs = [1, 2, 3, 4].map((n) => {
    const f = join(ASSETS, `stone-wall-iso-${n}.png`);
    return { inPng: f, outPng: f, doLevel: true, targetW: WALL_W, targetH: WALL_H };
  });
} else {
  const inPng = process.argv[2];
  const outPng = process.argv[3];
  if (!inPng || !outPng) {
    console.error('用法: node scripts/cut-paper.mjs <inPng> <outPng> [--level]  |  --walls');
    process.exit(1);
  }
  jobs = [{ inPng, outPng, doLevel: process.argv.includes('--level') }];
}

const browser = await chromium.launch();
const page = await browser.newPage();

const cutOne = (uri, doLevel, targetW, targetH) => page.evaluate(async ({ uri, doLevel, targetW, targetH }) => {
  /* global Image, document */ // 此回调由 Playwright 注入浏览器上下文执行，故有 DOM 全局
  const load = (u) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = u;
  });
  const img = await load(uri);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w0; cv.height = h0;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let id = ctx.getImageData(0, 0, w0, h0);
  let d = id.data;

  // —— ① flood-fill 抠纸底 ——
  const isPaper = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r < 200 || g < 195 || b < 178) return false; // 不够亮 → 内容
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min < 46; // 低饱和 → 纸底
  };
  const flood = (w, h) => {
    const visited = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + (w - 1)); }
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const i = p * 4;
      if (!isPaper(i)) continue;
      d[i + 3] = 0;
      const x = p % w, y = (p - x) / w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    }
  };
  flood(w0, h0);

  // —— ② PCA 测长轴并转正成水平（--level）——
  let W, H;
  if (doLevel) {
    // 按「墨色深度 × 不透明」加权：深墨石轮廓权重大，柔和浅灰阴影权重小 → 长轴不被阴影带偏。
    let sw = 0, mx = 0, my = 0;
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        const i = (y * w0 + x) * 4;
        if (d[i + 3] === 0) continue;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const wgt = (1 - lum / 255) * (d[i + 3] / 255);
        sw += wgt; mx += wgt * x; my += wgt * y;
      }
    }
    mx /= sw; my /= sw;
    let sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        const i = (y * w0 + x) * 4;
        if (d[i + 3] === 0) continue;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const wgt = (1 - lum / 255) * (d[i + 3] / 255);
        const dx = x - mx, dy = y - my;
        sxx += wgt * dx * dx; syy += wgt * dy * dy; sxy += wgt * dx * dy;
      }
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // 主轴角（图像 y 向下）
    // 旋转 -theta 把长轴转水平。用足够大的画布容纳旋转后内容。
    const diag = Math.ceil(Math.hypot(w0, h0));
    const rc = document.createElement('canvas');
    rc.width = diag; rc.height = diag;
    const rx = rc.getContext('2d');
    ctx.putImageData(id, 0, 0); // 把抠好透明的像素写回源画布，作为旋转源
    rx.translate(diag / 2, diag / 2);
    rx.rotate(-theta);
    rx.drawImage(cv, -w0 / 2, -h0 / 2);
    id = rx.getImageData(0, 0, diag, diag);
    d = id.data;
    cv.width = diag; cv.height = diag;
    ctx.putImageData(id, 0, 0);
    W = diag; H = diag;
    console.log('PCA theta(deg)=' + (theta * 180 / Math.PI).toFixed(1));
  } else {
    ctx.putImageData(id, 0, 0);
    W = w0; H = h0;
  }

  // —— ③ 按「行/列密度」裁到密集卵石带（留 2px 边）——
  // 不用单像素包围盒：AI 出图常有①极淡羽化/淡影(alpha 1~39)铺满整张画布，②角落零星杂点。
  // 二者都会把单像素包围盒撑大 → 缩放后石块没铺满、且各图撑大程度不一 → 石块占比 35%~87% 各异、
  // 墙忽粗忽细。改为：先按 CROP_ALPHA 数每行/每列的「实像素」数，仅当某行(列)实像素占比 ≥ DENSITY
  // 才算内容行(列)，裁到内容行列区间 → 紧贴密集卵石带、无视稀疏杂点与淡影 → 缩放铺满、八向厚度统一。
  const CROP_ALPHA = 64;
  const DENSITY = 0.04; // 行(列)内 ≥4% 像素够实，才算内容
  const rowN = new Array(H).fill(0);
  const colN = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] >= CROP_ALPHA) { rowN[y]++; colN[x]++; }
    }
  }
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) if (rowN[y] >= W * DENSITY) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let x = 0; x < W; x++) if (colN[x] >= H * DENSITY) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  if (maxX < 0 || maxY < 0) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; } // 兜底：未命中则不裁
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1, chh = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = chh;
  out.getContext('2d').putImageData(ctx.getImageData(minX, minY, cw, chh), 0, 0);

  // —— ④ 统一尺寸（可选）：强制缩放到 targetW×targetH，保证多张贴图大小一致 ——
  if (targetW && targetH) {
    const norm = document.createElement('canvas');
    norm.width = targetW; norm.height = targetH;
    const nx = norm.getContext('2d');
    nx.imageSmoothingEnabled = true;
    nx.drawImage(out, 0, 0, targetW, targetH);
    return norm.toDataURL('image/png');
  }
  return out.toDataURL('image/png');
}, { uri, doLevel, targetW, targetH });

for (const job of jobs) {
  const uri = `data:image/png;base64,${readFileSync(job.inPng).toString('base64')}`;
  const outDataUrl = await cutOne(uri, job.doLevel, job.targetW, job.targetH);
  const b64 = outDataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(job.outPng, Buffer.from(b64, 'base64'));
  console.log('✓ 抠图完成 →', job.outPng);
}

await browser.close();
