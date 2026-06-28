import { describe, it, expect } from 'vitest';
import { createSim, stepSim } from '../src/sim/simulation';
import { FIXED_DT } from '../src/core/fixedLoop';
import { L1 } from '../src/levels/L1';

/** 跑 n 步，返回村庄受击数 + 活跃粒子位置快照（用于逐位比对）。 */
function runAndSnapshot(steps: number) {
  const sim = createSim(L1);
  for (let i = 0; i < steps; i++) stepSim(sim, FIXED_DT);
  const positions: number[] = [];
  for (const p of sim.pool.particles) {
    if (p.active) positions.push(p.x, p.y, p.vx, p.vy);
  }
  return { hits: sim.villageHitCount, active: sim.pool.activeCount, positions };
}

describe('水流模拟 — 确定性（检查点 C1）', () => {
  it('同种子同布局，两次运行结果逐位完全一致', () => {
    const a = runAndSnapshot(400);
    const b = runAndSnapshot(400);
    expect(b.hits).toBe(a.hits);
    expect(b.active).toBe(a.active);
    expect(b.positions).toEqual(a.positions);
  });

  it('跑满全程后村庄受击数完全可复现', () => {
    const total = Math.ceil(L1.simDuration / FIXED_DT);
    const a = runAndSnapshot(total);
    const b = runAndSnapshot(total);
    expect(b.hits).toBe(a.hits);
  });
});
