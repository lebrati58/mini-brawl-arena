import Phaser from 'phaser';
import { CHARACTERS, CharacterId } from '../game/characters';
import { DPR, makeButton, textStyle } from '../game/ui';
import { Audio, vibrate } from '../systems/audio';
import type { GameScene } from './GameScene';
import { CH_TEX_SCALE as K } from '../systems/textures';

interface ResultData { win: boolean; character: CharacterId; kills: number; damage: number; duration: number; hpLeft: number; maxHp: number }

export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create(data: ResultData) {
    const { width: w, height: h } = this.scale;
    const s = Math.min(w / 900, h / 640, 1.3 * DPR);
    const def = CHARACTERS[data.character];
    const win = data.win;
    const portrait = h > w * 1.15;

    const shade = this.add.rectangle(0, 0, w, h, win ? 0x1b1446 : 0x150a20, 0).setOrigin(0);
    this.tweens.add({ targets: shade, fillAlpha: 0.78, duration: 400 });

    // rotating light rays + trophy (victory) or grey clouds (defeat)
    const cy = portrait ? h * 0.28 : h * 0.36;
    if (win) {
      const rays = this.add.container(w / 2, cy).setAlpha(0);
      for (let i = 0; i < 16; i++) rays.add(this.add.image(0, 0, 'ray').setOrigin(0.5, 1).setAngle(i * 22.5).setTint(i % 2 ? 0xffe14a : 0xff8bd8).setAlpha(0.35).setScale(1.4, Math.max(w, h) / 420));
      this.tweens.add({ targets: rays, alpha: 1, duration: 500 });
      this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
      Audio.sfx('victory');
      vibrate([60, 40, 60, 40, 120]);
      // confetti rain
      this.add.particles(0, -20, 'confetti', {
        x: { min: 0, max: w }, lifespan: 4200, speedY: { min: 160, max: 320 }, speedX: { min: -60, max: 60 },
        rotate: { start: 0, end: 720 }, scaleX: { min: 0.6, max: 1.1 }, scaleY: { start: 1, end: 0.3 },
        tint: [0xff3d7f, 0xffe14a, 0x3ff0ff, 0x9dff6b, 0x8f5bff, 0xffffff], frequency: 18, quantity: 2,
      }).setDepth(5);
      // fireworks
      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(300 + i * 450, () => {
          const fx = this.add.particles(Phaser.Math.Between(w * 0.15, w * 0.85), Phaser.Math.Between(h * 0.1, h * 0.45), 'spark', {
            speed: { min: 120, max: 380 }, scale: { start: 1.2, end: 0 }, lifespan: 900, gravityY: 200, blendMode: 'ADD',
            tint: Phaser.Utils.Array.GetRandom([0xffe14a, 0xff3d7f, 0x3ff0ff, 0x9dff6b]), emitting: false,
          }).setDepth(6);
          fx.explode(40);
          Audio.sfx('explode');
          this.time.delayedCall(1200, () => fx.destroy());
        });
      }
    } else {
      Audio.sfx('defeat');
      vibrate(200);
    }

    // hero
    const hero = this.add.image(w / 2 + (win ? 0 : 0), cy + 30 * s, `ch_${def.id}`).setScale(0).setDepth(7);
    if (win) {
      const trophy = this.add.image(w / 2 + 120 * s, cy + 20 * s, 'trophy').setScale(0).setDepth(6).setAngle(12);
      this.tweens.add({ targets: trophy, scale: 0.75 * s, duration: 600, delay: 400, ease: 'Back.Out' });
      this.tweens.add({ targets: trophy, angle: 4, y: trophy.y - 10, duration: 900, yoyo: true, repeat: -1, delay: 1000, ease: 'Sine.InOut' });
      hero.x = w / 2 - 60 * s;
      this.tweens.add({ targets: hero, scale: 1.25 * s * K, duration: 600, ease: 'Back.Out' });
      this.tweens.add({ targets: hero, y: hero.y - 36 * s, duration: 360, yoyo: true, repeat: -1, delay: 700, ease: 'Quad.Out' });
      this.tweens.add({ targets: hero, angle: { from: -8, to: 8 }, duration: 360, yoyo: true, repeat: -1, delay: 700 });
    } else {
      hero.setTint(0x9999bb);
      this.tweens.add({ targets: hero, scale: 1.1 * s * K, duration: 500, ease: 'Back.Out' });
      this.tweens.add({ targets: hero, angle: 90, y: hero.y + 30 * s, duration: 700, delay: 500, ease: 'Bounce.Out' });
      const stars = this.add.container(hero.x, hero.y - 70 * s).setDepth(8);
      for (let i = 0; i < 3; i++) stars.add(this.add.image(Math.cos(i * 2.09) * 50 * s, Math.sin(i * 2.09) * 16 * s, 'star').setScale(0.4 * s));
      this.tweens.add({ targets: stars, angle: 360, duration: 1500, repeat: -1 });
    }

    // title
    const titleTxt = win ? 'VICTOIRE !' : 'PERDU…';
    const title = this.add.text(w / 2, portrait ? h * 0.08 + 20 * DPR : h * 0.1, titleTxt, textStyle((win ? 110 : 90) * s, win ? '#ffe14a' : '#ff8a9a')).setOrigin(0.5).setDepth(9).setScale(4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 450, ease: 'Back.Out' });
    if (win) this.tweens.add({ targets: title, scale: 1.08, duration: 500, yoyo: true, repeat: -1, delay: 600, ease: 'Sine.InOut' });
    const sub = win ? `${def.name} est le champion de l’arène !` : 'Les robots ont gagné cette fois… revanche ?';
    this.add.text(w / 2, title.y + 70 * s, sub, textStyle(Math.min(26 * s, w / 22), '#ffffff')).setOrigin(0.5).setDepth(9);

    // stats
    const statsY = portrait ? h * 0.58 : cy + 160 * s;
    const stars = win ? (data.hpLeft / data.maxHp > 0.6 ? 3 : data.hpLeft / data.maxHp > 0.25 ? 2 : 1) : 0;
    if (win) {
      for (let i = 0; i < 3; i++) {
        const st = this.add.image(w / 2 + (i - 1) * 70 * s, statsY - 10 * s - (i === 1 ? 14 * s : 0), 'star').setScale(0).setDepth(9);
        if (i >= stars) st.setTint(0x444466);
        this.time.delayedCall(700 + i * 260, () => {
          if (i < stars) Audio.sfx('pickup');
          this.tweens.add({ targets: st, scale: 0.9 * s, angle: { from: -180, to: 0 }, duration: 380, ease: 'Back.Out' });
        });
      }
    }
    const lines = [`ROBOTS K.O. : ${data.kills} / 5`, `DÉGÂTS : ${data.damage}`, `TEMPS : ${data.duration} s`];
    const stTxt = this.add.text(w / 2, statsY + (win ? 54 : 0) * s, lines.join('   ·   '), textStyle(Math.min(22 * s, w / 30), '#9ff6ff')).setOrigin(0.5).setDepth(9).setAlpha(0);
    this.tweens.add({ targets: stTxt, alpha: 1, duration: 400, delay: 900 });

    // buttons
    const bh = Math.max(62 * DPR, 76 * s);
    const by = h - bh / 2 - 28 * DPR;
    const bw = Math.min(w * 0.44, 300 * Math.max(s, 0.8 * DPR));
    const gameScene = this.scene.get('Game') as GameScene;
    const replay = makeButton(this, w / 2 - bw / 2 - 12 * DPR, by, 'REJOUER', 0x47e35b, () => {
      Audio.sfx('go');
      gameScene.restartBattle();
    }, bw, bh).setDepth(10).setScale(0);
    const change = makeButton(this, w / 2 + bw / 2 + 12 * DPR, by, 'HÉROS', 0x8f5bff, () => {
      this.scene.stop('UI');
      this.scene.stop('Game');
      this.scene.start('Select');
    }, bw, bh).setDepth(10).setScale(0);
    this.tweens.add({ targets: [replay, change], scale: 1, duration: 400, delay: 1100, ease: 'Back.Out' });
    this.tweens.add({ targets: replay, scale: 1.06, duration: 600, yoyo: true, repeat: -1, delay: 1600, ease: 'Sine.InOut' });

    this.input.keyboard?.once('keydown-ENTER', () => gameScene.restartBattle());
    this.input.keyboard?.once('keydown-R', () => gameScene.restartBattle());
    Audio.playMusic('menu');
  }
}
