# Spec: 都江堰治水解谜游戏 — 第一关 L1（横屏 Web 版）

> 版本 V0.1 · 2026-06-28 · 待人工审阅
> 关联策划文档：proposal/系统1~5。本 spec 是 web 实现的唯一事实来源，与原 Unity 策划冲突处以本文为准。

## 1. Objective（目标）

**做什么**：一款"建造—放水—顿悟"循环的确定性水流解谜游戏的**第一关 L1**，浏览器横屏运行；L2 仅做占位。

**为什么**：把都江堰"堵不如疏、顺势而为"的理念，转化为玩家在零惩罚试错中自己悟出的操作体验，整局即教学，不靠文字说教。

**目标用户**：对中国传统水利/解谜感兴趣的休闲玩家；浏览器优先，后续移植微信小游戏。

**L1 的成功体验**：玩家第一反应横着筑墙硬堵 → 墙被冲垮、村庄被淹（撞墙）→ 调整为斜放导流 → 主流顺势绕过村庄、村庄存活（顿悟）→ 用更少的墙达成 = 节俭通关。

**本期成功判定（Definition of Done）**：
- L1 可在浏览器横屏完整游玩：编辑 → 放水 → 模拟 → 结算 → 重试/下一关。
- 水流模拟**确定性**：同一布局 + 同一种子，多次运行的村庄受击数完全一致（有自动化测试证明）。
- 横着筑墙必败（墙塌+淹村），斜向导流可胜，2 个墙的优雅解可触发节俭。
- 水墨美术替换占位色块后画面"较为精美"。
- L2 入口存在，点击显示"敬请期待"占位。

## 2. Tech Stack（技术栈）

| 项 | 选择 | 说明 |
|---|---|---|
| 语言 | TypeScript 5.x | 编译为 JS，文档数据结构强类型，便于正确性 |
| 渲染 | PixiJS v8 | WebGL 2D，俯视/横屏舞台、图层、滤镜 |
| 构建/开发 | Vite 5.x | 快速 HMR |
| 单测 | Vitest | 模拟确定性 + 纯逻辑单测 |
| E2E/浏览器测试 | Playwright | 真实浏览器跑拖拽放置全流程、放水→结算、视觉截图 |
| 美术素材 | Agnes.ai（Agnes Image 2.1） | 水墨贴图生成；生成时向用户索取 API key |
| 音频 | 预留接口（本期不接素材） | `src/audio/` 抽象层，占位静音 |
| 确定性随机 | 自实现 mulberry32（seeded PRNG） | 禁止用 Math.random |
| 微信移植（后期） | PixiJS 微信适配层 | 本期不实现，但代码不写浏览器专属 API 死结 |

**禁止项**：渲染层与模拟层耦合；模拟逻辑里用 `Math.random` / `Date.now` / 非固定步长。

## 3. Commands（命令）

```
安装:  npm install
开发:  npm run dev          # Vite dev server，浏览器打开
构建:  npm run build        # 产出 dist/
预览:  npm run preview
单测:  npm run test         # vitest run
单测(watch): npm run test:watch
E2E:   npm run e2e          # playwright test（先 build 或起 dev server）
E2E(有头): npm run e2e:headed
类型检查: npm run typecheck # tsc --noEmit
Lint:  npm run lint
```

## 4. Project Structure（目录结构）

