import Phaser from 'phaser';
import {
  CharacterDef, ENEMY_DAMAGE_MULT, ENEMY_HP_MULT, ENEMY_SPEED_MULT, MAX_AMMO, REGEN_DELAY_MS, REGEN_PER_SEC,
} from './characters';
import type { GameScene } from '../scenes/GameScene';
import { Audio, vibrate } from '../systems/audio';
import { FONT } from './ui';
import { TILE, worldToCell, cellCenter, COLS, ROWS } from './arena';
import { findPath } from '../systems/pathfinding';
import { CH_TEX_SCALE } from '../systems/textures';

const BOT_NAMES = ['Robo-Rex', 'Bzzt', 'Glitch', 'Chomp', 'Pixel', 'Kaboom'];

export class Fighter {
  readonly scene: GameScene;
  readonly def: CharacterDef;
  readonly isPlayer: boolean;
  readonly team: 0 | 1;
  readonly name: string;

  body: Phaser.Physics.Arcade.Image;
  view: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;

  maxHp: number;
  hp: number;
  ghostHp: number;
  ammo = MAX_AMMO;
  superCharge = 0;
  alive = true;
  aim = -Math.PI / 2;
  speed: number;
  dmgMult: number;
  lastAttackAt = -99999;
  lastHurtAt = -99999;
  invulnUntil = 0;
  dashing = false;
  busyUntil = 0; // can't move/attack (e.g. Tanko leap)
  knockX = 0;
  knockY = 0;
  inBush = false;
  revealed = true;
  private walkPhase = 0;
  private baseScale: number;
  private nextBlink = 0;
  private superWasReady = false;
  private barDirty = true;
  private lastBarState = '';

  // --- bot brain
  activateAt = Infinity;
  /** test hook: bot stands still */
  frozen = false;
  aggro = false;
  private path: { x: number; y: number }[] = [];
  private pathIdx = 0;
  private nextRepath = 0;
  private nextShotAt = 0;
  private strafeDir = 1;
  private nextStrafeSwap = 0;
  private stuckTime = 0;
  private wanderTarget: { x: number; y: number } | null = null;
  private lastPos = { x: 0, y: 0 };
  spawn: { x: number; y: number };

