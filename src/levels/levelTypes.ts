import type { Vec2 } from '../core/vec2';

/** 矩形区域（世界坐标，米）。x0<x1, y0<y1。 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 水源配置：左侧入口，流量按曲线由小到大到洪峰后稳定。 */
export interface WaterSourceConfig {
  x: number;
  yMin: number;
  yMax: number;
  dir: Vec2;
  baseFlowRate: number; // 粒子/秒
  peakFlowRate: number;
  riseDuration: number; // base→peak 时间（秒）
  stableDuration: number; // 洪峰持续（秒）
  turbulence: number; // 湍流强度
  speed: number; // 基础流速（米/秒）
  flowBiasY: number; // 河床朝村庄侧（下岸）的坡降加速度，使直冲水流自然灌入缺口
}

/** 村庄受击区域与淹没阈值。 */
export interface VillageConfig {
  area: Rect;
  floodThreshold: number; // 累计进入粒子数 ≥ 此值 = 淹没
}

/** 关卡叙事文案。 */
export interface Narrative {
  start: string;
  success: string;
  fail_flood: string;
  fail_wall: string;
  frugal: string;
}

/** 关卡静态配置。 */
export interface LevelConfig {
  id: string;
  index: number;
  title: string;
  theme: string;
  /** 河道内腔（水可流动范围）。 */
  channel: Rect;
  /** 下岸缺口（朝向村庄的开口），x 区间内下边界开放。 */
  gap: { x0: number; x1: number };
  source: WaterSourceConfig;
  village: VillageConfig;
  /** 玩家可放置构件的区域。 */
  placeZone: Rect;
  inventory: Record<string, number>;
  moneyLimit: number;
  frugalMoney: number;
  maxParticles: number;
  simSeed: number;
  simDuration: number; // 模拟总时长（秒）
  narrative: Narrative;
}
