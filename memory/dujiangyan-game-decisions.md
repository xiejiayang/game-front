---
name: dujiangyan-game-decisions
description: 都江堰治水解谜游戏的核心技术与设计决策（PixiJS 2D / AI水墨贴图 / L1斜向导流）
metadata:
  type: project
---

都江堰治水主题解谜游戏（web 优先，后续适配微信小程序）。原始策划文档面向 Unity，已决定改为 web 技术栈。当前目标：只做第一关 L1，第二关 L2 仅占位。

决策（2026-06-28 确认）：
- 渲染技术栈：**PixiJS 2D 俯视**（不用 Three.js / 纯 Canvas）。水流模拟是 2D 平面粒子，确定性、性能好、易移植微信小游戏。
- 美术：**AI 生成水墨风贴图**（地形/构件/UI），搭配程序化水流特效。素材由 Claude 协助生成。
- L1 解法：**斜向导流**——玩家领悟到正面筑墙会被冲垮（石墙 worst-case 0.8s 倒塌、村庄约10s被淹），需把构件斜放把主流"顺势"偏导离开村庄。契合"堵不如疏"，只需1种核心构件。
- 视角：**横屏，水从左往右流**（不是俯视从上往下）。
- 流程：**先写 spec 定规范，再动手**（spec-driven）。

关键约束（来自策划文档）：
- 水流模拟必须**确定性**：固定时间步长、固定随机种子。
- 零惩罚重试；节俭通关（consumedMoney ≤ frugalMoney）解锁隐藏内容。
- 核心循环：Editing → Simulating → Settling 状态机。
- 文档未定义 L1 实际获胜布局，需自行设计。

相关：[[dujiangyan-game-l1-spec]]
