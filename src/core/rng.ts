/**
 * 确定性伪随机：mulberry32。
 * 同一 seed 必产生同一序列，跨设备一致 —— 顿悟体验的前提。
 * 模拟层禁止使用 Math.random，一律走此实例。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 保证为 32 位无符号整数
    this.state = seed >>> 0;
  }

  /** 下一个 [0, 1) 浮点。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 区间浮点。 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** 当前内部状态（用于快照/调试）。 */
  getState(): number {
    return this.state;
  }
}
