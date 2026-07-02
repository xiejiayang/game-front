import {
  Container,
  Filter,
  GlProgram,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  UniformGroup,
  defaultFilterVert,
} from 'pixi.js';
import type { Particle } from '../sim/particlePool';
import type { WorldView } from './worldView';
import type { Stage } from './stage';
import type { LevelConfig } from '../levels/levelTypes';
import type { WallRect } from './blockRenderer';

/* global document */

// 迎水面加深：深蓝色 + 水压→透明度归一化参考值 + 透明度上限。
const DEEPEN_COLOR = 0x0f3357;
const DEEPEN_REF = 120; // pressure/此值 = 透明度（经验值，可调）
const DEEPEN_MAX = 0.5;

/**
 * 写实流体水面（metaball 密度场融合）。
 *
 * 问题：把每颗水粒子单独画成圆点/短线，粒子一稀疏就成了「一条条分离的蓝条」，不像整片水。
 * 方案：① 每颗粒子投影到屏幕，画成柔和径向光斑、**叠加**累积到一张离屏密度图(RenderTexture)；
 *       ② 一个阈值滤镜：密度过阈处显示为水、以下透明——相邻光斑密度相加越过阈值 → **自动融成一整片**、
 *          边缘有机连续（经典 metaball）；③ 滤镜内叠加流纹(滚动噪声)着色 + 边缘白沫 → 写实蓝水。
 *
 * 纯渲染，无 sim 依赖：粒子位置仍由确定性物理(遇石墙反弹改向)驱动，这里只把它们「显示成整片水」。
 */

// 柔和径向光斑贴图（白心 → 透明边，近高斯衰减）：叠加后可在粒子间形成 metaball 融合。
function makeBlobTexture(size = 128): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return Texture.WHITE;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(cv);
}

// 片段着色器：密度图 → 阈值融合 → 写实蓝水（深浅蓝 + 流纹 + 边缘白沫）。
// 复用 Pixi 默认顶点着色器(defaultFilterVert) 提供的 vTextureCoord / uTexture / uInputSize。
const FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;      // 输入：密度图（本滤镜作用于展示密度图的全屏精灵）
uniform highp vec4 uInputSize;
uniform sampler2D uFlowTex;      // 流纹/噪声贴图（横向可平铺）
uniform float uTime;
uniform float uThreshold;
uniform vec2 uFlowDir;           // 河流 +x 在屏幕上的方向（单位向量）