```
game-vue/
  index.html
  package.json  vite.config.ts  tsconfig.json
  docs/
    spec-L1.md              # 本文件
  src/
    main.ts                 # 入口，挂载 PixiJS Application
    core/
      rng.ts                # mulberry32 确定性随机
      fixedLoop.ts          # 固定步长循环（dt=1/60）
      gameStateMachine.ts   # Editing / Simulating / Settling / Paused
      vec2.ts               # 2D 向量工具
    sim/
      simulation.ts         # 模拟主循环（确定性，纯逻辑，无渲染依赖）
      particlePool.ts       # 粒子池（预分配，无运行时分配）
      waterSource.ts        # 流量曲线发射
      collision.ts          # OBB 碰撞 + 法向反射/导流
      village.ts            # 村庄受击区域与淹没计数
    blocks/
      blockConfig.ts        # 构件静态配置（石墙）
      blockInstance.ts      # 运行时实例
      placement.ts          # 放置/移动/旋转/删除 + 网格吸附 + 校验
    economy/
      wallet.ts             # 金钱钱包 + 节俭判定
    levels/
      levelTypes.ts         # LevelConfig / LevelRuntime 类型
      L1.ts                 # L1 数据
      L2.ts                 # L2 占位
    judge/
      puzzleJudge.ts        # 通关/失败/节俭判定
    render/
      stage.ts              # 图层装配（背景/水/构件/UI）
      waterRenderer.ts      # 粒子 + 水墨水面渲染
      blockRenderer.ts      # 构件渲染（预览/已放置/损坏）
      hud.ts                # 顶部关卡名+金钱条、底部工具栏、结算弹窗
    ui/
      levelSelect.ts        # 选关界面（L1 可玩 / L2 占位）
    audio/
      audio.ts              # 音频接口抽象（playSfx/playBgm），本期占位静音
    assets/                 # 水墨贴图（Agnes.ai 生成）
  tests/
    sim.determinism.test.ts # 同种子同布局结果一致
    placement.test.ts       # 吸附/重叠/库存校验
    judge.test.ts           # 胜负/节俭判定
  e2e/
    drag-place.spec.ts      # 拖拽放置/旋转/删除全流程（浏览器）
    play-through.spec.ts    # 编辑→放水→结算（硬堵败 / 斜放胜）
    playwright.config.ts
  scripts/
    gen-assets.ts           # 调 Agnes.ai 批量生成水墨素材（运行时索取 api key）
```

**分层铁律**：`sim/`、`blocks/`、`economy/`、`judge/`、`levels/` 是**纯逻辑**，不 import PixiJS；`render/`、`ui/` 只读取逻辑层状态做绘制。这样模拟可被测试，且后期换渲染/移植微信不动逻辑。

## 5. 关卡设计（L1 具体布局与数值）

> **构件范围决策（2026-06-28）**：L1 **单构件=石墙**。石墙正撞会垮（堵），斜放 45° 导流取胜（疏），顿悟点=换角度。竹笼按原文档保留到 L2（分水）。

### 5.1 坐标系
- 世界单位 = 米。x 向右（水流方向），y 向下（屏幕方向）。
- 网格吸附步长 0.5m；**旋转步长 45°（rotStep 0~7，8 朝向）** —— 较原策划 90° 加密，斜向导流必需。

### 5.2 横屏河道布局（俯视横置，水左→右）
```
 x: 0 ─────────────────────────────────────────── 28 (m)
 y=0 ┌───────────────── 上岸（不可放置）─────────────────┐
 y=2 │≈≈≈≈≈≈≈                                    主流出口 →│
     │水源→   [   玩家可放置区  x∈[6,14]  ]              │
 y=8 │≈≈≈≈≈≈≈            ┌──缺口 x∈[14,18]──┐          │
     └───────────────────┘   ↓ 村庄区 ↓    └──────────────┘
            下岸                🏠🏠🏠
```
- **河道内腔**：y ∈ [2, 8]，x ∈ [0, 28]。
- **水源**：左边缘 x=0，沿 y∈[2,8] 发射，方向 +x。
- **主流出口**：右边缘 x=28（水应从这里流走 = 安全）。
- **村庄缺口**：下岸在 x∈[15,17] 有 2m 缺口，缺口下方是村庄受击区 x∈[15,17] y∈[8,10]。水若直冲会从缺口灌入。
- **玩家可放置区**：x∈[6,15]、y∈[2,8]（缺口上游至缺口口）。玩家在此斜放石墙，把下层主流向上岸偏导，使其越过缺口、从右侧出口流走。

### 5.3 机制（为什么斜放能赢、硬堵会输）— 实现版（已落地，对原策划有偏离）
- 石墙是旋转 OBB。粒子进入 OBB 时按墙面**法向**反射法向分量（带衰减），保留切向 → 斜墙把水"导走"。
- **墙分两类**（按宽面对流向对齐度 align=|sin(角)|）：align ≥ 0.85 = **挡水墙**（横断 90°）；否则 = **导流墙**（含 45° 斜放、0° 水平等一切非横断墙）。
- **倒塌 = 接触计时模型**：墙被洪水粒子首次接触（粒子进入包围盒）即闩锁，之后连续累计 contactTime；达到 collapseDelay 即垮。与水势大小无关，故水平墙/被挡住的坝也能稳定计时。
  - 挡水墙 collapseDelay = **3.5s**（接触后快垮 → 决堤 → 村庄被淹 → 败）。
  - 导流墙 collapseDelay = **9s**（接触后 8-10s 内垮；晚于洪峰，故村庄已安全）。契合都江堰"岁修"——无永固之物，连导流墙最终也会被冲垮。
