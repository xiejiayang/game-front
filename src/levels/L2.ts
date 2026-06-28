import type { LevelConfig } from './levelTypes';

/**
 * L2「疏」—— 占位关卡（本期不可玩）。
 * 仅提供选关界面展示所需的 id/index/title/theme 与一份合法的占位配置，
 * 待后续接入竹笼/分流机制后再实装。数值暂复用 L1 形状，勿据此调玩法。
 */
export const L2: LevelConfig = {
  id: 'L2',
  index: 2,
  title: '疏',
  theme: '分水导流 · 竹笼护岸（敬请期待）',

  channel: { x0: 0, y0: 2, x1: 28, y1: 8 },
  gap: { x0: 15, x1: 17 },

  source: {
    x: 0,
    yMin: 2,
    yMax: 8,
    dir: { x: 1, y: 0 },
    baseFlowRate: 20,
    peakFlowRate: 70,
    riseDuration: 3,
    stableDuration: 8,
    turbulence: 0.35,
    speed: 5,
    flowBiasY: 0.35,
  },

  village: {
    area: { x0: 15, y0: 8, x1: 17, y1: 10 },
    floodThreshold: 30,
  },

  placeZone: { x0: 0, y0: 2, x1: 28, y1: 8 },

  inventory: { wall: 5 },
  moneyLimit: 50,
  frugalMoney: 20,

  maxParticles: 400,
  simSeed: 20260629,
  simDuration: 18,

  narrative: {
    start: '（第二关「疏」尚在修渠，敬请期待。）',
    success: '',
    fail_flood: '',
    fail_wall: '',
    frugal: '',
  },
};
