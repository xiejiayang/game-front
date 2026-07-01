import { Graphics, Point, Text } from 'pixi.js';
import { createStage } from './render/stage';
import { WaterRenderer } from './render/waterRenderer';
import { BlockRenderer } from './render/blockRenderer';
import { Hud } from './render/hud';
import { FixedLoop } from './core/fixedLoop';
import { GameSession } from './core/gameStateMachine';
import { getBlockConfig } from './blocks/blockConfig';
import { worldAngle, type BlockInstance } from './blocks/blockInstance';
import { validatePlacement, snapToGrid } from './blocks/placement';
import { createAudio } from './audio/audio';
import { loadGameTextures } from './render/assets';
import { LevelSelect } from './ui/levelSelect';
import { L1 } from './levels/L1';
import { L2 } from './levels/L2';
import type { Vec2 } from './core/vec2';

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const PLACE_BLOCK_ID = 'wall';

async function bootstrap(): Promise<void> {
  const stage = await createStage(LOGICAL_W, LOGICAL_H);
  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app mount point not found');
  mount.appendChild(stage.app.canvas);

  const rotateTip = document.getElementById('rotate-tip');
  function fit(): void {
    const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
    stage.app.renderer.resize(LOGICAL_W * scale, LOGICAL_H * scale);
    stage.root.scale.set(scale);
    if (rotateTip) rotateTip.setAttribute('data-show', window.innerHeight > window.innerWidth ? '1' : '0');
  }
  window.addEventListener('resize', fit);
  fit();

  const audio = createAudio();
  const tex = await loadGameTextures();
  const session = new GameSession(L1);
  const water = new WaterRenderer(stage, L1, tex);
  const view = water.view;
  stage.groundLayer.setFromMatrix(view.matrix); // 地面层套等距矩阵 → 左高右低斜视角
  const blocks = new BlockRenderer(stage, view, tex);
  const hud = new Hud(stage, L1, tex);

  // 删除区
  const deleteZone = new Graphics();
  const DZ = { x: 200, y: stage.height - 84, w: 120, h: 64 };
  deleteZone.roundRect(DZ.x, DZ.y, DZ.w, DZ.h, 8).fill(0xd9c4be).stroke({ width: 2, color: 0x8a3b2f });
  deleteZone.eventMode = 'static';
  deleteZone.cursor = 'pointer';
  const dzText = new Text({ text: '拆除', style: { fill: 0x8a3b2f, fontFamily: 'KaiTi, serif', fontSize: 22 } });
  dzText.anchor.set(0.5);
  dzText.position.set(DZ.x + DZ.w / 2, DZ.y + DZ.h / 2);
  dzText.eventMode = 'none';
  stage.uiLayer.addChild(deleteZone, dzText);

  // 选关界面（uiLayer 最顶层覆盖；显示时屏蔽下方游戏交互）
  const levelSelect = new LevelSelect(stage, [
    { id: L1.id, index: L1.index, title: L1.title, theme: L1.theme, locked: false },
    { id: L2.id, index: L2.index, title: L2.title, theme: L2.theme, locked: true },
  ]);

  // 拖拽预览
  const ghost = new Graphics();
  ghost.visible = false;
  stage.blockLayer.addChild(ghost);

  // ---- 坐标换算（等距投影）----
  // e.global 是 canvas 逻辑像素；除 root.scale 得 root 局部，再 unproject（地面层矩阵逆）得 world。
  const screenToWorld = (gx: number, gy: number): Vec2 =>
    view.unproject(gx / stage.root.scale.x, gy / stage.root.scale.y);
  const worldToPage = (wx: number, wy: number) => {
    const p = view.project(wx, wy); // root 局部
    const g = stage.root.toGlobal(new Point(p.x, p.y));
    const r = stage.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  };
  const nodeToPage = (node: { toGlobal: (p: Point) => Point }, lx: number, ly: number) => {
    const g = node.toGlobal(new Point(lx, ly));
    const r = stage.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  };

  // 命中已放置构件（OBB 局部坐标判定）
  const hitBlock = (w: Vec2): BlockInstance | null => {
    for (let i = session.placedBlocks.length - 1; i >= 0; i--) {
      const b = session.placedBlocks[i];
      const cfg = getBlockConfig(b.blockId);
      const a = worldAngle(b.rotStep);
      const dx = w.x - b.pos.x;
      const dy = w.y - b.pos.y;
      const lx = dx * Math.cos(a) + dy * Math.sin(a);
      const ly = -dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= cfg.longLen / 2 && Math.abs(ly) <= cfg.shortLen / 2) return b;
    }
    return null;
  };

  // ---- 交互状态 ----
  type Mode = 'none' | 'placing' | 'dragging';
  let mode: Mode = 'none';
  let ghostRot = 0;
  let dragId: string | null = null;
  let moved = false;
  let downAt = { x: 0, y: 0 };
  let selectedId: string | null = null;
  // 拖拽跟手用：抓取时构件与光标的世界偏移（避免抓取瞬间跳到光标中心）、起点（非法回弹用）、当前自由位
  let dragGrabOffset = { x: 0, y: 0 };
  let dragOrigin = { x: 0, y: 0 };
  let dragFree = { x: 0, y: 0 };

  // 拆除按钮：删除当前选中的石墙并返还金钱
  deleteZone.on('pointertap', () => {
    if (session.state !== 'editing' || !selectedId) return;
    if (session.removeBlock(selectedId)) {
      audio.playSfx('remove');
      selectedId = null;
    }
  });

  const drawGhost = (w: Vec2, valid: boolean): void => {
    const cfg = getBlockConfig(PLACE_BLOCK_ID);
    const hl = (cfg.longLen / 2) * view.scale;
    const hs = (cfg.shortLen / 2) * view.scale;
    ghost.clear();
    ghost.roundRect(-hl, -hs, hl * 2, hs * 2, 3).fill({ color: valid ? 0x4a8f6a : 0xb1503f, alpha: 0.6 });
    ghost.position.set(view.sx(w.x), view.sy(w.y));
    ghost.rotation = worldAngle(ghostRot);
    ghost.visible = true;
  };

  hud.toolbarItem.on('pointerdown', () => {
    if (session.state !== 'editing' || session.getInventoryCount(PLACE_BLOCK_ID) <= 0) return;
    mode = 'placing';
    ghostRot = 0;
  });

  stage.app.stage.eventMode = 'static';
  stage.app.stage.hitArea = stage.app.screen;

  stage.app.stage.on('pointerdown', (e) => {
    if (session.state !== 'editing' || mode === 'placing') return;
    if (e.target !== stage.app.stage) return; // 点在 UI 元素上（工具栏/拆除/按钮）交给其各自处理
    const w = screenToWorld(e.global.x, e.global.y);
    const b = hitBlock(w);
    if (b) {
      mode = 'dragging';
      dragId = b.instanceId;
      moved = false;
      downAt = { x: e.global.x, y: e.global.y };
      dragOrigin = { x: b.pos.x, y: b.pos.y };
      dragGrabOffset = { x: b.pos.x - w.x, y: b.pos.y - w.y }; // 保持抓取点不跳
      dragFree = { x: b.pos.x, y: b.pos.y };
    } else {
      selectedId = null; // 点空白处取消选中
    }
  });

  stage.app.stage.on('pointermove', (e) => {
    const w = screenToWorld(e.global.x, e.global.y);
    if (mode === 'placing') {
      const pos = snapToGrid(w);
      const cfg = getBlockConfig(PLACE_BLOCK_ID);
      const ok = validatePlacement(L1, cfg, pos, ghostRot, session.placedBlocks) === 'success';
      drawGhost(pos, ok);
    } else if (mode === 'dragging' && dragId) {
      if (Math.hypot(e.global.x - downAt.x, e.global.y - downAt.y) > 6) {
        moved = true;
        // 连续跟手：直接置位（不吸附、不校验）→ 丝滑跟随，无跳格、无"非法即卡住"顿挫
        dragFree = { x: w.x + dragGrabOffset.x, y: w.y + dragGrabOffset.y };
        session.dragBlockTo(dragId, dragFree);
      }
    }
  });

  stage.app.stage.on('pointerup', (e) => {
    if (mode === 'placing') {
      const pos = snapToGrid(screenToWorld(e.global.x, e.global.y));
      const r = session.placeBlock(PLACE_BLOCK_ID, pos, ghostRot);
      if (r === 'success') selectedId = session.placedBlocks[session.placedBlocks.length - 1].instanceId;
      audio.playSfx(r === 'success' ? 'place' : 'insufficient');
      ghost.visible = false;
      mode = 'none';
    } else if (mode === 'dragging' && dragId) {
      if (moved) {
        // 落手提交：吸附网格 + 校验；非法则回弹到起点（保持"最终落点必为合格网格点"不变量）
        if (session.moveBlock(dragId, dragFree) !== 'success') {
          session.dragBlockTo(dragId, dragOrigin);
        }
        selectedId = dragId; // 拖动后选中
      } else if (selectedId === dragId) {
        session.rotateBlock(dragId); // 再次点选中的墙 → 旋转 45°
        audio.playSfx('rotate');
      } else {
        selectedId = dragId; // 首次点选 → 选中
      }
      dragId = null;
      mode = 'none';
    }
  });

  // ---- HUD 回调 ----
  hud.onRelease = () => {
    selectedId = null;
    if (session.startSimulation()) audio.playSfx('release');
  };
  hud.onRetry = () => {
    hud.hideSettle();
    water.clear();
    selectedId = null;
    session.retry();
  };
  hud.onNext = () => {
    // 结算「下一关」→ 回选关界面（L2 尚未开放，在选关页置灰提示）
    hud.hideSettle();
    water.clear();
    selectedId = null;
    session.reset();
    levelSelect.show();
  };

  // 进入关卡：当前仅 L1 可玩，选中即隐藏选关覆盖层、重置为初始编辑态
  const enterLevel = (id: string): void => {
    if (id !== L1.id) return;
    hud.hideSettle();
    water.clear();
    selectedId = null;
    session.reset();
    levelSelect.hide();
  };
  levelSelect.onSelect = enterLevel;
  levelSelect.show(); // 开局停在选关界面

  // ---- 主循环 ----
  const loop = new FixedLoop();
  let settledShown = false;
  stage.app.ticker.add((ticker) => {
    levelSelect.update(ticker.deltaMS / 1000);
    if (session.state === 'simulating') {
      loop.advance(ticker.deltaMS / 1000, () => session.tick());
    }
    if (session.state === 'simulating' && session.sim) water.update(session.sim);
    blocks.sync(session.placedBlocks, session.state === 'editing' ? selectedId : null);
    hud.update(session);

    // 渲染层动效（与确定性 sim 解耦）
    water.animate(ticker.deltaMS, session.state === 'simulating');
    blocks.animate(ticker.deltaMS);
    hud.animate(ticker.deltaMS);

    if (session.state === 'settling' && !settledShown && session.result) {
      hud.showSettle(session.result, L1);
      audio.playSfx(session.result.isSuccess ? (session.result.isFrugal ? 'frugal' : 'win') : 'flood');
      settledShown = true;
    }
    if (session.state === 'editing') settledShown = false;
  });

  // ---- 测试钩子（dev/test）----
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    (window as Window & { __game?: unknown }).__game = {
      ready: true,
      getState: () => session.state,
      getMoney: () => ({ current: session.wallet.currentMoney, max: session.wallet.maxMoney }),
      getInventory: (id: string = PLACE_BLOCK_ID) => session.getInventoryCount(id),
      getBlocks: () =>
        session.placedBlocks.map((b) => ({
          id: b.instanceId,
          rotStep: b.rotStep,
          state: b.state,
          ...worldToPage(b.pos.x, b.pos.y),
        })),
      getResult: () => session.result,
      getSelected: () => selectedId,
      // 选关界面
      getScreen: () => (levelSelect.visible ? 'select' : 'game'),
      enterLevel: (id: string = L1.id) => enterLevel(id),
      levelCardPage: (id: string) => levelSelect.cardPage(id, stage.app.canvas),
      // 测试用：同步快进模拟到结算（避免 E2E 等实时 18s）
      finishSim: () => {
        let n = 0;
        while (session.state === 'simulating' && n++ < 5000) session.tick();
        return session.state;
      },
      worldToPage,
      toolbarPage: () => nodeToPage(hud.toolbarItem, 48, 32),
      releasePage: () => nodeToPage(hud.releaseBtn, 70, 28),
      retryPage: () => nodeToPage(hud.retryBtn, 65, 25),
      nextPage: () => nodeToPage(hud.nextBtn, 65, 25),
      deletePage: () => nodeToPage(stage.uiLayer, DZ.x + DZ.w / 2, DZ.y + DZ.h / 2),
    };
  }
}

void bootstrap();
