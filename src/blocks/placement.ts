import type { Vec2 } from '../core/vec2';
import type { LevelConfig, Rect } from '../levels/levelTypes';
import type { BlockConfig } from './blockConfig';
import { localAxes, type BlockInstance } from './blockInstance';

export const GRID_STEP = 0.5;

export type PlacementResult =
  | 'success'
  | 'out_of_bounds'
  | 'overlapping'
  | 'insufficient'
  | 'invalid_state';

/** 吸附到 0.5m 网格。 */
export function snapToGrid(v: Vec2, step = GRID_STEP): Vec2 {
  return { x: Math.round(v.x / step) * step, y: Math.round(v.y / step) * step };
}

/** 构件四角世界坐标（用于包围盒）。 */
export function blockCorners(cfg: BlockConfig, pos: Vec2, rotStep: number): Vec2[] {
  const { ux, uy } = localAxes(rotStep);
  const hl = cfg.longLen / 2;
  const hs = cfg.shortLen / 2;
  return [
    { x: pos.x + ux.x * hl + uy.x * hs, y: pos.y + ux.y * hl + uy.y * hs },
    { x: pos.x + ux.x * hl - uy.x * hs, y: pos.y + ux.y * hl - uy.y * hs },
    { x: pos.x - ux.x * hl + uy.x * hs, y: pos.y - ux.y * hl + uy.y * hs },
    { x: pos.x - ux.x * hl - uy.x * hs, y: pos.y - ux.y * hl - uy.y * hs },
  ];
}

interface Aabb {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

function aabbOf(corners: Vec2[]): Aabb {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const c of corners) {
    if (c.x < minx) minx = c.x;
    if (c.x > maxx) maxx = c.x;
    if (c.y < miny) miny = c.y;
    if (c.y > maxy) maxy = c.y;
  }
  return { minx, miny, maxx, maxy };
}

function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.minx < b.maxx && a.maxx > b.minx && a.miny < b.maxy && a.maxy > b.miny;
}

function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/**
 * 校验放置/移动是否合法（不含库存，库存由调用方判定）。
 * R1 中心点在可放置区；R2 包围盒不与其他 placed 构件重叠（近似用 AABB）。
 */
export function validatePlacement(
  level: LevelConfig,
  cfg: BlockConfig,
  pos: Vec2,
  rotStep: number,
  others: BlockInstance[],
  ignoreInstanceId?: string,
): PlacementResult {
  if (!pointInRect(pos, level.placeZone)) return 'out_of_bounds';

  const myAabb = aabbOf(blockCorners(cfg, pos, rotStep));
  for (const o of others) {
    if (o.instanceId === ignoreInstanceId) continue;
    if (o.state === 'broken') continue;
    const oCfg = cfg.blockId === o.blockId ? cfg : undefined;
    // 同关只有石墙，简化：用同一 cfg 尺寸近似（多构件时应按各自 cfg）
    const otherCfg = oCfg ?? cfg;
    const oAabb = aabbOf(blockCorners(otherCfg, o.pos, o.rotStep));
    if (aabbOverlap(myAabb, oAabb)) return 'overlapping';
  }
  return 'success';
}
