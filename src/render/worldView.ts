import { Matrix, Point } from 'pixi.js';
import type { LevelConfig } from '../levels/levelTypes';
import { A, B, C, D } from '../core/isoBasis';

/**
 * 世界坐标（米）→ 屏幕逻辑坐标（像素）的等距(2.5D)投影。
 *
 * 河道平面按「左高右低」斜视角呈现：沿河 +x 向屏幕右下、横河 +y 向屏幕右下且压缩，
 * 整体是一个平行四边形（参考 wrong_pic/newDesign.png）。投影是仿射的，因此用一个
 * 等距矩阵套在「地面容器」(stage.groundLayer) 上即可：容器内用 sx()/sy() 的「地面像素」
 * 坐标绘制（=world*scale，未投影），由容器矩阵统一斜切投影 → 贴图/构件自动落在斜面上。
 * project()/unproject() 用同一矩阵做点投影/逆投影（交互命中、页面坐标换算用）。
 */
export interface WorldView {
  scale: number;
  /** 地面像素(world*scale) → 屏幕(root 局部) 的等距矩阵，赋给 stage.groundLayer。 */
  matrix: Matrix;
  /** world x → 地面像素 X（未投影，供 groundLayer 内部绘制）。 */
  sx(x: number): number;
  /** world y → 地面像素 Y（未投影）。 */
  sy(y: number): number;
  /** world → 屏幕(root 局部) 投影点。 */
  project(wx: number, wy: number): { x: number; y: number };
  /** 屏幕(root 局部) → world 逆投影点。 */
  unproject(sx: number, sy: number): { x: number; y: number };
}

// 等距基向量 A/B/C/D（左高右低 + 横河放宽 + 整体顺时针 18°）已抽到 core/isoBasis，
// 与构件「屏幕均匀旋转」的世界角反投影共用同一套基（避免两处常量漂移）。

// 自适应只取「源头→村庄稍过」这一段：据此放大画面，下游(>FIT_LEN)照常绘制并自然
// 溢出屏幕右下角 → 河道从左上源头斜贯到右下角（贴合背景河道走向）。
const FIT_LEN = 18;

export function makeWorldView(level: LevelConfig, viewW: number, viewH: number): WorldView {
  const x0 = level.channel.x0;
  const x1 = Math.min(level.channel.x1, FIT_LEN); // 仅用于自适应；实际河道仍画到 channel.x1
  const y0 = level.channel.y0;
  const y1 = level.village.area.y1; // 纳入村庄，保证其在画面内

  // 以 scale=1 求投影后包围盒，据此自适应 scale 与平移。
  const corners = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => ({ x: A * x + C * y, y: B * x + D * y }));
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  const marginX = 40;
  const marginTop = 60; // 源头贴近画面顶部，河道自上而下斜贯
  const marginBottom = 20;
  const scale = Math.min((viewW - marginX * 2) / bboxW, (viewH - marginTop - marginBottom) / bboxH);

  // 河道左上「源头」贴到画面左缘（向左上方延伸至左侧边缘），故不再水平居中；
  // 下游(右下)自然溢出屏幕右侧（出水口在画面外）。
  const LEFT_PAD = 0;
  const originX = LEFT_PAD - minX * scale;
  const originY = marginTop - minY * scale;

  // 地面像素已含 scale，故矩阵基直接用 A/B/C/D，平移为 origin。
  const matrix = new Matrix(A, B, C, D, originX, originY);

  return {
    scale,
    matrix,
    sx: (x) => x * scale,
    sy: (y) => y * scale,
    project: (wx, wy) => {
      const p = matrix.apply(new Point(wx * scale, wy * scale));
      return { x: p.x, y: p.y };
    },
    unproject: (px, py) => {
      const p = matrix.applyInverse(new Point(px, py));
      return { x: p.x / scale, y: p.y / scale };
    },
  };
}
