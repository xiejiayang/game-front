import { describe, it, expect } from 'vitest';
import { resolveBlockCollision } from '../src/sim/collision';
import { getBlockConfig } from '../src/blocks/blockConfig';
import { createBlockInstance } from '../src/blocks/blockInstance';
import type { Particle } from '../src/sim/particlePool';

const wall = getBlockConfig('wall');

function particleAt(x: number, y: number, vx: number, vy: number): Particle {
  return { x, y, vx, vy, life: 1, ink: 0, active: true };
}

describe('构件碰撞 — 法向水势', () => {
  it('正撞（长轴横断河道）比斜掠累计更高水势', () => {
    // 正撞：rotStep=2（长轴沿 y，宽面法向沿 x），水 +x 迎面撞
    const headOn = createBlockInstance('h', 'wall', { x: 0, y: 0 }, 2);
    const pHead = particleAt(-0.2, 0, 5, 0);
    resolveBlockCollision(pHead, headOn, wall);

    // 斜掠：rotStep=1（45°），同样水 +x
    const oblique = createBlockInstance('o', 'wall', { x: 0, y: 0 }, 1);
    const pObl = particleAt(-0.2, 0, 5, 0);
    resolveBlockCollision(pObl, oblique, wall);

    expect(headOn.pressure).toBeGreaterThan(0);
    expect(oblique.pressure).toBeGreaterThan(0);
    expect(headOn.pressure).toBeGreaterThan(oblique.pressure);
  });

  it('斜放把水流向侧向偏导（产生横向速度）', () => {
    const oblique = createBlockInstance('o', 'wall', { x: 0, y: 0 }, 7); // "/" 抬升
    const p = particleAt(-0.2, 0.1, 5, 0);
    resolveBlockCollision(p, oblique, wall);
    // 偏导后应获得纵向速度分量（被导向上岸方向）
    expect(Math.abs(p.vy)).toBeGreaterThan(0.1);
  });

  it('已损坏构件不再参与碰撞', () => {
    const broken = createBlockInstance('b', 'wall', { x: 0, y: 0 }, 2);
    broken.state = 'broken';
    const p = particleAt(-0.2, 0, 5, 0);
    resolveBlockCollision(p, broken, wall);
    expect(broken.pressure).toBe(0);
    expect(p.vx).toBe(5);
  });
});
