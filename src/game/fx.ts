import Phaser from 'phaser';
import { FONT } from './ui';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Centralised visual effects with pre-built particle emitters (cheap to fire). */
export class Fx {
  private scene: Phaser.Scene;
  private dust: Emitter;
  private sparks: Emitter;
  private fire: Emitter;
  private smoke: Emitter;
  private stars: Emitter;
  private planks: Emitter;
  private heals: Emitter;
  private cyan: Emitter;
  private green: Emitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const mk = (tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number) => {
      const e = scene.add.particles(0, 0, tex, { ...cfg, emitting: false });
      e.setDepth(depth);
      return e;
    };
    this.dust = mk('smoke', { speed: { min: 10, max: 50 }, scale: { start: 0.35, end: 0 }, alpha: { start: 0.5, end: 0 }, lifespan: 450, tint: 0xe9f5c8 }, 5);
    this.sparks = mk('spark', { speed: { min: 140, max: 420 }, scale: { start: 0.9, end: 0 }, lifespan: 380, rotate: { min: 0, max: 360 }, blendMode: 'ADD', tint: [0xffffff, 0xffe14a, 0xffa51f] }, 9000);
    this.fire = mk('glow', { speed: { min: 80, max: 380 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 520, blendMode: 'ADD' }, 9001);
    this.smoke = mk('smoke', { speed: { min: 30, max: 150 }, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.55, end: 0 }, lifespan: 900, tint: [0x6b5a8a, 0x8a7aa8, 0x4a3d66] }, 8999);
    this.stars = mk('star', { speed: { min: 200, max: 520 }, scale: { start: 0.6, end: 0 }, lifespan: 750, rotate: { min: 0, max: 360 }, gravityY: 300 }, 9002);
    this.planks = mk('crate_plank', { speed: { min: 150, max: 400 }, angle: { min: 200, max: 340 }, scale: { start: 1.2, end: 0.6 }, lifespan: 800, rotate: { start: 0, end: 540 }, gravityY: 900 }, 9000);
    this.heals = mk('spark', { speedY: { min: -90, max: -40 }, speedX: { min: -20, max: 20 }, scale: { start: 0.8, end: 0 }, lifespan: 700, tint: 0x5dff7a, blendMode: 'ADD' }, 9000);
    this.cyan = mk('glow_cyan', { speed: { min: 60, max: 300 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 450, blendMode: 'ADD' }, 9001);
    this.green = mk('glow_green', { speed: { min: 80, max: 420 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 600, blendMode: 'ADD' }, 9001);
  }

  footDust(x: number, y: number) { this.dust.explode(1, x + Phaser.Math.Between(-8, 8), y); }
  healSparkle(x: number, y: number) { this.heals.explode(1, x + Phaser.Math.Between(-22, 22), y + Phaser.Math.Between(-30, 10)); }
  hitSparks(x: number, y: number, n = 8) { this.sparks.explode(n, x, y); }
  cyanBurst(x: number, y: number, n = 10) { this.cyan.explode(n, x, y); }
  greenBurst(x: number, y: number, n = 14) { this.green.explode(n, x, y); }

  explosion(x: number, y: number, radius: number) {
    const k = radius / 90;
    this.fire.explode(Math.round(18 * k), x, y);
    this.smoke.explode(Math.round(8 * k), x, y);
    this.sparks.explode(10, x, y);
    const flash = this.scene.add.image(x, y, 'glow').setScale(radius / 18).setDepth(9003).setBlendMode('ADD');
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: radius / 12, duration: 260, onComplete: () => flash.destroy() });
    const ring = this.scene.add.image(x, y, 'ring').setScale(0.2).setDepth(8).setTint(0xffd23f);
    this.scene.tweens.add({ targets: ring, scale: radius / 40, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    // scorch mark on the ground
    const scorch = this.scene.add.image(x, y, 'shadow').setScale(radius / 26, radius / 36).setDepth(2).setAlpha(0.55);
    this.scene.tweens.add({ targets: scorch, alpha: 0, duration: 2500, delay: 1200, onComplete: () => scorch.destroy() });
  }

  crateBreak(x: number, y: number) {
    this.planks.explode(10, x, y);
    this.smoke.explode(6, x, y);
    this.sparks.explode(6, x, y);
  }

  koBurst(x: number, y: number, tint: number) {
    this.stars.explode(14, x, y - 20);
    this.smoke.explode(10, x, y);
    this.fire.explode(10, x, y);
    const ring = this.scene.add.image(x, y, 'ring').setScale(0.3).setDepth(8).setTint(tint);
    this.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 500, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  floatText(x: number, y: number, text: string, color: string, size = 26) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#1a1030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(9500).setScale(0.3);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
  }

  damageNumber(x: number, y: number, dmg: number, onPlayer: boolean) {
    const big = dmg >= 1000;
    const t = this.scene.add.text(x + Phaser.Math.Between(-18, 18), y, `${dmg}`, {
      fontFamily: FONT, fontSize: big ? '34px' : '26px', color: onPlayer ? '#ff5a6e' : big ? '#ffe14a' : '#ffffff', stroke: '#1a1030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(9500).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: big ? 1.25 : 1, duration: 140, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: t, y: y - 46, alpha: 0, delay: 380, duration: 420, onComplete: () => t.destroy() });
  }
}
