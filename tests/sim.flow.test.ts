import { describe, it, expect } from 'vitest';
import { createSim, stepSim } from '../src/sim/simulation';
import { FIXED_DT } from '../src/core/fixedLoop';
import { L1 } from '../src/levels/L1';

function runSteps(sim: ReturnType<typeof createSim>, n: number, onStep?: () => void) {
  for (let i = 0; i < n; i++) {
    stepSim(sim, FIXED_DT);
    onStep?.();
  }
}

describe('水流模拟 — 基础流动', () => {
  it('粒子从左流入，活跃粒子始终被约束在河道内（缺口处放行）', () => {
    const sim = createSim(L1);
    const ch = L1.channel;
    runSteps(sim, 300, () => {
      for (const p of sim.pool.particles) {
        if (!p.active) continue;
        expect(p.x).toBeGreaterThanOrEqual(ch.x0 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(ch.x1 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(ch.y0 - 1e-6);
        // 下界：要么在河道内，要么正穿过缺口流向村庄
        const inGapColumn = p.x >= L1.gap.x0 && p.x <= L1.gap.x1;
        expect(p.y).toBeLessThanOrEqual(inGapColumn ? L1.village.area.y1 + 1e-6 : ch.y1 + 1e-6);
      }
    });
  });

  it('有粒子被发射并在流动', () => {
    const sim = createSim(L1);
    runSteps(sim, 120);
    expect(sim.pool.activeCount).toBeGreaterThan(0);
  });

  it('无任何构件时，直冲水流会灌入村庄（教学基线：不作为=淹）', () => {
    const sim = createSim(L1);
    const totalSteps = Math.ceil(L1.simDuration / FIXED_DT);
    runSteps(sim, totalSteps);
    expect(sim.finished).toBe(true);
    expect(sim.villageHitCount).toBeGreaterThanOrEqual(L1.village.floodThreshold);
  });
});
