import { Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { LevelConfig } from '../levels/levelTypes';
import type { SimState } from '../sim/simulation';
import type { Stage } from './stage';
import { makeWorldView, type WorldView } from './worldView';
import type { GameTextures } from './assets';

// 卡通蓝水配色（参考 water-exam.gif）：深蓝水边 + 亮蓝水面 + 白色波纹高光。
const WATER_EDGE = 0x3f86d6; // 水体外缘/阴影（偏深的蓝）
const WATER_BODY = 0x9fd0f5; // 亮蓝水面
const WATER_RIPPLE = 0xeaf6ff; // 白色流向波纹

/**
 * 水流渲染（等距 2.5D）：远景底图(bgLayer，屏幕对齐) + 河道水墨水纹平面 + 村落小屋 + 洪水。
 * 河道/岸/村屋/洪水都挂在 stage.waterLayer(groundLayer 内)，由地面等距矩阵统一斜切投影 →
 * 河道呈「左高右低」平行四边形。河道底用水墨水纹贴图(water-tile)横向滚动模拟水流。
 * 洪水表现见 update()（卡通蓝水绕石，片 B）。贴图由 Agnes.ai 生成（见 render/assets.ts）。
 */
export class WaterRenderer {
  readonly view: WorldView;
  private readonly particleGfx = new Graphics();
  private readonly splashGfx = new Graphics();
  private readonly radius: number;
  private waterFlow!: TilingSprite;
  private readonly srcX: number;
  private readonly srcY0: number;
  private readonly srcY1: number;
  private phase = 0;

  constructor(stage: Stage, level: LevelConfig, tex: GameTextures) {
    this.view = makeWorldView(level, stage.width, stage.height);
    this.radius = Math.max(2, 0.18 * this.view.scale);
    this.srcX = this.view.sx(level.channel.x0);
    this.srcY0 = this.view.sy(level.source.yMin);
    this.srcY1 = this.view.sy(level.source.yMax);
    this.drawStatic(stage, level, tex);
    stage.waterLayer.addChild(this.particleGfx, this.splashGfx);
  }

  private drawStatic(stage: Stage, level: LevelConfig, tex: GameTextures): void {
    const v = this.view;
    const ch = level.channel;

    // 1. 全屏远景水墨底图（bgLayer，屏幕对齐，不参与等距投影）
    const bg = new Sprite(tex.bgScene);
    bg.width = stage.width;
    bg.height = stage.height;
    bg.alpha = 0.6; // 背景淡化 50%（向纸底退晕），突出前景河道/构件
    stage.bgLayer.addChild(bg);

    // 2. 河道水墨水纹平面（water-tile，横向滚动；地面像素坐标 → 地面矩阵斜切成平行四边形）
    const chW = (ch.x1 - ch.x0) * v.scale;
    const chH = (ch.y1 - ch.y0) * v.scale;
    const water = new TilingSprite({ texture: tex.waterTile, width: chW, height: chH });
    water.position.set(v.sx(ch.x0), v.sy(ch.y0));
    water.tileScale.set(chW / tex.waterTile.width); // 单块铺满整条宽度，缝隙罕见
    water.blendMode = 'multiply'; // 纸白底消隐、只留青绿墨纹水波，叠在背景斜河上 → 通透水墨水纹
    water.alpha = 0.9;
    this.waterFlow = water;
    stage.waterLayer.addChild(water);

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
    stage.waterLayer.addChild(banks);

    // 4. 村落小屋（缺口下方村庄区）：直立广告牌渲染。
    //    贴图本身已按等距三分俯视绘制（屋舍直立），故**不挂在 groundLayer**——否则会被地面
    //    等距矩阵二次斜切、把屋舍压扁变形（即「单纯跟着河道旋转」的问题）。改挂屏幕对齐的
    //    uiLayer，用 view.project() 把村庄区投影点算成屏幕坐标定位，保持直立。multiply 消隐纸白底。
    const va = level.village.area;
    const hut = new Sprite(tex.villageHut);
    hut.anchor.set(0.5, 0.55); // 锚点 → 屋舍主体落在河道下边界之下的村庄地，坐于下岸
    // 贴图已裁到房屋主体，故按裁切后的宽高比绘制（不再强制正方形）。宽度调小以保持
    // 房子原视觉尺寸：原图房屋约占全幅 0.67，裁切后几乎占满 → 宽度由 8 → 5.5。
    const hutW = 5.5 * v.scale;
    hut.width = hutW;
    hut.height = (hutW * hut.texture.height) / hut.texture.width; // 按裁切框宽高比
    // 缺口中心 + 河道下边界(channel.y1) → 村庄正坐在下岸缺口处
    const vp = v.project((va.x0 + va.x1) / 2, ch.y1);
    hut.position.set(vp.x, vp.y);
    // 贴图纸底已抠成透明（见 assets.ts / 离线 flood-fill 抠图），故用普通叠加即可：
    // 只显示房屋本身、不再有任何方框，也不会被 multiply 压暗。
    hut.eventMode = 'none'; // 纯装饰，不拦截 HUD 交互
    stage.uiLayer.addChildAt(hut, 0); // 置于 HUD 之下、地面之上
  }

  clear(): void {
    this.particleGfx.clear();
    this.splashGfx.clear();
  }

  /**
   * 渲染层动效（与确定性 sim 无关）：河水横向滚动 + 入水口喷涌。
   * @param dtMs 帧间隔毫秒；@param flowing 是否放水中（喷涌仅放水时显示）。
   */
  animate(dtMs: number, flowing: boolean): void {
    this.phase += dtMs / 1000;
    this.waterFlow.tilePosition.x -= dtMs * 0.04; // 水自左向右流 → 纹理向左滚

    const g = this.splashGfx;
    g.clear();
    if (!flowing) return;
    // 入水口喷涌：沿水源竖向喷出几道半透明白沫流线
    const r = this.radius;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = this.srcY0 + (this.srcY1 - this.srcY0) * t;
      const pulse = 0.5 + 0.5 * Math.sin(this.phase * 7 + i * 1.7);
      const len = r * (3 + 4 * pulse);
      const x0 = this.srcX - r;
      const wob = Math.sin(this.phase * 5 + i) * r * 0.6;
      g.moveTo(x0, y)
        .lineTo(x0 + len, y + wob)
        .stroke({ width: r * 1.1, color: WATER_RIPPLE, alpha: 0.1 + 0.2 * pulse, cap: 'round' });
    }
  }

  /**
   * 洪水渲染（卡通亮蓝水，参考 water-exam.gif）：粒子由 sim 物理驱动，遇石墙自然偏转，
   * 渲染层把偏转后的粒子画成连续蓝水体。三遍叠加：
   * ① 深蓝水边（宽圆，堆叠成水体外缘暗色）② 亮蓝水面（中圆）③ 白色流向波纹（速度对齐短线）。
   * 圆/线绘于地面像素坐标，经 groundLayer 等距矩阵投影 → 平铺在斜面河床上。
   */
  update(sim: SimState): void {
    const v = this.view;
    const g = this.particleGfx;
    const r = this.radius;
    g.clear();

    // ① 深蓝水边：大半径低透叠加 → 水体连成片，边缘偏深
    for (const p of sim.pool.particles) {
      if (!p.active) continue;
      g.circle(v.sx(p.x), v.sy(p.y), r * 2.6).fill({ color: WATER_EDGE, alpha: 0.1 });
    }
    // ② 亮蓝水面：中半径，盖在水边上 → 明亮卡通水色
    for (const p of sim.pool.particles) {
      if (!p.active) continue;
      g.circle(v.sx(p.x), v.sy(p.y), r * 1.6).fill({ color: WATER_BODY, alpha: 0.18 });
    }
    // ③ 白色波纹高光：仅较快粒子，沿速度方向短线 → 体现流向与绕石偏转
    for (const p of sim.pool.particles) {
      if (!p.active) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed < 0.25) continue;
      const ux = p.vx / speed;
      const uy = p.vy / speed;
      const hx = v.sx(p.x);
      const hy = v.sy(p.y);
      const len = Math.min(r * 5, r * 1.5 + speed * v.scale * 0.05);
      g.moveTo(hx - ux * len, hy - uy * len)
        .lineTo(hx, hy)
        .stroke({ width: r * 0.7, color: WATER_RIPPLE, alpha: 0.22, cap: 'round' });
    }
  }
}
