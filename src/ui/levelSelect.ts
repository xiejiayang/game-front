import { Container, Graphics, Point, Text, type TextStyleOptions } from 'pixi.js';
import type { Stage } from '../render/stage';

const INK: TextStyleOptions = { fill: 0x2b2622, fontFamily: 'KaiTi, STKaiti, serif', fontSize: 22 };

/** 选关条目（playable 的进入关卡，locked 的显示「敬请期待」）。 */
export interface LevelEntry {
  id: string;
  index: number;
  title: string;
  theme: string;
  locked: boolean;
}

/**
 * 选关界面：卷轴风占位。L1 可进入，L2 置灰「敬请期待」。
 * 作为 uiLayer 最顶层全屏覆盖；显示时其暗底吞掉所有指针事件，屏蔽下方游戏交互。
 */
export class LevelSelect {
  private readonly root = new Container();
  private readonly toast: Text;
  private toastTimer = 0;
  /** 各关卡卡片，供测试钩子定位。 */
  readonly cards = new Map<string, Container>();
  onSelect?: (id: string) => void;

  constructor(stage: Stage, levels: LevelEntry[]) {
    const W = stage.width;
    const H = stage.height;

    // 全屏暗底：eventMode=static 以吞掉指针事件，屏蔽下方游戏交互
    const dim = new Graphics();
    dim.rect(0, 0, W, H).fill(0xe3ddcd);
    dim.eventMode = 'static';

    // 卷轴主体
    const sX = W / 2 - 360;
    const sW = 720;
    const sY = 72;
    const sH = H - 150;
    const paper = new Graphics();
    paper.roundRect(sX, sY, sW, sH, 6).fill(0xf4efe2).stroke({ width: 2, color: 0xcabfa3 });
    const rodTop = new Graphics();
    rodTop.roundRect(sX - 30, sY - 22, sW + 60, 28, 14).fill(0x8a6f4a).stroke({ width: 2, color: 0x5c4a30 });
    const rodBot = new Graphics();
    rodBot.roundRect(sX - 30, sY + sH - 6, sW + 60, 28, 14).fill(0x8a6f4a).stroke({ width: 2, color: 0x5c4a30 });

    const title = new Text({ text: '都江堰治水', style: { ...INK, fontSize: 48 } });
    title.anchor.set(0.5);
    title.position.set(W / 2, sY + 64);
    const sub = new Text({ text: '— 择关而治 —', style: { ...INK, fontSize: 22, fill: 0x6b6258 } });
    sub.anchor.set(0.5);
    sub.position.set(W / 2, sY + 110);

    this.root.addChild(dim, paper, rodTop, rodBot, title, sub);

    // 关卡卡片
    const cardW = 560;
    const cardH = 96;
    const gap = 28;
    const startY = sY + 168;
    levels.forEach((lv, i) => {
      const card = this.makeCard(lv, cardW, cardH);
      card.position.set(W / 2 - cardW / 2, startY + i * (cardH + gap));
      this.cards.set(lv.id, card);
      this.root.addChild(card);
    });

    this.toast = new Text({ text: '', style: { ...INK, fontSize: 24, fill: 0x8a3b2f } });
    this.toast.anchor.set(0.5);
    this.toast.position.set(W / 2, H - 96);
    this.toast.visible = false;
    this.root.addChild(this.toast);

    stage.uiLayer.addChild(this.root);
  }

  private makeCard(lv: LevelEntry, w: number, h: number): Container {
    const c = new Container();
    const accent = lv.locked ? 0xb6ab92 : 0x3f6b5e;
    const muted = lv.locked ? 0x9a9486 : 0x2b2622;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 10).fill(lv.locked ? 0xe2dccb : 0xf8f3e6).stroke({ width: 2, color: accent });
    const idx = new Text({ text: `第${lv.index}关`, style: { ...INK, fontSize: 22, fill: accent } });
    idx.position.set(28, h / 2 - 14);
    const name = new Text({ text: `「${lv.title}」`, style: { ...INK, fontSize: 34, fill: muted } });
    name.anchor.set(0, 0.5);
    name.position.set(132, h / 2);
    const note = new Text({
      text: lv.locked ? '敬请期待' : lv.theme,
      style: { ...INK, fontSize: 18, fill: lv.locked ? 0xb05a3f : 0x6b6258 },
    });
    note.anchor.set(1, 0.5);
    note.position.set(w - 28, h / 2);
    c.addChild(bg, idx, name, note);
    c.eventMode = 'static';
    c.cursor = lv.locked ? 'not-allowed' : 'pointer';
    c.on('pointertap', () => {
      if (lv.locked) this.showToast('「疏」尚在修渠，敬请期待');
      else this.onSelect?.(lv.id);
    });
    return c;
  }

  private showToast(msg: string): void {
    this.toast.text = msg;
    this.toast.visible = true;
    this.toast.alpha = 1;
    this.toastTimer = 2.2;
  }

  /** 每帧推进 toast 淡出。 */
  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0.6) this.toast.alpha = Math.max(0, this.toastTimer / 0.6);
      if (this.toastTimer <= 0) this.toast.visible = false;
    }
  }

  /** 卡片中心的全屏 page 坐标（测试钩子用）。 */
  cardPage(id: string, canvas: HTMLCanvasElement): { x: number; y: number } | null {
    const card = this.cards.get(id);
    if (!card) return null;
    const g = card.toGlobal(new Point(280, 48));
    const r = canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }

  show(): void {
    this.root.visible = true;
  }
  hide(): void {
    this.root.visible = false;
  }
  get visible(): boolean {
    return this.root.visible;
  }
}
