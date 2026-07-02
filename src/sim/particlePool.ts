/** 单个水粒子（世界坐标，米；速度米/秒）。 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 剩余生命 0~1
  ink: number; // 墨浓度（渲染用，速度映射）
  active: boolean;
  jet: number; // 抛物线射流剩余时间（秒）；0 表示常规粒子
}

/**
 * 预分配粒子池：固定容量，运行时零分配。
 * 用 free 索引栈复用，spawn/recycle 顺序确定，保证确定性。
 */
export class ParticlePool {
  readonly particles: Particle[] = [];
  private readonly free: number[] = [];

  constructor(readonly capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, ink: 0, active: false, jet: 0 });
    }
    // 倒序入栈，使 pop 先取小索引，遍历顺序与索引一致
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  /** 取一个空闲粒子索引；池满返回 -1。 */
  spawn(): number {
    const idx = this.free.pop();
    if (idx === undefined) return -1;
    const p = this.particles[idx];
    p.active = true;
    p.jet = 0;
    return idx;
  }

  /** 回收指定索引粒子。 */
  recycle(idx: number): void {
    const p = this.particles[idx];
    if (!p.active) return;
    p.active = false;
    this.free.push(idx);
  }

  get activeCount(): number {
    return this.capacity - this.free.length;
  }
}