- **L1 失败判定 = 村庄被淹（唯一）**。硬堵的墙在 ~5-7s 被冲垮（过程，可视），决堤后水涌入村庄、~10-11s 越过 floodThreshold → 失败由**洪水**触发（不是"墙垮即败"）。斜放墙不垮且分流 → 村庄存活 → 成功；什么都不做 → 直冲淹没。
- > **对原策划的偏离（需留意）**：① 旋转 90°→45°；② 水势/倒塌从"pressure=count×velocity + 瞬时阈值"演化为"loadFactor 判据 + 累积损伤"——因纯法向冲量无法把"扎在密集水里的斜墙"与"正撞坝"分开（斜墙反而水势更高）。两者经机制回归单测验证成立。

### 5.4 L1 数值（可调，写在 src/levels/L1.ts）
| 项 | 值 | 用意 |
|---|---|---|
| 可用构件 | 石墙 wall ×5 | 只给一种核心构件 |
| 石墙 cost | 10 | — |
| 石墙尺寸 | 长 2.0m × 短 0.6m | OBB |
| 挡水墙判据 | align ≥ 0.85 | 横断墙；否则导流墙(含45°/0°) |
| 挡水墙 collapseDelay | 3.5s | 接触后快垮 → 决堤致败 |
| 导流墙 collapseDelay | 9s | 接触后 8-10s 垮（晚于洪峰，村庄已安全） |
| moneyLimit | 50 | 够堆 5 个硬堵（然后失败） |
| frugalMoney | 20 | 2 个斜墙即可解 = 节俭（实测最优解 14.5,7 / 14.5,5 rot7，漏水 8） |
| 水源 base→peak | 20→70 粒子/秒，rise3s/stable8s | "流量递增后稳定" |
| flowBiasY | 0.35 | 河床朝下岸坡降，使直冲水流灌入缺口 |
| maxParticles | 400（全设备统一） | 确定性前提 |
| floodThreshold | 累计 30 粒子进入村庄区 | 淹没判定（空布局~51必淹；硬堵墙垮后~39淹；斜2解~8存活） |
| 模拟时长 | 18s | 撑过洪峰 = 胜 |
| 胜利 | 村庄受击 < floodThreshold | — |
| 失败 | 村庄受击 ≥ floodThreshold | 文案：墙曾垮则"墙倒了"，否则"村子仍被淹" |

## 6. 数据结构（核心，TypeScript）

```ts
// 构件静态配置
interface BlockConfig {
  blockId: string;        // "wall"
  blockName: string;      // "石墙"
  cost: number;           // 10
  longLen: number;        // 2.0 (m)
  shortLen: number;       // 0.6 (m)
  canRotate: boolean;     // true
  collapseThreshold: number; // 15
  collapseDuration: number;  // 0.8 (s)
}

// 构件运行时实例
interface BlockInstance {
  instanceId: string;
  blockId: string;
  pos: { x: number; y: number };  // 世界坐标（已吸附网格）
  rotStep: 0 | 1 | 2 | 3;
  state: 'preview' | 'placed' | 'broken';
  damage: 'stable' | 'collapsing' | 'collapsed';
  collapseTimer: number;
}

// 粒子（粒子池中预分配，active 标记复用）
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; ink: number; active: boolean;
}

// 关卡配置
interface LevelConfig {
  id: string; index: number; title: string; theme: string;
  channel: { x0: number; y0: number; x1: number; y1: number };
  source: { x: number; yMin: number; yMax: number; dir: {x:number;y:number};
            baseFlowRate: number; peakFlowRate: number;
            riseDuration: number; stableDuration: number; turbulence: number };
  village: { x0: number; y0: number; x1: number; y1: number; floodThreshold: number };
  placeZone: { x0: number; y0: number; x1: number; y1: number };
  inventory: Record<string, number>;   // { wall: 5 }
  moneyLimit: number; frugalMoney: number;
  maxParticles: number; simSeed: number; simDuration: number;
  narrative: { start: string; success: string; fail: string };
}

// 结算结果
interface PuzzleResult {
  isSuccess: boolean; isFrugal: boolean;
  failReason: 'flood' | 'wall_broken' | null;
  consumedMoney: number; villageHitCount: number; simTime: number;
}
```

## 7. 确定性模拟算法（核心）

