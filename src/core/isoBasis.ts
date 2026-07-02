/**
 * 等距(2.5D)投影的**基向量与角度反投影**——纯计算，无任何渲染(Pixi)依赖，
 * 故 sim/构件几何可安全引用（确定性不受破坏）。
 *
 * 这里是「世界(米) → 地面像素」线性基 A/B/C/D（不含 scale/平移；scale 为各向同性，
 * 不影响方向，平移不影响方向）。worldView 的等距矩阵直接复用这套基；构件旋转则用
 * `worldAngleForScreenAngle` 把「屏幕上想要的朝向」反算成世界朝向。
 *
 * 为什么 sim 也要这套：石墙旋转要求「在屏幕上每次均匀转 45°」（以河道为基准）。但投影是
 * 非正交斜切，世界里的 45° 投到屏幕并不均匀。于是改为：先定屏幕目标角 = θ0 + k·45°，
 * 再反投影成世界角作为构件 OBB 的真实朝向 → 投影回屏幕自然均匀、且碰撞/挡水与画面一致。
 * ⚠️ 若改了下面任何基向量常量，构件的世界朝向会随之变化（这是有意的：朝向定义就锚定在投影上）。
 */

// —— 基础等距基向量（屏幕位移 / 地面像素）：左高右低 + 地面俯视舒展平铺 ——
const BASE_A = 1.0; // 沿河 +x → 屏幕右
const BASE_B = 0.16; // 沿河 +x → 屏幕下（左高右低的下倾，温和）
const BASE_C = 0.5; // 横河 +y → 屏幕右（平行四边形斜切，强 → 地面感）
const BASE_D = 0.62; // 横河 +y → 屏幕下（进深加大 → 俯视舒展）

// 河道整体顺时针旋转角：贴合背景图(bg-iso)中央土黄斜带（自左上→右下）。
const ROT_DEG = 18;
const _r = (ROT_DEG * Math.PI) / 180;
const _cos = Math.cos(_r);
const _sin = Math.sin(_r);

// 横河(+y) 基向量再放大 WIDTH_MUL：河道在屏幕上变宽，方便放置石墙。
const WIDTH_MUL = 1.2;

/** world x → 地面像素的屏幕基（X,Y 分量）。 */
export const A = _cos * BASE_A - _sin * BASE_B;
export const B = _sin * BASE_A + _cos * BASE_B;
/** world y → 地面像素的屏幕基（X,Y 分量），含 WIDTH_MUL。 */
export const C = (_cos * BASE_C - _sin * BASE_D) * WIDTH_MUL;
export const D = (_sin * BASE_C + _cos * BASE_D) * WIDTH_MUL;

/** 河道（沿河 +x）在屏幕上的方向角（弧度）= 下河岸/水流的屏幕基准线。 */
export const THETA0 = Math.atan2(B, A);

const _det = A * D - C * B;

/**
 * 把「屏幕上的目标朝向角」反投影成「世界朝向角」（弧度）。
 * 屏幕方向 (cosφ,sinφ) = M·世界方向，M=[[A,C],[B,D]] → 世界方向 = M⁻¹·屏幕方向。
 * 取 atan2 得世界角。这样该世界朝向投影回屏幕恰为 φ（构造保证）。
 */
export function worldAngleForScreenAngle(screenAngle: number): number {
  const cs = Math.cos(screenAngle);
  const sn = Math.sin(screenAngle);
  const wx = (D * cs - C * sn) / _det;
  const wy = (-B * cs + A * sn) / _det;
  return Math.atan2(wy, wx);
}

/**
 * 抛物线射流的"重力/加速度"方向（单位世界向量）：
 * 以下游(+x)为主、略带屏幕正下方下坠分量（你指定方向）。
 * 由 70% 下游 + 30% 屏幕正下方 混合、单位化，使视觉上水被甩出后微微下坠，
 * 但不会持续把主流推向下岸/村庄（对比纯屏幕正下方 (−0.35,+0.94)）。
 */
function _parabolaGravity(): { x: number; y: number } {
  const screenDownX = -C / _det;
  const screenDownY = A / _det;
  const wx = 0.7 * 1.0 + 0.3 * screenDownX; // 70% +x
  const wy = 0.7 * 0.0 + 0.3 * screenDownY; // 30% 屏幕正下方
  const len = Math.hypot(wx, wy) || 1;
  return { x: wx / len, y: wy / len };
}
export const PARABOLA_GRAVITY = _parabolaGravity();

