# 实现计划 Plan: L1（Phase 2）

> 配套 `docs/spec-L1.md` V0.2 · 2026-06-28 · 待审
> 原则：垂直切片，每片独立可跑可验证；先用占位色块跑通玩法手感，最后再上 Agnes.ai 水墨美术（避免没验证机制就投美术）。

## A. 组件依赖图（谁依赖谁）

```
                 core/ (rng, fixedLoop, vec2)        ← 无依赖，最底层
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                 ▼
   levels/(类型+L1)  sim/(粒子/水源/    blocks/(config/
        │            碰撞/村庄/主循环)   instance/placement)
        │               │                 │
        │               └───────┬─────────┘
        ▼                       ▼
   economy/(wallet)        judge/(puzzleJudge)
        │                       │
        └───────────┬───────────┘
                    ▼
         core/gameStateMachine（编排 Editing/Simulating/Settling）
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   render/(stage,water,      ui/(levelSelect)   audio/(占位)
   block,hud) + window.__game 测试钩子
                    │
                    ▼
   assets/（Agnes.ai 水墨贴图，最后替换）
```

**铁律复述**：`core/sim/blocks/economy/judge/levels` 纯逻辑、零 PixiJS import；`render/ui` 只读逻辑态绘制。

## B. 构建顺序（垂直切片）

### Slice 0 — 脚手架与测试管线（地基）
- Vite + TypeScript + PixiJS v8；Vitest + Playwright 配置；npm scripts（dev/build/test/e2e/typecheck/lint）。
- 渲染一个空横屏舞台（固定逻辑分辨率 + 自适应缩放，锁横屏）。
- 串通 `window.__game` 测试钩子骨架（dev/test 构建挂载，prod 不挂）。
- **验证**：`npm run dev` 出空白横屏画布；`npm run test` 与 `npm run e2e` 能跑（各 1 条 smoke）。

### Slice 1 — 确定性水流（占位色点）
- `core/rng`（mulberry32）、`core/fixedLoop`、`core/vec2`。
- `levels/levelTypes` + `levels/L1`（河道/水源/村庄/可放区/种子/数值）。
- `sim/particlePool`（预分配池）、`sim/waterSource`（流量曲线+carry累计）、`sim/simulation`（每帧流程）、`sim/collision`（先只做河岸约束）、`sim/village`（受击计数）。
- `render/stage` + `render/waterRenderer`：河道/村庄画成矩形，粒子画成墨点（速度→墨色）。
- **验证**：水从左流到右、撞岸不穿出、从右出口回收；`sim.determinism.test` 通过（同种子两次跑 villageHitCount 与抽样粒子位完全一致）。**此片是最大风险的早期验证。**

### Slice 2 — 构件与导流/倒塌机制（纯逻辑先行）
- `blocks/blockConfig`（石墙）、`blocks/blockInstance`、`blocks/placement`（网格吸附/越界/重叠/库存校验，程序化调用，暂无 UI）。
- `sim/collision` 扩展：OBB 检测 + 法向反射 + 累加法向水势 pressure；`updateBlockDamage`（effectiveCollapseDuration、broken 后停止挡水）。
- **验证（单测）**：横排堵满河道 → 墙 broken 且 villageHitCount≥阈值（败）；2 墙斜放 → 村庄存活（胜）。**§9.1 第 4 条机制回归，L1 成立与否在此拍板。** 不过此片需在 Slice 1 之后、调参可能反复。

### Slice 3 — 编辑交互 + 金钱 + 状态机 + HUD + 结算
- `economy/wallet`（扣减/返还/节俭判定）、`judge/puzzleJudge`、`core/gameStateMachine`。
- `render/blockRenderer`（preview 半透/非法泛红 / placed / broken 倒塌特效占位）。
- 交互：工具栏拖拽放置、点击旋转 90°、拖到删除区删除、实时金钱预览。
- `render/hud`：顶部关卡名+金钱条、底部工具栏（图标/数量/置灰）、放水按钮（模拟中置灰）、结算弹窗（暂时安全/墙倒了/村子仍被淹/俭）。
- 完整 `window.__game` 只读查询（getBlockScreenPos/getState/getResult/getHud）。
- **验证（E2E）**：`drag-place.spec` 全过（放置/旋转/删除/非法回弹/重叠拒绝 + 截图）；`play-through.spec` 硬堵败、斜放胜、节俭、重试回编辑。

### Slice 4 — 选关 + L2 占位 + 叙事 + 音频接口
- `ui/levelSelect`（L1 可玩、L2 置灰"敬请期待"）、`levels/L2`（占位）。
- 叙事文本接入（§12 文案）：开场/成功/失败/节俭弹窗。
- `audio/audio`（AudioBus 占位静音）+ 在事件点调用（不报错即可）。
- **验证（E2E）**：play-through 跑到结算后进选关、点 L2 显示"敬请期待"；叙事弹窗按状态出现。

### Slice 5 — Agnes.ai 水墨美术 + 表现打磨
- `scripts/gen-assets.ts` 调 Agnes.ai 生成清单（地形/河道/石墙三态/村庄/缺口/印章/UI），运行时索取 api key。
- 用贴图替换占位色块；水面墨纹（PixiJS 滤镜/着色）、入水口喷涌、墙倒塌碎屑、结算印章动画。
- **验证**：浏览器横屏实玩 + E2E 关键帧截图人工核验"较为精美"。

## C. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **浮点非确定性** | 跨次/跨设备结果不一致，毁掉顿悟前提 | 固定 dt=1/60；唯一 seeded rng 固定取值顺序；遍历按 index 稳定排序；spawn 用 carry 累计小数；必要时关键量定点化。Slice 1 即上确定性测试 |
| **导流手感不成立**（斜放赢不了 / 硬堵不败） | L1 玩法立不住 | Slice 2 纯逻辑 + 单测先把机制跑通再做 UI；阈值/尺寸/流量集中在 L1.ts 反复调；先保证两条回归绿 |
| **PixiJS 画布无法 DOM 选择** | E2E 拖拽难写 | `window.__game` 暴露画布内构件屏幕坐标供定位；拖拽走真实指针事件断言效果 |
| **Agnes.ai 风格不统一/不可控** | 画面拼凑 | 先出 1~2 张样张定风格（统一 prompt 词根/色板）再批量；美术在最后切片，不阻塞玩法 |
| **状态机时序竞态**（放水冷却、切后台） | 重复触发/卡死 | 状态机集中管理转换；放水按钮进冷却；切后台暂停 |

## D. 可并行 vs 必须串行

- **必须串行**：Slice 0 → 1 → 2 → 3（每片依赖前片的逻辑层）。
- **可并行**：
  - 音频接口（Slice 4 的 audio）、L2 占位 数据：任意时间可写，无依赖。
  - Agnes.ai **风格样张**（Slice 5 前置）：可在 Slice 2/3 进行时并行尝试定调，但素材替换仍放最后。
  - E2E 测试用例骨架可在 Slice 3 渲染就绪前先写断言契约（依赖 window.__game 接口先定）。

## E. 验证检查点（每片之间的 gate）

- C0：空舞台渲染 + 两条 smoke 测试可跑。
- C1：水流确定性测试绿（**关键里程碑**）。
- C2：机制回归两条单测绿——硬堵败/斜放胜（**玩法拍板**）。
- C3：drag-place + play-through E2E 全绿。
- C4：选关/L2/叙事 E2E 绿。
- C5：水墨替换后人工验收 + 截图。

每个检查点不过，不进下一片。