```
固定步长 dt = 1/60，模拟与渲染分离（render 插值/直接读最新态）。
每帧（StepSimulation）:
  1. flowRate = lerp(base, peak, saturate(elapsed/riseDuration))
     spawnCount = floor(flowRate*dt + carry)  // carry 累计小数，保证确定
     在 source 区间用 seeded rng 取随机 y 与微扰，生成粒子
  2. 遍历 active 粒子：x += vx*dt; y += vy*dt（加确定性湍流：rng 驱动）
  3. 碰撞：
       - 河岸约束：y 越界则夹回并反射法向分量
       - 对每个 placed 石墙做 OBB 检测：命中则按墙面法向反射，
         累加该墙 pressure += 撞击法向速度分量
  4. 村庄：粒子进入 village 矩形 → villageHitCount++（且回收该粒子）
  5. 回收：life<=0 或 x>channel.x1 的粒子 active=false
  6. 石墙损坏：对每个 placed 墙，若 pressure≥thr：
        collapseTimer += dt; eff = min(duration/(pressure/thr), 2.0)
        timer≥eff → state=broken（不再参与碰撞），触发倒塌特效事件
     pressure 每帧清零重算
  7. elapsed += dt；elapsed≥simDuration 或 villageHitCount≥floodThreshold → 结束
```

**确定性要点**：固定 dt；唯一 seeded rng 实例按固定顺序取值；遍历顺序稳定（按 instanceId/index 排序）；不用浮点不稳定操作（必要时统一保留定点/固定精度）。

## 8. Code Style（代码风格）

```ts
// 纯逻辑模块：导出纯函数 + 小类，无副作用、无渲染依赖。
// 命名：camelCase 变量/函数，PascalCase 类型，UPPER_SNAKE 常量。
export function stepSimulation(sim: SimState, dt: number): void {
  spawnParticles(sim, dt);
  for (const p of sim.particles) {
    if (!p.active) continue;
    integrate(p, sim, dt);
    resolveBankCollision(p, sim.level.channel);
    resolveBlockCollisions(p, sim.blocks);
  }
  accumulateVillageHits(sim);
  recycleDeadParticles(sim);
  updateBlockDamage(sim, dt);
  sim.elapsed += dt;
}
```
约定：每个文件单一职责；函数 < ~40 行；避免过度抽象——只有真出现第二处复用才提取。

## 9. Testing Strategy（测试策略）

两层：纯逻辑单测（Vitest）+ 浏览器 E2E（Playwright）。**两层都是验收的硬门槛，不只是单测。**

### 9.1 单测（Vitest，纯逻辑、不依赖浏览器）
  1. `sim.determinism.test.ts`：固定 seed + 固定布局，跑 N 步两次，`villageHitCount` 与若干粒子位置完全相等。
  2. `placement.test.ts`：网格吸附取整、重叠拒绝、越界拒绝、库存为 0 拒绝、删除返还。
  3. `judge.test.ts`：村庄达阈值=失败；撑过=成功；消耗≤frugalMoney=节俭；墙塌后淹村=fail_reason 正确。
  4. 机制回归：横着堵满河道 → 墙 broken 且淹村（失败）；2 个斜墙布局 → 村庄存活且节俭（成功）。这两条是 L1 的核心验收。
- 覆盖期望：`sim/`、`blocks/`、`economy/`、`judge/` 逻辑覆盖率 ≥ 80%。

### 9.2 浏览器 E2E（Playwright，真实浏览器、含拖拽全流程展示）
PixiJS 画布内的交互无法用 DOM 选择器点选，因此约定：**为 E2E 暴露一个测试钩子** `window.__game`（仅 dev/test 构建挂载），提供 `getBlockScreenPos(id)`、`getState()`、`getResult()`、`getHud()` 等只读查询，让测试能定位画布内构件并断言状态。拖拽用 Playwright 的 `mouse.move/down/up` 走真实指针事件，不走钩子。

  1. `drag-place.spec.ts`（**拖拽全流程展示**，重点）：
     - 从底部工具栏拖石墙到河道合法点 → 断言出现 placed 实例、库存 -1、金钱 -10。
     - 拖到非法点（岸上/可放区外）→ 断言预览泛红、释放后回弹、库存/金钱不变。
     - 点击已放置构件 → 断言 rotStep+1、包围盒长宽互换。
     - 拖到删除区 → 断言实例移除、库存/金钱返还。
     - 拖到与已有构件重叠 → 断言拒绝。
     - 全程每个关键步骤 `page.screenshot()` 留档，作为"全流程展示"产物。
  2. `play-through.spec.ts`（端到端玩法）：
     - 硬堵布局：横排堵满河道 → 点放水 → 等模拟结束 → 断言结算弹窗为失败（"墙倒了"/"村子仍被淹"），且能看到墙 broken。
     - 斜放布局：2 墙斜向导流 → 放水 → 断言结算为成功"暂时安全" + 节俭"俭"。
     - 点"重试"回到 Editing；点"下一关"进入选关；点 L2 显示"敬请期待"。
  3. 关键帧截图纳入 `e2e/__screenshots__/`，PR 中附上，便于人工核验画面。
