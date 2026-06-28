# 任务拆分 Tasks: L1（Phase 3）

> 配套 `docs/spec-L1.md` V0.2 与 `docs/plan-L1.md` · 2026-06-28
> 每个任务：单次专注会话可完成、改 ≤5 文件、有明确验收与验证手段。按依赖顺序排列。

---

## Slice 0 — 脚手架与测试管线

- [ ] **T0.1 初始化工程**
  - 内容：`npm init`，装 typescript / vite / pixi.js / vitest / @playwright/test；写 `package.json` scripts（dev/build/preview/test/test:watch/e2e/e2e:headed/typecheck/lint）、`tsconfig.json`、`vite.config.ts`、`.gitignore`。
  - 验收：`npm install` 成功；`npm run typecheck` 通过（空源）；`npm run dev` 起服务。
  - 验证：终端跑上述命令。
  - 文件：package.json, tsconfig.json, vite.config.ts, .gitignore, index.html

- [ ] **T0.2 空横屏舞台**
  - 内容：`src/main.ts` 挂载 PixiJS Application；固定逻辑分辨率（如 1280×720）+ 自适应缩放、锁横屏（竖屏提示旋转）；纯色背景。
  - 验收：浏览器显示横屏画布，窗口缩放等比适配，竖屏显示"请横屏"。
  - 验证：`npm run dev` 手动看；改窗口比例。
  - 文件：src/main.ts, src/render/stage.ts, index.html

- [ ] **T0.3 测试管线 smoke**
  - 内容：`window.__game` 钩子骨架（dev/test 挂载、prod 不挂，用 `import.meta.env`）；Vitest 1 条平凡断言；Playwright config + 1 条打开页面断言标题/画布存在。
  - 验收：`npm run test` 与 `npm run e2e` 各 1 条绿。
  - 验证：跑两条命令。
  - 文件：src/main.ts（挂钩子）, tests/smoke.test.ts, e2e/smoke.spec.ts, e2e/playwright.config.ts

---

## Slice 1 — 确定性水流（占位色点）

- [ ] **T1.1 确定性基建**
  - 内容：`core/rng.ts`（mulberry32，seed→[0,1)）、`core/vec2.ts`、`core/fixedLoop.ts`（累加器固定步长 dt=1/60，分离 update/render）。
  - 验收：rng 同 seed 同序列；fixedLoop 在可变帧时间下产出稳定步数。
  - 验证：单测 `tests/rng.test.ts`（同 seed 两序列相等、不同 seed 不等）。
  - 文件：src/core/rng.ts, src/core/vec2.ts, src/core/fixedLoop.ts, tests/rng.test.ts

- [ ] **T1.2 关卡数据与类型**
  - 内容：`levels/levelTypes.ts`（spec §6 全部接口）、`levels/L1.ts`（河道28×6/水源/村庄缺口x∈[14,18]/可放区x∈[6,14]/数值/种子/叙事）。
  - 验收：类型编译通过；L1 数值与 spec §5.4 一致。
  - 验证：`npm run typecheck`。
  - 文件：src/levels/levelTypes.ts, src/levels/L1.ts

- [ ] **T1.3 粒子池与水源**
  - 内容：`sim/particlePool.ts`（预分配 maxParticles，active 复用，无运行时分配）、`sim/waterSource.ts`（flowRate=lerp(base,peak)，carry 累计小数，seeded 随机 y 与微扰）。
  - 验收：发射数随时间按曲线上升后稳定；粒子从 source 区间生成。
  - 验证：单测：给定 elapsed 序列，spawn 总数确定且与曲线吻合。
  - 文件：src/sim/particlePool.ts, src/sim/waterSource.ts, tests/source.test.ts

- [ ] **T1.4 模拟主循环 + 河岸约束 + 村庄计数**
  - 内容：`sim/simulation.ts`（spec §7 每帧流程，先不含构件碰撞）、`sim/collision.ts`（河岸夹回+法向反射）、`sim/village.ts`（进入村庄矩形 → 计数并回收）。
  - 验收：粒子左→右流动、撞岸不穿出、进村庄计数、右端回收。
  - 验证：单测：跑 N 步后无粒子越界；空布局下 villageHitCount 按预期（缺口直冲会累计）。
  - 文件：src/sim/simulation.ts, src/sim/collision.ts, src/sim/village.ts, tests/sim.flow.test.ts

