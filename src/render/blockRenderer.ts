import { Container, Graphics, Sprite } from 'pixi.js';
import type { BlockInstance } from '../blocks/blockInstance';
import { rotAngle } from '../blocks/blockInstance';
import { getBlockConfig } from '../blocks/blockConfig';
import type { WorldView } from './worldView';
import type { Stage } from './stage';
import type { GameTextures } from './assets';

const TINT_PLACED = 0xffffff;
const TINT_COLLAPSING = 0xe79a86; // 受冲泛红
const TINT_BROKEN = 0x8c7d70; // 垮塌暗化

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

/** 已放置构件渲染：石墙水墨贴图（multiply 消隐纸底）+ 选中金描边 + 状态着色 + 倒塌碎屑。 */
export class BlockRenderer {
  private readonly layer = new Container();
  private readonly debrisGfx = new Graphics();
  private readonly nodes = new Map<string, BlockNode>();
  private debris: Debris[] = [];

  constructor(
    stage: Stage,
    private readonly view: WorldView,
    private readonly tex: GameTextures,
  ) {
    stage.blockLayer.addChild(this.layer, this.debrisGfx);
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
    const sprite = new Sprite(this.tex.stoneWall);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'multiply';
    root.addChild(outline, sprite);
    this.layer.addChild(root);
    return { root, sprite, outline, wasBroken: false };
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
    const w = cfg.longLen * v.scale;
    const h = cfg.shortLen * v.scale;
    const { sprite, outline } = node;

    sprite.width = w;
    sprite.height = h;
    const broken = b.state === 'broken';
    if (broken && !node.wasBroken) {
      this.spawnDebris(v.sx(b.pos.x), v.sy(b.pos.y), w); // 刚垮 → 迸碎屑
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
        .roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, Math.min(h / 2, 6))
        .stroke({ width: 3, color: 0xd9a441, alpha: 0.95 });
    }

    node.root.position.set(v.sx(b.pos.x), v.sy(b.pos.y));
    node.root.rotation = rotAngle(b.rotStep);
  }
}