  constructor(scene: GameScene, def: CharacterDef, x: number, y: number, isPlayer: boolean, botIndex = 0) {
    this.scene = scene;
    this.def = def;
    this.isPlayer = isPlayer;
    this.team = isPlayer ? 0 : 1;
    this.name = isPlayer ? 'TOI' : BOT_NAMES[botIndex % BOT_NAMES.length];
    this.spawn = { x, y };
    this.maxHp = Math.round(def.maxHp * (isPlayer ? 1 : ENEMY_HP_MULT));
    this.hp = this.maxHp;
    this.ghostHp = this.maxHp;
    this.speed = def.speed * (isPlayer ? 1 : ENEMY_SPEED_MULT);
    this.dmgMult = isPlayer ? 1 : ENEMY_DAMAGE_MULT;
    this.baseScale = (def.radius / 26) * 0.5 * CH_TEX_SCALE;

    // physics body (invisible) — the visual container follows it
    this.body = scene.physics.add.image(x, y, 'dot').setVisible(false);
    this.body.setCircle(def.radius, 8 - def.radius, 8 - def.radius);
    this.body.setCollideWorldBounds(true);
    this.body.setData('fighter', this);

    this.shadow = scene.add.image(0, def.radius * 0.9, 'shadow').setScale(def.radius / 22, def.radius / 26);
    this.ring = scene.add.image(0, def.radius * 0.85, 'ring').setScale(def.radius / 52).setTint(isPlayer ? 0x3fa9ff : 0xff3d5a).setAlpha(0.95);
    this.sprite = scene.add.image(0, -def.radius * 0.55, `ch_${def.id}`).setScale(this.baseScale * 1.25);
    this.weapon = scene.add.image(0, 0, `w_${def.id}`).setScale(0.5);
    this.bar = scene.add.graphics();
    this.label = scene.add.text(0, -def.radius * 2.6 - 22, this.name, {
      fontFamily: FONT, fontSize: '16px', color: isPlayer ? '#9ff6ff' : '#ffd0d8', stroke: '#1a1030', strokeThickness: 4,
    }).setOrigin(0.5);
    this.view = scene.add.container(x, y, [this.shadow, this.ring, this.weapon, this.sprite, this.bar, this.label]);
    this.nextBlink = scene.time.now + Phaser.Math.Between(1000, 4000);
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get superReady() { return this.superCharge >= 1; }
  get attackDamage() { return this.def.attackDamage * this.dmgMult; }

  // ------------------------------------------------------------------ update
  update(time: number, dt: number, moveX: number, moveY: number) {
    if (!this.alive) return;
    const body = this.body.body as Phaser.Physics.Arcade.Body;

    // reload ammo
    if (this.ammo < MAX_AMMO) this.ammo = Math.min(MAX_AMMO, this.ammo + dt / this.def.reloadMs);

    // regen when out of combat
    if (time - this.lastHurtAt > REGEN_DELAY_MS && time - this.lastAttackAt > REGEN_DELAY_MS && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * REGEN_PER_SEC * (dt / 1000));
      this.barDirty = true;
      if (Math.random() < dt / 250) this.scene.fx.healSparkle(this.x, this.y);
    }

    // movement
    if (!this.dashing) {
      let mx = moveX, my = moveY;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      if (time < this.busyUntil) { mx = 0; my = 0; }
      body.setVelocity(mx * this.speed + this.knockX, my * this.speed + this.knockY);
      const decay = Math.pow(0.0025, dt / 1000);
      this.knockX *= decay; this.knockY *= decay;
      if (Math.abs(this.knockX) < 5) this.knockX = 0;
      if (Math.abs(this.knockY) < 5) this.knockY = 0;
      const moving = len > 0.15 && time >= this.busyUntil;
      this.animateWalk(dt, moving);
    }

    // bush
    const cell = worldToCell(this.x, this.y + 4);
    this.inBush = this.scene.cellType(cell.col, cell.row) === 'b';

    // super ready feedback
    if (this.superReady && !this.superWasReady) {
      this.superWasReady = true;
      if (this.isPlayer) { Audio.sfx('super_ready'); vibrate([20, 40, 20]); this.scene.fx.floatText(this.x, this.y - 90, 'SUPER PRÊT !', '#ffe14a', 26); }
    }
    if (!this.superReady) this.superWasReady = false;

    // blink
    if (time > this.nextBlink) {
      this.sprite.setTexture(`ch_${this.def.id}_blink`);
      this.scene.time.delayedCall(120, () => this.alive && this.sprite.setTexture(`ch_${this.def.id}`));
      this.nextBlink = time + Phaser.Math.Between(1800, 4500);
    }

    if (this.ghostHp > this.hp) { this.ghostHp = Math.max(this.hp, this.ghostHp - this.maxHp * dt / 900); this.barDirty = true; }
    this.syncView();
  }

  private animateWalk(dt: number, moving: boolean) {
    if (moving) this.walkPhase += dt * 0.016;
    else this.walkPhase = Phaser.Math.Linear(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 0.2);
    const s = Math.abs(Math.sin(this.walkPhase));
    const idle = moving ? 0 : Math.sin(this.scene.time.now * 0.004) * 0.025;
    this.sprite.y = -this.def.radius * 0.55 - s * 7;
    this.sprite.scaleY = this.baseScale * 1.25 * (1 + s * 0.05 + idle);
    this.sprite.scaleX = this.baseScale * 1.25 * (1 - s * 0.03 - idle * 0.5) * (this.sprite.flipX ? 1 : 1);
    this.sprite.angle = moving ? Math.sin(this.walkPhase) * 7 : 0;
    if (moving && Math.random() < dt / 160) this.scene.fx.footDust(this.x, this.y + this.def.radius * 0.8);
  }

