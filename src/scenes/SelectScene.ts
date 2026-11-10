import Phaser from 'phaser';
import { Audio, vibrate } from '../systems/audio';
import { CHARACTER_ORDER, CHARACTERS, CharacterId } from '../game/characters';
import { DPR, hex, makeButton, textStyle } from '../game/ui';
import { menuBackground, muteButton, restartOnResize } from './common';
import { CH_TEX_SCALE as K } from '../systems/textures';

export class SelectScene extends Phaser.Scene {
  private selected: CharacterId = 'blaze';
  private cards: { id: CharacterId; cont: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Graphics; sprite: Phaser.GameObjects.Image; w: number; h: number }[] = [];

  constructor() { super('Select'); }

  create() {
    this.cards = [];
    this.selected = (this.registry.get('character') as CharacterId) ?? 'blaze';
    Audio.playMusic('menu');
    const { width: w, height: h } = this.scale;
    menuBackground(this, 0x1b1446, 0x5b2bd6);
    restartOnResize(this);
    muteButton(this);

    const portrait = h > w * 1.15;
    const s = Math.min(w / 1000, h / 700, 1.3 * DPR);
    const d = DPR;

    const title = this.add.text(w / 2, portrait ? 78 * d : Math.max(36 * d, 54 * s), 'CHOISIS TON HÉROS !', textStyle(Math.min(Math.max(30 * d, 56 * s), w / 15), '#ffe14a')).setOrigin(0.5);
    this.tweens.add({ targets: title, scale: { from: 0.4, to: 1 }, duration: 500, ease: 'Back.Out' });

    // card geometry
    let cw: number, ch: number;
    const positions: { x: number; y: number }[] = [];
    const btnH = Math.max(64 * d, 84 * s);
    if (portrait) {
      const avail = h - 140 * d - btnH - 50 * d;
      ch = Math.min(avail / 3 - 14 * d, 230 * d);
      cw = Math.min(w - 32 * d, 520 * d);
      CHARACTER_ORDER.forEach((_, i) => positions.push({ x: w / 2, y: 122 * d + ch / 2 + i * (ch + 14 * d) }));
    } else {
      cw = Math.min((w - 80 * d) / 3, 300 * s + 20 * d);
      ch = Math.min(h - 120 * s - btnH - 70 * d, 420 * s + 20 * d);
      const top = Math.max(80 * d, 110 * s);
      CHARACTER_ORDER.forEach((_, i) => positions.push({ x: w / 2 + (i - 1) * (cw + 24 * d), y: top + ch / 2 }));
    }

    CHARACTER_ORDER.forEach((id, i) => this.buildCard(id, positions[i].x, positions[i].y, cw, ch, portrait, i));
    this.refreshSelection(false);

    const btn = makeButton(this, w / 2, h - btnH / 2 - 26 * d, 'COMBATTRE !', 0xff3d7f, () => this.startGame(), Math.min(w - 40 * d, 360 * Math.max(s, 0.8 * d)), btnH);
    this.tweens.add({ targets: btn, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // keyboard shortcuts
    this.input.keyboard?.on('keydown-LEFT', () => this.cycle(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.cycle(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
  }

  private cycle(d: number) {
    const i = CHARACTER_ORDER.indexOf(this.selected);
    this.select(CHARACTER_ORDER[(i + d + 3) % 3]);
  }

  private buildCard(id: CharacterId, x: number, y: number, cw: number, ch: number, portrait: boolean, idx: number) {
    const def = CHARACTERS[id];
    const cont = this.add.container(x, y);
    const frame = this.add.graphics();
    const bg = this.add.graphics();
    const top = Phaser.Display.Color.ValueToColor(def.color).lighten(10).color;
    const bot = Phaser.Display.Color.ValueToColor(def.color).darken(35).color;
    bg.fillGradientStyle(top, top, bot, bot, 1);
    bg.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 24);
    bg.fillStyle(0xffffff, 0.12).fillRoundedRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, ch * 0.18, 16);
    cont.add([frame, bg]);

    const d = DPR;
    const scaleBase = portrait ? Math.min(ch / 210, d) : Math.min(cw / 260, ch / 380, 1.25 * d);
    let sprite: Phaser.GameObjects.Image;
    if (portrait) {
      const sx = -cw / 2 + ch * 0.42;
      cont.add(this.add.image(sx, ch * 0.32, 'shadow').setScale(1.8 * scaleBase, 1.3 * scaleBase));
      sprite = this.add.image(sx, 0, `ch_${id}`).setScale(0.95 * scaleBase * K);
      cont.add(sprite);
      const tx = -cw / 2 + ch * 0.85;
      const nameSize = Math.min(Math.max(24 * d, 38 * scaleBase), ch * 0.2);
      const roleSize = Math.min(Math.max(15 * d, 20 * scaleBase), ch * 0.11);
      const top = -ch / 2 + 8 * d;
      cont.add(this.add.text(tx, top, def.name, textStyle(nameSize)).setOrigin(0, 0));
      cont.add(this.add.text(tx, top + nameSize * 1.12, def.role, textStyle(roleSize, hex(def.accent))).setOrigin(0, 0));
      const statsTop = top + nameSize * 1.12 + roleSize * 1.6;
      const superSize = Math.min(Math.max(13 * d, 17 * scaleBase), ch * 0.09);
      const statsRow = (ch / 2 - 10 * d - superSize * 1.4 - statsTop) / 4;
      this.statBars(cont, def, tx, statsTop + statsRow / 2, cw / 2 - tx - 16 * d, Math.min(scaleBase * 0.85, statsRow / 25), statsRow);
      cont.add(this.add.text(tx, ch / 2 - 10 * d, `★ ${def.superName}`, textStyle(superSize, '#ffe14a')).setOrigin(0, 1));
    } else {
      const k = Math.min(ch / 440, cw / 300);
      const spY = -ch / 2 + ch * 0.33;
      cont.add(this.add.image(0, spY + 78 * k, 'shadow').setScale(2.2 * k, 1.5 * k));
      sprite = this.add.image(0, spY, `ch_${id}`).setScale(1.1 * k * K);
      cont.add(sprite);
      cont.add(this.add.text(0, -ch / 2 + 30 * k, `${def.emoji} ${def.name}`, textStyle(40 * k)).setOrigin(0.5, 0.5));
      cont.add(this.add.text(0, -ch / 2 + ch * 0.575, def.role, textStyle(24 * k, hex(def.accent))).setOrigin(0.5));
      this.statBars(cont, def, -cw / 2 + 18, -ch / 2 + ch * 0.655, cw - 36, k, ch * 0.062);
      const sup = this.add.text(0, ch / 2 - ch * 0.065, `★ ${def.superName}`, textStyle(19 * k, '#ffe14a')).setOrigin(0.5);
      sup.setWordWrapWidth(cw - 20);
      cont.add(sup);
    }

    // idle animation
    this.tweens.add({ targets: sprite, y: sprite.y - 8, scaleY: sprite.scaleY * 1.05, duration: 600 + idx * 80, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.time.addEvent({ delay: 2600 + idx * 700, loop: true, callback: () => {
      sprite.setTexture(`ch_${id}_blink`);
      this.time.delayedCall(130, () => sprite.setTexture(`ch_${id}`));
    } });

    const zone = this.add.zone(0, 0, cw, ch).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => { Audio.unlock(); this.select(id); });
    cont.add(zone);

    cont.setScale(0);
    this.tweens.add({ targets: cont, scale: 1, duration: 450, delay: 150 + idx * 110, ease: 'Back.Out' });
    this.cards.push({ id, cont, frame, sprite, w: cw, h: ch });
  }

  private statBars(cont: Phaser.GameObjects.Container, def: typeof CHARACTERS[CharacterId], x: number, y: number, width: number, s: number, rowHeight?: number) {
    const labels: [string, number][] = [['VIE', def.stats.hp], ['VITESSE', def.stats.speed], ['PUISSANCE', def.stats.power], ['PORTÉE', def.stats.range]];
    const rowH = rowHeight ?? 25 * s;
    const labelW = Math.min(width * 0.45, 110 * s);
    labels.forEach(([lab, v], i) => {
      const ry = y + i * rowH;
      cont.add(this.add.text(x, ry, lab, textStyle(Math.max(12 * DPR, 15 * s))).setOrigin(0, 0.5));
      const g = this.add.graphics();
      const bw = width - labelW;
      const segW = bw / 5;
      for (let k = 0; k < 5; k++) {
        g.fillStyle(0x1a1030, 0.6).fillRoundedRect(x + labelW + k * segW, ry - 7 * s, segW - 4, 14 * s, 4);
        if (k < v) g.fillStyle(k < 2 ? 0xffe14a : k < 4 ? 0xffb21f : 0xff6a2b, 1).fillRoundedRect(x + labelW + k * segW + 2, ry - 5 * s, segW - 8, 10 * s, 3);
      }
      cont.add(g);
    });
  }

  private select(id: CharacterId) {
    if (id === this.selected) {
      // tapping the already-selected card makes the hero do a little jump
      const c = this.cards.find((k) => k.id === id)!;
      this.tweens.add({ targets: c.sprite, angle: 360, duration: 500, ease: 'Cubic.Out', onComplete: () => c.sprite.setAngle(0) });
      Audio.sfx('select');
      return;
    }
    this.selected = id;
    Audio.sfx('select');
    vibrate(15);
    this.refreshSelection(true);
  }

  private refreshSelection(animate: boolean) {
    this.registry.set('character', this.selected);
    for (const c of this.cards) {
      const on = c.id === this.selected;
      c.frame.clear();
      if (on) {
        c.frame.fillStyle(0xffe14a, 1).fillRoundedRect(-c.w / 2 - 9, -c.h / 2 - 9, c.w + 18, c.h + 18, 30);
        c.frame.fillStyle(0x1a1030, 1).fillRoundedRect(-c.w / 2 - 4, -c.h / 2 - 4, c.w + 8, c.h + 8, 27);
      } else {
        c.frame.fillStyle(0x1a1030, 1).fillRoundedRect(-c.w / 2 - 5, -c.h / 2 - 5, c.w + 10, c.h + 10, 27);
      }
      if (animate) this.tweens.add({ targets: c.cont, scale: on ? 1.05 : 0.94, duration: 220, ease: 'Back.Out' });
      else c.cont.setData('target', on ? 1.05 : 0.94);
      c.cont.setAlpha(on ? 1 : 0.82);
      if (on && animate) {
        this.tweens.add({ targets: c.sprite, y: c.sprite.y - 30, duration: 160, yoyo: true, ease: 'Quad.Out' });
        const p = this.add.particles(c.cont.x, c.cont.y, 'star', { speed: { min: 150, max: 380 }, scale: { start: 0.5, end: 0 }, lifespan: 600, rotate: { min: 0, max: 360 }, emitting: false });
        p.explode(12);
        this.time.delayedCall(800, () => p.destroy());
      }
    }
  }

  private startGame() {
    Audio.unlock();
    Audio.sfx('go');
    vibrate(40);
    this.cameras.main.fadeOut(300, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { character: this.selected }));
  }
}