- [ ] **T1.5 水流渲染（占位墨点）+ 确定性测试**
  - 内容：`render/waterRenderer.ts`（粒子→墨点，速度映射墨色；河道/村庄/缺口画矩形）；接入 fixedLoop 实跑。
  - 验收：浏览器看到水从左流到右、灌入缺口；`sim.determinism.test` 绿。
  - 验证：`npm run dev` 目视 + `npm run test`（**检查点 C1**）。
  - 文件：src/render/waterRenderer.ts, src/render/stage.ts, src/main.ts, tests/sim.determinism.test.ts

---

## Slice 2 — 构件与导流/倒塌机制（纯逻辑先行）

- [ ] **T2.1 构件配置与实例 + 放置校验**
  - 内容：`blocks/blockConfig.ts`（石墙）、`blocks/blockInstance.ts`、`blocks/placement.ts`（0.5m 网格吸附、越界、重叠 OBB、库存校验；放置/移动/旋转/删除纯逻辑函数，返回 PlacementResult）。
  - 验收：吸附取整、可放区外拒绝、重叠拒绝、库存0拒绝、删除返还。
  - 验证：单测 `tests/placement.test.ts`（spec §9.1-2 全部分支）。
  - 文件：src/blocks/blockConfig.ts, src/blocks/blockInstance.ts, src/blocks/placement.ts, tests/placement.test.ts

- [ ] **T2.2 OBB 碰撞 + 法向水势**
  - 内容：`sim/collision.ts` 扩展：粒子 vs 旋转 OBB 检测；命中按墙面法向反射法向分量、保留切向；累加该墙 pressure += 撞击法向速度分量（每帧清零）。
  - 验收：横墙正撞 pressure 高、斜墙掠过 pressure 低（单测断言量级关系）。
  - 验证：单测 `tests/collision.test.ts`（构造正撞/斜掠两布局比较 pressure）。
  - 文件：src/sim/collision.ts, tests/collision.test.ts

- [ ] **T2.3 构件倒塌 + 机制回归（玩法拍板）**
  - 内容：`sim/simulation.ts` 接入 `updateBlockDamage`（effectiveCollapseDuration=min(duration/(p/thr),2)，broken 后停止挡水并发倒塌事件）。
  - 验收：横排堵满 → 墙 broken 且 villageHitCount≥阈值（败）；2 墙斜放 → 村庄存活（胜）。
  - 验证：单测 `tests/mechanic.regression.test.ts`（**检查点 C2**；若不成立，调 L1.ts 数值至两条均绿）。
  - 文件：src/sim/simulation.ts, src/blocks/blockInstance.ts, tests/mechanic.regression.test.ts

---

## Slice 3 — 交互 + 金钱 + 状态机 + HUD + 结算

- [ ] **T3.1 金钱与判定**
  - 内容：`economy/wallet.ts`（init/canAfford/consume/refund/getActualCost/isFrugal）、`judge/puzzleJudge.ts`（成功/失败/失败原因/节俭）。
  - 验收：放置扣减、删除返还不超上限、节俭判定正确；judge 各分支正确。
  - 验证：单测 `tests/wallet.test.ts`、`tests/judge.test.ts`。
  - 文件：src/economy/wallet.ts, src/judge/puzzleJudge.ts, tests/wallet.test.ts, tests/judge.test.ts

- [ ] **T3.2 解谜状态机**
  - 内容：`core/gameStateMachine.ts`（Editing/Simulating/Settling/Paused，转换守卫；放水合法性校验+冷却；切后台暂停）。
  - 验收：非法转换被拒；放水需有构件且合法；模拟结束进结算。
  - 验证：单测 `tests/statemachine.test.ts`。
  - 文件：src/core/gameStateMachine.ts, tests/statemachine.test.ts

- [ ] **T3.3 构件渲染 + 拖拽放置/旋转/删除**
  - 内容：`render/blockRenderer.ts`（preview 半透/非法泛红/placed/broken 占位特效）；工具栏拖拽放置、点击旋转、拖到删除区；实时金钱预览。接 placement/wallet。
  - 验收：能拖入合法点放置、非法回弹、点击旋转、删除返还，金钱实时变。
  - 验证：`npm run dev` 手动 + 留待 T3.6 E2E。
  - 文件：src/render/blockRenderer.ts, src/render/stage.ts, src/main.ts