void main() {
    float d = texture(uTexture, vTextureCoord).a;      // 累积密度
    float edgeW = 0.06;
    float mask = smoothstep(uThreshold - edgeW, uThreshold + edgeW, d);
    if (mask <= 0.001) { finalColor = vec4(0.0); return; }

    vec3 EDGE = vec3(0.247, 0.525, 0.839);             // 0x3f86d6 深蓝水边
    vec3 BODY = vec3(0.623, 0.816, 0.960);             // 0x9fd0f5 亮蓝水面
    float depth = smoothstep(uThreshold, uThreshold + 0.40, d); // 0=边缘 1=深水
    vec3 col = mix(EDGE, BODY, depth);

    // 流纹：沿河流方向滚动采样噪声 → 明暗流线（写实流动感）
    vec2 fuv = vTextureCoord * 3.0 - uFlowDir * uTime * 0.06;
    float flow = texture(uFlowTex, fuv).r;
    col += (flow - 0.5) * 0.14;

    // 边缘白沫：水体外缘(低 depth 的一圈)被噪声打碎成白沫；水绕石墙时边缘增多 → 遇墙溅沫
    float rim = (1.0 - depth) * mask;
    float noise = texture(uFlowTex, fuv * 1.9 + 0.37).r;
    float foam = rim * smoothstep(0.45, 0.92, noise);
    col = mix(col, vec3(1.0), foam * 0.6);

    float a = mask * 0.88;                              // 略透，隐约透出河床
    finalColor = vec4(col * a, a);                     // 预乘 alpha
}
`;

export class FluidSurface {
  private readonly layer = new Container();
  private readonly blobs = new Container();
  private readonly sprites: Sprite[] = [];
  /** 石墙"抠缝"层：在密度图上按未垮墙的 OBB 用 erase 混合清零 → metaball 无法跨墙愈合。 */
  private readonly cuts = new Container();
  private readonly cutGfx = new Graphics();
  /** 迎水面加深层：沿撞击面画深蓝带，透明度随水压动态增强（置于水面之上、石墙之下）。 */
  private readonly deepenGfx = new Graphics();
  private readonly rt: RenderTexture;
  private readonly surface: Sprite;
  private readonly uniforms: UniformGroup;
  private readonly blobTex: Texture;
  private time = 0;
  private readonly flowSx: number;
  private readonly flowSy: number;

  constructor(
    private readonly stage: Stage,
    view: WorldView,
    capacity: number,
    flowTex: Texture,
    level: LevelConfig,
  ) {
    const w = stage.width;
    const h = stage.height;
    const resolution = stage.app.renderer.resolution;
    this.rt = RenderTexture.create({ width: w, height: h, resolution });
    this.blobTex = makeBlobTexture();

    // 光斑半径取略大于粒子平均间距 → 相邻粒子密度叠加越过阈值、融成整片（不是一颗颗圆点）。
    const blobDiameter = 2.1 * view.scale;
    for (let i = 0; i < capacity; i++) {
      const s = new Sprite(this.blobTex);
      s.anchor.set(0.5);
      s.width = s.height = blobDiameter;
      s.blendMode = 'add'; // 叠加累积密度
      s.visible = false;
      this.blobs.addChild(s);
      this.sprites.push(s);
    }

    // 抠缝层：white 多边形 + erase 混合 → 渲染到密度 RT 时把该处 alpha 清零。
    this.cutGfx.blendMode = 'erase';
    this.cuts.addChild(this.cutGfx);

    // 河流 +x 在屏幕上的方向（供流纹滚动 + 尾流射流初速方向）
    const o = view.project(0, 0);
    const fx = view.project(1, 0);
    const ddx = fx.x - o.x;
    const ddy = fx.y - o.y;
    const dlen = Math.hypot(ddx, ddy) || 1;
    this.flowSx = ddx / dlen;
    this.flowSy = ddy / dlen;

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uThreshold: { value: 0.32, type: 'f32' },
      uFlowDir: { value: new Float32Array([ddx / dlen, ddy / dlen]), type: 'vec2<f32>' },
    });

    const filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: FRAG, name: 'fluid-water' }),
      resources: {
        waterUniforms: this.uniforms,
        uFlowTex: flowTex.source,
        uFlowSampler: flowTex.source.style,
      },
    });

    this.surface = new Sprite(this.rt);
    this.surface.filters = [filter];
    this.surface.eventMode = 'none';

    // —— 河道遮罩：水面只显示在河道平行四边形内（含村庄缺口延伸），防止软光斑溢出河岸 ——
    // 向外扩展 mask，补偿 metaball 阈值/软边导致的可见水体收缩，使水实际贴合到河岸。
    const ch = level.channel;
    const gap = level.gap;
    const expand = 1.7; // 世界米：让阈值后的水体边缘到达真实河岸（约半光斑半径）
    const gapExtend = (ch.y1 - ch.y0) * 3; // 缺口向下延伸，让流出缺口的水不被裁掉
    const maskPts = [
      view.project(ch.x0 - expand, ch.y0 ),
      view.project(ch.x1 + expand * 2.5, ch.y0 - expand),
      view.project(ch.x1 + expand * 2.5, ch.y1 + expand),
      view.project(gap.x1, ch.y1 + expand),
      view.project(gap.x1, ch.y1 + gapExtend),
      view.project(gap.x0, ch.y1 + gapExtend),
      view.project(gap.x0, ch.y1 + expand),
      view.project(ch.x0 - expand, ch.y1 + expand),
    ];
    const mask = new Graphics();
    mask.moveTo(maskPts[0].x, maskPts[0].y);
    for (let i = 1; i < maskPts.length; i++) mask.lineTo(maskPts[i].x, maskPts[i].y);
    mask.fill({ color: 0xffffff });
    this.surface.mask = mask;

    this.layer.eventMode = 'none';
    this.layer.addChild(this.surface);
    this.deepenGfx.eventMode = 'none';
    this.layer.addChild(this.deepenGfx); // 水面之上、石墙之下
    // 置于地面层(河床)之上、石墙/UI 之下 → 水铺在河床上、石墙从水里立出来。
    stage.root.addChildAt(this.layer, stage.root.getChildIndex(stage.groundLayer) + 1);

    this.clear();
  }

  /** 用当前粒子位置刷新密度图（每帧，放水中调用）。walls 为各石墙的屏幕矩形，用于在密度图上抠出墙缝。 */
  update(particles: Particle[], view: WorldView, walls: WallRect[] = []): void {
    let n = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const s = this.sprites[i];
      if (!s) break;
      if (p.active) {
        const pt = view.project(p.x, p.y);
        s.position.set(pt.x, pt.y);
        s.visible = true;
        n++;
      } else {
        s.visible = false;
      }
    }
    this.stage.app.renderer.render({ container: this.blobs, target: this.rt, clear: true });
    // 石墙抠缝：只抠墙身矩形（让粒子真实物理决定哪里干、哪里湿）。
    // 不再人工抠大尾流扇形——物理抛物线射流会在墙背自然形成干区，避免 p5 那种孤立水滴。
    const g = this.cutGfx;
    g.clear();
    for (const r of walls) {
      const c = Math.cos(r.angle);
      const s = Math.sin(r.angle);
      const ux = c * r.hw;
      const uy = s * r.hw;
      const vx = -s * r.hh;
      const vy = c * r.hh;
      this.fillPoly(g, [
        [r.cx + ux + vx, r.cy + uy + vy],
        [r.cx - ux + vx, r.cy - uy + vy],
        [r.cx - ux - vx, r.cy - uy - vy],
        [r.cx + ux - vx, r.cy + uy - vy],
      ]);
    }
    if (walls.length > 0) {
      this.stage.app.renderer.render({ container: this.cuts, target: this.rt, clear: false });
    }

    // 迎水面动态加深：非平行墙的上游面画深蓝带，透明度随本帧水压增强（越堵越深）。
    const dg = this.deepenGfx;
    dg.clear();
    for (const r of walls) {
      if (r.rotStep % 4 === 0) continue; // 平行墙无撞击面
      const a = Math.min(DEEPEN_MAX, r.pressure / DEEPEN_REF);
      if (a < 0.02) continue;
      const c = Math.cos(r.angle);
      const s = Math.sin(r.angle);
      const Sx = -s;
      const Sy = c; // 短轴屏幕方向
      const sSign = Sx * this.flowSx + Sy * this.flowSy > 0 ? -1 : 1; // 指向上游(迎水)侧
      const bw = r.hh * 2.2; // 带宽（向上游延伸入水体）
      const inX = Sx * sSign * r.hh;
      const inY = Sy * sSign * r.hh;
      const outX = Sx * sSign * (r.hh + bw);
      const outY = Sy * sSign * (r.hh + bw);
      const lx = c * r.hw;
      const ly = s * r.hw;
      dg.moveTo(r.cx + lx + inX, r.cy + ly + inY);
      dg.lineTo(r.cx - lx + inX, r.cy - ly + inY);
      dg.lineTo(r.cx - lx + outX, r.cy - ly + outY);
      dg.lineTo(r.cx + lx + outX, r.cy + ly + outY);
      dg.fill({ color: DEEPEN_COLOR, alpha: a });
    }

    this.surface.visible = n > 0;
  }

  /** 在抠缝层画一个填充多边形（erase 混合 → 清零密度）。 */
  private fillPoly(g: Graphics, pts: [number, number][]): void {
    if (pts.length < 3) return;
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.fill({ color: 0xffffff });
  }

  /** 推进流纹时间（每帧）。 */
  animate(dtMs: number): void {
    this.time += dtMs / 1000;
    this.uniforms.uniforms.uTime = this.time;
  }

  /** 清空水面（回到编辑态/重试时）。 */
  clear(): void {
    for (const s of this.sprites) s.visible = false;
    this.stage.app.renderer.render({ container: this.blobs, target: this.rt, clear: true });
    this.deepenGfx.clear();
    this.surface.visible = false;
  }
}
