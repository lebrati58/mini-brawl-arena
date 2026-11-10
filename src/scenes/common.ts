import Phaser from 'phaser';
import { Audio } from '../systems/audio';
import { DPR, textStyle } from '../game/ui';

/** Animated menu backdrop: gradient sky, slowly spinning light rays, floating sparkles. */
export function menuBackground(scene: Phaser.Scene, top = 0x2a1a6e, bottom = 0xff4f8b) {
  const { width: w, height: h } = scene.scale;
  const bg = scene.add.graphics();
  bg.fillGradientStyle(top, top, bottom, bottom, 1);
  bg.fillRect(0, 0, w, h);

  const rays = scene.add.container(w / 2, h * 0.42);
  for (let i = 0; i < 14; i++) {
    const r = scene.add.image(0, 0, 'ray').setOrigin(0.5, 1).setAngle((360 / 14) * i).setAlpha(0.13);
    r.setScale(1.6, Math.max(w, h) / 380);
    rays.add(r);
  }
  scene.tweens.add({ targets: rays, angle: 360, duration: 60000, repeat: -1 });

  // checker floor stripe at the bottom for depth
  const floor = scene.add.graphics();
  floor.fillStyle(0x1a1030, 0.25);
  for (let i = 0; i < 24 * DPR; i++) floor.fillRect(i * 80 * DPR, h - 40 * DPR, 40 * DPR, 40 * DPR);

  scene.add.particles(0, 0, 'spark', {
    x: { min: 0, max: w }, y: { min: 0, max: h },
    lifespan: 2600, scale: { start: 0.9 * DPR, end: 0 }, alpha: { start: 0.8, end: 0 },
    speedY: { min: -30 * DPR, max: -8 * DPR }, frequency: 140, tint: [0xffffff, 0xffe14a, 0x9ff6ff],
  });
}

/** Mute toggle shown on every screen. */
export function muteButton(scene: Phaser.Scene, x?: number, y?: number) {
  const { width: w } = scene.scale;
  const t = scene.add.text(x ?? w - 16 * DPR, y ?? 14 * DPR, Audio.muted ? '🔇' : '🔊', textStyle(30 * DPR)).setOrigin(1, 0).setDepth(1000).setInteractive({ useHandCursor: true });
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    Audio.unlock();
    const m = Audio.toggleMute();
    t.setText(m ? '🔇' : '🔊');
  });
  return t;
}

/** Restart scene on resize (debounced) — used by the menu screens. */
export function restartOnResize(scene: Phaser.Scene) {
  let timer: Phaser.Time.TimerEvent | null = null;
  const handler = () => {
    timer?.remove();
    timer = scene.time.delayedCall(150, () => scene.scene.restart());
  };
  scene.scale.on('resize', handler);
  scene.events.once('shutdown', () => scene.scale.off('resize', handler));
}
