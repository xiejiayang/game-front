import { Application, Container, Graphics } from 'pixi.js';

/** 舞台：固定逻辑分辨率 + 分层容器，渲染层的根。 */
export interface Stage {
  app: Application;
  /** 逻辑坐标根容器，按窗口比例整体缩放。 */
  root: Container;
  /** 背景层（宣纸 / 地形占位）。 */
  bgLayer: Container;
  /** 水流层（粒子 / 水面）。 */
  waterLayer: Container;
  /** 构件层。 */
  blockLayer: Container;
  /** UI / HUD 层。 */
  uiLayer: Container;
  readonly width: number;
  readonly height: number;
}

export async function createStage(width: number, height: number): Promise<Stage> {
  const app = new Application();
  await app.init({
    width,
    height,
    background: '#d9d2c2',
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const root = new Container();
  app.stage.addChild(root);

  const bgLayer = new Container();
  const waterLayer = new Container();
  const blockLayer = new Container();
  const uiLayer = new Container();
  root.addChild(bgLayer, waterLayer, blockLayer, uiLayer);

  // 占位背景：宣纸底 + 河道色块（Slice 1 起用真实关卡数据替换）
  const paper = new Graphics();
  paper.rect(0, 0, width, height).fill(0xe8e4d8);
  bgLayer.addChild(paper);

  return {
    app,
    root,
    bgLayer,
    waterLayer,
    blockLayer,
    uiLayer,
    width,
    height,
  };
}
