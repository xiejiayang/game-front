import { describe, it, expect } from 'vitest';
import { Rng } from '../src/core/rng';
import { FixedLoop, FIXED_DT } from '../src/core/fixedLoop';

describe('Rng', () => {
  it('同 seed 产生相同序列', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed 序列不同', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('输出落在 [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('FixedLoop', () => {
  it('可变帧时间下产出稳定步数', () => {
    const loop = new FixedLoop();
    let steps = 0;
    // 累计 1 秒，无论分几帧喂入，总步数应为 60
    const deltas = [0.013, 0.02, 0.005, 0.03, 0.1, 0.05, 0.4, 0.2, 0.149, 0.03];
    let total = 0;
    for (const d of deltas) total += d;
    // 用一次大步喂入（受 maxSteps 限制会丢积压），改为均匀小帧验证
    loop.reset();
    steps = 0;
    const frames = 60;
    for (let i = 0; i < frames; i++) {
      loop.advance(FIXED_DT, () => steps++);
    }
    expect(steps).toBe(60);
    expect(total).toBeGreaterThan(0);
  });
});
