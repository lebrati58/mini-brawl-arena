import Phaser from 'phaser';
import { CharacterId } from '../game/characters';

/**
 * Every visual in the game is drawn procedurally here (Canvas 2D) — original art,
 * no external image files. Characters are drawn at 2x and displayed at 0.5 scale
 * so they stay crisp on high-DPI phones.
 */
const OUT = '#1a1030';
/** Multiply any character sprite scale by this (textures are 2x the reference 160px art). */
export const CH_TEX_SCALE = 0.5;

type Ctx = CanvasRenderingContext2D;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h)!;
  const c = t.getContext();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  t.refresh();
}

function radial(c: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke = OUT, lw = 6) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  if (lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function eyes(c: Ctx, cx: number, cy: number, spacing: number, size: number, blink: boolean, angry = 0, pupil = '#1a1030') {
  for (const s of [-1, 1]) {
    const ex = cx + s * spacing;
    if (blink) {
      c.beginPath(); c.moveTo(ex - size, cy); c.quadraticCurveTo(ex, cy + size * 0.6, ex + size, cy);
      c.strokeStyle = OUT; c.lineWidth = 5; c.stroke();
      continue;
    }
    ellipse(c, ex, cy, size * 0.85, size, '#ffffff', OUT, 4.5);
    ellipse(c, ex + size * 0.3, cy + size * 0.1, size * 0.45, size * 0.55, pupil, OUT, 0);
    ellipse(c, ex + size * 0.12, cy - size * 0.2, size * 0.17, size * 0.17, '#ffffff', OUT, 0);
    if (angry) {
      c.beginPath();
      c.moveTo(ex - size * 1.0, cy - size * 1.15 - (s > 0 ? angry : -angry) * 0);
      c.lineTo(ex + size * 1.0, cy - size * 1.15 + s * angry);
      c.strokeStyle = OUT; c.lineWidth = 7; c.stroke();
    }
  }
}

// ---------------- characters ----------------

function drawBlaze(c: Ctx, blink: boolean) {
  const cx = 80, cy = 92;
  // feet
  ellipse(c, cx - 20, cy + 50, 16, 10, '#5a2410');
  ellipse(c, cx + 20, cy + 50, 16, 10, '#5a2410');
  // flame hair (behind body)
  const flame = c.createLinearGradient(0, 10, 0, 80);
  flame.addColorStop(0, '#fff6a0'); flame.addColorStop(0.4, '#ffd23f'); flame.addColorStop(1, '#ff5a1f');
  c.beginPath();
  c.moveTo(cx - 46, cy - 18);
  c.quadraticCurveTo(cx - 62, cy - 52, cx - 40, cy - 70);
  c.quadraticCurveTo(cx - 34, cy - 50, cx - 24, cy - 56);
  c.quadraticCurveTo(cx - 28, cy - 84, cx - 4, cy - 96);
  c.quadraticCurveTo(cx - 2, cy - 72, cx + 10, cy - 70);
  c.quadraticCurveTo(cx + 18, cy - 92, cx + 40, cy - 86);
  c.quadraticCurveTo(cx + 30, cy - 66, cx + 44, cy - 56);
  c.quadraticCurveTo(cx + 64, cy - 60, cx + 62, cy - 40);
  c.quadraticCurveTo(cx + 54, cy - 30, cx + 48, cy - 18);
  c.closePath();
  c.fillStyle = flame; c.fill(); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke();
  // body
  ellipse(c, cx, cy, 50, 52, radial(c, cx, cy, 52, [[0, '#ffb07a'], [0.55, '#ff6a2b'], [1, '#c23a10']]));
  // belly / jacket
  c.save(); c.beginPath(); c.ellipse(cx, cy, 50, 52, 0, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#3b2a6b'; c.fillRect(cx - 60, cy + 18, 120, 60);
  c.fillStyle = '#ffd23f'; c.fillRect(cx - 60, cy + 18, 120, 7);
  c.restore();
  c.beginPath(); c.ellipse(cx, cy, 50, 52, 0, 0, Math.PI * 2); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke();
  // face
  eyes(c, cx + 8, cy - 10, 18, 13, blink, 6);
  // grin
  c.beginPath(); c.moveTo(cx - 6, cy + 6); c.quadraticCurveTo(cx + 12, cy + 22, cx + 32, cy + 4);
  c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4.5; c.stroke();
  // cheek
  ellipse(c, cx - 22, cy + 6, 7, 4, 'rgba(255,60,60,0.45)', OUT, 0);
}

function drawZippy(c: Ctx, blink: boolean) {
  const cx = 80, cy = 92;
  // headband tails (behind)
  c.beginPath();
  c.moveTo(cx - 36, cy - 30);
  c.quadraticCurveTo(cx - 70, cy - 46, cx - 76, cy - 18);
  c.quadraticCurveTo(cx - 60, cy - 30, cx - 40, cy - 20);
  c.moveTo(cx - 36, cy - 24);
  c.quadraticCurveTo(cx - 64, cy - 10, cx - 70, cy + 10);
  c.quadraticCurveTo(cx - 54, cy - 6, cx - 38, cy - 14);
  c.fillStyle = '#3ff0ff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 5; c.stroke();
  // feet
  ellipse(c, cx - 18, cy + 48, 14, 9, '#2a1a55');
  ellipse(c, cx + 18, cy + 48, 14, 9, '#2a1a55');
  // body (hood) – slightly egg-shaped
  c.beginPath();
  c.moveTo(cx, cy - 56);
  c.bezierCurveTo(cx + 46, cy - 56, cx + 50, cy + 10, cx + 44, cy + 34);
  c.bezierCurveTo(cx + 36, cy + 54, cx - 36, cy + 54, cx - 44, cy + 34);
  c.bezierCurveTo(cx - 50, cy + 10, cx - 46, cy - 56, cx, cy - 56);
  c.fillStyle = radial(c, cx, cy, 52, [[0, '#c4a2ff'], [0.55, '#8f5bff'], [1, '#4a2aa8']]);
  c.fill(); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke();
  // face opening
  roundRect(c, cx - 26, cy - 26, 66, 30, 14);
  c.fillStyle = '#ffd9b8'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 5; c.stroke();
  eyes(c, cx + 8, cy - 11, 16, 10, blink, 5, '#0b5a66');
  // headband
  c.fillStyle = '#3ff0ff';
  roundRect(c, cx - 42, cy - 40, 86, 12, 5); c.fill(); c.strokeStyle = OUT; c.lineWidth = 4.5; c.stroke();
  // lightning emblem
  c.beginPath();
  c.moveTo(cx + 2, cy + 10); c.lineTo(cx - 10, cy + 28); c.lineTo(cx, cy + 28); c.lineTo(cx - 6, cy + 44);
  c.lineTo(cx + 12, cy + 22); c.lineTo(cx + 2, cy + 22); c.closePath();
  c.fillStyle = '#ffe94a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3.5; c.stroke();
}

function drawTanko(c: Ctx, blink: boolean) {
  const cx = 80, cy = 90;
  // feet
  ellipse(c, cx - 26, cy + 54, 20, 11, '#2f3b2a');
  ellipse(c, cx + 26, cy + 54, 20, 11, '#2f3b2a');
  // body – big rounded square
  roundRect(c, cx - 60, cy - 50, 120, 106, 42);
  c.fillStyle = radial(c, cx, cy, 64, [[0, '#9df0a6'], [0.5, '#3fbf5a'], [1, '#1f7a34']]);
  c.fill(); c.strokeStyle = OUT; c.lineWidth = 7; c.stroke();
  // belt
  c.save(); roundRect(c, cx - 60, cy - 50, 120, 106, 42); c.clip();
  c.fillStyle = '#5b4632'; c.fillRect(cx - 70, cy + 26, 140, 14);
  c.fillStyle = '#ffd23f'; roundRect(c, cx - 10, cy + 24, 20, 18, 4); c.fill();
  c.restore();
  // helmet
  c.beginPath();
  c.moveTo(cx - 56, cy - 18);
  c.bezierCurveTo(cx - 56, cy - 80, cx + 56, cy - 80, cx + 56, cy - 18);
  c.closePath();
  const hg = c.createLinearGradient(0, cy - 70, 0, cy - 18);
  hg.addColorStop(0, '#eef3fb'); hg.addColorStop(1, '#8794ab');
  c.fillStyle = hg; c.fill(); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke();
  roundRect(c, cx - 62, cy - 26, 124, 14, 6); c.fillStyle = '#6b7890'; c.fill(); c.stroke();
  for (const rx of [-40, -14, 14, 40]) ellipse(c, cx + rx, cy - 19, 3, 3, '#d8dfeb', OUT, 2);
  // face
  eyes(c, cx + 10, cy + 0, 20, 10, blink, 9);
  // underbite mouth with teeth
  roundRect(c, cx - 4, cy + 12, 40, 12, 5); c.fillStyle = '#5a1020'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
  c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(cx + 4, cy + 24); c.lineTo(cx + 8, cy + 15); c.lineTo(cx + 12, cy + 24); c.fill();
  c.beginPath(); c.moveTo(cx + 22, cy + 24); c.lineTo(cx + 26, cy + 15); c.lineTo(cx + 30, cy + 24); c.fill();
  // scar
  c.beginPath(); c.moveTo(cx - 38, cy - 4); c.lineTo(cx - 26, cy + 14); c.strokeStyle = '#1f7a34'; c.lineWidth = 4; c.stroke();
}

const DRAWERS: Record<CharacterId, (c: Ctx, blink: boolean) => void> = {
  blaze: drawBlaze, zippy: drawZippy, tanko: drawTanko,
};

// ---------------- weapons ----------------
function drawWeapons(scene: Phaser.Scene) {
  canvasTex(scene, 'w_blaze', 80, 40, (c) => {
    roundRect(c, 6, 12, 50, 18, 7); c.fillStyle = '#3b2a6b'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    roundRect(c, 50, 9, 22, 24, 6); c.fillStyle = '#ff6a2b'; c.fill(); c.stroke();
    ellipse(c, 72, 21, 5, 8, '#ffd23f', OUT, 3);
    roundRect(c, 16, 26, 12, 12, 3); c.fillStyle = '#2a1d50'; c.fill(); c.stroke();
  });
  canvasTex(scene, 'w_zippy', 96, 32, (c) => {
    c.beginPath(); c.moveTo(22, 10); c.lineTo(88, 12); c.quadraticCurveTo(94, 16, 88, 20); c.lineTo(22, 22); c.closePath();
    const g = c.createLinearGradient(22, 0, 92, 0); g.addColorStop(0, '#d6fdff'); g.addColorStop(1, '#3ff0ff');
    c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3.5; c.stroke();
    roundRect(c, 4, 9, 20, 14, 4); c.fillStyle = '#4a2aa8'; c.fill(); c.stroke();
    roundRect(c, 20, 4, 6, 24, 3); c.fillStyle = '#ffe94a'; c.fill(); c.stroke();
  });
  canvasTex(scene, 'w_tanko', 70, 70, (c) => {
    ellipse(c, 34, 35, 28, 26, radial(c, 34, 35, 28, [[0, '#ffffff'], [0.5, '#b8c4d6'], [1, '#5d6a80']]), OUT, 6);
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(46, 18 + i * 12); c.lineTo(58, 20 + i * 12); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    }
    roundRect(c, 4, 25, 14, 20, 4); c.fillStyle = '#ffd23f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
  });
}

// ---------------- environment ----------------
function drawEnvironment(scene: Phaser.Scene) {
  // floor tiles (two shades for the checker pattern)
  const floor = (key: string, base: string, dark: string) =>
    canvasTex(scene, key, 64, 64, (c) => {
      c.fillStyle = base; c.fillRect(0, 0, 64, 64);
      c.fillStyle = dark;
      for (let i = 0; i < 7; i++) {
        const x = (i * 23 + 7) % 60, y = (i * 37 + 11) % 60;
        c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x + 2, y); c.lineTo(x + 4, y + 6); c.fill();
      }
      c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 2; c.strokeRect(1, 1, 62, 62);
    });
  floor('floor_a', '#7ccf5a', '#68b84a');
  floor('floor_b', '#86d964', '#70c252');
  canvasTex(scene, 'floor_sand', 64, 64, (c) => {
    c.fillStyle = '#f1cf8a'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#e2bb72';
    for (let i = 0; i < 6; i++) ellipse(c, (i * 29 + 9) % 58 + 3, (i * 17 + 5) % 58 + 3, 3, 2, '#e2bb72', OUT, 0);
    c.strokeStyle = 'rgba(0,0,0,0.05)'; c.lineWidth = 2; c.strokeRect(1, 1, 62, 62);
  });

  // wall block in 3/4 view: 64 wide, top face 64 tall + 22 px front face
  canvasTex(scene, 'wall', 64, 86, (c) => {
    c.fillStyle = '#4b3f8f'; c.fillRect(0, 56, 64, 30);
    c.fillStyle = '#3a2f73';
    for (let x = 0; x < 64; x += 16) c.fillRect(x + 7, 60, 2, 22);
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#a99cf0'); g.addColorStop(1, '#7a6bd0');
    c.fillStyle = g; c.fillRect(0, 0, 64, 62);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, 64, 6);
    c.strokeStyle = 'rgba(40,24,90,0.35)'; c.lineWidth = 2;
    c.strokeRect(4, 4, 56, 54);
    c.beginPath(); c.moveTo(4, 31); c.lineTo(60, 31); c.moveTo(32, 4); c.lineTo(32, 31); c.moveTo(18, 31); c.lineTo(18, 58); c.moveTo(46, 31); c.lineTo(46, 58); c.stroke();
  });

  // bush
  canvasTex(scene, 'bush', 84, 84, (c) => {
    const blobs: [number, number, number][] = [[24, 48, 22], [58, 48, 22], [42, 30, 24], [28, 26, 16], [60, 26, 16], [42, 58, 22]];
    blobs.forEach(([x, y, r]) => ellipse(c, x, y, r, r, '#1d6a35', OUT, 5));
    blobs.forEach(([x, y, r]) => ellipse(c, x, y, r - 3, r - 3, radial(c, x, y, r, [[0, '#7fe08a'], [0.6, '#2f9a4a'], [1, '#1d6a35']]), OUT, 0));
    for (let i = 0; i < 6; i++) ellipse(c, 18 + (i * 13) % 50, 20 + (i * 19) % 44, 3, 2, 'rgba(255,255,255,0.35)', OUT, 0);
  });

  // crate (3/4 view)
  canvasTex(scene, 'crate', 64, 82, (c) => {
    roundRect(c, 4, 58, 56, 20, 4); c.fillStyle = '#9b5a22'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    roundRect(c, 4, 4, 56, 58, 6);
    const g = c.createLinearGradient(0, 4, 0, 62); g.addColorStop(0, '#f2b45a'); g.addColorStop(1, '#d48a36');
    c.fillStyle = g; c.fill(); c.stroke();
    c.strokeStyle = '#9b5a22'; c.lineWidth = 3;
    for (const y of [20, 36]) { c.beginPath(); c.moveTo(8, y + 3); c.lineTo(56, y + 3); c.stroke(); }
    c.strokeStyle = OUT; c.lineWidth = 4;
    c.beginPath(); c.moveTo(10, 10); c.lineTo(54, 56); c.stroke();
    for (const [x, y] of [[10, 10], [54, 10], [10, 56], [54, 56]]) ellipse(c, x, y, 4, 4, '#cfd6e2', OUT, 2.5);
  });
  canvasTex(scene, 'crate_plank', 24, 10, (c) => {
    roundRect(c, 1, 1, 22, 8, 3); c.fillStyle = '#d48a36'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
  });
}

