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

/** 粗筛：AABB 明显不相交时直接跳过精确 SAT（性能优化，不改变判定结果）。 */
function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.minx < b.maxx && a.maxx > b.minx && a.miny < b.maxy && a.maxy > b.miny;
}

/** 一组角点在某轴上的投影区间。 */
function projectRange(corners: Vec2[], ax: number, ay: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const p = c.x * ax + c.y * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

/**
 * 两个**旋转矩形(OBB)**是否真实重叠——分离轴定理(SAT)。
 * 以点击石墙时显示的黄框（构件真实 OBB）为判定面，而非其外接 AABB：斜放细长墙的 AABB
 * 远大于本体，会把「视觉未接触」的两墙误判为重叠。改用 SAT → 石墙可紧密贴放（含斜放）。
 * 轴取两矩形各自的长/短轴法向共 4 条；任一轴上投影出现间隙即判不重叠。边缘恰好相接（间隙=0）
 * 视为不重叠，允许紧贴。
 */
function obbOverlap(aCorners: Vec2[], aAxes: { ux: Vec2; uy: Vec2 }, bCorners: Vec2[], bAxes: { ux: Vec2; uy: Vec2 }): boolean {
  const axes = [aAxes.ux, aAxes.uy, bAxes.ux, bAxes.uy];
  for (const ax of axes) {
    const ra = projectRange(aCorners, ax.x, ax.y);
    const rb = projectRange(bCorners, ax.x, ax.y);
    if (ra.max <= rb.min || rb.max <= ra.min) return false; // 该轴有间隙 → 分离
  }
  return true;
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

  const myCorners = blockCorners(cfg, pos, rotStep);
  const myAabb = aabbOf(myCorners);
  const myAxes = localAxes(rotStep);
  for (const o of others) {
    if (o.instanceId === ignoreInstanceId) continue;
    if (o.state === 'broken') continue;
    const oCfg = cfg.blockId === o.blockId ? cfg : undefined;
    // 同关只有石墙，简化：用同一 cfg 尺寸近似（多构件时应按各自 cfg）
    const otherCfg = oCfg ?? cfg;
    const oCorners = blockCorners(otherCfg, o.pos, o.rotStep);
    // 先 AABB 粗筛（廉价），明显分离直接跳过；相交再用 OBB(SAT) 精确判定 → 以黄框为判定面
    if (!aabbOverlap(myAabb, aabbOf(oCorners))) continue;
    if (obbOverlap(myCorners, myAxes, oCorners, localAxes(o.rotStep))) return 'overlapping';
  }
  return 'success';
}
