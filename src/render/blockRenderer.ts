import { Container, Graphics, Sprite } from 'pixi.js';
import type { BlockInstance } from '../blocks/blockInstance';
import { worldAngle } from '../blocks/blockInstance';
import { getBlockConfig } from '../blocks/blockConfig';
import type { WorldView } from './worldView';
import type { Stage } from './stage';
import type { GameTextures } from './assets';

const TINT_PLACED = 0xffffff;
const TINT_COLLAPSING = 0xe79a86; // 受冲泛红
const TINT_BROKEN = 0x8c7d70; // 垮塌暗化
const SIZE_MUL = 1.12; // 立体石墙比 OBB 足迹略放大，露出墙顶+正面、读出体量

interface BlockNode {
  root: Container;
  sprite: Sprite;
  outline: Graphics;
  wasBroken: boolean;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number; // 1→0
}

/**
 * 已放置石墙渲染：**直立广告牌**（screen-aligned），不挂在会被等距矩阵斜切的地面层
 * （否则立体贴图会被二次压平）。改挂屏幕对齐层，用 view.project() 定位、按该旋转档位
 * 长轴的「投影屏幕角」(全角，8 档各不同)旋转贴图 → 立体卵石堰精确贴合河道走向。贴图为 4 张
 * 已抠透明、长轴转正、统一尺寸的立体卵石堰，按 rotStep % 4 选一张。另含选中金描边 + 状态着色 + 倒塌碎屑。
 */
export class BlockRenderer {
  private readonly layer = new Container();
  private readonly debrisGfx = new Graphics();
  private readonly nodes = new Map<string, BlockNode>();
  private debris: Debris[] = [];
  /** 统一尺寸基准：每世界单位的投影屏幕长度，取 rot2(横跨河道,a=90°)朝向之值。
   *  各档不用自己的投影长度（会随角度 0.5~1.3 倍变化、墙忽大忽小），统一用此基准 →
   *  8 档屏幕尺寸一致。非写死像素：由矩阵 +y 基向量(c,d)×scale 算出，scale/视口变化自适应。 */
  private readonly refPxPerUnit: number;

  constructor(
    stage: Stage,
    private readonly view: WorldView,
    private readonly tex: GameTextures,
  ) {
    // 置于地面层（水/洪水）之上、uiLayer(HUD/村屋) 之下：石墙立在水面上、不挡 HUD。
    stage.root.addChildAt(this.layer, stage.root.getChildIndex(stage.uiLayer));
    this.layer.addChild(this.debrisGfx);
    this.refPxPerUnit = view.scale * Math.hypot(view.matrix.c, view.matrix.d);
  }

  sync(blocks: BlockInstance[], selectedId: string | null = null): void {
    const seen = new Set<string>();
    for (const b of blocks) {
      seen.add(b.instanceId);
      let node = this.nodes.get(b.instanceId);
      if (!node) {
        node = this.createNode();
        this.nodes.set(b.instanceId, node);
      }
      this.draw(node, b, b.instanceId === selectedId);
    }
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.root.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
  }

  private createNode(): BlockNode {
    const root = new Container();
    const outline = new Graphics();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0.58); // 锚点略偏下 → 墙基坐在投影点、墙体向上立起
    root.addChild(outline, sprite);
    this.layer.addChildAt(root, 0); // 在碎屑层之下
    return { root, sprite, outline, wasBroken: false };
  }

  /** 某旋转档位下，石墙长轴的投影屏幕角（弧度）。 */
  private orientAngle(rotStep: number): number {
    const m = this.view.matrix;
    const a = worldAngle(rotStep); // 世界朝向（已由屏幕均匀角反投影而来）
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = m.a * ca + m.c * sa; // 长轴方向投影向量（地面基，未含 scale）
    const dy = m.b * ca + m.d * sa;
    // worldAngle 的构造保证：投影回屏幕恰为 θ0 + rotStep×45° → 8 档屏幕上均匀转 45°（以河道为基准）。
    // 与 OBB/碰撞共用同一世界角 → 放水时水正好挡在画出来的墙上。相差 180° 的档贴图上下翻转（已确认接受）。
    return Math.atan2(dy, dx);
  }

  private spawnDebris(cx: number, cy: number, w: number): void {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      this.debris.push({
        x: cx + (Math.random() - 0.5) * w,
        y: cy + (Math.random() - 0.5) * w * 0.3,
        vx: Math.cos(a) * sp + 40, // 偏下游
        vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 4,
        life: 1,
      });
    }
  }

  /** 推进倒塌碎屑动效（渲染层，与 sim 无关）。 */
  animate(dtMs: number): void {
    const dt = dtMs / 1000;
    const g = this.debrisGfx;
    g.clear();
    for (const d of this.debris) {
      d.life -= dt / 0.9;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 140 * dt; // 重力
      if (d.life > 0) {
        g.circle(d.x, d.y, d.r).fill({ color: 0x4a3a2e, alpha: 0.7 * d.life });
      }
    }
    this.debris = this.debris.filter((d) => d.life > 0);
  }

  private draw(node: BlockNode, b: BlockInstance, selected: boolean): void {
    const cfg = getBlockConfig(b.blockId);
    const v = this.view;
    const { sprite, outline } = node;

    // 选贴图：4 个朝向各一张（rotStep 0~3 对应 0/1/2/3，4~7 复用对面那张）。
    const variant = this.tex.stoneWalls[b.rotStep % this.tex.stoneWalls.length];
    if (sprite.texture !== variant) sprite.texture = variant;

    const angle = this.orientAngle(b.rotStep);
    // 尺寸用统一基准 refPxPerUnit（不随角度变）→ 8 档屏幕大小一致；角度只影响朝向、不影响尺寸。
    const w = cfg.longLen * this.refPxPerUnit * SIZE_MUL; // 屏幕上的墙长（恒定）
    const h = (w * sprite.texture.height) / sprite.texture.width; // 按贴图比例定高
    sprite.width = w;
    sprite.height = h;

    const broken = b.state === 'broken';
    const p = v.project(b.pos.x, b.pos.y);
    if (broken && !node.wasBroken) {
      this.spawnDebris(p.x, p.y, w); // 刚垮 → 迸碎屑
    }
    node.wasBroken = broken;
    if (broken) {
      sprite.tint = TINT_BROKEN;
      sprite.alpha = 0.5;
    } else if (b.damage === 'collapsing') {
      sprite.tint = TINT_COLLAPSING;
      sprite.alpha = 1;
    } else {
      sprite.tint = TINT_PLACED;
      sprite.alpha = 1;
    }

    outline.clear();
    if (selected && b.state !== 'broken') {
      outline
        .roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6)
        .stroke({ width: 3, color: 0xd9a441, alpha: 0.95 });
    }

    node.root.position.set(p.x, p.y);
    node.root.rotation = angle;
  }
}
