/** 轻量 2D 向量工具（纯函数，世界单位 = 米）。 */
export interface Vec2 {
  x: number;
  y: number;
}

export function len(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 归一化；零向量返回 {0,0}。 */
export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/**
 * 沿单位法向 n 反射速度的法向分量，带衰减；切向分量保留。
 * v' = v - (1 + restitution) * (v·n) * n   —— restitution<1 表示能量损失。
 * 返回反射后速度，以及被抵消的法向速度大小（即"撞击法向分量"，用于水势）。
 */
export function reflectAlongNormal(
  v: Vec2,
  n: Vec2,
  restitution: number,
): { v: Vec2; normalImpact: number } {
  const vn = dot(v, n); // 沿法向的速度分量（朝向墙为负）
  // 只在迎面撞击（vn < 0）时反射
  if (vn >= 0) return { v, normalImpact: 0 };
  const k = (1 + restitution) * vn;
  return {
    v: { x: v.x - k * n.x, y: v.y - k * n.y },
    normalImpact: -vn, // 正值：法向撞击速度大小
  };
}
