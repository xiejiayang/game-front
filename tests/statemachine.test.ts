import { describe, it, expect } from 'vitest';
import { GameSession } from '../src/core/gameStateMachine';
import { FIXED_DT } from '../src/core/fixedLoop';
import { L1 } from '../src/levels/L1';

function runToSettle(s: GameSession) {
  s.startSimulation();
  const steps = Math.ceil(L1.simDuration / FIXED_DT) + 5;
  for (let i = 0; i < steps && s.state === 'simulating'; i++) s.tick();
}

describe('GameSession 状态机', () => {
  it('放置扣库存与金钱', () => {
    const s = new GameSession(L1);
    expect(s.placeBlock('wall', { x: 10, y: 5 }, 7)).toBe('success');
    expect(s.getInventoryCount('wall')).toBe(L1.inventory.wall - 1);
    expect(s.wallet.currentMoney).toBe(L1.moneyLimit - 10);
  });

  it('删除返还库存与金钱', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 10, y: 5 }, 7);
    const id = s.placedBlocks[0].instanceId;
    expect(s.removeBlock(id)).toBe(true);
    expect(s.getInventoryCount('wall')).toBe(L1.inventory.wall);
    expect(s.wallet.currentMoney).toBe(L1.moneyLimit);
  });

  it('旋转 45° 步进', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 10, y: 5 }, 0);
    const inst = s.placedBlocks[0];
    expect(s.rotateBlock(inst.instanceId)).toBe(true);
    expect(inst.rotStep).toBe(1);
  });

  it('河道外（岸上）拒绝', () => {
    const s = new GameSession(L1);
    expect(s.placeBlock('wall', { x: 10, y: 1 }, 0)).toBe('out_of_bounds');
  });

  it('模拟态禁止编辑', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 10, y: 5 }, 7);
    s.startSimulation();
    expect(s.state).toBe('simulating');
    expect(s.placeBlock('wall', { x: 12, y: 5 }, 7)).toBe('invalid_state');
  });

  it('放水→模拟→结算，斜放解成功且节俭', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 14.5, y: 7 }, 7);
    s.placeBlock('wall', { x: 14.5, y: 5 }, 7);
    runToSettle(s);
    expect(s.state).toBe('settling');
    expect(s.result?.isSuccess).toBe(true);
    expect(s.result?.isFrugal).toBe(true);
  });

  it('硬堵 → 结算失败', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 12, y: 3 }, 2);
    s.placeBlock('wall', { x: 12, y: 5 }, 2);
    s.placeBlock('wall', { x: 12, y: 7 }, 2);
    runToSettle(s);
    expect(s.result?.isSuccess).toBe(false);
  });

  it('重试保留构件，重置清空', () => {
    const s = new GameSession(L1);
    s.placeBlock('wall', { x: 14.5, y: 7 }, 7);
    runToSettle(s);
    s.retry();
    expect(s.state).toBe('editing');
    expect(s.placedBlocks.length).toBe(1);
    s.reset();
    expect(s.placedBlocks.length).toBe(0);
    expect(s.wallet.currentMoney).toBe(L1.moneyLimit);
  });
});
