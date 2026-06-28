import type { LevelConfig } from '../levels/levelTypes';

/** 世界坐标（米）→ 屏幕逻辑坐标（像素）的映射。 */
export interface WorldView {
  scale: number;
  offsetX: number;
  offsetY: number;
  sx(x: number): number;
  sy(y: number): number;
  /** 屏幕→世界（拖拽放置用）。 */
  wx(screenX: number): number;
  wy(screenY: number): number;
}

export function makeWorldView(level: LevelConfig, viewW: number, viewH: number): WorldView {
  const worldW = level.channel.x1;
  const worldH = level.village.area.y1 + 1; // 顶到村庄下沿再留 1m
  const margin = 60;
  const scale = Math.min((viewW - margin * 2) / worldW, (viewH - margin * 2) / worldH);
  const offsetX = (viewW - worldW * scale) / 2;
  const offsetY = (viewH - worldH * scale) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    sx: (x) => offsetX + x * scale,
    sy: (y) => offsetY + y * scale,
    wx: (screenX) => (screenX - offsetX) / scale,
    wy: (screenY) => (screenY - offsetY) / scale,
  };
}
