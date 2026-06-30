import { Assets, Rectangle, Texture } from 'pixi.js';
import bgSceneUrl from '../assets/bg-iso.png'; // 等距俯视水墨河谷（替换原水平视角 bg-scene）
import waterTileUrl from '../assets/water-tile.png';
import stoneWallIso1Url from '../assets/stone-wall-iso-1.png';
import stoneWallIso2Url from '../assets/stone-wall-iso-2.png';
import stoneWallIso3Url from '../assets/stone-wall-iso-3.png';
import stoneWallIso4Url from '../assets/stone-wall-iso-4.png';
import villageHutUrl from '../assets/village-hut.png';
import sealUrl from '../assets/seal.png';
import waterFlowUrl from '../assets/water-flow.png';
import foamUrl from '../assets/foam.png';
import flowNoiseUrl from '../assets/flow-noise.png';

export interface GameTextures {
  bgScene: Texture;
  waterTile: Texture;
  stoneWalls: Texture[]; // 4 张立体卵石堰（已抠透明+长轴转正），按朝向各取一张
  villageHut: Texture;
  seal: Texture;
  waterFlow: Texture; // 丝滑长曝光流水底层（横向可平铺）
  foam: Texture; // 白沫浪花，黑底（additive 抠黑，横向可平铺）
  flowNoise: Texture; // 灰度湍流位移图（DisplacementFilter）
}

/**
 * 加载全部水墨贴图（Agnes.ai 生成）。
 * stoneWalls 为 4 张立体卵石堰，已离线抠纸底透明 + 长轴转正成水平（见 scripts/cut-paper.mjs）；
 * 渲染层按旋转档位选一张并按投影角旋转 → 直立广告牌、贴合河道方向（见 blockRenderer.ts）。
 * waterFlow/foam/flowNoise 用于放水环节的丝滑流水分层（参考真实长曝光溪流），均设 repeat 以便平铺/位移。
 */
export async function loadGameTextures(): Promise<GameTextures> {
  const [bgScene, waterTile, sw1, sw2, sw3, sw4, villageFull, seal, waterFlow, foam, flowNoise] =
    await Promise.all([
      Assets.load<Texture>(bgSceneUrl),
      Assets.load<Texture>(waterTileUrl),
      Assets.load<Texture>(stoneWallIso1Url),
      Assets.load<Texture>(stoneWallIso2Url),
      Assets.load<Texture>(stoneWallIso3Url),
      Assets.load<Texture>(stoneWallIso4Url),
      Assets.load<Texture>(villageHutUrl),
      Assets.load<Texture>(sealUrl),
      Assets.load<Texture>(waterFlowUrl),
      Assets.load<Texture>(foamUrl),
      Assets.load<Texture>(flowNoiseUrl),
    ]);

  const stoneWalls = [sw1, sw2, sw3, sw4];

  // 村屋原图 1024²，房屋+树仅居中一小块，四周大片宣纸空白。裁切到内容主体，
  // 去掉空白边 → multiply 叠底时不再在房子周围压出一圈淡方框。
  const villageHut = new Texture({
    source: villageFull.source,
    frame: new Rectangle(150, 240, 700, 500),
  });

  // 平铺/位移贴图设为重复采样，避免边缘接缝与位移拉伸。
  for (const t of [waterFlow, foam, flowNoise]) {
    t.source.addressMode = 'repeat';
  }

  return { bgScene, waterTile, stoneWalls, villageHut, seal, waterFlow, foam, flowNoise };
}