- 运行前提：`npm run dev` 起本地服务，或 `npm run build && preview`，Playwright `baseURL` 指向它。

### 9.3 手动验证
浏览器横屏实玩一遍，确认手感、水墨表现与音频占位接口被正确调用（不报错）。

## 10. Boundaries（边界）

- **Always（总是）**：模拟层零渲染依赖；改逻辑先跑 `npm run test`；用 seeded rng；数值改在 `levels/L1.ts` 不散落代码；提交前 `npm run typecheck`。
- **Ask first（先问）**：新增第三方依赖；改 L1 核心数值平衡导致解法变化；改确定性模拟算法；引入存档/后端。
- **Never（绝不）**：模拟里用 `Math.random`/`Date.now`/可变步长；为过关写死特判而非通用机制；删测试来"通过"。

## 11. Success Criteria（可测成功标准）

1. `npm run dev` 浏览器横屏可玩 L1，完整状态机流转无报错。
2. `npm run test` 全绿，含确定性测试与"硬堵必败/斜放可胜/2墙节俭"三条回归。
3. `npm run e2e` 全绿，含拖拽放置/旋转/删除全流程与端到端玩法，关键帧截图产出。
4. 横着堵满河道 → 10s 内墙塌且淹村（失败弹窗"墙倒了"/"村子仍被淹"）。
5. 斜向导流布局 → 村庄受击 < 阈值（成功弹窗"暂时安全"）；≤20 金钱时显示"俭"。
6. 选关界面 L2 点击显示"敬请期待"。
7. 水墨贴图（Agnes.ai 生成）替换后整体观感"较为精美"（主观，以你验收为准）。

## 12. 叙事文案（V1 草稿，老河工口吻，简练水墨）

写入 `src/levels/L1.ts` 的 `narrative` 字段，后续可再润色。

- **开场 start**：「岷江水起，村子就在下游岸边。河工递来几垛石料：『水来了，先挡一挡吧。』」
- **失败·墙倒 wall_broken**：「石墙轰然垮塌——『硬挡？水的力气，比石头大。』」
- **失败·淹村 flood**：「水漫过田埂，涌进了村子。『堵住一处，它便从别处来。』」
- **成功 success**：「水顺着石垛斜斜淌过，绕开了村子，向下游去了。老河工捋须：『好——不与水争，顺势而走，这便是疏。』」
- **节俭追加 frugal**：「你只用了两垛石料。『四两拨千斤，这才是治水的本事。』」

## 13. 音频接口（本期只预留，不接素材）

`src/audio/audio.ts` 暴露抽象，逻辑/UI 在关键事件调用，占位实现为静音空函数；后期接素材不改调用方。
```ts
interface AudioBus {
  playSfx(id: 'place' | 'rotate' | 'remove' | 'release' | 'collapse'
            | 'flood' | 'win' | 'frugal' | 'insufficient'): void;
  playBgm(id: 'level' | null): void;  // null = 停止
  setMuted(muted: boolean): void;
}
```
触发点：放置/旋转/删除构件、点放水、墙倒塌、淹村、成功、节俭、金钱不足。

## 14. 已收口决策 & 剩余待办

**已确认**：§5.3 法向水势改动 ✔；§5.2 横屏布局 + 下岸缺口村庄 ✔；E2E 含拖拽全流程 ✔；美术用 Agnes.ai（生成时索取 api key）✔；叙事由我先写（见 §12）✔；音频预留接口 ✔。

**剩余待办（不阻塞进入 Phase 2）**：
1. 河道尺寸 28×6m、缺口 x∈[14,18]、可放区 x∈[6,14] 为初值，实现期跑通后按手感微调。
2. Agnes.ai 生成素材的具体清单（地形/河道/石墙三态/村庄/缺口/UI 印章/结算印章）在 Phase 3 列出，开生成时找你要 key。

