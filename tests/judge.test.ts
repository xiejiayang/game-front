import { describe, it, expect } from 'vitest';
import { judge } from '../src/judge/puzzleJudge';
import { L1 } from '../src/levels/L1';

const base = { level: L1, villageHitCount: 0, simTime: 18 };

describe('puzzleJudge', () => {
  it('村庄存活 + 节俭消耗 → 成功且节俭', () => {
    const r = judge({ ...base, flooded: false, anyWallBroken: false, consumedMoney: 20 });
    expect(r.isSuccess).toBe(true);
    expect(r.isFrugal).toBe(true);
    expect(r.failReason).toBeNull();
  });

  it('村庄存活但消耗超节俭阈值 → 成功不节俭', () => {
    const r = judge({ ...base, flooded: false, anyWallBroken: false, consumedMoney: 40 });
    expect(r.isSuccess).toBe(true);
    expect(r.isFrugal).toBe(false);
  });

  it('被淹 + 曾有墙垮 → 失败「墙倒了」', () => {
    const r = judge({ ...base, flooded: true, anyWallBroken: true, consumedMoney: 30 });
    expect(r.isSuccess).toBe(false);
    expect(r.failReason).toBe('wall_broken');
    expect(r.isFrugal).toBe(false);
  });

  it('被淹 + 无墙垮 → 失败「村子仍被淹」', () => {
    const r = judge({ ...base, flooded: true, anyWallBroken: false, consumedMoney: 0 });
    expect(r.isSuccess).toBe(false);
    expect(r.failReason).toBe('flood');
  });
});
