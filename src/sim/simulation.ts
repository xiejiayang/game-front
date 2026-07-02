import type { LevelConfig } from '../levels/levelTypes';
import { Rng } from '../core/rng';
import { ParticlePool } from './particlePool';
import { WaterSource } from './waterSource';
import { resolveBankCollision, resolveBlockCollision } from './collision';
import { inVillage } from './village';
import { getBlockConfig } from '../blocks/blockConfig';
import { updateBlockDamage, type BlockInstance } from '../blocks/blockInstance';
import { PARABOLA_GRAVITY } from '../core/isoBasis';

const LIFE_SECONDS = 8; // 粒子最长存活，避免无限堆积
const JET_GRAVITY = 4.5; // 抛物线射流重力加速度（米/秒²）

/** 模拟运行时状态（纯逻辑，无渲染依赖）。 */
export interface SimState {
  level: LevelConfig;
  pool: ParticlePool;
  source: WaterSource;
  rng: Rng;
  blocks: BlockInstance[];
  elapsed: number;
  villageHitCount: number;
  finished: boolean;
}

export function createSim(level: LevelConfig, blocks: BlockInstance[] = []): SimState {
  const rng = new Rng(level.simSeed);
  const pool = new ParticlePool(level.maxParticles);
  const source = new WaterSource(level.source, pool, rng);
  return {
    level,
    pool,
    source,
    rng,
    blocks,
    elapsed: 0,
    villageHitCount: 0,
    finished: false,
  };
}

/** 推进一固定步。调用顺序固定 → 确定性。 */
export function stepSim(sim: SimState, dt: number): void {
  if (sim.finished) return;
  const { pool, level, rng } = sim;
  const src = level.source;

  // 1. 发射（先消费 rng）
  sim.source.emit(sim.elapsed, dt);

  // 2. 构件水势/接触清零（每帧重算）
  for (const b of sim.blocks) {
    b.pressure = 0;
    b.hits = 0;
  }

  // 3. 逐粒子积分 + 碰撞 + 统计（按索引顺序，固定）
  const maxV = src.speed * 1.6;
  for (let i = 0; i < pool.particles.length; i++) {
    const p = pool.particles[i];
    if (!p.active) continue;

    // 河床坡降 + 湍流（确定性 rng）
    if (p.jet <= 0) {
      p.vy += src.flowBiasY * dt + (rng.next() * 2 - 1) * src.turbulence * src.speed * dt;
      if (p.vy > maxV) p.vy = maxV;
      else if (p.vy < -maxV) p.vy = -maxV;
    } else {
      // 射流粒子：只受抛物线重力（以下游为主、略带下坠），不受河床坡降/湍流干扰，保证轨迹清晰。
      p.vx += PARABOLA_GRAVITY.x * JET_GRAVITY * dt;
      p.vy += PARABOLA_GRAVITY.y * JET_GRAVITY * dt;
      p.jet -= dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 构件碰撞（顺序固定）
    for (const b of sim.blocks) {
      resolveBlockCollision(p, b, getBlockConfig(b.blockId), src.dir, sim.level.channel.y0, sim.level.channel.y1, src.speed);
    }

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.ink = Math.min(1, speed / (src.speed * 1.5));

    resolveBankCollision(p, level);

    if (inVillage(p, level)) {
      sim.villageHitCount++;
      pool.recycle(i);
      continue;
    }

    p.life -= dt / LIFE_SECONDS;
    if (p.x > level.channel.x1 || p.y > level.village.area.y1 || p.life <= 0) {
      pool.recycle(i);
    }
  }

  // 4. 构件倒塌推进 + 水压平滑（平滑用于迎水面加深，避免闪烁）
  for (const b of sim.blocks) {
    updateBlockDamage(b, getBlockConfig(b.blockId), dt);
    // EMA：瞬时 pressure 每帧清零，这里把它平滑成连续变化的加深强度。
    const alpha = 0.15; // 越接近 1 越跟手；越小越平滑
    b.pressureSmoothed = b.pressureSmoothed * (1 - alpha) + b.pressure * alpha;
  }

  // 5. 时间推进与结束判定
  sim.elapsed += dt;
  if (sim.villageHitCount >= level.village.floodThreshold || sim.elapsed >= level.simDuration) {
    sim.finished = true;
  }
}

export function isFlooded(sim: SimState): boolean {
  return sim.villageHitCount >= sim.level.village.floodThreshold;
}

/** 是否有构件被冲垮（硬堵失败的标志）。 */
export function anyWallBroken(sim: SimState): boolean {
  return sim.blocks.some((b) => b.state === 'broken');
}