  syncView() {
    this.view.setPosition(this.x, this.y);
    this.view.setDepth(this.y + 30);
    const cos = Math.cos(this.aim), sin = Math.sin(this.aim);
    this.sprite.setFlipX(cos < 0);
    const r = this.def.radius;
    this.weapon.setPosition(cos * r * 0.95, sin * r * 0.55 - r * 0.25);
    this.weapon.setRotation(this.aim);
    this.weapon.setFlipY(cos < 0);
    // weapon behind body when aiming up
    const wIdx = this.view.getIndex(this.weapon), sIdx = this.view.getIndex(this.sprite);
    if (sin < -0.3 && wIdx > sIdx) this.view.moveBelow(this.weapon, this.sprite);
    else if (sin >= -0.3 && wIdx < sIdx) this.view.moveAbove(this.weapon, this.sprite);
    if (this.superReady) {
      this.ring.setTint(0xffe14a).setAlpha(0.7 + Math.sin(this.scene.time.now * 0.012) * 0.3);
    } else this.ring.setTint(this.isPlayer ? 0x3fa9ff : 0xff3d5a).setAlpha(0.95);
    this.drawBar();
  }

  private drawBar() {
    const state = `${Math.ceil(this.hp)}|${Math.floor(this.ghostHp)}|${this.isPlayer ? Math.floor(this.ammo * 20) : 0}`;
    if (!this.barDirty && state === this.lastBarState) return;
    this.lastBarState = state; this.barDirty = false;
    const g = this.bar; g.clear();
    const w = 78, h = 13, x = -w / 2, y = -this.def.radius * 2.6 - 8;
    g.fillStyle(0x1a1030, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 6);
    g.fillStyle(0x3b2d66, 1).fillRoundedRect(x, y, w, h, 4);
    const gf = Math.max(0, this.ghostHp / this.maxHp), f = Math.max(0, this.hp / this.maxHp);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(x, y, w * gf, h, 4);
    const col = this.isPlayer ? (f > 0.35 ? 0x47e35b : 0xffc21f) : 0xff3d5a;
    if (f > 0) g.fillStyle(col, 1).fillRoundedRect(x, y, Math.max(6, w * f), h, 4);
    g.fillStyle(0xffffff, 0.3).fillRect(x + 3, y + 2, Math.max(0, w * f - 6), 3);
    if (this.isPlayer) {
      const ay = y + h + 6, sw = (w - 4) / MAX_AMMO;
      for (let i = 0; i < MAX_AMMO; i++) {
        g.fillStyle(0x1a1030, 1).fillRoundedRect(x + i * (sw + 2) - 1, ay - 1, sw + 2, 9, 3);
        const fill = Phaser.Math.Clamp(this.ammo - i, 0, 1);
        g.fillStyle(0x5a4a2a, 1).fillRoundedRect(x + i * (sw + 2), ay, sw, 7, 2);
        if (fill > 0) g.fillStyle(fill >= 1 ? 0xffa51f : 0xc98a3a, 1).fillRoundedRect(x + i * (sw + 2), ay, sw * fill, 7, 2);
      }
    }
    // hp number
    const hpText = `${Math.ceil(Math.max(0, this.hp))}`;
    if (this.label.text !== hpText) this.label.setText(hpText);
    this.label.setY(y - 12);
  }

  // ------------------------------------------------------------------ combat
  canAttack(time: number) {
    return this.alive && this.ammo >= 1 && time - this.lastAttackAt >= this.def.attackCooldownMs && time >= this.busyUntil && !this.dashing;
  }

  attack(angle: number) {
    const time = this.scene.time.now;
    if (!this.canAttack(time)) {
      if (this.isPlayer && this.ammo < 1) Audio.sfx('empty');
      return false;
    }
    this.ammo -= 1;
    this.lastAttackAt = time;
    this.aim = angle;
    this.revealed = true;
    this.scene.performAttack(this, angle);
    // recoil squash
    this.scene.tweens.add({ targets: this.sprite, scaleX: this.baseScale * 1.4, scaleY: this.baseScale * 1.1, duration: 70, yoyo: true });
    if (this.isPlayer) vibrate(12);
    return true;
  }

