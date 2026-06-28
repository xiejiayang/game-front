import type { Vec2 } from '../core/vec2';
import type { BlockConfig } from './blockConfig';

export type BlockState = 'preview' | 'placed' | 'broken';
export type DamageState = 'stable' | 'collapsing' | 'collapsed';

/**
 * 旋转步进：8 步 × 45°。
 * 注意：原策划为 90°（rotStep 0~3）；为支持 L1「斜向导流」机制（需 45° 斜放），
 * 此处加密为 45° 步进（rotStep 0~7）。属对原策划的有意偏离。
 */
export const ROT_STEPS = 8;
export const ROT_UNIT = Math.PI / 4;

export interface BlockInstance {
  instanceId: string;
  blockId: string;
  pos: Vec2;
  rotStep: number; // 0~7
  state: BlockState;
  damage: DamageState;
  contactTime: number; // 累计被洪水接触的时间（秒）
  pressure: number; // 本帧累计水势（每帧清零），损坏渲染等用
  hits: number; // 本帧进入包围盒的粒子数（每帧清零），>0 视为被接触
}

export function rotAngle(rotStep: number): number {
  return (((rotStep % ROT_STEPS) + ROT_STEPS) % ROT_STEPS) * ROT_UNIT;
}

/** 长轴(ux)/短轴(uy)单位向量。 */
export function localAxes(rotStep: number): { ux: Vec2; uy: Vec2 } {
  const a = rotAngle(rotStep);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { ux: { x: c, y: s }, uy: { x: -s, y: c } };
}

export function createBlockInstance(
  instanceId: string,
  blockId: string,
  pos: Vec2,
  rotStep: number,
  state: BlockState = 'placed',
): BlockInstance {
  return {
    instanceId,
    blockId,
    pos: { x: pos.x, y: pos.y },
    rotStep: ((rotStep % ROT_STEPS) + ROT_STEPS) % ROT_STEPS,
    state,
    damage: 'stable',
    contactTime: 0,
    pressure: 0,
    hits: 0,
  };
}

// 挡水墙判据：宽面对流向的对齐度 ≥ 此值算"横断挡水墙"，否则算"导流墙"。
// 0.85 ≈ 偏离垂直流向 < 32°；45°斜放(0.707)、0°水平(0) 都算导流墙。
const HEAD_ALIGN = 0.85;
// 接触后倒塌时间（秒）：挡水墙快垮，导流墙 8~10s 内垮（含 45°/0° 等一切非横断墙）。
const HEAD_COLLAPSE_S = 3.5;
const DIVERSION_COLLAPSE_S = 9;

/**
 * 构件宽面相对主流向(+x)的对齐度 |sin(angle)|。
 * 横断河道(90°)=1；斜放(45°)=0.707；顺流(0°)=0。
 * 注：L1 主流为横向 +x，此处按此假设；多流向关卡需改为传入 flowDir。
 */
export function flowAlignment(rotStep: number): number {
  return Math.abs(Math.sin(rotAngle(rotStep)));
}

/** 是否为横断挡水墙（否则为导流墙）。 */
export function isHeadWall(rotStep: number): boolean {
  return flowAlignment(rotStep) >= HEAD_ALIGN;
}

/** 接触后的倒塌耗时（秒）。挡水墙快，导流墙 8~10s。 */
export function collapseDelay(rotStep: number): number {
  return isHeadWall(rotStep) ? HEAD_COLLAPSE_S : DIVERSION_COLLAPSE_S;
}

/**
 * 倒塌推进（接触计时模型）。
 * 墙一旦被洪水粒子进入包围盒(hits>0)即累计 contactTime（几何接触，与水势大小无关，
 * 故水平墙/被挡住的坝也能稳定计时）；累计达到 collapseDelay 即垮：
 * 挡水墙 ~3.5s 快垮，导流墙 ~9s（接触后8-10s内，含 45°/0°）。
 */
export function updateBlockDamage(block: BlockInstance, _cfg: BlockConfig, dt: number): void {
  if (block.state !== 'placed') return;

  // 首次被接触即闩锁，之后连续计时（水一旦冲到墙，结构便持续受损，不要求持续接触）
  if (block.hits > 0 || block.contactTime > 0) {
    block.contactTime += dt;
    block.damage = 'collapsing';
  }
  if (block.contactTime >= collapseDelay(block.rotStep)) {
    block.state = 'broken';
    block.damage = 'collapsed';
  }
}
