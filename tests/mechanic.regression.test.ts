import { describe, it, expect } from 'vitest';
import { createSim, stepSim, isFlooded, anyWallBroken } from '../src/sim/simulation';
import { FIXED_DT } from '../src/core/fixedLoop';
import {
  createBlockInstance,
  isHeadWall,
  collapseDelay,
  type BlockInstance,
} from '../src/blocks/blockInstance';
import { getBlockConfig } from '../src/blocks/blockConfig';
import { validatePlacement } from '../src/blocks/placement';
import { L1 } from '../src/levels/L1';

const wall = getBlockConfig('wall');

function w(x: number, y: number, rot: number, i: number): BlockInstance {
  return createBlockInstance(`w${i}`, 'wall', { x, y }, rot);
}

function runFull(blocks: BlockInstance[]) {
  const sim = createSim(L1, blocks);
  const steps = Math.ceil(L1.simDuration / FIXED_DT);
  for (let i = 0; i < steps && !sim.finished; i++) stepSim(sim, FIXED_DT);
  return sim;
}

function placeable(blocks: BlockInstance[]): boolean {
  const placed: BlockInstance[] = [];
  for (const b of blocks) {
    if (validatePlacement(L1, wall, b.pos, b.rotStep, placed) !== 'success') return false;
    placed.push(b);
  }
  return true;
}

// L1 失败判定 = 村庄被淹（唯一）。墙垮只是过程，最终由"水淹村庄"触发失败。
const FRUGAL_SOLUTION = [w(14.5, 7, 7, 0), w(14.5, 5, 7, 1)];

describe('L1 机制回归（检查点 C2）', () => {
  it('硬堵：横排筑墙 → 墙先被冲垮 → 决堤后村庄被淹（失败由洪水触发）', () => {
    const dam = [w(12, 3, 2, 0), w(12, 5, 2, 1), w(12, 7, 2, 2)];
    const sim = runFull(dam);
    expect(anyWallBroken(sim)).toBe(true); // 过程：墙撑不住先垮
    expect(isFlooded(sim)).toBe(true); // 结果：决堤后村庄被淹 = 失败
  });

  it('斜向导流：2 道斜墙导离主流 → 村庄存活 → 成功且节俭（即便斜墙晚期可能垮）', () => {
    expect(placeable(FRUGAL_SOLUTION)).toBe(true); // 合法可放置
    const sim = runFull(FRUGAL_SOLUTION);
    expect(isFlooded(sim)).toBe(false); // 村庄存活 = 成功（成功判定不变）
    expect(sim.villageHitCount).toBeLessThan(L1.village.floodThreshold);
    const cost = FRUGAL_SOLUTION.length * wall.cost;
    expect(cost).toBeLessThanOrEqual(L1.frugalMoney); // 节俭
  });

  it('什么都不做 → 直冲灌入村庄 → 失败', () => {
    const sim = runFull([]);
    expect(isFlooded(sim)).toBe(true);
  });

  it('挡水墙接触后快垮；导流墙(含45°/水平0°)接触后8-10s垮', () => {
    expect(isHeadWall(2)).toBe(true); // 横断 90° = 挡水墙
    expect(isHeadWall(7)).toBe(false); // 45° = 导流墙
    expect(isHeadWall(0)).toBe(false); // 0° 水平 = 导流墙
    expect(collapseDelay(2)).toBeLessThan(collapseDelay(7)); // 挡水墙垮得更快
    const d = collapseDelay(7);
    expect(d).toBeGreaterThanOrEqual(8);
    expect(d).toBeLessThanOrEqual(10); // 导流墙 8~10s
    expect(collapseDelay(0)).toBe(d); // 0° 与 45° 同为导流墙
    // 行为：横断挡水墙快速垮塌 → 决堤
    const head = runFull([w(12, 5, 2, 0), w(12, 7, 2, 1), w(12, 3, 2, 2)]);
    expect(anyWallBroken(head)).toBe(true);
    expect(isFlooded(head)).toBe(true);
  });
});
