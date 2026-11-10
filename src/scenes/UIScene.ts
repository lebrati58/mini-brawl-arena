import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import { DPR, textStyle } from '../game/ui';
import { Audio, vibrate } from '../systems/audio';
import { muteButton } from './common';
import { Fighter } from '../game/Fighter';
import { CH_TEX_SCALE as K } from '../systems/textures';

interface Stick {
  base: Phaser.GameObjects.Image;
  knob: Phaser.GameObjects.Image;
  pointerId: number | null;
  homeX: number; homeY: number;
  cx: number; cy: number;
  maxDrag: number;
  radius: number;
}

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private moveStick!: Stick;
  private aimStick!: Stick;
  private superBtn!: Phaser.GameObjects.Image;
  private superRing!: Phaser.GameObjects.Graphics;
  private superPointer: number | null = null;
  private superStart = { x: 0, y: 0, max: 0 };
  private touchGroup!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private enemyIcons: Phaser.GameObjects.Image[] = [];
  private enemyCount!: Phaser.GameObjects.Text;
  private portraitBar!: Phaser.GameObjects.Graphics;
  private portraitText!: Phaser.GameObjects.Text;
  private deskSuper!: Phaser.GameObjects.Container;
  private deskSuperGfx!: Phaser.GameObjects.Graphics;
  private deskSuperLabel!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private s = 1;
  private hurtAt = -9999;

  constructor() { super('UI'); }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;
    this.enemyIcons = [];
    this.superPointer = null;
    this.s = Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / DPR / 420, 0.75, 1.3) * DPR;
    this.input.addPointer(3);

    this.vignette = this.add.graphics().setDepth(0);
    this.buildHud();
    this.buildTouchControls();
    this.buildDesktopSuper();
    this.mute = muteButton(this);
    this.layout();
    this.applyMode();

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.game_.events.off('enemy-died', this.onEnemyDied, this);
      this.game_.events.off('game-over', this.onGameOver, this);
      this.game_.events.off('touchmode', this.applyMode, this);
      this.game_.events.off('player-hurt', this.onPlayerHurt, this);
    });
    this.game_.events.on('enemy-died', this.onEnemyDied, this);
    this.game_.events.on('game-over', this.onGameOver, this);
    this.game_.events.on('touchmode', this.applyMode, this);
    this.game_.events.on('player-hurt', this.onPlayerHurt, this);

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    this.runCountdown();
  }

  // ------------------------------------------------------------------ HUD
  private buildHud() {
    const s = this.s;
    this.hud = this.add.container(0, 0).setDepth(10);
    // player portrait panel
    const p = this.game_.player;
    const panel = this.add.graphics();
    panel.fillStyle(0x1a1030, 0.75).fillRoundedRect(0, 0, 230 * s, 64 * s, 18 * s);
    panel.fillStyle(p.def.color, 1).fillCircle(32 * s, 32 * s, 26 * s);
    panel.lineStyle(4, 0x1a1030, 1).strokeCircle(32 * s, 32 * s, 26 * s);
    const face = this.add.image(32 * s, 34 * s, `ch_${p.def.id}`).setScale(0.36 * s * K);
    const name = this.add.text(66 * s, 8 * s, p.def.name, textStyle(20 * s)).setOrigin(0, 0);
    this.portraitBar = this.add.graphics();
    this.portraitText = this.add.text(66 * s, 46 * s, '', textStyle(13 * s)).setOrigin(0, 0.5);
    const pc = this.add.container(12 * DPR, 12 * DPR, [panel, face, name, this.portraitBar, this.portraitText]).setName('portrait');
    this.hud.add(pc);

    // enemies remaining
    const ec = this.add.container(0, 12).setName('enemies');
    const bg = this.add.graphics();
    const n = this.game_.enemies.length;
    const iw = 40 * s;
    const totalW = n * iw + 24 * s;
    bg.fillStyle(0x1a1030, 0.75).fillRoundedRect(-totalW / 2, 0, totalW, 60 * s, 18 * s);
    ec.add(bg);
    this.game_.enemies.forEach((e, i) => {
      const x = -totalW / 2 + 12 * s + iw * i + iw / 2;
      const ring = this.add.circle(x, 30 * s, 17 * s, 0xff3d5a).setStrokeStyle(3, 0x1a1030);
      const ic = this.add.image(x, 32 * s, `ch_${e.def.id}`).setScale(0.22 * s * K);
      ec.add([ring, ic]);
      this.enemyIcons.push(ic);
      ic.setData('ring', ring);
    });
    this.enemyCount = this.add.text(0, 66 * s, 'ÉLIMINE LES 5 ROBOTS !', textStyle(16 * s, '#ffe14a')).setOrigin(0.5, 0);
    ec.add(this.enemyCount);
    this.hud.add(ec);
  }

  private buildDesktopSuper() {
    const s = this.s;
    this.deskSuperGfx = this.add.graphics();
    const star = this.add.image(0, 0, 'super_btn').setScale(0.75 * s);
    this.deskSuperLabel = this.add.text(0, 62 * s, 'ESPACE', textStyle(18 * s, '#ffe14a')).setOrigin(0.5);
    const zone = this.add.zone(0, 0, 110 * s, 110 * s).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.game_.controls.superFire = { auto: true, angle: 0, power: 1 }; });
    this.deskSuper = this.add.container(0, 0, [this.deskSuperGfx, star, this.deskSuperLabel, zone]).setDepth(10);
    star.setName('star');
  }

  private makeStick(knobTex: string): Stick {
    const s = this.s;
    const base = this.add.image(0, 0, 'joy_base').setScale(0.75 * s).setAlpha(0.7);
    const knob = this.add.image(0, 0, knobTex).setScale(0.75 * s);
    return { base, knob, pointerId: null, homeX: 0, homeY: 0, cx: 0, cy: 0, maxDrag: 0, radius: 70 * s };
  }

  private buildTouchControls() {
    this.touchGroup = this.add.container(0, 0).setDepth(20);
    this.moveStick = this.makeStick('joy_knob');
    this.aimStick = this.makeStick('joy_knob_aim');
    this.superRing = this.add.graphics();
    this.superBtn = this.add.image(0, 0, 'super_btn_off').setScale(0.8 * this.s);
    this.touchGroup.add([this.moveStick.base, this.moveStick.knob, this.aimStick.base, this.aimStick.knob, this.superRing, this.superBtn]);
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const s = this.s;
    const pad = 20 * s;
    const ms = this.moveStick, as = this.aimStick;
    ms.homeX = pad + ms.radius + 20 * s; ms.homeY = h - pad - ms.radius - 10 * s;
    as.homeX = w - pad - as.radius - 20 * s; as.homeY = h - pad - as.radius - 10 * s;
    for (const st of [ms, as]) if (st.pointerId === null) this.resetStick(st);
    this.superBtn.setPosition(as.homeX - as.radius - 70 * s, as.homeY + 18 * s);
    if (this.superBtn.x - 60 * s < w * 0.5) this.superBtn.setPosition(as.homeX, as.homeY - as.radius - 70 * s);
    this.deskSuper.setPosition(w - 80 * s, h - 92 * s);
    const ec = this.hud.getByName('enemies') as Phaser.GameObjects.Container;
    const narrow = w / DPR < 640;
    ec.setPosition(narrow ? w / 2 + 50 * s : w / 2, narrow ? 84 * s : 12 * DPR);
    if (narrow) ec.setScale(0.85); else ec.setScale(1);
    this.mute.setPosition(w - 16 * DPR, 14 * DPR);
    this.hint?.setPosition(w / 2, h * 0.3);
  }

  private applyMode() {
    const touch = this.game_.controls.touchMode;
    this.touchGroup.setVisible(touch);
    this.deskSuper.setVisible(!touch);
  }

  private resetStick(st: Stick) {
    st.cx = st.homeX; st.cy = st.homeY;
    st.base.setPosition(st.homeX, st.homeY).setAlpha(0.45);
    st.knob.setPosition(st.homeX, st.homeY).setAlpha(0.7);
  }

  // ------------------------------------------------------------------ touch input
  private onDown(p: Phaser.Input.Pointer) {
    Audio.unlock();
    if (!p.wasTouch) return;
    const c = this.game_.controls;
    if (!c.touchMode) { c.touchMode = true; this.applyMode(); }
    const { width: w } = this.scale;
    const s = this.s;
    // super button first
    if (this.superPointer === null && Phaser.Math.Distance.Between(p.x, p.y, this.superBtn.x, this.superBtn.y) < 64 * s) {
      this.superPointer = p.id;
      this.superStart = { x: p.x, y: p.y, max: 0 };
      this.superBtn.setScale(0.9 * s);
      if (this.game_.player.superReady) c.superAimActive = true;
      return;
    }
    if (p.x < w * 0.5) {
      if (this.moveStick.pointerId !== null) return;
      const st = this.moveStick;
      st.pointerId = p.id; st.cx = p.x; st.cy = p.y; st.maxDrag = 0;
      st.base.setPosition(p.x, p.y).setAlpha(0.8); st.knob.setPosition(p.x, p.y).setAlpha(1);
    } else {
      if (this.aimStick.pointerId !== null) return;
      const st = this.aimStick;
      st.pointerId = p.id; st.cx = p.x; st.cy = p.y; st.maxDrag = 0;
      st.base.setPosition(p.x, p.y).setAlpha(0.8); st.knob.setPosition(p.x, p.y).setAlpha(1);
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    const c = this.game_.controls;
    if (p.id === this.moveStick.pointerId) {
      const v = this.stickVector(this.moveStick, p);
      c.moveX = v.x; c.moveY = v.y;
    } else if (p.id === this.aimStick.pointerId) {
      const v = this.stickVector(this.aimStick, p);
      if (this.aimStick.maxDrag > 14 * DPR) {
        c.aimActive = true; c.aimAngle = Math.atan2(v.y, v.x); c.aimPower = Math.hypot(v.x, v.y);
      }
    } else if (p.id === this.superPointer) {
      const dx = p.x - this.superStart.x, dy = p.y - this.superStart.y;
      const d = Math.hypot(dx, dy);
      this.superStart.max = Math.max(this.superStart.max, d);
      if (d > 12 * DPR && this.game_.player.superReady) {
        c.superAimActive = true; c.aimAngle = Math.atan2(dy, dx); c.aimPower = Math.min(1, d / (110 * this.s));
      }
    }
  }

  private stickVector(st: Stick, p: Phaser.Input.Pointer) {
    let dx = p.x - st.cx, dy = p.y - st.cy;
    const d = Math.hypot(dx, dy);
    st.maxDrag = Math.max(st.maxDrag, d);
    if (d > st.radius) { dx = (dx / d) * st.radius; dy = (dy / d) * st.radius; }
    st.knob.setPosition(st.cx + dx, st.cy + dy);
    const n = Math.min(1, d / st.radius);
    if (n < 0.12) return { x: 0, y: 0 };
    return { x: (dx / st.radius), y: (dy / st.radius) };
  }

  private onUp(p: Phaser.Input.Pointer) {
    const c = this.game_.controls;
    if (p.id === this.moveStick.pointerId) {
      this.moveStick.pointerId = null; c.moveX = 0; c.moveY = 0; this.resetStick(this.moveStick);
    } else if (p.id === this.aimStick.pointerId) {
      const st = this.aimStick;
      const d = Math.hypot(p.x - st.cx, p.y - st.cy);
      if (st.maxDrag < 14 * DPR) c.fire = { auto: true, angle: 0, power: 1 };
      else if (d > 14 * DPR) c.fire = { auto: false, angle: Math.atan2(p.y - st.cy, p.x - st.cx), power: Math.min(1, d / st.radius) };
      // dragged back to the centre = cancel
      st.pointerId = null; c.aimActive = false; this.resetStick(st);
    } else if (p.id === this.superPointer) {
      this.superPointer = null;
      this.superBtn.setScale(0.8 * this.s);
      const ready = this.game_.player.superReady;
      if (!ready) {
        Audio.sfx('empty'); vibrate(10);
        this.tweens.add({ targets: this.superBtn, x: this.superBtn.x + 6, duration: 40, yoyo: true, repeat: 2 });
      } else {
        const dx = p.x - this.superStart.x, dy = p.y - this.superStart.y, d = Math.hypot(dx, dy);
        if (this.superStart.max < 12 * DPR) c.superFire = { auto: true, angle: 0, power: 1 };
        else if (d > 12 * DPR) c.superFire = { auto: false, angle: Math.atan2(dy, dx), power: Math.min(1, d / (110 * this.s)) };
      }
      c.superAimActive = false;
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(time: number) {
    const p = this.game_.player;
    if (!p) return;
    const s = this.s;
    // portrait HP bar
    const g = this.portraitBar; g.clear();
    const bw = 150 * s, f = Math.max(0, p.hp / p.maxHp);
    g.fillStyle(0x3b2d66, 1).fillRoundedRect(66 * s, 32 * s, bw, 10 * s, 4);
    g.fillStyle(f > 0.35 ? 0x47e35b : 0xffc21f, 1).fillRoundedRect(66 * s, 32 * s, Math.max(4, bw * f), 10 * s, 4);
    this.portraitText.setText(`${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`).setY(52 * s);

    // super gauge (touch)
    const ready = p.superReady;
    this.superBtn.setTexture(ready ? 'super_btn' : 'super_btn_off');
    const sr = this.superRing; sr.clear();
    const bx = this.superBtn.x, by = this.superBtn.y, rr = 52 * s;
    sr.lineStyle(8 * s, 0x1a1030, 0.7).strokeCircle(bx, by, rr);
    sr.lineStyle(6 * s, ready ? 0xffe14a : 0xffa51f, 1).beginPath().arc(bx, by, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.superCharge).strokePath();
    if (ready) {
      const pulse = 1 + Math.sin(time * 0.012) * 0.08;
      if (this.superPointer === null) this.superBtn.setScale(0.8 * s * pulse);
      sr.fillStyle(0xffe14a, 0.18 + Math.sin(time * 0.012) * 0.1).fillCircle(bx, by, rr + 10 * s);
    }

    // super gauge (desktop)
    const dg = this.deskSuperGfx; dg.clear();
    dg.fillStyle(0x1a1030, 0.7).fillCircle(0, 0, 50 * s);
    dg.lineStyle(7 * s, ready ? 0xffe14a : 0xffa51f, 1).beginPath().arc(0, 0, 46 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.superCharge).strokePath();
    (this.deskSuper.getByName('star') as Phaser.GameObjects.Image).setTexture(ready ? 'super_btn' : 'super_btn_off').setScale(0.62 * s * (ready ? 1 + Math.sin(time * 0.012) * 0.08 : 1));
    this.deskSuperLabel.setText(ready ? 'ESPACE !' : `SUPER ${Math.floor(p.superCharge * 100)}%`);

    // low HP vignette
    const { width: w, height: h } = this.scale;
    this.vignette.clear();
    const hurtA = Math.max(0, 1 - (time - this.hurtAt) / 250) * 0.35;
    if (p.alive && (f < 0.3 || hurtA > 0)) {
      const a = Math.max(hurtA, f < 0.3 ? (0.3 - f) / 0.3 * (0.35 + Math.sin(time * 0.008) * 0.12) : 0);
      const t = 40 * s;
      this.vignette.fillStyle(0xff1030, a);
      this.vignette.fillRect(0, 0, w, t).fillRect(0, h - t, w, t).fillRect(0, 0, t, h).fillRect(w - t, 0, t, h);
    }
  }

  // ------------------------------------------------------------------ events
  private onPlayerHurt() {
    this.hurtAt = this.time.now;
  }

  private onEnemyDied(f: Fighter) {
    const idx = this.game_.enemies.indexOf(f);
    const ic = this.enemyIcons[idx];
    if (ic) {
      ic.setTint(0x555577);
      (ic.getData('ring') as Phaser.GameObjects.Arc).setFillStyle(0x444466);
      const skull = this.add.image(0, 0, 'skull').setScale(0);
      const ec = this.hud.getByName('enemies') as Phaser.GameObjects.Container;
      skull.setPosition(ic.x, ic.y);
      ec.add(skull);
      this.tweens.add({ targets: skull, scale: 0.55 * this.s, duration: 300, ease: 'Back.Out' });
    }
    const left = this.game_.enemies.filter((e) => e.alive).length;
    this.enemyCount.setText(left > 0 ? `ENCORE ${left} !` : 'TOUS ÉLIMINÉS !');
    if (left > 0) this.banner(left === 1 ? 'PLUS QU’UN !' : 'K.O. !', left === 1 ? '#ff8bd8' : '#ffe14a', 64);
  }

  private onGameOver(win: boolean) {
    this.touchGroup.setVisible(false);
    this.deskSuper.setVisible(false);
    this.banner(win ? 'K.O. FINAL !' : 'AÏE… K.O. !', win ? '#ffe14a' : '#ff5a6e', 84, 1200);
  }

  private banner(text: string, color: string, size: number, hold = 500) {
    const { width: w, height: h } = this.scale;
    const sz = Math.min(size * this.s, w / (text.length * 0.62));
    const t = this.add.text(w / 2, h * 0.36, text, textStyle(sz, color)).setOrigin(0.5).setScale(3).setAlpha(0).setDepth(50).setAngle(-6);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 260 + hold, duration: 300, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------ countdown
  private runCountdown() {
    const { width: w, height: h } = this.scale;
    const touch = this.game_.controls.touchMode;
    const hintTxt = touch
      ? 'Gauche : bouger · Droite : viser et tirer\n(touche rapide = tir automatique) · ★ = SUPER'
      : 'ZQSD / WASD : bouger · Souris : viser et tirer\nESPACE ou clic droit : SUPER · Maj : voir la portée du super';
    this.hint = this.add.text(w / 2, h * 0.3, hintTxt, textStyle(Math.min(20 * this.s, w / 34), '#ffffff')).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 1, duration: 300, delay: 200 });
    if (touch && h > w) {
      const rot = this.add.text(w / 2, h * 0.18, '↻ Tourne ton téléphone pour jouer en grand !', textStyle(Math.min(18 * this.s, w / 24), '#9ff6ff')).setOrigin(0.5).setDepth(40);
      this.tweens.add({ targets: rot, alpha: 0, delay: 5000, duration: 600, onComplete: () => rot.destroy() });
    }

    this.time.delayedCall(500, () => this.game_.startIntroZoom());
    const steps: [string, string][] = [['3', '#ffffff'], ['2', '#ffe14a'], ['1', '#ff8a3f'], ['GO !', '#5dff7a']];
    steps.forEach(([txt, col], i) => {
      this.time.delayedCall(900 + i * 750, () => {
        const isGo = i === 3;
        Audio.sfx(isGo ? 'go' : 'beep');
        vibrate(isGo ? 60 : 20);
        const t = this.add.text(w / 2, h * 0.5, txt, textStyle((isGo ? 150 : 170) * this.s, col)).setOrigin(0.5).setDepth(60).setScale(0.2);
        this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.Out' });
        this.tweens.add({ targets: t, scale: isGo ? 2.2 : 1.4, alpha: 0, delay: isGo ? 400 : 420, duration: 300, onComplete: () => t.destroy() });
        if (isGo) {
          this.cameras.main.flash(200, 255, 255, 255);
          this.game_.beginFight();
          if (this.hint) this.tweens.add({ targets: this.hint, alpha: 0, delay: 3500, duration: 600 });
        }
      });
    });
  }
}
