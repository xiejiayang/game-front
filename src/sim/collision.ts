import type { LevelConfig } from '../levels/levelTypes';
import type { Vec2 } from '../core/vec2';
import type { Particle } from './particlePool';
import type { BlockConfig } from '../blocks/blockConfig';
import { worldAngle, isHeadWall, type BlockInstance } from '../blocks/blockInstance';
import { PARABOLA_GRAVITY } from '../core/isoBasis';

const BANK_RESTITUTION = 0.5;

const DEFAULT_FLOW: Vec2 = { x: 1, y: 0 };

// 抛物线射流参数：粒子从自由端头离开墙时获得的初速与持续时间。
const JET_DURATION = 0.4; // 秒
const JET_SPEED_MUL = 1.05; // 相对水源速度倍率
const JET_DIR_DOWNSTREAM = 1.0; // 下游方向权重
const JET_DIR_GRAVITY = 0.25; // 抛物线重力方向权重（控制下坠幅度）
const END_MARGIN = 0.18; // 距端头多远即视为"正在离开"（米）

/**
 * 贴岸密封判定距离（世界米）。
 * 横断挡水墙（rot2/rot6）端头距河岸 ≤ 0.3m 即密封，保证硬堵场景仍决堤失败；
 * 斜放/顺河墙（rot0/1/3/4/5/7）端头距河岸 ≤ 0.6m 才密封，修复 p6 贴岸墙背水问题。
 * 横断墙端头几乎顶满河道，密封过宽会挡住太多水、破坏硬堵失败机制。
 */
const SEAL_DISTANCE_HEAD = 0.3;
const SEAL_DISTANCE_DIV = 0.6;

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
 * 粒子 vs 旋转构件（OBB）——**单向屏障 + 贴墙导流**模型。
 *
 * 石墙不再是"弹床"，而是一道挡水墙：迎水面(上游侧)把水挡住，水**消去垂直墙面的速度分量、
 * 只保留沿墙分量** → 贴着墙面滑行到墙端，再从端头绕出（墙端之外不拦截）。因此：
 *  · 墙端贴河岸 → 那侧无空隙、被河岸挡住 → 水全导向另一端、不漏（需求1）；
 *  · 墙悬在河道中间 → 水从两端绕出，缝隙越大绕出越多（需求2，自然涌现）。
 *
 * 关键点：**始终把粒子推回上游面、绝不推到下游面**，杜绝旧"最浅穿透弹出"把粒子挤到墙后的漏水。
 * @param flowDir 主流方向（世界系，用于判定迎水面）；缺省 +x。
 */