// ---------------- FX ----------------
function drawFx(scene: Phaser.Scene) {
  const glowDot = (key: string, size: number, inner: string, outer: string) =>
    canvasTex(scene, key, size, size, (c) => {
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, inner); g.addColorStop(0.6, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, size, size);
    });
  glowDot('glow', 64, 'rgba(255,240,180,1)', 'rgba(255,160,40,0.5)');
  glowDot('glow_cyan', 64, 'rgba(200,255,255,1)', 'rgba(60,220,255,0.5)');
  glowDot('glow_green', 64, 'rgba(220,255,200,1)', 'rgba(120,255,90,0.5)');
  glowDot('glow_red', 64, 'rgba(255,200,200,1)', 'rgba(255,60,60,0.5)');

  canvasTex(scene, 'fireball', 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff27a'); g.addColorStop(0.65, '#ff8a1f'); g.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(24, 24, 22, 0, Math.PI * 2); c.fill();
  });
  canvasTex(scene, 'enemy_ball', 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#ffb0c8'); g.addColorStop(0.65, '#ff2d6a'); g.addColorStop(1, 'rgba(255,0,60,0)');
    c.fillStyle = g; c.beginPath(); c.arc(24, 24, 22, 0, Math.PI * 2); c.fill();
  });
  // shockwave fist crescent
  canvasTex(scene, 'wave', 64, 96, (c) => {
    c.beginPath(); c.arc(-6, 48, 58, -0.95, 0.95); c.arc(-6, 48, 34, 0.85, -0.85, true); c.closePath();
    const g = c.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(160,255,120,0.1)'); g.addColorStop(0.7, '#b9ff8a'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.stroke();
  });
  // slash arc
  canvasTex(scene, 'slash', 160, 160, (c) => {
    c.beginPath(); c.arc(80, 80, 72, -1.15, 1.15); c.arc(80, 80, 46, 1.0, -1.0, true); c.closePath();
    const g = c.createRadialGradient(80, 80, 40, 80, 80, 76); g.addColorStop(0, 'rgba(63,240,255,0)'); g.addColorStop(0.6, 'rgba(120,250,255,0.8)'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fill();
  });
  canvasTex(scene, 'meteor', 44, 44, (c) => {
    ellipse(c, 22, 22, 15, 15, radial(c, 22, 22, 15, [[0, '#fff27a'], [0.5, '#ff6a2b'], [1, '#8a1f05']]), OUT, 4);
    ellipse(c, 17, 18, 4, 3, 'rgba(255,255,255,0.6)', OUT, 0);
  });
  canvasTex(scene, 'spark', 16, 16, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(8, 0); c.lineTo(10, 6); c.lineTo(16, 8); c.lineTo(10, 10); c.lineTo(8, 16); c.lineTo(6, 10); c.lineTo(0, 8); c.lineTo(6, 6); c.closePath(); c.fill();
  });
  canvasTex(scene, 'dot', 16, 16, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(8, 8, 7, 0, Math.PI * 2); c.fill(); });
  canvasTex(scene, 'smoke', 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 23);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 48, 48);
  });
  canvasTex(scene, 'star', 64, 64, (c) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 13 : 29; const a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = '#ffe14a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    ellipse(c, 26, 24, 5, 3, 'rgba(255,255,255,0.7)', OUT, 0);
  });
  canvasTex(scene, 'confetti', 12, 18, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 12, 18); });
  canvasTex(scene, 'shadow', 64, 32, (c) => {
    const g = c.createRadialGradient(32, 16, 0, 32, 16, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.scale(1, 0.5); c.fillStyle = g; c.fillRect(0, 0, 64, 64); c.restore();
  });
  canvasTex(scene, 'ring', 128, 64, (c) => {
    c.beginPath(); c.ellipse(64, 32, 58, 26, 0, 0, Math.PI * 2);
    c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.stroke();
  });
  canvasTex(scene, 'heal', 56, 56, (c) => {
    ellipse(c, 28, 28, 24, 24, radial(c, 28, 28, 24, [[0, '#d6ffd0'], [0.6, '#38d96a'], [1, '#13863a']]), OUT, 4);
    c.fillStyle = '#ffffff';
    roundRect(c, 22, 12, 12, 32, 4); c.fill();
    roundRect(c, 12, 22, 32, 12, 4); c.fill();
    ellipse(c, 19, 17, 5, 3, 'rgba(255,255,255,0.7)', OUT, 0);
  });
  canvasTex(scene, 'skull', 48, 48, (c) => {
    ellipse(c, 24, 21, 17, 16, '#f4f4ff', OUT, 4);
    roundRect(c, 15, 30, 18, 12, 4); c.fillStyle = '#f4f4ff'; c.fill(); c.strokeStyle = OUT; c.stroke();
    ellipse(c, 18, 21, 5, 6, OUT, OUT, 0); ellipse(c, 30, 21, 5, 6, OUT, OUT, 0);
    c.fillStyle = OUT; c.fillRect(20, 34, 2, 6); c.fillRect(26, 34, 2, 6);
  });
  canvasTex(scene, 'trophy', 160, 170, (c) => {
    // cup
    c.beginPath(); c.moveTo(34, 20); c.lineTo(126, 20); c.quadraticCurveTo(124, 96, 80, 106); c.quadraticCurveTo(36, 96, 34, 20); c.closePath();
    const g = c.createLinearGradient(34, 0, 126, 0); g.addColorStop(0, '#ffb81f'); g.addColorStop(0.4, '#fff3a6'); g.addColorStop(1, '#e08a00');
    c.fillStyle = g; c.fill(); c.strokeStyle = OUT; c.lineWidth = 7; c.stroke();
    // handles
    c.beginPath(); c.arc(30, 46, 20, Math.PI * 0.5, Math.PI * 1.5); c.lineWidth = 9; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.arc(130, 46, 20, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.beginPath(); c.arc(30, 46, 20, Math.PI * 0.5, Math.PI * 1.5); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
    c.beginPath(); c.arc(130, 46, 20, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    // stem + base
    roundRect(c, 68, 104, 24, 24, 4); c.fillStyle = '#e08a00'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke();
    roundRect(c, 40, 126, 80, 30, 8); c.fillStyle = '#7a4dff'; c.fill(); c.stroke();
    // star
    c.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 20; const a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(80 + Math.cos(a) * r, 56 + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 4; c.stroke();
  });
  // ray for victory screen
  canvasTex(scene, 'ray', 64, 512, (c) => {
    const g = c.createLinearGradient(0, 512, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(28, 512); c.lineTo(36, 512); c.lineTo(64, 0); c.lineTo(0, 0); c.closePath(); c.fill();
  });
}

// ---------------- UI ----------------
function drawUi(scene: Phaser.Scene) {
  canvasTex(scene, 'joy_base', 200, 200, (c) => {
    ellipse(c, 100, 100, 92, 92, 'rgba(20,10,50,0.35)', 'rgba(255,255,255,0.55)', 6);
    ellipse(c, 100, 100, 60, 60, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)', 3);
  });
  canvasTex(scene, 'joy_knob', 100, 100, (c) => {
    ellipse(c, 50, 50, 42, 42, radial(c, 50, 50, 42, [[0, '#ffffff'], [0.6, '#dfe6ff'], [1, '#9aa6d6']]), OUT, 5);
  });
  canvasTex(scene, 'joy_knob_aim', 100, 100, (c) => {
    ellipse(c, 50, 50, 42, 42, radial(c, 50, 50, 42, [[0, '#fff3c0'], [0.6, '#ffc93f'], [1, '#e08a00']]), OUT, 5);
    c.strokeStyle = OUT; c.lineWidth = 4;
    c.beginPath(); c.arc(50, 50, 14, 0, Math.PI * 2); c.moveTo(50, 26); c.lineTo(50, 38); c.moveTo(50, 62); c.lineTo(50, 74); c.moveTo(26, 50); c.lineTo(38, 50); c.moveTo(62, 50); c.lineTo(74, 50); c.stroke();
  });
  canvasTex(scene, 'super_btn', 140, 140, (c) => {
    ellipse(c, 70, 70, 56, 56, radial(c, 70, 70, 56, [[0, '#fff6a0'], [0.5, '#ffc21f'], [1, '#d86a00']]), OUT, 6);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 14 : 32; const a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(70 + Math.cos(a) * r, 72 + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 5; c.stroke();
  });
  canvasTex(scene, 'super_btn_off', 140, 140, (c) => {
    ellipse(c, 70, 70, 56, 56, 'rgba(60,50,110,0.75)', 'rgba(255,255,255,0.4)', 5);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 14 : 32; const a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(70 + Math.cos(a) * r, 72 + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
  });
}

export function generateTextures(scene: Phaser.Scene) {
  (Object.keys(DRAWERS) as CharacterId[]).forEach((id) => {
    // characters are drawn at 4x their on-screen size (CH_TEX_SCALE compensates) → crisp at any zoom
    canvasTex(scene, `ch_${id}`, 320, 320, (c) => { c.scale(2, 2); DRAWERS[id](c, false); });
    canvasTex(scene, `ch_${id}_blink`, 320, 320, (c) => { c.scale(2, 2); DRAWERS[id](c, true); });
  });
  drawWeapons(scene);
  drawEnvironment(scene);
  drawFx(scene);
  drawUi(scene);
}
