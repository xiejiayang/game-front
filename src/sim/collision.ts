import type { LevelConfig } from '../levels/levelTypes';
import type { Particle } from './particlePool';
import type { BlockConfig } from '../blocks/blockConfig';
import { worldAngle, type BlockInstance } from '../blocks/blockInstance';

const BANK_RESTITUTION = 0.5;
const BLOCK_RESTITUTION = 0.3;

/**
 * 河岸约束：上岸、下岸（缺口处放行）、左壁。
 * 缺口 x∈[gap.x0, gap.x1] 处下岸开放，水可流入村庄方向。
 */
export function resolveBankCollision(p: Particle, level: LevelConfig): void {
  const ch = level.channel;

  // 上岸
  if (p.y < ch.y0) {
    p.y = ch.y0;
    if (p.vy < 0) p.vy = -p.vy * BANK_RESTITUTION;
  }

  // 下岸（缺口外才挡）
  if (p.y > ch.y1) {
    const inGap = p.x >= level.gap.x0 && p.x <= level.gap.x1;
    if (!inGap) {
      p.y = ch.y1;
      if (p.vy > 0) p.vy = -p.vy * BANK_RESTITUTION;
    }
    // 缺口内：放行，不夹回（流向村庄受击区）
  }

  // 左壁
  if (p.x < ch.x0) {
    p.x = ch.x0;
    if (p.vx < 0) p.vx = -p.vx * BANK_RESTITUTION;
  }
}

/**
 * 粒子 vs 旋转构件（OBB）。命中则沿最近面法向推出 + 反射法向分量，
 * 并向该构件累加「撞击法向速度分量」作为水势。
 * 正撞（法向分量大）→ 水势高；斜掠（法向分量小，切向把水导走）→ 水势低。
 */
export function resolveBlockCollision(
  p: Particle,
  block: BlockInstance,
  cfg: BlockConfig,
): void {
  if (block.state !== 'placed') return;

  const a = worldAngle(block.rotStep);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - block.pos.x;
  const dy = p.y - block.pos.y;
  // 转入构件局部坐标（ux=长轴, uy=短轴）
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const hl = cfg.longLen / 2;
  const hs = cfg.shortLen / 2;
  if (Math.abs(lx) >= hl || Math.abs(ly) >= hs) return; // 不在包围盒内

  block.hits += 1; // 几何接触计数（用于倒塌计时）

  const penX = hl - Math.abs(lx);
  const penY = hs - Math.abs(ly);

  // 沿穿透更浅的轴推出
  let nx: number;
  let ny: number;
  let pen: number;
  if (penY <= penX) {
    const sign = ly >= 0 ? 1 : -1;
    nx = -s * sign; // uy * sign
    ny = c * sign;
    pen = penY;
  } else {
    const sign = lx >= 0 ? 1 : -1;
    nx = c * sign; // ux * sign
    ny = s * sign;
    pen = penX;
  }

  p.x += nx * pen;
  p.y += ny * pen;

  const vn = p.vx * nx + p.vy * ny; // 沿外法向分量；迎面撞击为负
  if (vn < 0) {
    p.vx -= (1 + BLOCK_RESTITUTION) * vn * nx;
    p.vy -= (1 + BLOCK_RESTITUTION) * vn * ny;
    block.pressure += -vn; // 撞击法向速度分量
  }
}
