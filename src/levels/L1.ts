import type { LevelConfig } from './levelTypes';

/**
 * L1「堵」—— 筑墙失败 / 斜向导流。
 * 横屏河道，水左→右。下岸 x∈[14,18] 有缺口朝向村庄；
 * 玩家在上游 x∈[6,14] 斜放石墙把主流偏向上岸、绕过缺口从右侧出口流走。
 * 数值为初值，机制回归（S2）后按手感微调。
 */
export const L1: LevelConfig = {
  id: 'L1',
  index: 1,
  title: '堵',
  theme: '筑墙失败 → 斜向导流',

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
    // 缺口下方的村庄受击区
    area: { x0: 15, y0: 8, x1: 17, y1: 10 },
    floodThreshold: 30,
  },

  // 可放置区 = 整条河道内腔，玩家可自由摆放
  placeZone: { x0: 0, y0: 2, x1: 28, y1: 8 },

  inventory: { wall: 5 },
  moneyLimit: 50,
  frugalMoney: 20,

  maxParticles: 400,
  simSeed: 20260628,
  simDuration: 18,

  narrative: {
    start: '岷江水起，村子就在下游岸边。河工递来几垛石料：「水来了，先挡一挡吧。」',
    success: '水顺着石垛斜斜淌过，绕开了村子，向下游去了。老河工捋须：「好——不与水争，顺势而走，这便是疏。」',
    fail_flood: '水漫过田埂，涌进了村子。「堵住一处，它便从别处来。」',
    fail_wall: '石墙轰然垮塌——「硬挡？水的力气，比石头大。」',
    frugal: '你只用了两垛石料。「四两拨千斤，这才是治水的本事。」',
  },
};
