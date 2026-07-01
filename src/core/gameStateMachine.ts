import type { LevelConfig } from '../levels/levelTypes';
import type { Vec2 } from './vec2';
import {
  createBlockInstance,
  ROT_STEPS,
  type BlockInstance,
} from '../blocks/blockInstance';
import { getBlockConfig } from '../blocks/blockConfig';
import { snapToGrid, validatePlacement, type PlacementResult } from '../blocks/placement';
import {
  createWallet,
  consume,
  refund,
  canAfford,
  actualCost,
  type MoneyWallet,
} from '../economy/wallet';
import {
  createSim,
  stepSim,
  isFlooded,
  anyWallBroken,
  type SimState,
} from '../sim/simulation';
import { FIXED_DT } from './fixedLoop';
import { judge, type PuzzleResult } from '../judge/puzzleJudge';

export type GameState = 'editing' | 'simulating' | 'settling';

/**
 * 单关运行时会话：编辑/模拟/结算状态机 + 构件/库存/金钱的单一真相源。
 * render/HUD 只读此对象绘制；交互通过其方法驱动。
 */
export class GameSession {
  state: GameState = 'editing';
  readonly level: LevelConfig;
  placedBlocks: BlockInstance[] = [];
  inventory: Record<string, number>;
  wallet: MoneyWallet;
  sim: SimState | null = null;
  result: PuzzleResult | null = null;
  private idCounter = 0;

  constructor(level: LevelConfig) {
    this.level = level;
    this.inventory = { ...level.inventory };
    this.wallet = createWallet(level.moneyLimit);
  }

  getInventoryCount(blockId: string): number {
    return this.inventory[blockId] ?? 0;
  }

  /** 拿起构件的预计消耗（UI 预览用）。 */
  costOf(blockId: string): number {
    return getBlockConfig(blockId).cost;
  }

  /** 放置构件（仅编辑态）。 */
  placeBlock(blockId: string, worldPos: Vec2, rotStep: number): PlacementResult {
    if (this.state !== 'editing') return 'invalid_state';
    if (this.getInventoryCount(blockId) <= 0) return 'insufficient';
    const cfg = getBlockConfig(blockId);
    if (!canAfford(this.wallet, cfg.cost)) return 'insufficient';

    const pos = snapToGrid(worldPos);
    const r = validatePlacement(this.level, cfg, pos, rotStep, this.placedBlocks);
    if (r !== 'success') return r;

    this.inventory[blockId] -= 1;
    consume(this.wallet, cfg.cost);
    this.placedBlocks.push(createBlockInstance(`b${this.idCounter++}`, blockId, pos, rotStep));
    return 'success';
  }

  /** 移动已放置构件（仅编辑态）。 */
  moveBlock(instanceId: string, worldPos: Vec2): PlacementResult {
    if (this.state !== 'editing') return 'invalid_state';
    const inst = this.placedBlocks.find((b) => b.instanceId === instanceId);
    if (!inst) return 'invalid_state';
    const cfg = getBlockConfig(inst.blockId);
    const pos = snapToGrid(worldPos);
    const r = validatePlacement(this.level, cfg, pos, inst.rotStep, this.placedBlocks, instanceId);
    if (r !== 'success') return r;
    inst.pos = pos;
    return 'success';
  }

  /**
   * 拖拽中实时跟手：直接置位，**不吸附网格、不做合法性校验**（仅编辑态）。
   * 用于让构件连续跟随光标、消除跳格与"非法即卡住"的顿挫；落手时再由 moveBlock 吸附+校验提交。
   */
  dragBlockTo(instanceId: string, worldPos: Vec2): void {
    if (this.state !== 'editing') return;
    const inst = this.placedBlocks.find((b) => b.instanceId === instanceId);
    if (!inst) return;
    inst.pos = { x: worldPos.x, y: worldPos.y };
  }

  /** 旋转 45°；旋转后若与他者重叠则回退（仅编辑态、可旋转构件）。 */
  rotateBlock(instanceId: string): boolean {
    if (this.state !== 'editing') return false;
    const inst = this.placedBlocks.find((b) => b.instanceId === instanceId);
    if (!inst) return false;
    const cfg = getBlockConfig(inst.blockId);
    if (!cfg.canRotate) return false;
    const next = (inst.rotStep + 1) % ROT_STEPS;
    if (validatePlacement(this.level, cfg, inst.pos, next, this.placedBlocks, instanceId) !== 'success') {
      return false;
    }
    inst.rotStep = next;
    return true;
  }

  /** 删除构件，返还库存与金钱（仅编辑态）。 */
  removeBlock(instanceId: string): boolean {
    if (this.state !== 'editing') return false;
    const idx = this.placedBlocks.findIndex((b) => b.instanceId === instanceId);
    if (idx < 0) return false;
    const inst = this.placedBlocks[idx];
    this.placedBlocks.splice(idx, 1);
    this.inventory[inst.blockId] = this.getInventoryCount(inst.blockId) + 1;
    refund(this.wallet, getBlockConfig(inst.blockId).cost);
    return true;
  }

  /** 放水：进入模拟态。构件损坏状态先复位，保证可复现。 */
  startSimulation(): boolean {
    if (this.state !== 'editing') return false;
    for (const b of this.placedBlocks) {
      b.state = 'placed';
      b.damage = 'stable';
      b.contactTime = 0;
      b.pressure = 0;
      b.hits = 0;
    }
    this.sim = createSim(this.level, this.placedBlocks);
    this.state = 'simulating';
    this.result = null;
    return true;
  }

  /** 推进模拟一固定步；结束则进入结算。 */
  tick(dt: number = FIXED_DT): void {
    if (this.state !== 'simulating' || !this.sim) return;
    stepSim(this.sim, dt);
    if (this.sim.finished) this.settle();
  }

  private settle(): void {
    const sim = this.sim!;
    this.result = judge({
      level: this.level,
      flooded: isFlooded(sim),
      anyWallBroken: anyWallBroken(sim),
      villageHitCount: sim.villageHitCount,
      consumedMoney: actualCost(this.wallet),
      simTime: sim.elapsed,
    });
    this.state = 'settling';
  }

  /** 重试：回到编辑态，保留已放置构件（复位损坏）。 */
  retry(): void {
    for (const b of this.placedBlocks) {
      b.state = 'placed';
      b.damage = 'stable';
      b.contactTime = 0;
      b.pressure = 0;
      b.hits = 0;
    }
    this.sim = null;
    this.result = null;
    this.state = 'editing';
  }

  /** 重置：清空所有构件，恢复初始库存与金钱。 */
  reset(): void {
    this.placedBlocks = [];
    this.inventory = { ...this.level.inventory };
    this.wallet = createWallet(this.level.moneyLimit);
    this.sim = null;
    this.result = null;
    this.state = 'editing';
  }
}