  useSuper(angle: number, dist: number) {
    if (!this.alive || !this.superReady || this.dashing || this.scene.time.now < this.busyUntil) return false;
    this.superCharge = 0;
    this.aim = angle;
    this.lastAttackAt = this.scene.time.now;
    this.revealed = true;
    this.scene.performSuper(this, angle, dist);
    if (this.isPlayer) vibrate([30, 30, 60]);
    return true;
  }

  addSuperCharge(dmg: number) {
    this.superCharge = Math.min(1, this.superCharge + dmg / this.def.superChargeNeeded);
  }

  heal(amount: number) {
    if (!this.alive) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.barDirty = true;
    this.scene.fx.floatText(this.x, this.y - 70, `+${Math.round(this.hp - before)}`, '#5dff7a', 28);
  }

  takeDamage(amount: number, from: Fighter | null, kx = 0, ky = 0, chargesSuper = true) {
    const time = this.scene.time.now;
    if (!this.alive || time < this.invulnUntil) return 0;
    const dmg = Math.round(amount);
    this.hp -= dmg;
    this.lastHurtAt = time;
    this.revealed = true;
    this.barDirty = true;
    this.knockX += kx; this.knockY += ky;
    if (!this.isPlayer) { this.aggro = true; this.activateAt = Math.min(this.activateAt, time); }
    if (from && from.alive && chargesSuper) from.addSuperCharge(dmg);
    if (from?.isPlayer) this.scene.stats.damage += dmg;

    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
    this.scene.tweens.add({ targets: this.sprite, scaleX: this.baseScale * 1.45, scaleY: this.baseScale * 1.05, duration: 60, yoyo: true });
    this.scene.fx.damageNumber(this.x, this.y - 60, dmg, this.isPlayer);
    if (this.isPlayer) {
      Audio.sfx('hurt');
      vibrate(25);
      this.scene.cameras.main.shake(110, 0.006);
      this.scene.events.emit('player-hurt');
    } else Audio.sfx('hit');

    if (this.hp <= 0) this.die(from);
    return dmg;
  }

