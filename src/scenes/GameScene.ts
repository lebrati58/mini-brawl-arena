import Phaser from 'phaser';
import { ARENA_ROWS, COLS, ROWS, TILE, WORLD_H, WORLD_W, PLAYER_SPAWN, ENEMY_SPAWNS, Cell } from '../game/arena';
import { CHARACTERS, CharacterId, CHARACTER_ORDER } from '../game/characters';
import { Fighter } from '../game/Fighter';
import { Fx } from '../game/fx';
import { Controls } from '../game/controls';
import { Audio, vibrate } from '../systems/audio';
import { hasLineOfSight } from '../systems/pathfinding';
import { DPR } from '../game/ui';

interface Projectile {
  img: Phaser.GameObjects.Image;
  trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  x: number; y: number; vx: number; vy: number;
  owner: Fighter; dmg: number; range: number; dist: number; radius: number;
  pierce: boolean; hit: Set<Fighter>; kind: 'fire' | 'wave';
}

interface Crate { col: number; row: number; img: Phaser.GameObjects.Image; zone: Phaser.GameObjects.Zone; hp: number }
interface Pickup { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; amount: number; born: number }
interface Dash { f: Fighter; until: number; dirX: number; dirY: number; hit: Set<Fighter>; nextGhost: number; dmg: number }

const CRATE_HP = 1150;

export class GameScene extends Phaser.Scene {
  charId: CharacterId = 'blaze';
  player!: Fighter;
  enemies: Fighter[] = [];
  fighters: Fighter[] = [];
  fx!: Fx;
  controls = new Controls();
  fighting = false;
  ended = false;
  stats = { damage: 0, kills: 0, startTime: 0 };

  private grid: Cell[][] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private crateGroup!: Phaser.Physics.Arcade.StaticGroup;
  private crates = new Map<string, Crate>();
  private bushes: Phaser.GameObjects.Image[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private dashes: Dash[] = [];
  private aimGfx!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mouseDown = false;
  private playZoom = 1;

  constructor() { super('Game'); }

  init(data: { character?: CharacterId }) {
    this.charId = data.character ?? (this.registry.get('character') as CharacterId) ?? 'blaze';
    this.registry.set('character', this.charId);
    this.enemies = []; this.fighters = []; this.projectiles = []; this.pickups = []; this.dashes = [];
    this.crates = new Map(); this.bushes = [];
    this.fighting = false; this.ended = false;
    this.stats = { damage: 0, kills: 0, startTime: 0 };
    this.controls = new Controls();
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    this.controls.touchMode = !this.sys.game.device.os.desktop || coarse || new URLSearchParams(location.search).has('touch');
    this.mouseDown = false;
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.physics.world.timeScale = 1;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#2b2160');
    this.fx = new Fx(this);
    this.grid = ARENA_ROWS.map((r) => r.split('') as Cell[]);

    this.buildArena();
    this.aimGfx = this.add.graphics().setDepth(6);

    // fighters
    const def = CHARACTERS[this.charId];
    this.player = new Fighter(this, def, PLAYER_SPAWN.x, PLAYER_SPAWN.y, true);
    this.player.aim = -Math.PI / 2;
    this.fighters.push(this.player);
    const roster = Phaser.Utils.Array.Shuffle([...CHARACTER_ORDER, ...CHARACTER_ORDER]).slice(0, 5) as CharacterId[];
    ENEMY_SPAWNS.forEach((sp, i) => {
      const e = new Fighter(this, CHARACTERS[roster[i]], sp.x, sp.y, false, i);
      e.aim = Math.PI / 2;
      this.enemies.push(e); this.fighters.push(e);
    });
    const bodies = this.fighters.map((f) => f.body);
    this.physics.add.collider(bodies, this.walls);
    this.physics.add.collider(bodies, this.crateGroup);

    // camera intro: whole arena, then zoom on the hero during the countdown
    const cam = this.cameras.main;
    cam.setBounds(-TILE, -TILE * 1.5, WORLD_W + TILE * 2, WORLD_H + TILE * 2.5);
    this.playZoom = this.computeZoom();
    cam.setZoom(Math.min(this.scale.width / (WORLD_W + 100), this.scale.height / (WORLD_H + 100)));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
    cam.fadeIn(400, 255, 255, 255);

    // input
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,Z,Q,UP,DOWN,LEFT,RIGHT,SPACE,E,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(3);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      Audio.unlock();
      if (p.wasTouch) { if (!this.controls.touchMode) { this.controls.touchMode = true; this.events.emit('touchmode'); } return; }
      if (this.controls.touchMode) {
        if (!this.sys.game.device.os.desktop) return;
        this.controls.touchMode = false; this.events.emit('touchmode'); // a real mouse is being used
      }
      if (p.rightButtonDown()) this.playerSuper(); else this.mouseDown = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.mouseDown = false; });
    kb.on('keydown-SPACE', () => this.playerSuper());
    kb.on('keydown-E', () => this.playerSuper());

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.scene.launch('UI');
    this.scene.bringToTop('UI');

