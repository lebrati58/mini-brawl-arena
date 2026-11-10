import Phaser from 'phaser';
import { Audio, vibrate } from '../systems/audio';
import { DPR, textStyle } from '../game/ui';
import { menuBackground, muteButton, restartOnResize } from './common';
import { CHARACTER_ORDER, CHARACTERS } from '../game/characters';
import { CH_TEX_SCALE as K } from '../systems/textures';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const { width: w, height: h } = this.scale;
    const s = Math.min(w / 900, h / 640, 1.4 * DPR);
    menuBackground(this);
    restartOnResize(this);

    // --- characters burst in from below
    const spacing = Math.min(240 * s, w / 3.2);
    CHARACTER_ORDER.forEach((id, i) => {
      const x = w / 2 + (i - 1) * spacing;
      const y = h * 0.66;
      const shadow = this.add.image(x, y + 70 * s, 'shadow').setScale(2.2 * s, 1.6 * s).setAlpha(0);
      const ch = this.add.image(x, h + 200, `ch_${id}`).setScale(1.05 * s * K);
      if (i === 0) ch.setFlipX(false);
      if (i === 2) ch.setFlipX(true);
      this.tweens.add({
        targets: ch, y, duration: 650, delay: 900 + i * 160, ease: 'Back.Out',
        onStart: () => Audio.sfx('whoosh'),
        onComplete: () => {
          this.tweens.add({ targets: shadow, alpha: 1, duration: 200 });
          this.tweens.add({ targets: ch, y: y - 14 * s, scaleY: 1.1 * s * K, duration: 520 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
          this.dust(x, y + 70 * s, CHARACTERS[id].glow);
        },
      });
    });

    // --- logo: letters drop in one by one
    const title = 'MINI BRAWL';
    const size = 96 * s;
    const letters: Phaser.GameObjects.Text[] = [];
    let totalW = 0;
    const widths = title.split('').map((ch) => {
      const t = this.add.text(0, 0, ch, textStyle(size, '#ffe14a', '#1a1030', size / 6)).setVisible(false);
      const tw = ch === ' ' ? size * 0.35 : t.width * 0.92;
      t.destroy();
      totalW += tw;
      return tw;
    });
    let cx = w / 2 - totalW / 2;
    title.split('').forEach((ch, i) => {
      const colors = ['#ffe14a', '#ffffff', '#ffe14a', '#ffffff', '', '#3ff0ff', '#ff6a2b', '#9dff6b', '#ff8bd8', '#ffe14a'];
      const t = this.add.text(cx + widths[i] / 2, -100, ch, textStyle(size, colors[i] || '#fff', '#1a1030', size / 6)).setOrigin(0.5);
      letters.push(t);
      cx += widths[i];
      const targetY = h * 0.2;
      this.tweens.add({
        targets: t, y: targetY, angle: { from: Phaser.Math.Between(-40, 40), to: 0 }, duration: 520, delay: 120 + i * 70, ease: 'Bounce.Out',
        onComplete: () => this.tweens.add({ targets: t, y: targetY - 8 * s, duration: 900, delay: i * 90, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
      });
    });

    // --- "ARENA" ribbon
    const ribbon = this.add.container(w / 2, h * 0.2 + 74 * s).setScale(0);
    const rg = this.add.graphics();
    rg.fillStyle(0x1a1030, 1).fillRoundedRect(-150 * s, -28 * s, 300 * s, 62 * s, 16 * s);
    rg.fillStyle(0xff3d7f, 1).fillRoundedRect(-144 * s, -24 * s, 288 * s, 50 * s, 12 * s);
    rg.fillStyle(0xffffff, 0.25).fillRoundedRect(-136 * s, -20 * s, 272 * s, 14 * s, 6 * s);
    ribbon.add([rg, this.add.text(0, 0, '★ ARENA ★', textStyle(40 * s)).setOrigin(0.5)]);
    this.tweens.add({ targets: ribbon, scale: 1, angle: { from: -20, to: -3 }, duration: 600, delay: 1000, ease: 'Back.Out' });

    // --- tap to play
    const tap = this.add.text(w / 2, h * 0.9, 'TOUCHE L’ÉCRAN POUR JOUER', textStyle(30 * Math.max(s, 0.7 * DPR))).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: tap, alpha: 1, duration: 400, delay: 1700 });
    this.tweens.add({ targets: tap, scale: 1.08, duration: 600, yoyo: true, repeat: -1, delay: 2100, ease: 'Sine.InOut' });

    this.add.text(12 * DPR, h - 10 * DPR, 'v1.0 · fait avec une IA', textStyle(14 * DPR, '#ffffffaa', '#1a1030', 3 * DPR)).setOrigin(0, 1);
    muteButton(this);

    const go = () => {
      Audio.unlock();
      Audio.sfx('go');
      Audio.playMusic('menu');
      vibrate(30);
      this.cameras.main.flash(250, 255, 255, 255);
      this.time.delayedCall(180, () => this.scene.start('Select'));
    };
    this.input.once('pointerup', go);
    this.input.keyboard?.once('keydown', go);
  }

  private dust(x: number, y: number, tint: number) {
    const p = this.add.particles(x, y, 'smoke', {
      speed: { min: 60, max: 180 }, angle: { min: 180, max: 360 }, scale: { start: 0.7, end: 0 }, alpha: { start: 0.7, end: 0 },
      lifespan: 600, tint: [0xffffff, tint], emitting: false,
    });
    p.explode(14);
    this.time.delayedCall(800, () => p.destroy());
  }
}
