// Agnes.ai 资产生成脚本。用法：
//   AGNES_API_KEY=xxx node scripts/gen-assets.mjs [name1 name2 ...]
// 不带参数 = 生成清单全部；带参数 = 只生成指定项。输出到 src/assets/。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', 'assets');
mkdirSync(OUT, { recursive: true });

const API = 'https://apihub.agnes-ai.com/v1/images/generations';
const KEY = process.env.AGNES_API_KEY;
if (!KEY) {
  console.error('缺少 AGNES_API_KEY 环境变量');
  process.exit(1);
}

// 统一水墨风格词根：宣纸质感、墨黑+赭石+青绿、留白、无文字无人物
const STYLE =
  'traditional Chinese ink wash painting (shuimo), xuan rice-paper texture, ' +
  'muted palette of ink black, warm sepia and faded celadon green, soft wet brush strokes, ' +
  'elegant negative space, subtle, refined, no text, no people, no signature';

const MANIFEST = {
  // 主场景背景：横向河谷，水自左向右，近岸有村落。纯氛围底，置于最底层。
  'bg-scene': {
    size: '1280x720',
    prompt:
      `A horizontal river valley landscape seen from a high angle, a wide river flowing from left to right across the whole frame, ` +
      `gentle earthen banks, a small cluster of village rooftops on the lower-right near bank, ` +
      `distant misty mountains at the top, willow and reeds along the shore, ${STYLE}, ` +
      `wide cinematic composition, atmospheric mist, high visual density background art for a game`,
  },
  // 河水纹理（可平铺）：水墨水波纹，横向流动感
  'water-tile': {
    size: '1024x1024',
    prompt:
      `Seamless tileable water surface texture, flowing ink-wash river ripples streaming horizontally, ` +
      `swirling brush strokes suggesting current, faded celadon and grey-blue ink on rice paper, ${STYLE}, ` +
      `top-down view, even lighting, no horizon, abstract water pattern`,
  },
  // 石墙构件：正交俯视、长轴水平（rotStep0=水平），便于 45° 旋转无固有透视。白底便于抠图。
  'stone-wall': {
    size: '1024x1024',
    prompt:
      `Strict top-down orthographic bird's-eye view, looking straight down, of a long straight rampart of ` +
      `packed river cobblestones, the wall running horizontally left-to-right across the centre, ` +
      `individual grey weathered fitted stones with sepia and faint celadon moss, completely flat overhead ` +
      `view with no perspective and no side faces visible, ink-wash rendering, ${STYLE}, soft faint cast ` +
      `shadow directly beneath, isolated centered on a plain off-white paper background, single horizontal bar object`,
  },
  // 村落小屋（俯视聚落），白底
  'village-hut': {
    size: '1024x1024',
    prompt:
      `A small cluster of traditional Chinese village houses with grey tiled roofs, top-down view, ` +
      `a few trees, ink-wash rendering, ${STYLE}, isolated centered on plain off-white paper background, single small settlement`,
  },
  // 结算印章（朱红篆刻）白底
  'seal': {
    size: '1024x1024',
    prompt:
      `A traditional Chinese carved seal stamp impression in vermilion cinnabar red, square seal with ` +
      `archaic seal-script motif of flowing water, slightly rough edges like pressed on paper, ` +
      `isolated centered on plain off-white background, no other text`,
  },

  // —— 放水环节流水材质（参考真实长曝光溪流 GIF，丝滑流动+白沫）——
  // 底层流水：横向无缝可平铺，丝滑长曝光水流，青绿灰水色，无强高光
  'water-flow': {
    size: '1024x512',
    prompt:
      `Seamless horizontally tileable top-down river water surface, silky long-exposure motion-blurred ` +
      `current flowing left to right, smooth flowing streaks, soft turquoise grey-green water, ` +
      `gentle tonal variation, no foam, no rocks, no horizon, even soft lighting, photographic, high detail`,
  },
  // 白沫层：纯白浪花泡沫流线，黑底（用 additive 混合抠黑），横向无缝
  'foam': {
    size: '1024x512',
    prompt:
      `Seamless horizontally tileable river foam and froth, wispy streaks of pure white whitewater foam ` +
      `flowing horizontally like rapids, soft feathered foam strands, on a solid pure black background, ` +
      `high contrast, top-down, photographic whitewater texture, no rocks`,
  },
  // 位移噪声图：柔和灰度湍流，用于 DisplacementFilter 制造水面扰动
  'flow-noise': {
    size: '512x512',
    prompt:
      `Seamless tileable smooth grayscale turbulence noise map, soft cloudy perlin-like flowing distortion, ` +
      `gentle horizontal streaking, mid grey average, low contrast, no sharp edges, abstract displacement map`,
  },
};

async function gen(name, spec) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-image-2.1-flash',
      prompt: spec.prompt,
      size: spec.size,
      return_base64: true,
    }),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  const d = json?.data?.[0];
  let buf;
  if (d?.b64_json) {
    buf = Buffer.from(d.b64_json, 'base64');
  } else if (d?.url) {
    const img = await fetch(d.url);
    if (!img.ok) throw new Error(`${name}: 下载图片失败 HTTP ${img.status}`);
    buf = Buffer.from(await img.arrayBuffer());
  } else {
    throw new Error(`${name}: 响应无图片: ${JSON.stringify(json).slice(0, 300)}`);
  }
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, buf);
  console.log(`✓ ${name} → ${file}`);
}

const picked = process.argv.slice(2);
const names = picked.length ? picked : Object.keys(MANIFEST);
for (const name of names) {
  const spec = MANIFEST[name];
  if (!spec) {
    console.error(`未知资产名：${name}`);
    continue;
  }
  try {
    await gen(name, spec);
  } catch (e) {
    console.error('✗', e.message);
  }
}
