import type { LevelConfig } from '../levels/levelTypes';

export type FailReason = 'flood' | 'wall_broken' | null;

export interface PuzzleResult {
  isSuccess: boolean;
  isFrugal: boolean;
  failReason: FailReason;
  consumedMoney: number;
  villageHitCount: number;
  simTime: number;
}

export interface JudgeInput {
  level: LevelConfig;
  flooded: boolean;
  anyWallBroken: boolean;
  villageHitCount: number;
  consumedMoney: number;
  simTime: number;
}

/**
 * L1 判定：成功 = 村庄未被淹（唯一）。
 * 失败文案区分：曾有墙被冲垮 → "墙倒了"(wall_broken)，否则 → "村子仍被淹"(flood)。
 * 节俭 = 成功且消耗 ≤ frugalMoney。
 */
export function judge(input: JudgeInput): PuzzleResult {
  const isSuccess = !input.flooded;
  const failReason: FailReason = isSuccess ? null : input.anyWallBroken ? 'wall_broken' : 'flood';
  const isFrugal = isSuccess && input.consumedMoney <= input.level.frugalMoney;
  return {
    isSuccess,
    isFrugal,
    failReason,
    consumedMoney: input.consumedMoney,
    villageHitCount: input.villageHitCount,
    simTime: input.simTime,
  };
}
