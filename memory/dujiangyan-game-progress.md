---
name: dujiangyan-game-progress
description: 都江堰游戏 L1 实现进度（已完成切片与下一步）
metadata:
  type: project
---

L1 实现按 `docs/tasks-L1.md` 的 6 切片推进，spec/plan/tasks 在 `docs/`。约定：**按切片汇报**。

进度（2026-06-28）：
- **Slice 0 脚手架** ✅ 检查点 C0：Vite6+TS(strict)+PixiJS v8 分层舞台、横屏自适应、测试钩子 window.__game、Vitest+Playwright 双管线，typecheck/lint/build/test/e2e 全绿。
- **Slice 1 确定性水流** ✅ 检查点 C1：core(rng mulberry32/fixedLoop/vec2)、levels(类型+L1)、sim(粒子池/水源/碰撞/村庄/主循环)、render(waterRenderer占位墨点)。确定性测试逐位一致；空布局会淹村基线成立；浏览器实跑水流正常。
- **Slice 2 构件与导流/倒塌机制** ✅ 检查点 C2：blocks(config/instance/placement)、sim/collision OBB+法向水势、累积损伤倒塌。机制回归绿（硬堵墙垮=败 / 2斜墙节俭胜 / 空布局淹）。全套 23 测试通过。
- 用户反馈(2026-06-28)：① L1 失败判定改回**仅村庄被淹**（去掉"墙垮即败"），墙垮是过程、决堤后水淹才判负；floodThreshold 调到 30。② L1 确定**单构件=石墙**（竹笼留 L2）。
- **Slice 3 交互+金钱+状态机+HUD+结算** ✅ 检查点 C3：economy/wallet、judge/puzzleJudge、core/gameStateMachine(GameSession 单一真相源)、render/blockRenderer、render/hud、audio占位、main.ts 全交互(工具栏拖拽放置/点击旋转45°/拖到拆除区删除/放水/结算弹窗)。测试钩子 window.__game(getBlocks/worldToPage/各按钮page坐标/finishSim)。**39 单测 + 8 E2E 全绿**（drag-place 拖拽全流程 + play-through 斜放节俭胜/硬堵败/重试）。
- **Slice 4 选关 + L2 占位** ✅ 检查点 C4：`ui/levelSelect.ts`（卷轴风全屏覆盖，L1 可玩/L2 置灰「敬请期待」+ toast）、`levels/L2.ts`（占位 LevelConfig，title 疏）。main.ts：开局停选关界面，选 L1→hide 进游戏，结算「下一关」→reset+回选关。覆盖层暗底 eventMode=static 吞指针事件屏蔽下方交互（须在 deleteZone 之后 addChild 保证最顶层）。测试钩子 getScreen/enterLevel/levelCardPage；e2e ready() 改为 enter L1。**40 单测 + 9 E2E 全绿**（新增 C4：开局选关→L2置灰不进→L1进→胜→下一关回选关）。叙事弹窗与音频接口已在 S3 接入。
- **Slice 5 Agnes.ai 水墨美术** ✅（T5.1 样张定调 + T5.2 批量替换占位）：`scripts/gen-assets.mjs`（Agnes.ai 生成脚本，AGNES_API_KEY 环境变量；API 实际返回 url 非 b64，脚本兼容下载 url）。5 张资产存 `src/assets/`：bg-scene(1280x720 河谷底图)、water-tile(河道水纹)、stone-wall(正交俯视长轴水平石垒，用户要求改正俯视便于旋转)、village-hut、seal(朱印)。`render/assets.ts` loadGameTextures()（Assets.load + stone-wall 裁切 frame）。waterRenderer 用场景底图 Sprite+河道水纹带+河岸赭石条+村落小屋(multiply 消纸底)；blockRenderer 每实例 stone-wall Sprite(multiply)+状态 tint(placed白/collapsing泛红/broken暗0.5)+选中金描边；hud 结算成功盖朱印 Sprite(multiply)。eslint.config 加 scripts/**.mjs node globals 块。**40 单测 + 9 E2E 全绿**，截图核验 gameplay/win-seal/fail 观感精美。统一风格词根=水墨/宣纸/墨黑+赭石+青绿/留白。注意：PNG 各~1.8MB(共~9MB)，微信小程序移植前需压缩。
- **T5.3 表现打磨** ✅：渲染层动效与确定性 sim 解耦（main 主循环每帧调 water.animate/blocks.animate/hud.animate(deltaMS)，E2E 的 finishSim 只跑逻辑不受影响）。① 河水 TilingSprite 横向滚动（tileScale=chW/texW 单块铺满宽度，缝隙罕见缓慢掠过）；② 入水口喷涌（splashGfx 沿水源竖向 6 簇墨花随相位脉动，仅放水时显示）；③ 墙倒碎屑（blockRenderer 检测 state→broken 跃变 spawnDebris 9 粒，重力+下游漂移，0.9s 淡出，debrisGfx 重绘）；④ 朱印落章动画（hud success 时 sealAnim 计时，scale 1.9→1.0 easeOutBack 回弹 + alpha 渐显 0.32s）。**40 单测 + 9 E2E 全绿**。截图核验 polish-sim/debris/settle。
- 用户反馈(放水特效#1)：弃用离散小圆球，改**水流流线**——waterRenderer.update 按粒子速度方向画半透明流线，藏住球形，遇墙偏转。
- 用户反馈(放水特效#2)：流线仍嫌粗糙，参考真实长曝光溪流 GIF（`src/assets/01442WP8-0.gif`，丝滑急流+白沫绕石）→ 改**贴图分层流水**：① 新增 3 张 Agnes 贴图 water-flow(丝滑流水底层)/foam(白沫黑底,additive)/flow-noise(灰度湍流位移图)，均 `source.addressMode='repeat'`；assets.ts loadGameTextures 加载。② waterRenderer 河道水面 = Container{ base TilingSprite(water-flow, tint 0x9fb7b0 染青绿融入水墨, alpha0.85) + foamBack/foamFront 两层 TilingSprite(foam, blendMode 'add', 错半幅相位) } + DisplacementFilter(flow-noise sprite, renderable=false, scale 6→20 随放水增强)；**三者均单块铺满河道宽度(tileScale=chW/texW)杜绝横向接缝**。animate(dtMs,flowing)：tilePosition.x 三层不同速度右滚、foam 竖向 sin 摆动、flowMix 平滑过渡(编辑缓流↔放水湍急)白沫提浓位移加强。③ 粒子→**极淡 additive 白沫细流线**(width r*1.3, alpha 0.025+0.04*bright，speed<0.12 不画)：单个几乎隐于水纹，仅墙体逼挤密集对齐处叠加成亮浪花 → 遇墙激浪/导流。坑：粒子稀疏时高 alpha 会显成离散白"药丸"，必须压到≈0.03 才隐入丝滑水面。截图 flow-editing(平缓青绿)/flow-release(湍急银白急流)观感贴近 GIF。**40 单测 + 9 E2E 全绿**(渲染动效与 finishSim 逻辑解耦，不影响判定)。
- **L1 全切片完成（S0~S5 + T5.3 + GIF 丝滑分层水效）**。后续可选：L2 实装（竹笼/分流机制）、PNG 压缩后微信小程序移植（现 8 张贴图各~1.6-1.9MB）。

UI 交互约定：所有 pointer 事件在 stage 层统一处理；构件命中用 OBB 局部坐标判定；E2E 用 __game 返回的 page 坐标驱动真实鼠标拖拽。

用户反馈(2026-06-28 续)：
- 放置区改为**整条河道自由摆放**（去掉中间限制框）。
- 删除改为**点选石墙高亮 → 点拆除按钮删除返还**（不再拖到删除区）；修了"点拆除按钮被 stage 空白点击抢先取消选中"的 bug（加 e.target 守卫）。
- 机制（两轮迭代后定稿）：倒塌改为**接触计时模型**（弃用 loadFactor/累积损伤）。墙被洪水粒子首次接触(进入包围盒,hits>0)即闩锁、之后连续累计 contactTime，达 collapseDelay 即垮。挡水墙(align≥0.85,横断)collapseDelay=3.5s 快垮；导流墙(含45°/0°水平等一切非横断)=9s（接触后8-10s）。0°水平墙现在也会垮。成功判定(村庄<30)不变，硬堵接触后3.5s垮决堤致败(村庄36)，节俭2斜墙解村庄16仍胜。collision.ts 给 block.hits 计数；sim 每帧清零 pressure/hits。

S2 对原策划的偏离（已写回 spec §5.1/5.3/5.4，待用户最终确认）：
- 石墙旋转 90°→**45° 步进**(rotStep 0~7)，斜向导流必需。
- 倒塌机制：从"pressure=count×velocity+瞬时阈值"演化为 **loadFactor 判据(对齐度>0.8算挡水墙会垮, ≤0.8导流墙不垮) + 累积损伤**。纯法向冲量分不开"密集水里的斜墙"与"正撞坝"。
- L1 失败判定 = **村庄被淹 ∨ 任一墙被冲垮**（硬堵失败由墙垮干净触发）。
- 关键数值：gap 收窄到 x∈[15,17]，floodThreshold=40，flowBiasY=0.35，耐久预算 0.3，simDuration 18s。最优节俭解 w(14.5,7,rot7)+w(14.5,5,rot7) 漏水 8。

关键实现约定：
- 纯逻辑层（core/sim/blocks/economy/judge/levels）零 PixiJS import；render/ui 只读逻辑态。
- 水势=撞击法向速度分量之和（见 [[dujiangyan-game-decisions]] §5.3 改动）。
- L1 加了 source.flowBiasY（河床朝下岸坡降）使直冲水流自然灌入缺口；平衡数值留 S2 调。
- 截图工具：e2e/_shot.mjs（dev server 起后 node 跑，输出 png）。
