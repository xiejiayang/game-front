import type { LevelConfig } from '../levels/levelTypes';
import type { Particle } from './particlePool';

/** 粒子是否进入村庄受击区域。 */
export function inVillage(p: Particle, level: LevelConfig): boolean {
  const a = level.village.area;
  return p.x >= a.x0 && p.x <= a.x1 && p.y >= a.y0 && p.y <= a.y1;
}