- [ ] **T3.4 HUD + 结算弹窗**
  - 内容：`render/hud.ts`（顶部关卡名+金钱条、底部工具栏图标/数量/置灰、放水按钮模拟中置灰、结算弹窗：暂时安全/墙倒了/村子仍被淹/俭）。
  - 验收：金钱条实时、库存0置灰、放水态切换、结算按结果显示对应文案。
  - 验证：`npm run dev` 手动跑一局。
  - 文件：src/render/hud.ts, src/render/stage.ts

- [ ] **T3.5 测试钩子 window.__game**
  - 内容：补全只读查询 getBlockScreenPos/getState/getResult/getHud/getInventory，供 E2E 定位画布内构件与断言。
  - 验收：dev/test 下 `window.__game` 可用、prod 不挂。
  - 验证：浏览器 console 调用返回正确值。
  - 文件：src/main.ts, src/render/stage.ts

- [ ] **T3.6 E2E：拖拽全流程 + 端到端玩法**
  - 内容：`e2e/drag-place.spec.ts`（放置/旋转/删除/非法回弹/重叠拒绝，每步截图）；`e2e/play-through.spec.ts`（硬堵败/斜放胜/节俭/重试回编辑）。真实指针事件。
  - 验收：两份 E2E 全绿，截图产出到 `e2e/__screenshots__/`。
  - 验证：`npm run e2e`（**检查点 C3**）。
  - 文件：e2e/drag-place.spec.ts, e2e/play-through.spec.ts

---

## Slice 4 — 选关 + L2 占位 + 叙事 + 音频接口

- [ ] **T4.1 音频接口占位**
  - 内容：`audio/audio.ts`（AudioBus 占位静音，spec §13），在放置/旋转/删除/放水/倒塌/淹村/成功/节俭/金钱不足处调用。
  - 验收：事件触发时调用不报错；setMuted 可切。
  - 验证：单测 stub 被调用计数；浏览器 console 无错。
  - 文件：src/audio/audio.ts, src/main.ts, src/render/hud.ts

- [ ] **T4.2 叙事弹窗**
  - 内容：开场/成功/失败（墙倒/淹村）/节俭文案接入（来自 L1.ts narrative），水墨弹窗占位样式。
  - 验收：进入关卡显示开场；结算按结果显示对应叙事；节俭追加文案。
  - 验证：`npm run dev` 手动 + play-through E2E 断言文本。
  - 文件：src/render/hud.ts, src/levels/L1.ts

- [ ] **T4.3 选关界面 + L2 占位**
  - 内容：`ui/levelSelect.ts`（卷轴风占位，L1 可玩、L2 置灰"敬请期待"）、`levels/L2.ts`（占位数据）；结算"下一关"→选关。
  - 验收：选关显示 L1/L2，L2 点击提示"敬请期待"，L1 可进入。
  - 验证：`npm run e2e` play-through 末段断言（**检查点 C4**）。
  - 文件：src/ui/levelSelect.ts, src/levels/L2.ts, src/main.ts

---

## Slice 5 — Agnes.ai 水墨美术 + 打磨

- [ ] **T5.1 风格样张定调**
  - 内容：`scripts/gen-assets.ts` 接 Agnes.ai；先生成 1~2 张样张（统一 prompt 词根/色板）定水墨风格，找用户要 api key。
  - 验收：样张风格获用户认可。
  - 验证：用户目视确认。
  - 文件：scripts/gen-assets.ts

- [ ] **T5.2 批量生成 + 替换占位**
  - 内容：生成清单（地形/河道/石墙三态/村庄/缺口/印章/UI），存 `src/assets/`，渲染层替换占位色块。
  - 验收：画面用上水墨贴图，无明显拼凑感。
  - 验证：`npm run dev` 目视。
  - 文件：src/assets/*, src/render/waterRenderer.ts, src/render/blockRenderer.ts, src/render/stage.ts

- [ ] **T5.3 表现打磨**
  - 内容：水面墨纹（PixiJS 滤镜/着色）、入水口喷涌、墙倒塌碎屑、结算印章动画。
  - 验收：整体观感"较为精美"。
  - 验证：浏览器实玩 + E2E 关键帧截图人工核验（**检查点 C5**）。
  - 文件：src/render/waterRenderer.ts, src/render/blockRenderer.ts, src/render/hud.ts

---

## 任务计数：23 个，覆盖 6 切片。
依赖顺序即列出顺序。可并行项：T4.1（音频）、T5.1（样张）可提前穿插；其余串行。
