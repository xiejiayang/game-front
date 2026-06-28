import { Assets, Rectangle, Texture } from 'pixi.js';
import bgSceneUrl from '../assets/bg-scene.png';
import waterTileUrl from '../assets/water-tile.png';
import stoneWallUrl from '../assets/stone-wall.png';
import villageHutUrl from '../assets/village-hut.png';
import sealUrl from '../assets/seal.png';
import waterFlowUrl from '../assets/water-flow.png';
import foamUrl from '../assets/foam.png';
import flowNoiseUrl from '../assets/flow-noise.png';

export interface GameTextures {
  bgScene: Texture;
  waterTile: Texture;
  stoneWall: Texture; // 已裁切到石垒主体（长轴水平）
  villageHut: Texture;
  seal: Texture;
  waterFlow: Texture; // 丝滑长曝光流水底层（横向可平铺）
  foam: Texture; // 白沫浪花，黑底（additive 抠黑，横向可平铺）
  flowNoise: Texture; // 灰度湍流位移图（DisplacementFilter）
}

/**
 * 加载全部水墨贴图（Agnes.ai 生成）。
 * stoneWall 裁切到石墙主体水平条带，避免大片纸底留白；纸底由 multiply 混色消隐。
 * waterFlow/foam/flowNoise 用于放水环节的丝滑流水分层（参考真实长曝光溪流），均设 repeat 以便平铺/位移。
 */
export async function loadGameTextures(): Promise<GameTextures> {
  const [bgScene, waterTile, stoneFull, villageHut, seal, waterFlow, foam, flowNoise] = await Promise.all([
    Assets.load<Texture>(bgSceneUrl),
    Assets.load<Texture>(waterTileUrl),
    Assets.load<Texture>(stoneWallUrl),
    Assets.load<Texture>(villageHutUrl),
    Assets.load<Texture>(sealUrl),
    Assets.load<Texture>(waterFlowUrl),
    Assets.load<Texture>(foamUrl),
    Assets.load<Texture>(flowNoiseUrl),
  ]);

  // 石墙原图 1024²，石垒主体约在垂直中段。裁切成水平条带贴合构件 OBB 长宽比。
  const sw = stoneFull.source;
  const stoneWall = new Texture({
    source: sw,
    frame: new Rectangle(70, 395, 884, 235),
  });

  // 平铺/位移贴图设为重复采样，避免边缘接缝与位移拉伸。
  for (const t of [waterFlow, foam, flowNoise]) {
    t.source.addressMode = 'repeat';
  }

  return { bgScene, waterTile, stoneWall, villageHut, seal, waterFlow, foam, flowNoise };
}
