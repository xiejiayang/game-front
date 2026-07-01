import { describe, it, expect } from 'vitest';
import { snapToGrid, validatePlacement } from '../src/blocks/placement';
import { getBlockConfig } from '../src/blocks/blockConfig';
import { createBlockInstance, localAxes } from '../src/blocks/blockInstance';
import { L1 } from '../src/levels/L1';

const wall = getBlockConfig('wall');

describe('placement', () => {
  it('吸附到 0.5m 网格', () => {
    expect(snapToGrid({ x: 1.2, y: 3.4 })).toEqual({ x: 1.0, y: 3.5 });
    expect(snapToGrid({ x: 1.24, y: 3.26 })).toEqual({ x: 1.0, y: 3.5 });
  });

  it('可放置区内合法', () => {
    const r = validatePlacement(L1, wall, { x: 10, y: 5 }, 0, []);
    expect(r).toBe('success');
  });

  it('河道外（岸上/越界）拒绝', () => {
    // y=1 在上岸之上、河道外
    expect(validatePlacement(L1, wall, { x: 10, y: 1 }, 0, [])).toBe('out_of_bounds');
    // y=9 在下岸之下
    expect(validatePlacement(L1, wall, { x: 10, y: 9 }, 0, [])).toBe('out_of_bounds');
  });

  it('河道内任意位置可放置（自由摆放）', () => {
    expect(validatePlacement(L1, wall, { x: 2, y: 5 }, 0, [])).toBe('success');
    expect(validatePlacement(L1, wall, { x: 24, y: 4 }, 0, [])).toBe('success');
  });

  it('与已放置构件重叠则拒绝', () => {
    const existing = createBlockInstance('a', 'wall', { x: 10, y: 5 }, 0);
    expect(validatePlacement(L1, wall, { x: 10.2, y: 5 }, 0, [existing])).toBe('overlapping');
  });

  it('远离已放置构件不重叠', () => {
    const existing = createBlockInstance('a', 'wall', { x: 7, y: 3 }, 0);
    expect(validatePlacement(L1, wall, { x: 13, y: 7 }, 0, [existing])).toBe('success');
  });

  it('忽略已损坏构件的重叠', () => {
    const broken = createBlockInstance('a', 'wall', { x: 10, y: 5 }, 0, 'broken');
    expect(validatePlacement(L1, wall, { x: 10, y: 5 }, 0, [broken])).toBe('success');
  });

  it('两斜墙沿短轴并排紧贴不误判重叠（以 OBB 黄框为判定面，非外接 AABB）', () => {
    // 斜放墙(rot1) OBB 细长；两墙沿其短轴方向偏移略大于 shortLen(0.6)，本体不接触。
    // 旧 AABB 判定会因外接框重叠而误拒；改用 SAT/OBB 后应可紧密放置。
    const { uy } = localAxes(1);
    const base = { x: 12, y: 5 };
    const gap = wall.shortLen + 0.2; // 沿短轴让开略大于短边 → OBB 不重叠
    const near = { x: base.x + uy.x * gap, y: base.y + uy.y * gap };
    const existing = createBlockInstance('a', 'wall', base, 1);
    expect(validatePlacement(L1, wall, near, 1, [existing])).toBe('success');
    // 而沿短轴仅让开半个短边（本体仍交叠）应判重叠，证明并非放宽为“永不重叠”
    const overlapPos = { x: base.x + uy.x * 0.2, y: base.y + uy.y * 0.2 };
    expect(validatePlacement(L1, wall, overlapPos, 1, [existing])).toBe('overlapping');
  });
});
