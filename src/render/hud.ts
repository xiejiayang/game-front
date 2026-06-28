import { Container, Graphics, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import type { Stage } from './stage';
import type { LevelConfig } from '../levels/levelTypes';
import type { GameSession } from '../core/gameStateMachine';
import type { PuzzleResult } from '../judge/puzzleJudge';
import type { GameTextures } from './assets';

const INK: TextStyleOptions = { fill: 0x2b2622, fontFamily: 'KaiTi, STKaiti, serif', fontSize: 22 };

function makeButton(label: string, w: number, h: number, color: number): Container {
  const c = new Container();
  const bg = new Graphics();
  bg.roundRect(0, 0, w, h, 8).fill(color).stroke({ width: 2, color: 0x2b2622 });
  const t = new Text({ text: label, style: { ...INK, fontSize: 22, fill: 0xf4efe2 } });
  t.anchor.set(0.5);
  t.position.set(w / 2, h / 2);
  c.addChild(bg, t);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  (c as Container & { label?: string }).label = label;
  return c;
}

/** HUD：顶部关卡名+金钱条，底部工具栏+放水按钮，结算弹窗。占位水墨风。 */
export class Hud {
  readonly toolbarItem = new Container();
  readonly releaseBtn = makeButton('放　水', 140, 56, 0x3f6b5e);
  readonly retryBtn = makeButton('重　试', 130, 50, 0x7a6a55);
  readonly nextBtn = makeButton('下一关', 130, 50, 0x3f6b5e);

  private readonly moneyText: Text;
  private readonly countText: Text;
  private readonly phaseText: Text;
  private readonly settle = new Container();
  private readonly settleTitle: Text;
  private readonly settleBody: Text;
  private readonly seal: Sprite;
  private sealBaseScale = 1;
  private sealAnim = -1; // <0 关闭；≥0 落章动画计时（秒）

  onRelease?: () => void;
  onRetry?: () => void;
  onNext?: () => void;

  constructor(stage: Stage, level: LevelConfig, tex: GameTextures) {
    const W = stage.width;
    const ui = stage.uiLayer;

    // 顶部：关卡名
    const title = new Text({ text: `都江堰 · 第${level.index}关「${level.title}」`, style: { ...INK, fontSize: 26 } });
    title.position.set(24, 16);

    // 顶部右：金钱
    this.moneyText = new Text({ text: '', style: { ...INK, fontSize: 22 } });
    this.moneyText.anchor.set(1, 0);
    this.moneyText.position.set(W - 24, 18);

    this.phaseText = new Text({ text: '', style: { ...INK, fontSize: 18, fill: 0x6b6258 } });
    this.phaseText.anchor.set(0.5, 0);
    this.phaseText.position.set(W / 2, 18);

    // 底部工具栏：石墙
    const box = new Graphics();
    box.roundRect(0, 0, 96, 64, 8).fill(0xe8e1d0).stroke({ width: 2, color: 0x2b2622 });
    const icon = new Graphics();
    icon.roundRect(20, 38, 56, 14, 3).fill(0x6f6a63).stroke({ width: 1.5, color: 0x2b2622 });
    const name = new Text({ text: '石墙', style: { ...INK, fontSize: 18 } });
    name.position.set(28, 8);
    this.countText = new Text({ text: '', style: { ...INK, fontSize: 18, fill: 0x8a3b2f } });
    this.countText.anchor.set(1, 0);
    this.countText.position.set(88, 8);
    this.toolbarItem.addChild(box, icon, name, this.countText);
    this.toolbarItem.position.set(40, stage.height - 84);
    this.toolbarItem.eventMode = 'static';
    this.toolbarItem.cursor = 'grab';

    this.releaseBtn.position.set(W - 180, stage.height - 80);

    this.releaseBtn.on('pointertap', () => this.onRelease?.());

    ui.addChild(title, this.moneyText, this.phaseText, this.toolbarItem, this.releaseBtn);

    // 结算弹窗
    this.settle.visible = false;
    const dim = new Graphics();
    dim.rect(0, 0, W, stage.height).fill({ color: 0x1a1814, alpha: 0.55 });
    const panel = new Graphics();
    panel.roundRect(W / 2 - 260, stage.height / 2 - 150, 520, 300, 14).fill(0xf4efe2).stroke({ width: 3, color: 0x2b2622 });
    this.settleTitle = new Text({ text: '', style: { ...INK, fontSize: 40 } });
    this.settleTitle.anchor.set(0.5);
    this.settleTitle.position.set(W / 2, stage.height / 2 - 90);
    this.settleBody = new Text({
      text: '',
      style: { ...INK, fontSize: 20, wordWrap: true, wordWrapWidth: 460, align: 'center', lineHeight: 30 },
    });
    this.settleBody.anchor.set(0.5);
    this.settleBody.position.set(W / 2, stage.height / 2 + 10);
    this.retryBtn.position.set(W / 2 - 150, stage.height / 2 + 80);
    this.nextBtn.position.set(W / 2 + 20, stage.height / 2 + 80);
    this.retryBtn.on('pointertap', () => this.onRetry?.());
    this.nextBtn.on('pointertap', () => this.onNext?.());

    // 朱印（成功时盖于面板右上角，multiply 消隐纸底）
    this.seal = new Sprite(tex.seal);
    this.seal.anchor.set(0.5);
    this.seal.width = 96;
    this.seal.height = 96;
    this.seal.position.set(W / 2 + 210, stage.height / 2 - 110);
    this.seal.rotation = 0.12;
    this.seal.blendMode = 'multiply';
    this.seal.visible = false;
    this.sealBaseScale = this.seal.scale.x;

    this.settle.addChild(dim, panel, this.settleTitle, this.settleBody, this.seal, this.retryBtn, this.nextBtn);
    ui.addChild(this.settle);
  }

  update(session: GameSession): void {
    const w = session.wallet;
    this.moneyText.text = `金钱 ${w.currentMoney}/${w.maxMoney}`;
    const count = session.getInventoryCount('wall');
    this.countText.text = `×${count}`;
    const editing = session.state === 'editing';
    const canUse = count > 0 && editing;
    this.toolbarItem.alpha = canUse ? 1 : 0.4;
    this.toolbarItem.eventMode = canUse ? 'static' : 'none';

    const simulating = session.state === 'simulating';
    this.releaseBtn.alpha = editing ? 1 : 0.4;
    this.releaseBtn.eventMode = editing ? 'static' : 'none';
    (this.releaseBtn.children[1] as Text).text = simulating ? '模拟中' : '放　水';

    this.phaseText.text = editing
      ? '拖石墙入河 · 点选构件(再点旋转) · 选中后点拆除'
      : simulating
        ? '放水中…'
        : '';
  }

  showSettle(result: PuzzleResult, level: LevelConfig): void {
    let title: string;
    if (result.isSuccess) title = result.isFrugal ? '暂时安全 · 俭' : '暂时安全';
    else title = result.failReason === 'wall_broken' ? '墙倒了' : '村子仍被淹';
    this.settleTitle.text = title;
    this.settleTitle.style.fill = result.isSuccess ? 0x3f6b5e : 0x8a3b2f;

    let body = result.isSuccess ? level.narrative.success : level.narrative[result.failReason === 'wall_broken' ? 'fail_wall' : 'fail_flood'];
    if (result.isFrugal) body += '\n' + level.narrative.frugal;
    this.settleBody.text = body;
    this.seal.visible = result.isSuccess; // 治水成功 → 盖印
    if (result.isSuccess) {
      this.sealAnim = 0; // 启动落章动画
      this.seal.alpha = 0;
    } else {
      this.sealAnim = -1;
    }
    this.settle.visible = true;
  }

  /** 落章动画：朱印自上而下盖落，带回弹（easeOutBack）。渲染层动效。 */
  animate(dtMs: number): void {
    if (this.sealAnim < 0) return;
    this.sealAnim += dtMs / 1000;
    const t = Math.min(1, this.sealAnim / 0.32);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); // easeOutBack
    const s = 1.9 + (1 - 1.9) * e; // 1.9→1.0 带回弹
    this.seal.scale.set(this.sealBaseScale * s);
    this.seal.alpha = Math.min(1, t * 2.2);
    if (t >= 1) this.sealAnim = -1;
  }

  hideSettle(): void {
    this.settle.visible = false;
  }
}