  die(from: Fighter | null) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.dashing = false;
    this.drawBar();
    const b = this.body.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(0, 0); b.enable = false;
    Audio.sfx('ko');
    this.scene.fx.koBurst(this.x, this.y, this.def.glow);
    this.scene.cameras.main.shake(220, 0.012);
    this.bar.setVisible(false); this.label.setVisible(false);
    this.scene.tweens.add({
      targets: this.sprite, angle: 720, scale: 0, y: this.sprite.y - 60, duration: 650, ease: 'Back.In',
    });
    this.scene.tweens.add({ targets: [this.weapon, this.ring, this.shadow], alpha: 0, duration: 400 });
    this.scene.time.delayedCall(700, () => this.view.setVisible(false));
    this.scene.onFighterDied(this, from);
  }

  // ------------------------------------------------------------------ bot AI
  updateBot(time: number, dt: number) {
    if (!this.alive) return;
    const scene = this.scene;
    const p = scene.player;
    let mx = 0, my = 0;

    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const los = p.alive && scene.lineOfSight(this.x, this.y, p.x, p.y);
    const playerHidden = p.inBush && dist > 230 && time - p.lastAttackAt > 1500 && time - p.lastHurtAt > 800;
    const canSee = p.alive && los && dist < 820 && !playerHidden;

    if (!scene.fighting || !p.alive || this.frozen) {
      // idle on the spot
      this.update(time, dt, 0, 0);
      return;
    }
    if (!this.aggro && (time >= this.activateAt || (canSee && dist < 520))) this.aggro = true;

    if (!this.aggro) {
      // patrol around spawn
      if (!this.wanderTarget || Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y) < 30 || time > this.nextRepath + 3000) {
        this.wanderTarget = { x: this.spawn.x + Phaser.Math.Between(-180, 180), y: this.spawn.y + Phaser.Math.Between(-140, 140) };
        this.repath(this.wanderTarget.x, this.wanderTarget.y, time);
      }
      [mx, my] = this.followPath();
      mx *= 0.5; my *= 0.5;
    } else if (canSee) {
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      const pref = this.def.id === 'zippy' ? 70 : this.def.id === 'tanko' ? 230 : 400;
      if (time > this.nextStrafeSwap) { this.strafeDir *= -1; this.nextStrafeSwap = time + Phaser.Math.Between(700, 1800); }
      if (dist > pref + 70) {
        // approach (path if direct line is grazing a corner)
        if (time > this.nextRepath) this.repath(p.x, p.y, time);
        const [px, py] = this.followPath();
        mx = px * 0.6 + nx * 0.4 + -ny * this.strafeDir * 0.25;
        my = py * 0.6 + ny * 0.4 + nx * this.strafeDir * 0.25;
      } else if (dist < pref - 90) {
        mx = -nx * 0.8 + -ny * this.strafeDir * 0.5;
        my = -ny * 0.8 + nx * this.strafeDir * 0.5;
      } else {
        mx = -ny * this.strafeDir; my = nx * this.strafeDir;
      }
      // shoot
      this.aim = Math.atan2(dy, dx);
      if (time >= this.nextShotAt && dist < this.def.attackRange * 0.95 && this.canAttack(time)) {
        const err = Phaser.Math.FloatBetween(-0.2, 0.2);
        this.attack(this.aim + err);
        this.nextShotAt = time + Phaser.Math.Between(850, 1500);
      }
      if (this.superReady && dist < (this.def.id === 'tanko' ? 220 : this.def.id === 'zippy' ? 380 : 520) && Math.random() < dt / 1500) {
        this.useSuper(this.aim, dist);
      }
    } else {
      // hunt: path toward the player's position
      if (time > this.nextRepath) this.repath(p.x, p.y, time);
      [mx, my] = this.followPath();
      if (mx || my) this.aim = Math.atan2(my, mx);
    }

    // separation from other bots
    for (const o of scene.enemies) {
      if (o === this || !o.alive) continue;
      const ox = this.x - o.x, oy = this.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d < 80 && d > 0.01) { mx += (ox / d) * (80 - d) / 60; my += (oy / d) * (80 - d) / 60; }
    }

    // stuck detection
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastPos.x, this.lastPos.y);
    if ((Math.abs(mx) + Math.abs(my) > 0.3) && moved < this.speed * dt / 1000 * 0.25) this.stuckTime += dt; else this.stuckTime = 0;
    if (this.stuckTime > 450) {
      this.stuckTime = 0;
      this.nextRepath = 0;
      this.strafeDir *= -1;
      this.knockX += Phaser.Math.Between(-120, 120); this.knockY += Phaser.Math.Between(-120, 120);
    }
    this.lastPos.x = this.x; this.lastPos.y = this.y;

    this.update(time, dt, mx, my);
  }

  private repath(tx: number, ty: number, time: number) {
    this.nextRepath = time + Phaser.Math.Between(450, 700);
    const s = worldToCell(this.x, this.y), g = worldToCell(tx, ty);
    const path = findPath(COLS, ROWS, (c, r) => this.scene.isBlocked(c, r), s, g);
    if (!path) { this.path = []; return; }
    this.path = path.map((pt) => cellCenter(pt.col, pt.row));
    this.pathIdx = Math.min(1, this.path.length - 1);
  }

  private followPath(): [number, number] {
    if (!this.path.length) return [0, 0];
    while (this.pathIdx < this.path.length - 1 && Phaser.Math.Distance.Between(this.x, this.y, this.path[this.pathIdx].x, this.path[this.pathIdx].y) < TILE * 0.45) this.pathIdx++;
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) return [0, 0];
    return [dx / d, dy / d];
  }
}
