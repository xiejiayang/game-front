/** 构件静态配置。数据驱动，程序不硬编码具体构件逻辑。 */
export interface BlockConfig {
  blockId: string;
  blockName: string;
  cost: number;
  longLen: number; // 长轴长度（米）
  shortLen: number; // 短轴长度（米）
  canRotate: boolean;
  collapseThreshold: number; // 水势阈值，超过才开始倒塌
  collapseDuration: number; // 倒塌基础时间（秒）
}

export const BLOCKS: Record<string, BlockConfig> = {
  wall: {
    blockId: 'wall',
    blockName: '石墙',
    cost: 10,
    longLen: 2.0,
    shortLen: 0.6,
    canRotate: true,
    collapseThreshold: 0.3, // 累积损伤耐久预算（非瞬时阈值）
    collapseDuration: 0.8, // 最快垮塌时间下限
  },
};

export function getBlockConfig(blockId: string): BlockConfig {
  const cfg = BLOCKS[blockId];
  if (!cfg) throw new Error(`unknown blockId: ${blockId}`);
  return cfg;
}
