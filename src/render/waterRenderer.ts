import { Container, DisplacementFilter, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { LevelConfig } from '../levels/levelTypes';
import type { SimState } from '../sim/simulation';
import type { Stage } from './stage';
import { makeWorldView, type WorldView } from './worldView';
import type { GameTextures } from './assets';

/**
 * 水流渲染：水墨场景底图 + 分层丝滑流水（参考真实长曝光溪流）+ 村落小屋。
 * 河道水面由三层叠加构成，并施加位移扰动制造水面湍流：
 *   ① 底层 water-flow（丝滑流水，青绿灰，染色与水墨场景调和）；
 *   ② 白沫两层 foam（additive 抠黑，前后两层不同速度/缩放 → 浪花层次）；
 *   ③ DisplacementFilter（flow-noise 灰度湍流，缓慢漂移 → 水面起伏churn）。
 * 放水(simulating)时整体提速、白沫增浓、扰动加强；水粒子渲染为 additive 白沫，
 * 在墙体处自然堆叠成亮白浪花 → 真实呈现「遇墙激起浪花 / 导流分水」。
 * 贴图由 Agnes.ai 生成（见 render/assets.ts）。纸底贴图（村落/印章）用 multiply 消隐纸白。
 */
export class WaterRenderer {
  readonly view: WorldView;
  private readonly foamGfx = new Graphics(); // 粒子白沫（additive）
  private readonly splashGfx = new Graphics(); // 入水口喷涌白沫（additive）
  private readonly radius: number;

  private base!: TilingSprite; // 底层流水
  private foamBack!: TilingSprite; // 后景白沫
  private foamFront!: TilingSprite; // 前景白沫
  private disp!: Sprite; // 位移图精灵
  private dispFilter!: DisplacementFilter;

  private readonly srcX: number;
  private readonly srcY0: number;
  private readonly srcY1: number;
  private phase = 0;
  private flowMix = 0; // 0=编辑(平缓) → 1=放水(湍急)，平滑过渡

  constructor(stage: Stage, level: LevelConfig, tex: GameTextures) {
    this.view = makeWorldView(level, stage.width, stage.height);
    this.radius = Math.max(2, 0.18 * this.view.scale);
    this.srcX = this.view.sx(level.channel.x0);
    this.srcY0 = this.view.sy(level.source.yMin);
    this.srcY1 = this.view.sy(level.source.yMax);
    this.drawStatic(stage, level, tex);
    this.foamGfx.blendMode = 'add';
    this.splashGfx.blendMode = 'add';
    stage.waterLayer.addChild(this.foamGfx, this.splashGfx);
  }

  private drawStatic(stage: Stage, level: LevelConfig, tex: GameTextures): void {
    const v = this.view;
    const ch = level.channel;

    // 1. 全屏水墨场景底图
    const bg = new Sprite(tex.bgScene);
    bg.width = stage.width;
    bg.height = stage.height;
    stage.bgLayer.addChild(bg);

    // 2. 河道丝滑流水（分层 + 位移扰动），整体裁在河道矩形内
    const chW = (ch.x1 - ch.x0) * v.scale;
    const chH = (ch.y1 - ch.y0) * v.scale;
    const flow = new Container();
    flow.position.set(v.sx(ch.x0), v.sy(ch.y0));

    // ② 底层流水：单块横向铺满整条河道（避免横向接缝），竖向裁切填满高度；染青绿与水墨调和
    this.base = new TilingSprite({ texture: tex.waterFlow, width: chW, height: chH });
    const spanScale = chW / tex.waterFlow.width; // 一块铺满宽度 → 横向接缝罕见
    this.base.tileScale.set(spanScale);
    this.base.tint = 0x9fb7b0; // 淡青绿，压住照片感融入水墨场景
    this.base.alpha = 0.85;

    // ③ 白沫两层（additive 抠黑）：同样单块铺满宽度，靠不同速度/相位错位制造层次
    this.foamBack = new TilingSprite({ texture: tex.foam, width: chW, height: chH });
    this.foamBack.tileScale.set(spanScale);
    this.foamBack.blendMode = 'add';
    this.foamBack.alpha = 0.16;

    this.foamFront = new TilingSprite({ texture: tex.foam, width: chW, height: chH });
    this.foamFront.tileScale.set(spanScale);
    this.foamFront.tilePosition.set(tex.foam.width * 0.5, 30); // 错开半幅 + 竖向偏移，避免与后景重影
    this.foamFront.blendMode = 'add';
    this.foamFront.alpha = 0.1;

    flow.addChild(this.base, this.foamBack, this.foamFront);

    // 位移扰动：flow-noise 灰度图驱动 DisplacementFilter，缓慢漂移制造水面起伏
    this.disp = new Sprite(tex.flowNoise);
    this.disp.scale.set(chW / tex.flowNoise.width, chH / tex.flowNoise.height);
    this.disp.renderable = false; // 仅作位移源，不直接绘制
    flow.addChild(this.disp);
    this.dispFilter = new DisplacementFilter({ sprite: this.disp, scale: 8 });
    flow.filters = [this.dispFilter];

    stage.bgLayer.addChild(flow);

    // 3. 河岸（赭石土色，半透；下岸在缺口处断开 → 洪水从缺口灌向村庄）
    const banks = new Graphics();
    const bankColor = 0x9c8e72;
    const bankH = 0.55 * v.scale;
    banks.rect(v.sx(ch.x0), v.sy(ch.y0) - bankH, chW, bankH).fill({ color: bankColor, alpha: 0.7 });
    banks
      .rect(v.sx(ch.x0), v.sy(ch.y1), (level.gap.x0 - ch.x0) * v.scale, bankH)
      .fill({ color: bankColor, alpha: 0.7 });
    banks
      .rect(v.sx(level.gap.x1), v.sy(ch.y1), (ch.x1 - level.gap.x1) * v.scale, bankH)
      .fill({ color: bankColor, alpha: 0.7 });
    stage.bgLayer.addChild(banks);

    // 4. 村落小屋（缺口下方村庄区；multiply 消隐纸底融入场景）
    const va = level.village.area;
    const hut = new Sprite(tex.villageHut);
    hut.anchor.set(0.5);
    const hutW = 4.2 * v.scale;
    hut.width = hutW;
    hut.height = hutW; // 原图近方形
    hut.position.set(v.sx((va.x0 + va.x1) / 2), v.sy(va.y1) - hutW * 0.42);
    hut.blendMode = 'multiply';
    stage.bgLayer.addChild(hut);
  }

  clear(): void {
    this.foamGfx.clear();
    this.splashGfx.clear();
  }

  /**
   * 渲染层动效（与确定性 sim 无关）：分层流水滚动 + 位移扰动 + 入水口喷涌。
   * @param dtMs 帧间隔毫秒；@param flowing 是否放水中（提速增浪、喷涌仅放水时显示）。
   */
  animate(dtMs: number, flowing: boolean): void {
    const dt = dtMs / 1000;
    this.phase += dt;
    // 编辑↔放水 平滑过渡（约 0.5s）
    this.flowMix += (Number(flowing) - this.flowMix) * Math.min(1, dt * 2);
    const m = this.flowMix;

    // 流速：编辑时缓流，放水时湍急（水自左向右 → 纹理向右滚，tilePosition.x 递增）
    const v0 = 18 + 60 * m; // px/s 底层
    this.base.tilePosition.x += v0 * dt;
    this.foamBack.tilePosition.x += v0 * 1.4 * dt;
    this.foamFront.tilePosition.x += v0 * 2.1 * dt;
    // 白沫竖向轻微摆动，增加翻涌感
    this.foamBack.tilePosition.y = Math.sin(this.phase * 0.6) * 6;
    this.foamFront.tilePosition.y = Math.sin(this.phase * 0.9 + 1) * 4;
    // 白沫浓度随放水增强（峰值收敛，避免中段过曝纯白）
    this.foamBack.alpha = 0.14 + 0.24 * m;
    this.foamFront.alpha = 0.09 + 0.19 * m;

    // 位移扰动：缓慢漂移制造churn，放水时扰动更强
    this.disp.x += (10 + 20 * m) * dt;
    this.disp.y = Math.sin(this.phase * 0.5) * 8;
    this.dispFilter.scale.x = 6 + 14 * m;
    this.dispFilter.scale.y = 4 + 8 * m;

    const g = this.splashGfx;
    g.clear();
    if (!flowing) return;
    // 入水口喷涌：沿水源竖向喷出几道 additive 白沫，强调灌入
    const r = this.radius;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = this.srcY0 + (this.srcY1 - this.srcY0) * t;
      const pulse = 0.5 + 0.5 * Math.sin(this.phase * 7 + i * 1.7);
      const len = r * (3 + 5 * pulse);
      const x0 = this.srcX - r;
      const wob = Math.sin(this.phase * 5 + i) * r * 0.6;
      g.moveTo(x0, y)
        .lineTo(x0 + len, y + wob)
        .stroke({ width: r * 1.3, color: 0xffffff, alpha: 0.04 + 0.08 * pulse, cap: 'round' });
    }
  }

  update(sim: SimState): void {
    const v = this.view;
    const g = this.foamGfx;
    const r = this.radius;
    g.clear();
    // 水粒子 → additive 白沫细流：单根极淡流线，单个几乎隐于水面纹理；
    // 仅在水流被墙体逼挤、粒子密集对齐处叠加成亮白浪花 → 遇墙激浪 / 斜墙导流。
    for (const p of sim.pool.particles) {
      if (!p.active) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed < 0.12) continue; // 近静止不画，杜绝离散白点
      const hx = v.sx(p.x);
      const hy = v.sy(p.y);
      const ux = p.vx / speed;
      const uy = p.vy / speed;
      const len = Math.min(r * 7, Math.max(r * 3, speed * v.scale * 0.09));
      const tx = hx - ux * len;
      const ty = hy - uy * len;
      const bright = Math.min(1, speed * 0.8);
      // 单根细长流线（极低透明，无亮芯）：单个几乎隐于水纹，仅密集对齐处叠加成浪花
      g.moveTo(tx, ty)
        .lineTo(hx, hy)
        .stroke({ width: r * 1.3, color: 0xffffff, alpha: 0.025 + 0.04 * bright, cap: 'round' });
    }
  }
}
