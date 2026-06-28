import { describe, it, expect } from 'vitest';
import { createWallet, canAfford, consume, refund, actualCost, isFrugal } from '../src/economy/wallet';

describe('wallet', () => {
  it('初始化为上限', () => {
    const w = createWallet(50);
    expect(w.currentMoney).toBe(50);
    expect(actualCost(w)).toBe(0);
  });

  it('放置扣费、删除返还、不超上限', () => {
    const w = createWallet(50);
    expect(consume(w, 10)).toBe(true);
    expect(w.currentMoney).toBe(40);
    expect(actualCost(w)).toBe(10);
    refund(w, 10);
    expect(w.currentMoney).toBe(50);
    refund(w, 10); // 不超上限
    expect(w.currentMoney).toBe(50);
  });

  it('金钱不足拒绝放置', () => {
    const w = createWallet(15);
    consume(w, 10);
    expect(canAfford(w, 10)).toBe(false);
    expect(consume(w, 10)).toBe(false);
    expect(w.currentMoney).toBe(5);
  });

  it('节俭判定', () => {
    expect(isFrugal(20, 20)).toBe(true);
    expect(isFrugal(30, 20)).toBe(false);
  });
});