    Audio.playMusic('none');
    this.exposeDebug();
  }

  /** Called by the UI when the countdown says GO! */
  beginFight() {
    this.fighting = true;
    this.stats.startTime = this.time.now;
    const cam = this.cameras.main;
    cam.startFollow(this.player.body, true, 0.12, 0.12);
    const now = this.time.now;
    const delays = Phaser.Utils.Array.Shuffle([600, 2800, 5600, 8600, 11500]);
    this.enemies.forEach((e, i) => { e.activateAt = now + delays[i]; });
    Audio.playMusic('battle');
  }

  startIntroZoom() {
    const cam = this.cameras.main;
    cam.pan(this.player.x, this.player.y, 2200, 'Cubic.easeInOut');
    cam.zoomTo(this.playZoom, 2200, 'Cubic.easeInOut');
  }

  private computeZoom() {
    const { width: w, height: h } = this.scale;
    const cw = w / DPR, chh = h / DPR;
    const z = chh > cw ? cw / 600 : Math.min(cw / 820, chh / 600); // portrait phones: frame ~600 world px across
    return Phaser.Math.Clamp(z, 0.55, 1.25) * DPR;
  }

  private onResize() {
    this.playZoom = this.computeZoom();
    if (this.fighting || this.ended) this.cameras.main.setZoom(this.playZoom);
  }

  // ------------------------------------------------------------------ arena
  private buildArena() {
    // decorative outer frame
    if (!this.textures.exists('outer_tile')) {
      const og = this.make.graphics({}, false);
      og.fillStyle(0x221a52, 1).fillRect(0, 0, TILE * 2, TILE * 2);
      og.fillStyle(0x2d2366, 1).fillRect(0, 0, TILE, TILE).fillRect(TILE, TILE, TILE, TILE);
      og.generateTexture('outer_tile', TILE * 2, TILE * 2);
      og.destroy();
    }
    this.add.tileSprite(-TILE * 4, -TILE * 4, WORLD_W + TILE * 8, WORLD_H + TILE * 8, 'outer_tile').setOrigin(0).setDepth(0);

    // floor
    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(1);
    rt.beginDraw();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const sand = (r >= 10 && r <= 13 && c >= 12 && c <= 17) || (c >= 13 && c <= 16 && (r <= 3 || r >= 20)) || ((r === 11 || r === 12) && c >= 2 && c <= 27);
        rt.batchDraw(sand ? 'floor_sand' : (r + c) % 2 ? 'floor_a' : 'floor_b', c * TILE, r * TILE);
      }
    rt.endDraw();
    // decorative flowers & center emblem (baked into the floor texture: zero per-frame cost)
    const deco = this.make.graphics({}, false);
    const rnd = new Phaser.Math.RandomDataGenerator(['mini-brawl']);
    for (let i = 0; i < 90; i++) {
      const c = rnd.between(1, COLS - 2), r = rnd.between(1, ROWS - 2);
      if (this.grid[r][c] !== '.') continue;
      const x = c * TILE + rnd.between(8, 56), y = r * TILE + rnd.between(8, 56);
      const col = rnd.pick([0xffffff, 0xffe14a, 0xff8bd8, 0x9ff6ff]);
      for (let k = 0; k < 5; k++) deco.fillStyle(col, 0.9).fillCircle(x + Math.cos(k * 1.256) * 4, y + Math.sin(k * 1.256) * 4, 3);
      deco.fillStyle(0xffa51f, 1).fillCircle(x, y, 2.5);
    }
    deco.lineStyle(8, 0xffffff, 0.35).strokeCircle(WORLD_W / 2, WORLD_H / 2, 120);
    deco.lineStyle(4, 0xffffff, 0.25).strokeCircle(WORLD_W / 2, WORLD_H / 2, 90);
    deco.fillStyle(0x3fa9ff, 0.3).fillRoundedRect(PLAYER_SPAWN.x - 90, PLAYER_SPAWN.y - 50, 180, 100, 30);
    deco.lineStyle(5, 0xffffff, 0.55).strokeRoundedRect(PLAYER_SPAWN.x - 90, PLAYER_SPAWN.y - 50, 180, 100, 30);
    rt.draw(deco);
    deco.destroy();

    this.walls = this.physics.add.staticGroup();
    this.crateGroup = this.physics.add.staticGroup();
    for (let r = 0; r < ROWS; r++) {
      let runStart = -1;
      for (let c = 0; c <= COLS; c++) {
        const isWall = c < COLS && this.grid[r][c] === '#';
        if (isWall) {
          this.add.image(c * TILE, r * TILE - 22, 'wall').setOrigin(0).setDepth(r * TILE + TILE);
          if (runStart < 0) runStart = c;
        } else if (runStart >= 0) {
          const z = this.add.zone(runStart * TILE, r * TILE, (c - runStart) * TILE, TILE).setOrigin(0);
          this.walls.add(z);
          runStart = -1;
        }
        if (c >= COLS) continue;
        const cell = this.grid[r][c];
        if (cell === 'c') {
          const img = this.add.image(c * TILE, r * TILE - 18, 'crate').setOrigin(0).setDepth(r * TILE + TILE);
          const zone = this.add.zone(c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8).setOrigin(0);
          this.crateGroup.add(zone);
          this.crates.set(`${c},${r}`, { col: c, row: r, img, zone, hp: CRATE_HP });
        } else if (cell === 'b') {
          const b = this.add.image(c * TILE + TILE / 2 + rnd.between(-4, 4), r * TILE + TILE / 2 - 6, 'bush').setDepth(8500 + r).setScale(0.95 + rnd.frac() * 0.1);
          this.bushes.push(b);
          this.tweens.add({ targets: b, scaleX: b.scaleX * 1.03, duration: 1400 + rnd.between(0, 800), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
      }
    }
    this.walls.refresh();
    this.crateGroup.refresh();
  }

  cellType(col: number, row: number): Cell {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
    return this.grid[row][col];
  }

  isBlocked(col: number, row: number) {
    const t = this.cellType(col, row);
    return t === '#' || t === 'c';
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number) {
    return hasLineOfSight(x0, y0, x1, y1, TILE, (c, r) => this.isBlocked(c, r));
  }

  // ------------------------------------------------------------------ main loop
  update(time: number, delta: number) {
    const dt = Math.min(delta, 50);
    this.updatePlayer(time, dt);
    for (const e of this.enemies) e.updateBot(time, dt);
    this.updateDashes(time);
    this.updateProjectiles(dt);
    this.updatePickups(time, dt);
    this.updateVisibility();
    this.drawAim();
  }

  private updatePlayer(time: number, dt: number) {
    const p = this.player;
    if (!p.alive) return;
    const c = this.controls;
    let mx = c.moveX, my = c.moveY;
    if (!c.touchMode || (mx === 0 && my === 0)) {
      const k = this.keys;
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.Q.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.Z.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) { mx = kx; my = ky; }
    }
    if (!this.fighting) { mx = 0; my = 0; }

    // aiming
    if (!c.touchMode) {
      const wp = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      p.aim = Math.atan2(wp.y - p.y, wp.x - p.x);
      if (this.mouseDown && this.fighting) p.attack(p.aim);
    } else if (c.aimActive || c.superAimActive) {
      p.aim = c.aimAngle;
    } else if (mx || my) {
      p.aim = Math.atan2(my, mx);
    }

    if (this.fighting && c.fire) {
      const a = c.fire.auto ? this.autoAimAngle(p, p.def.attackRange * 1.15) : c.fire.angle;
      p.attack(a);
    }
    c.fire = null;
    if (this.fighting && c.superFire) {
      const f = c.superFire;
      const a = f.auto ? this.autoAimAngle(p, 560) : f.angle;
      const target = f.auto ? this.nearestEnemy(p, 560) : null;
      const dist = target ? Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y) : Math.max(140, f.power * 520);
      p.useSuper(a, dist);
    }
    c.superFire = null;

    p.update(time, dt, mx, my);
  }

  playerSuper() {
    if (!this.fighting || this.controls.touchMode) return;
    const p = this.player;
    const wp = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const dist = Phaser.Math.Distance.Between(p.x, p.y, wp.x, wp.y);
    p.useSuper(Math.atan2(wp.y - p.y, wp.x - p.x), dist);
  }

  nearestEnemy(f: Fighter, maxDist: number) {
    let best: Fighter | null = null, bd = maxDist;
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || (e.inBush && !e.revealed)) continue;
      const d = Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y);
      if (d < bd && this.lineOfSight(f.x, f.y, e.x, e.y)) { bd = d; best = e; }
    }
    return best;
  }

  autoAimAngle(f: Fighter, maxDist: number) {
    const e = this.nearestEnemy(f, maxDist);
    return e ? Math.atan2(e.y - f.y, e.x - f.x) : f.aim;
  }

  private updateVisibility() {
    const p = this.player;
    const now = this.time.now;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
      const hidden = e.inBush && d > 220 && now - e.lastAttackAt > 1200 && now - e.lastHurtAt > 1000;
      e.revealed = !hidden;
      e.view.alpha = Phaser.Math.Linear(e.view.alpha, hidden ? 0 : 1, 0.2);
    }
    if (p.alive) p.view.alpha = Phaser.Math.Linear(p.view.alpha, p.inBush ? 0.6 : 1, 0.2);
    for (const b of this.bushes) {
      const near = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < 105;
      b.alpha = Phaser.Math.Linear(b.alpha, near ? 0.5 : 1, 0.2);
    }
  }

  // ------------------------------------------------------------------ aim indicator
  private drawAim() {
    const g = this.aimGfx; g.clear();
    const p = this.player;
    if (!p.alive || !this.fighting) return;
    const c = this.controls;
    const showAttack = c.touchMode ? c.aimActive : true;
    const showSuper = c.touchMode ? c.superAimActive : this.keys.SHIFT.isDown && p.superReady;
    const a = p.aim, cos = Math.cos(a), sin = Math.sin(a);
    if (showSuper) {
      const col = 0xffe14a;
      if (p.def.id === 'blaze') {
        const d = c.touchMode ? Math.max(140, c.aimPower * 520) : Math.min(520, Phaser.Math.Distance.Between(p.x, p.y, ...this.pointerWorld()));
        g.fillStyle(col, 0.25).fillCircle(p.x + cos * d, p.y + sin * d, 150);
        g.lineStyle(4, col, 0.8).strokeCircle(p.x + cos * d, p.y + sin * d, 150);
      } else if (p.def.id === 'zippy') {
        this.rectIndicator(g, p.x, p.y, a, 440, 60, col, 0.3);
      } else {
        g.fillStyle(col, 0.22).fillCircle(p.x, p.y, 290);
        g.lineStyle(4, col, 0.8).strokeCircle(p.x, p.y, 290);
      }
      return;
    }
    if (!showAttack) return;
    const alpha = c.touchMode ? 0.32 : 0.14;
    if (p.def.id === 'zippy') {
      g.fillStyle(0xffffff, alpha).slice(p.x, p.y, p.def.attackRange, a - 1.05, a + 1.05).fillPath();
    } else {
      this.rectIndicator(g, p.x, p.y, a, p.def.attackRange, p.def.id === 'tanko' ? 64 : 26, 0xffffff, alpha);
    }
  }

  private pointerWorld(): [number, number] {
    const wp = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return [wp.x, wp.y];
  }

  private rectIndicator(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, len: number, w: number, col: number, alpha: number) {
    const cos = Math.cos(a), sin = Math.sin(a), px = -sin * w / 2, py = cos * w / 2;
    const pts = [
      new Phaser.Math.Vector2(x + px, y + py), new Phaser.Math.Vector2(x + cos * len + px, y + sin * len + py),
      new Phaser.Math.Vector2(x + cos * len - px, y + sin * len - py), new Phaser.Math.Vector2(x - px, y - py),
    ];
    g.fillStyle(col, alpha).fillPoints(pts, true);
  }

  // ------------------------------------------------------------------ attacks
  performAttack(f: Fighter, angle: number) {
    const id = f.def.id;
    if (id === 'blaze') {
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(i * 95, () => {
          if (!f.alive) return;
          const spread = (i - 1) * 0.04;
          this.spawnProjectile(f, angle + spread, 980, f.def.attackRange, f.attackDamage, 15, false, 'fire');
          Audio.sfx('shoot_blaze');
        });
      }
    } else if (id === 'zippy') {
      this.slash(f, angle);
    } else {
      this.spawnProjectile(f, angle, 640, f.def.attackRange, f.attackDamage, 38, true, 'wave');
      Audio.sfx('punch');
      if (f.isPlayer) this.cameras.main.shake(90, 0.004);
      this.tweens.add({ targets: f.weapon, x: f.weapon.x + Math.cos(angle) * 24, y: f.weapon.y + Math.sin(angle) * 14, duration: 80, yoyo: true });
    }
  }

  private spawnProjectile(f: Fighter, angle: number, speed: number, range: number, dmg: number, radius: number, pierce: boolean, kind: 'fire' | 'wave') {
    const x = f.x + Math.cos(angle) * f.def.radius, y = f.y + Math.sin(angle) * f.def.radius - 10;
    const tex = kind === 'fire' ? (f.isPlayer ? 'fireball' : 'enemy_ball') : 'wave';
    const img = this.add.image(x, y, tex).setRotation(angle).setDepth(8800).setBlendMode(kind === 'fire' ? 'ADD' : 'NORMAL');
    if (kind === 'wave') { img.setScale(0.7); if (!f.isPlayer) img.setTint(0xff7a8a); }
    const trail = this.add.particles(0, 0, f.isPlayer ? 'glow' : 'glow_red', {
      follow: img, lifespan: kind === 'fire' ? 220 : 300, scale: { start: kind === 'fire' ? 0.5 : 0.8, end: 0 }, alpha: { start: 0.7, end: 0 },
      frequency: 22, blendMode: 'ADD', tint: kind === 'wave' && f.isPlayer ? 0x9dff6b : undefined,
    }).setDepth(8790);
    this.projectiles.push({
      img, trail, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, owner: f, dmg, range, dist: 0, radius, pierce, hit: new Set(), kind,
    });
    // muzzle flash
    const m = this.add.image(x, y, f.isPlayer ? 'glow' : 'glow_red').setScale(0.9).setDepth(8801).setBlendMode('ADD');
    this.tweens.add({ targets: m, alpha: 0, scale: 0.3, duration: 120, onComplete: () => m.destroy() });
  }

  private updateProjectiles(dt: number) {
    const s = dt / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = Math.hypot(pr.vx, pr.vy) * s;
      pr.x += pr.vx * s; pr.y += pr.vy * s; pr.dist += step;
      pr.img.setPosition(pr.x, pr.y);
      if (pr.kind === 'wave') pr.img.setScale(0.7 + (pr.dist / pr.range) * 0.5);
      let dead = false;

      const col = Math.floor(pr.x / TILE), row = Math.floor((pr.y + 10) / TILE);
      const cell = this.cellType(col, row);
      if (cell === '#') {
        this.fx.hitSparks(pr.x, pr.y, 6); Audio.sfx('wall'); dead = true;
      } else if (cell === 'c') {
        this.damageCrate(col, row, pr.dmg * (pr.owner.isPlayer ? 1 : 0.5), pr.owner);
        this.fx.hitSparks(pr.x, pr.y, 6); dead = true;
      }

      if (!dead) {
        for (const f of this.fighters) {
          if (!f.alive || f.team === pr.owner.team || pr.hit.has(f)) continue;
          const d = Phaser.Math.Distance.Between(pr.x, pr.y, f.x, f.y - 10);
          if (d < pr.radius + f.def.radius) {
            pr.hit.add(f);
            const nx = pr.vx / (step / s), ny = pr.vy / (step / s);
            const kb = pr.kind === 'wave' ? 380 : 90;
            f.takeDamage(pr.dmg, pr.owner, nx * kb, ny * kb);
            this.fx.hitSparks(pr.x, pr.y, pr.kind === 'wave' ? 12 : 8);
            if (pr.kind === 'wave') this.fx.greenBurst(f.x, f.y, 8);
            if (!pr.pierce) { dead = true; break; }
          }
        }
      }
      if (!dead && pr.dist >= pr.range) {
        dead = true;
        this.tweens.add({ targets: pr.img, alpha: 0, scale: 0.2, duration: 120 });
      }
      if (dead) {
        this.projectiles.splice(i, 1);
        pr.trail?.stop();
        this.time.delayedCall(320, () => { pr.trail?.destroy(); });
        this.time.delayedCall(130, () => pr.img.destroy());
        if (pr.img.alpha === 1) pr.img.setVisible(false);
      }
    }
  }

  private slash(f: Fighter, angle: number) {
    Audio.sfx('slash');
    const range = f.def.attackRange;
    const fxImg = this.add.image(f.x, f.y - 10, 'slash').setRotation(angle).setDepth(8800).setScale(range / 85).setBlendMode('ADD');
    if (!f.isPlayer) fxImg.setTint(0xff5a7a);
    fxImg.setAlpha(1);
    this.tweens.add({ targets: fxImg, rotation: angle + 0.6, alpha: 0, scale: range / 70, duration: 220, ease: 'Cubic.Out', onComplete: () => fxImg.destroy() });
    // lunge forward
    f.knockX += Math.cos(angle) * 420; f.knockY += Math.sin(angle) * 420;
    // second, smaller swipe for style
    this.time.delayedCall(110, () => {
      if (!f.alive) return;
      const s2 = this.add.image(f.x, f.y - 10, 'slash').setRotation(angle).setFlipY(true).setDepth(8800).setScale(range / 95).setBlendMode('ADD');
      if (!f.isPlayer) s2.setTint(0xff5a7a);
      this.tweens.add({ targets: s2, rotation: angle - 0.6, alpha: 0, duration: 200, onComplete: () => s2.destroy() });
    });
    for (const e of this.fighters) {
      if (!e.alive || e.team === f.team) continue;
      const d = Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y);
      const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - f.y, e.x - f.x) - angle));
      if (d < range + e.def.radius && da < 1.1) {
        e.takeDamage(f.attackDamage, f, Math.cos(angle) * 260, Math.sin(angle) * 260);
        this.fx.cyanBurst(e.x, e.y - 10, 10);
        if (f.isPlayer) this.cameras.main.shake(70, 0.004);
      }
    }
    this.damageCratesInArc(f.x, f.y, angle, range + 20, 1.1, f.attackDamage, f);
  }

  // ------------------------------------------------------------------ supers
  performSuper(f: Fighter, angle: number, dist: number) {
    const id = f.def.id;
    const label = f.isPlayer ? `${f.def.superName.toUpperCase()} !` : 'SUPER !';
    this.fx.floatText(f.x, f.y - 100, label, f.isPlayer ? '#ffe14a' : '#ff8a9a', f.isPlayer ? 30 : 22);
    if (id === 'blaze') this.meteorStrike(f, angle, Phaser.Math.Clamp(dist, 120, 520));
    else if (id === 'zippy') this.startDash(f, angle);
    else this.groundSlam(f);
  }

  private meteorStrike(f: Fighter, angle: number, dist: number) {
    Audio.sfx('meteor_cast');
    const tx = f.x + Math.cos(angle) * dist, ty = f.y + Math.sin(angle) * dist;
    const dmg = 640 * f.dmgMult;
    const count = 9;
    this.tweens.add({ targets: f.sprite, y: f.sprite.y - 24, duration: 140, yoyo: true });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = i === 0 ? 0 : 55 + Math.random() * 95;
      const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
      const delay = i * 85;
      const warn = this.add.graphics().setDepth(7).setPosition(x, y).setScale(0.01);
      warn.fillStyle(f.isPlayer ? 0xffa51f : 0xff3d5a, 0.25).fillCircle(0, 0, 70);
      warn.lineStyle(3, f.isPlayer ? 0xffe14a : 0xff3d5a, 0.9).strokeCircle(0, 0, 70);
      this.tweens.add({ targets: warn, scale: 1, duration: 200, delay, ease: 'Back.Out' });
      const m = this.add.image(x - 180, y - 560, 'meteor').setDepth(9100).setScale(0.6).setAlpha(0);
      const trail = this.add.particles(0, 0, 'glow', { follow: m, lifespan: 260, scale: { start: 0.9, end: 0 }, frequency: 18, blendMode: 'ADD' }).setDepth(9090);
      this.tweens.add({
        targets: m, x, y, scale: 1.2, alpha: 1, angle: 360, duration: 430, delay: delay + 120, ease: 'Quad.In',
        onComplete: () => {
          m.destroy(); trail.stop(); this.time.delayedCall(300, () => trail.destroy()); warn.destroy();
          this.fx.explosion(x, y, 85);
          Audio.sfx('explode');
          if (f.isPlayer) { this.cameras.main.shake(120, 0.008); vibrate(18); }
          this.damageRadius(f, x, y, 85, dmg, 260);
        },
      });
    }
  }

  private startDash(f: Fighter, angle: number) {
    Audio.sfx('dash');
    f.dashing = true;
    f.invulnUntil = this.time.now + 330;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    (f.body.body as Phaser.Physics.Arcade.Body).setVelocity(dirX * 1850, dirY * 1850);
    this.dashes.push({ f, until: this.time.now + 240, dirX, dirY, hit: new Set(), nextGhost: 0, dmg: 1500 * f.dmgMult });
    if (f.isPlayer) this.cameras.main.flash(90, 160, 255, 255);
  }

  private updateDashes(time: number) {
    for (let i = this.dashes.length - 1; i >= 0; i--) {
      const d = this.dashes[i];
      const f = d.f;
      if (!f.alive) { this.dashes.splice(i, 1); continue; }
      (f.body.body as Phaser.Physics.Arcade.Body).setVelocity(d.dirX * 1850, d.dirY * 1850);
      f.syncView();
      f.sprite.angle = 0;
      if (time > d.nextGhost) {
        d.nextGhost = time + 22;
        const g = this.add.image(f.x, f.y + f.sprite.y, f.sprite.texture.key).setScale(f.sprite.scaleX, f.sprite.scaleY).setFlipX(f.sprite.flipX)
          .setTintFill(f.isPlayer ? 0x5cf6ff : 0xff5a7a).setAlpha(0.6).setDepth(f.view.depth - 1).setBlendMode('ADD');
        this.tweens.add({ targets: g, alpha: 0, scale: g.scaleX * 0.8, duration: 260, onComplete: () => g.destroy() });
        this.fx.cyanBurst(f.x, f.y - 10, 2);
      }
      for (const e of this.fighters) {
        if (!e.alive || e.team === f.team || d.hit.has(e)) continue;
        if (Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y) < f.def.radius + e.def.radius + 40) {
          d.hit.add(e);
          e.takeDamage(d.dmg, f, -d.dirY * 300 + d.dirX * 200, d.dirX * 300 + d.dirY * 200, false);
          this.fx.cyanBurst(e.x, e.y, 16);
          this.fx.hitSparks(e.x, e.y, 12);
          if (!this.ended) { this.time.timeScale = 0.4; this.time.delayedCall(30, () => { if (!this.ended) this.time.timeScale = 1; }); }
          if (f.isPlayer) this.cameras.main.shake(120, 0.01);
        }
      }
      this.damageCratesInRadius(f.x, f.y, f.def.radius + 30, d.dmg, f);
      if (time >= d.until) {
        f.dashing = false;
        (f.body.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        this.fx.cyanBurst(f.x, f.y, 20);
        this.dashes.splice(i, 1);
      }
    }
  }

  private groundSlam(f: Fighter) {
    Audio.sfx('whoosh');
    const now = this.time.now;
    f.busyUntil = now + 460;
    f.invulnUntil = now + 460;
    const baseY = f.sprite.y;
    this.tweens.add({ targets: f.sprite, y: baseY - 90, duration: 220, ease: 'Quad.Out', yoyo: true, hold: 20 });
    this.tweens.add({ targets: f.shadow, scale: 0.5, duration: 220, yoyo: true, hold: 20 });
    this.time.delayedCall(460, () => {
      if (!f.alive) return;
      Audio.sfx('shockwave');
      const radius = 290;
      const x = f.x, y = f.y;
      const g = this.add.graphics().setDepth(7);
      const state = { r: 30 };
      const tint = f.isPlayer ? 0x9dff6b : 0xff5a6e;
      this.tweens.add({
        targets: state, r: radius, duration: 420, ease: 'Cubic.Out',
        onUpdate: () => {
          g.clear();
          const k = state.r / radius;
          g.fillStyle(tint, 0.35 * (1 - k)).fillCircle(x, y, state.r);
          g.lineStyle(18 * (1 - k) + 4, 0xffffff, 1 - k).strokeCircle(x, y, state.r);
          g.lineStyle(8, tint, 1 - k).strokeCircle(x, y, state.r * 0.8);
        },
        onComplete: () => g.destroy(),
      });
      // ground cracks
      const cracks = this.add.graphics().setDepth(3);
      cracks.lineStyle(5, 0x1a1030, 0.5);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
        let cx = x, cy = y;
        cracks.beginPath(); cracks.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += Math.cos(a + (Math.random() - 0.5) * 0.8) * 32; cy += Math.sin(a + (Math.random() - 0.5) * 0.8) * 32; cracks.lineTo(cx, cy); }
        cracks.strokePath();
      }
      this.tweens.add({ targets: cracks, alpha: 0, delay: 1500, duration: 1000, onComplete: () => cracks.destroy() });
      this.fx.greenBurst(x, y, 30);
      this.fx.explosion(x, y, 120);
      this.cameras.main.shake(320, f.isPlayer ? 0.02 : 0.008);
      if (f.isPlayer) vibrate([40, 30, 80]);
      this.damageRadius(f, x, y, radius, 1700 * f.dmgMult, 900);
    });
  }

  private damageRadius(src: Fighter, x: number, y: number, r: number, dmg: number, knock: number) {
    // area damage only comes from supers, which never refill the super gauge
    for (const e of this.fighters) {
      if (!e.alive || e.team === src.team) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < r + e.def.radius) {
        const nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
        e.takeDamage(dmg, src, nx * knock, ny * knock, false);
      }
    }
    this.damageCratesInRadius(x, y, r, dmg, src);
  }

  // ------------------------------------------------------------------ crates & pickups
  private damageCratesInRadius(x: number, y: number, r: number, dmg: number, src: Fighter) {
    for (const cr of [...this.crates.values()]) {
      const cx = cr.col * TILE + TILE / 2, cy = cr.row * TILE + TILE / 2;
      if (Phaser.Math.Distance.Between(x, y, cx, cy) < r + TILE * 0.4) this.damageCrate(cr.col, cr.row, dmg, src);
    }
  }

  private damageCratesInArc(x: number, y: number, angle: number, r: number, half: number, dmg: number, src: Fighter) {
    for (const cr of [...this.crates.values()]) {
      const cx = cr.col * TILE + TILE / 2, cy = cr.row * TILE + TILE / 2;
      const d = Phaser.Math.Distance.Between(x, y, cx, cy);
      const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(cy - y, cx - x) - angle));
      if (d < r + TILE * 0.4 && da < half) this.damageCrate(cr.col, cr.row, dmg, src);
    }
  }

  private damageCrate(col: number, row: number, dmg: number, src: Fighter) {
    const cr = this.crates.get(`${col},${row}`);
    if (!cr) return;
    cr.hp -= dmg;
    this.tweens.add({ targets: cr.img, x: cr.img.x + Phaser.Math.Between(-5, 5), duration: 40, yoyo: true, repeat: 1 });
    cr.img.setTint(0xffd0a0);
    this.time.delayedCall(60, () => cr.img.active && cr.img.clearTint());
    if (cr.hp > 0) { Audio.sfx('wall'); return; }
    // break!
    this.crates.delete(`${col},${row}`);
    this.grid[row][col] = '.';
    this.crateGroup.remove(cr.zone, true, true);
    const cx = col * TILE + TILE / 2, cy = row * TILE + TILE / 2;
    this.fx.crateBreak(cx, cy);
    Audio.sfx('crate');
    if (src.isPlayer) vibrate(20);
    this.tweens.add({ targets: cr.img, scaleY: 0.2, alpha: 0, y: cr.img.y + 40, duration: 180, onComplete: () => cr.img.destroy() });
    this.spawnPickup(cx, cy, 1300);
  }

  private spawnPickup(x: number, y: number, amount: number) {
    const glow = this.add.image(x, y, 'glow_green').setDepth(y + 20).setScale(1.4).setBlendMode('ADD').setAlpha(0.6);
    const img = this.add.image(x, y, 'heal').setDepth(y + 21).setScale(0);
    this.tweens.add({ targets: img, scale: 0.75, y: y - 30, duration: 300, ease: 'Back.Out', yoyo: false });
    this.pickups.push({ img, glow, x, y, amount, born: this.time.now });
  }

  private updatePickups(time: number, dt: number) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      const bob = Math.sin((time - k.born) * 0.006) * 6;
      if (time - k.born > 300) { k.img.y = k.y - 14 + bob; }
      k.img.x = k.x; k.glow.setPosition(k.x, k.y - 10); k.glow.setScale(1.2 + Math.sin(time * 0.008) * 0.2);
      if (!p.alive || time - k.born < 450) continue;
      const d = Phaser.Math.Distance.Between(k.x, k.y, p.x, p.y);
      if (d < 120) {
        const pull = Math.min(1, (dt / 1000) * 9);
        k.x += (p.x - k.x) * pull; k.y += (p.y - k.y) * pull;
      }
      if (d < 38) {
        Audio.sfx('pickup');
        vibrate(15);
        p.heal(k.amount);
        this.fx.greenBurst(p.x, p.y, 14);
        k.img.destroy(); k.glow.destroy();
        this.pickups.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ game flow
  onFighterDied(f: Fighter, _from: Fighter | null) {
    if (!f.isPlayer) {
      this.stats.kills++;
      this.events.emit('enemy-died', f);
      if (Math.random() < 0.5) this.time.delayedCall(350, () => this.spawnPickup(f.x, f.y, 1000));
      if (this.enemies.every((e) => !e.alive)) this.endGame(true, f);
    } else {
      this.endGame(false, f);
    }
  }

  private endGame(win: boolean, focus: Fighter) {
    if (this.ended) return;
    this.ended = true;
    this.fighting = false;
    this.controls.reset();
    this.mouseDown = false;
    this.events.emit('game-over', win);
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(focus.x, focus.y, 700, 'Cubic.easeOut');
    cam.zoomTo(this.playZoom * 1.35, 700, 'Cubic.easeOut');
    this.time.timeScale = 0.35; this.tweens.timeScale = 0.35; this.physics.world.timeScale = 1 / 0.35;
    Audio.playMusic('none');
    const duration = Math.round((this.time.now - this.stats.startTime) / 1000);
    window.setTimeout(() => {
      if (!this.scene.isActive()) return;
      this.time.timeScale = 1; this.tweens.timeScale = 1; this.physics.world.timeScale = 1;
      if (win) { cam.pan(this.player.x, this.player.y, 500, 'Cubic.easeOut'); }
      this.scene.launch('Result', {
        win, character: this.charId, kills: this.stats.kills, damage: this.stats.damage, duration,
        hpLeft: Math.ceil(this.player.hp), maxHp: this.player.maxHp,
      });
      this.scene.bringToTop('Result');
    }, 1400);
  }

  restartBattle(character?: CharacterId) {
    this.scene.stop('Result');
    this.scene.stop('UI');
    this.scene.restart({ character: character ?? this.charId });
  }

  // ------------------------------------------------------------------ test hooks
  private exposeDebug() {
    (window as unknown as { __mba: unknown }).__mba = {
      game: this.game,
      scene: this,
      state: () => ({
        fighting: this.fighting, ended: this.ended, character: this.charId,
        player: { x: this.player.x, y: this.player.y, hp: this.player.hp, maxHp: this.player.maxHp, ammo: this.player.ammo, superCharge: this.player.superCharge, alive: this.player.alive },
        enemies: this.enemies.map((e) => ({ id: e.def.id, x: e.x, y: e.y, hp: e.hp, alive: e.alive, aggro: e.aggro })),
        crates: this.crates.size, projectiles: this.projectiles.length, pickups: this.pickups.length,
        touchMode: this.controls.touchMode, kills: this.stats.kills,
      }),
    };
  }
}
