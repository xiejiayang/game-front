import { describe, it, expect } from 'vitest';
import { resolveBlockCollision } from '../src/sim/collision';
import { getBlockConfig } from '../src/blocks/blockConfig';
import { createBlockInstance } from '../src/blocks/blockInstance';
import type { Particle } from '../src/sim/particlePool';

const wall = getBlockConfig('wall');

function particleAt(x: number, y: number, vx: number, vy: number): Particle {
  return { x, y, vx, vy, life: 1, ink: 0, active: true, jet: 0 };
}

describe('构件碰撞 — 法向水势', () => {
  it('正撞（宽面最迎水流）比斜掠累计更高水势', () => {
    // 水流沿世界 +x。构件「世界朝向」由屏幕均匀角(θ0+rotStep×45°)反投影而来（等距斜切），
    // 故宽面最迎 +x（世界角最接近 90°）的是 rotStep=1（世界≈94°）；rotStep=3（世界≈143°）更斜掠。
    // 注：屏幕上「看着横断河道」的是 rotStep=2，但斜切使其世界角≈125°、并非最迎 +x —— 此为投影固有现象，
    //     pressure 仅为碰撞物理度量、不参与倒塌/胜负（倒塌靠 hits+分类，分类仍按标称偏角 rot2=挡水墙）。
    const headOn = createBlockInstance('h', 'wall', { x: 0, y: 0 }, 1);
    const pHead = particleAt(-0.2, 0, 5, 0);
    resolveBlockCollision(pHead, headOn, wall);

    const oblique = createBlockInstance('o', 'wall', { x: 0, y: 0 }, 3);
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