export function resolveBlockCollision(
  p: Particle,
  block: BlockInstance,
  cfg: BlockConfig,
  flowDir: Vec2 = DEFAULT_FLOW,
  channelY0 = -Infinity,
  channelY1 = Infinity,
  speed = 5,
): void {
  if (block.state !== 'placed') return;

  const a = worldAngle(block.rotStep);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - block.pos.x;
  const dy = p.y - block.pos.y;
  // 转入构件局部坐标（ux=长轴=(c,s)，uy=短轴=(-s,c)）
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const hl = cfg.longLen / 2;
  const hs = cfg.shortLen / 2;

  // 贴岸密封检测：长轴端点中，哪个端头紧贴上/下河岸？
  const yPos = block.pos.y + s * hl;
  const yNeg = block.pos.y - s * hl;
  const sealDist = isHeadWall(block.rotStep) ? SEAL_DISTANCE_HEAD : SEAL_DISTANCE_DIV;
  const reflectSeal = !isHeadWall(block.rotStep); // 斜放/顺河墙：密封端把粒子弹回上游；横断墙：夹到河岸线让水继续流（保证硬堵决堤）
  // sealDist 用于"视觉上贴岸"判定：只要端头离岸 ≤ 此值，就不从该端甩抛物线射流。
  const sealTop = Math.abs(yPos - channelY0) <= sealDist || Math.abs(yNeg - channelY0) <= sealDist;
  const sealBottom = Math.abs(yPos - channelY1) <= sealDist || Math.abs(yNeg - channelY1) <= sealDist;
  const endPlusFree = !(Math.abs(yPos - channelY0) <= sealDist || Math.abs(yPos - channelY1) <= sealDist);
  const endMinusFree = !(Math.abs(yNeg - channelY0) <= sealDist || Math.abs(yNeg - channelY1) <= sealDist);

  // 粒子在墙端外（即将绕流），且处于贴岸端那一侧 → 按河岸约束夹回，实现"密封"。
  // 斜放/顺河墙：把粒子弹回上游 → 水会重新沿墙滑向自由端，不会从贴岸端漏到背水面（p6 方框1/3）。
  // 横断挡水墙：夹到河岸线 → 水沿河岸继续流向下游，保证硬堵场景仍能决堤淹没村庄。
  if (lx > hl) {
    if (sealTop && p.y < channelY0 + hs) {
      if (reflectSeal) {
        p.y = channelY0 + hs; p.vx = -Math.abs(p.vx || speed) * 0.4; p.vy = Math.max(0, p.vy);
      } else { p.y = channelY0; if (p.vy < 0) p.vy = 0; }
      return;
    }
    if (sealBottom && p.y > channelY1 - hs) {
      if (reflectSeal) {
        p.y = channelY1 - hs; p.vx = -Math.abs(p.vx || speed) * 0.4; p.vy = Math.min(0, p.vy);
      } else { p.y = channelY1; if (p.vy > 0) p.vy = 0; }
      return;
    }
  }
  if (lx < -hl) {
    if (sealTop && p.y < channelY0 + hs) {
      if (reflectSeal) {
        p.y = channelY0 + hs; p.vx = -Math.abs(p.vx || speed) * 0.4; p.vy = Math.max(0, p.vy);
      } else { p.y = channelY0; if (p.vy < 0) p.vy = 0; }
      return;
    }
    if (sealBottom && p.y > channelY1 - hs) {
      if (reflectSeal) {
        p.y = channelY1 - hs; p.vx = -Math.abs(p.vx || speed) * 0.4; p.vy = Math.min(0, p.vy);
      } else { p.y = channelY1; if (p.vy > 0) p.vy = 0; }
      return;
    }
  }

  if (Math.abs(lx) >= hl || Math.abs(ly) >= hs) return; // 墙端之外/未进入 → 自由绕流

  block.hits += 1; // 几何接触计数（用于倒塌计时）

  // 迎水面（上游侧）：主流在短轴上的投影 uy·flow 决定水被挡在哪一侧。
  // 水从上游面进入，始终推回上游面 → 不会被挤到下游（杜绝漏水）。
  const uyDotFlow = -s * flowDir.x + c * flowDir.y;
  let faceSign: number;
  if (Math.abs(uyDotFlow) > 1e-4) {
    faceSign = uyDotFlow > 0 ? -1 : 1; // 上游面在 flow 法向分量的反向一侧
  } else {
    faceSign = ly >= 0 ? 1 : -1; // 墙近乎顺流：退化为就近面（几乎不挡水）
  }

  // 沿短轴把粒子推出到上游面（uy 方向位移）
  const targetLy = faceSign * hs;
  const pushLy = targetLy - ly;
  p.x += -s * pushLy; // uy.x * pushLy
  p.y += c * pushLy; // uy.y * pushLy

  // 贴墙滑行：消去垂直墙面(uy)的速度分量、保留沿墙(ux)分量 → 水顺墙滑向端头，不弹回。
  const vn = p.vx * -s + p.vy * c; // 速度沿短轴 uy 的分量
  const inward = -vn * faceSign; // >0 表示正冲向迎水面
  if (inward > 0) block.pressure += inward; // 记录法向撞击（倒塌/渲染用）
  p.vx -= vn * -s; // 去掉法向分量
  p.vy -= vn * c;

  // 抛物线射流触发：斜放/顺河墙（非横断挡水墙）、粒子滑到自由端头、且尚未进入射流模式。
  // 横断挡水墙不甩射流——水应持续正撞墙面、累积压力直至冲垮，保证硬堵决堤失败。
  if (!isHeadWall(block.rotStep) && block.rotStep % 4 !== 0 && p.jet <= 0) {
    const atPlus = lx > hl - END_MARGIN && endPlusFree;
    const atMinus = lx < -hl + END_MARGIN && endMinusFree;
    if (atPlus || atMinus) {
      const jx = JET_DIR_DOWNSTREAM * flowDir.x + JET_DIR_GRAVITY * PARABOLA_GRAVITY.x;
      const jy = JET_DIR_DOWNSTREAM * flowDir.y + JET_DIR_GRAVITY * PARABOLA_GRAVITY.y;
      const len = Math.hypot(jx, jy) || 1;
      p.vx = speed * JET_SPEED_MUL * (jx / len);
      p.vy = speed * JET_SPEED_MUL * (jy / len);
      p.jet = JET_DURATION;
    }
  }
}
