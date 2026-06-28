import type { WaterSourceConfig } from '../levels/levelTypes';
import type { ParticlePool } from './particlePool';
import type { Rng } from '../core/rng';

function saturate(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 水源发射器：按流量曲线（base→peak→稳定→停）在入口生成粒子。
 * carry 累计小数部分，保证每帧整数发射数确定。
 */
export class WaterSource {
  private carry = 0;

  constructor(
    private readonly cfg: WaterSourceConfig,
    private readonly pool: ParticlePool,
    private readonly rng: Rng,
  ) {}

  /** 当前流量（粒子/秒）。洪峰窗口结束后停止发射，存量自然流走。 */
  flowRateAt(elapsed: number): number {
    const activeWindow = this.cfg.riseDuration + this.cfg.stableDuration;
    if (elapsed >= activeWindow) return 0;
    const t = saturate(elapsed / this.cfg.riseDuration);
    return this.cfg.baseFlowRate + (this.cfg.peakFlowRate - this.cfg.baseFlowRate) * t;
  }

  emit(elapsed: number, dt: number): void {
    const rate = this.flowRateAt(elapsed);
    this.carry += rate * dt;
    let count = Math.floor(this.carry);
    if (count <= 0) return;
    this.carry -= count;

    const { cfg, rng } = this;
    const span = cfg.yMax - cfg.yMin;
    while (count-- > 0) {
      const idx = this.pool.spawn();
      if (idx < 0) break; // 池满
      const p = this.pool.particles[idx];
      p.x = cfg.x;
      p.y = cfg.yMin + rng.next() * span;
      // 基础流向速度 + 轻微湍流（确定性，来自 seeded rng）
      const jitter = (rng.next() * 2 - 1) * cfg.turbulence;
      p.vx = cfg.dir.x * cfg.speed;
      p.vy = cfg.dir.y * cfg.speed + jitter * cfg.speed;
      p.life = 1;
      p.ink = 0.5;
      p.active = true;
    }
  }

  reset(): void {
    this.carry = 0;
  }
}
