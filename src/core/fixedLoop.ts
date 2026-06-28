/**
 * 固定步长循环：把可变的渲染帧时间累加，按固定 dt 推进模拟。
 * 模拟逻辑只见固定 dt，保证确定性；渲染可任意帧率。
 */
export const FIXED_DT = 1 / 60;

export class FixedLoop {
  private accumulator = 0;
  private readonly maxSteps: number;

  /** maxSteps：单帧最多补几步，防卡顿后"死亡螺旋"。 */
  constructor(maxSteps = 5) {
    this.maxSteps = maxSteps;
  }

  /**
   * 推进逻辑。传入真实帧间隔（秒），回调每固定步执行一次。
   * 返回本帧执行的步数。
   */
  advance(frameDelta: number, step: (dt: number) => void): number {
    this.accumulator += frameDelta;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < this.maxSteps) {
      step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    // 超出步数上限则丢弃积压，避免落后
    if (steps >= this.maxSteps) this.accumulator = 0;
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
