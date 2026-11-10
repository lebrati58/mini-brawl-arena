import Phaser from 'phaser';
import { Audio } from '../systems/audio';

/** Render at device resolution (capped at 2x) so everything stays crisp on phones. */
export const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

export const FONT = '"Lilita One", "Arial Black", "Trebuchet MS", sans-serif';

export function textStyle(size: number, color = '#ffffff', stroke = '#1a1030', strokeW?: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    color,
    stroke,
    strokeThickness: strokeW ?? Math.max(3, Math.round(size / 7)),
    shadow: { offsetX: 0, offsetY: Math.max(2, size / 14), color: '#1a1030', blur: 0, fill: true, stroke: true },
    align: 'center',
  };
}

export function hex(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Chunky cartoon button with press animation. */
export function makeButton(
  scene: Phaser.Scene, x: number, y: number, label: string, color: number, onClick: () => void,
  w = 300, h = 84,
) {
  const cont = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    const dy = pressed ? 6 : 0;
    g.fillStyle(0x1a1030, 1).fillRoundedRect(-w / 2 - 5, -h / 2 - 5 + 8, w + 10, h + 10, 22);
    g.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(28).color, 1).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 18);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 2, 18);
    g.fillStyle(0xffffff, 0.28).fillRoundedRect(-w / 2 + 10, -h / 2 + 6 + dy, w - 20, h * 0.32, 12);
    txt.y = dy - 2;
  };
  const txt = scene.add.text(0, 0, label, textStyle(h * 0.46)).setOrigin(0.5);
  cont.add([g, txt]);
  draw(false);
  const hit = scene.add.zone(0, 0, w + 10, h + 16).setInteractive({ useHandCursor: true });
  cont.add(hit);
  hit.on('pointerdown', () => { draw(true); Audio.unlock(); Audio.sfx('click'); });
  hit.on('pointerout', () => draw(false));
  hit.on('pointerup', () => {
    draw(false);
    scene.tweens.add({ targets: cont, scale: { from: 0.92, to: 1 }, duration: 160, ease: 'Back.Out' });
    onClick();
  });
  cont.setSize(w, h);
  return cont;
}
