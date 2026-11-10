/**
 * End-to-end playtest in a real Chrome: drives the actual game with keyboard, mouse
 * and multi-touch, and checks every gameplay rule from the spec.
 *
 *   npm run build && npm run test:e2e            (uses CHROME_PATH or /usr/bin/google-chrome)
 *   BASE_URL=https://…/mini-brawl-arena/ npm run test:e2e   (test the deployed site)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = 'tests/screenshots/';
mkdirSync(SHOTS, { recursive: true });
let BASE = process.env.BASE_URL;
let server;
if (!BASE) {
  server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
  BASE = 'http://localhost:4174/';
  await new Promise((r) => setTimeout(r, 2000));
}

let failures = 0, passes = 0;
function check(name, ok, info = '') {
  if (ok) { passes++; console.log(`  ✅ ${name}${info ? ' — ' + info : ''}`); }
  else { failures++; console.log(`  ❌ ${name}${info ? ' — ' + info : ''}`); }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  return page;
}

const S = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => S(page, () => window.__mba.state());
const waitFor = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

/** advance until N ms of *game* time elapsed (the sandbox renders slowly, so real time ≠ game time) */
async function gameWait(page, ms) {
  const t0 = await S(page, () => window.__mba.scene.time.now);
  await waitFor(page, ([t0, ms]) => window.__mba.scene.time.now - t0 >= ms, [t0, ms]);
}

async function startGame(page, character) {
  await waitFor(page, () => window.__mbaGame?.scene.isActive('Select'));
  await S(page, (c) => window.__mbaGame.scene.getScene('Select').scene.start('Game', { character: c }), character);
  await waitFor(page, () => window.__mba?.scene?.sys.isActive() && window.__mba.state().fighting);
}

/** freeze bots so we can run controlled experiments */
const calmBots = (page) => S(page, () => window.__mba.scene.enemies.forEach((e) => { e.frozen = true; }));

async function place(page, who, x, y) {
  await S(page, ([who, x, y]) => {
    const g = window.__mba.scene;
    const f = who === 'p' ? g.player : g.enemies[who];
    f.body.body.reset(x, y); f.spawn = { x, y }; f.knockX = f.knockY = 0;
    if (who === 'p') g.cameras.main.centerOn(x, y);
  }, [who, x, y]);
}

async function screenPos(page, wx, wy) {
  return S(page, ([wx, wy]) => {
    const cam = window.__mba.scene.cameras.main;
    return { x: (wx - cam.worldView.x) * cam.zoom, y: (wy - cam.worldView.y) * cam.zoom };
  }, [wx, wy]);
}

// =====================================================================
console.log('\n▶ 1. Démarrage, intro et sélection');
{
  const page = await newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(BASE);
  await waitFor(page, () => window.__mbaGame?.scene.isActive('Title'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + 'title.png' });
  check('écran titre animé affiché', await S(page, () => window.__mbaGame.scene.isActive('Title')));
  await page.mouse.click(480, 270);
  await waitFor(page, () => window.__mbaGame.scene.isActive('Select'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + 'select.png' });
  check('écran de sélection affiché après un clic', true);
  // pick Tanko by clicking his card, then press the big button
  await page.mouse.click(480 + 270, 250);
  await page.waitForTimeout(400);
  check('clic sur une carte sélectionne le héros', (await S(page, () => window.__mbaGame.registry.get('character'))) === 'tanko');
  await page.keyboard.press('ArrowLeft');
  check('flèches du clavier changent de héros', (await S(page, () => window.__mbaGame.registry.get('character'))) === 'zippy');
  await page.mouse.click(480, 540 - 60);
  await waitFor(page, () => window.__mba?.scene?.sys.isActive());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + 'countdown.png' });
  const counting = await state(page);
  check('bouton COMBATTRE lance la partie avec le bon héros', counting.character === 'zippy');
  check('compte à rebours : les joueurs sont figés pendant 3-2-1', counting.fighting === false);
  await waitFor(page, () => window.__mba.state().fighting);
  check('GO ! — le combat commence', true);
  check('aucune erreur JavaScript', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
}

// =====================================================================
for (const hero of ['blaze', 'zippy', 'tanko']) {
  console.log(`\n▶ 2. Gameplay complet avec ${hero.toUpperCase()}`);
  const page = await newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(BASE + '?skipintro');
  await startGame(page, hero);
  await calmBots(page);

  // --- movement
  await place(page, 'p', 960, 1400);
  await gameWait(page, 200);
  let s0 = await state(page);
  await page.keyboard.down('d');
  await gameWait(page, 600);
  await page.keyboard.up('d');
  let s1 = await state(page);
  check('déplacement clavier (D → droite)', s1.player.x - s0.player.x > 60, `Δx=${(s1.player.x - s0.player.x).toFixed(0)}`);
  await place(page, 'p', 960, 1400);
  await gameWait(page, 100);
  s1 = await state(page);
  await page.keyboard.down('z');
  await gameWait(page, 400);
  await page.keyboard.up('z');
  const s2 = await state(page);
  check('déplacement AZERTY (Z → haut)', s1.player.y - s2.player.y > 40, `Δy=${(s1.player.y - s2.player.y).toFixed(0)}`);

  // --- collision with a wall block (cells 9-10 of row 3 are walls)
  await place(page, 'p', 8 * 64 + 20, 3 * 64 + 32);
  await page.keyboard.down('d');
  await gameWait(page, 900);
  await page.keyboard.up('d');
  const sc = await state(page);
  check('collision : impossible de traverser un mur', sc.player.x < 9 * 64, `x=${sc.player.x.toFixed(0)} (mur à 576)`);

  // --- shooting with the mouse & damage
  const range = hero === 'zippy' ? 100 : 230;
  await place(page, 'p', 960, 1400);
  await place(page, 0, 960 + range, 1400);
  await gameWait(page, 150);
  const before = (await state(page)).enemies[0].hp;
  const ammoBefore = (await state(page)).player.ammo;
  let pos = await screenPos(page, 960 + range, 1400);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await gameWait(page, 120);
  await page.mouse.up();
  await gameWait(page, 500);
  const after = await state(page);
  check('tir à la souris consomme une munition', after.player.ammo < ammoBefore, `${ammoBefore.toFixed(2)} → ${after.player.ammo.toFixed(2)}`);
  check('le tir inflige des dégâts à l’ennemi', after.enemies[0].hp < before, `${before} → ${after.enemies[0].hp}`);
  check('le super se charge en infligeant des dégâts', after.player.superCharge > 0, `${(after.player.superCharge * 100).toFixed(0)}%`);
  // ammo recharge
  await gameWait(page, 1600);
  check('les munitions se rechargent', (await state(page)).player.ammo >= 2.5);
  // three ammo max
  check('3 munitions maximum', (await state(page)).player.ammo <= 3);

  // --- super power
  await place(page, 0, 960 + 160, 1400);
  await S(page, () => { const g = window.__mba.scene; g.player.superCharge = 1; g.enemies[0].hp = g.enemies[0].maxHp; });
  pos = await screenPos(page, 960 + 160, 1400);
  await page.mouse.move(pos.x, pos.y);
  const hpBeforeSuper = (await state(page)).enemies[0].hp;
  await page.keyboard.press('Space');
  await gameWait(page, hero === 'blaze' ? 1500 : 800);
  const afterSuper = await state(page);
  await page.screenshot({ path: SHOTS + `super_${hero}.png` });
  check(`super-pouvoir (${hero}) déclenché avec ESPACE`, afterSuper.player.superCharge < 0.5);
  check(`super-pouvoir (${hero}) inflige des dégâts`, !afterSuper.enemies[0].alive || afterSuper.enemies[0].hp < hpBeforeSuper, `${hpBeforeSuper} → ${afterSuper.enemies[0].hp}`);

  // --- destructible crate + heal bonus
  await place(page, 'p', 6 * 64 + 32, 8 * 64 + 40);
  await S(page, () => { window.__mba.scene.player.hp = 1000; });
  const cratesBefore = (await state(page)).crates;
  for (let i = 0; i < 12 && (await state(page)).crates === cratesBefore; i++) {
    await S(page, () => { const p = window.__mba.scene.player; p.ammo = 3; p.lastAttackAt = -1e9; p.attack(-Math.PI / 2); });
    await gameWait(page, 250);
  }
  const sCr = await state(page);
  check('caisse destructible', sCr.crates < cratesBefore, `${cratesBefore} → ${sCr.crates}`);
  check('la caisse libère un bonus de soin', sCr.pickups > 0 || sCr.player.hp > 1000);
  const healedEarly = sCr.player.hp > 1000; // Zippy's lunge can already walk over the bonus
  const bonus = await S(page, () => { const k = window.__mba.scene.pickups[0]; return k ? { x: k.x, y: k.y } : null; });
  if (bonus) { await S(page, () => { window.__mba.scene.player.hp = 1000; }); await place(page, 'p', bonus.x, bonus.y + 20); }
  await gameWait(page, 900);
  const hpAfter = (await state(page)).player.hp;
  check('ramasser le bonus soigne le héros', healedEarly || hpAfter > 1000, `hp=${Math.round(healedEarly ? sCr.player.hp : hpAfter)}`);

  check('aucune erreur JavaScript', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
}

// =====================================================================
console.log('\n▶ 3. Intelligence artificielle des ennemis');
{
  const page = await newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(BASE + '?skipintro');
  await startGame(page, 'tanko');
  const s0 = await state(page);
  const dist = (st) => st.enemies.map((e) => Math.hypot(e.x - st.player.x, e.y - st.player.y));
  const d0 = dist(s0);
  let sawProjectile = false;
  const t0 = await S(page, () => window.__mba.scene.time.now);
  // let the bots hunt for ~14 s of game time, the player standing still
  while ((await S(page, () => window.__mba.scene.time.now)) - t0 < 14000) {
    const st = await state(page);
    if (st.projectiles > 0) sawProjectile = true;
    if (!st.player.alive || st.ended) break;
    await page.waitForTimeout(200);
  }
  const s1 = await state(page);
  const d1 = dist(s1);
  const approached = d1.filter((d, i) => d < d0[i] - 200).length;
  await page.screenshot({ path: SHOTS + 'ai.png' });
  check('les ennemis s’activent et chassent le joueur', s1.enemies.filter((e) => e.aggro).length >= 3, `${s1.enemies.filter((e) => e.aggro).length}/5 actifs`);
  check('les ennemis se rapprochent en contournant les obstacles', approached >= 3, `${approached}/5 se sont rapprochés`);
  check('les ennemis attaquent (projectiles / dégâts)', sawProjectile || s1.player.hp < s1.player.maxHp, `hp joueur ${Math.round(s1.player.hp)}/${s1.player.maxHp}`);
  const stuckInWalls = await S(page, () => {
    const g = window.__mba.scene;
    return g.enemies.filter((e) => g.isBlocked(Math.floor(e.x / 64), Math.floor(e.y / 64))).length;
  });
  check('aucun ennemi coincé dans un mur', stuckInWalls === 0);
  check('aucune erreur JavaScript', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
}

// =====================================================================
console.log('\n▶ 4. Victoire, REJOUER et défaite');
{
  const page = await newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(BASE + '?skipintro');
  await startGame(page, 'blaze');
  await S(page, () => { const g = window.__mba.scene; g.enemies.forEach((e) => e.takeDamage(1e6, g.player)); });
  await waitFor(page, () => window.__mbaGame.scene.isActive('Result'));
  await gameWait(page, 10);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOTS + 'victory.png' });
  const res = await S(page, () => window.__mbaGame.scene.getScene('Result').children.list.filter((o) => o.type === 'Text').map((t) => t.text));
  check('victoire après élimination des 5 ennemis', res.includes('VICTOIRE !'), res.slice(0, 2).join(' / '));
  check('bouton REJOUER présent', JSON.stringify(await S(page, () => window.__mbaGame.scene.getScene('Result').children.list.map((o) => o.list?.map((c) => c.text)).flat())).includes('REJOUER'));
  // click REJOUER
  await waitFor(page, () => window.__mbaGame.scene.getScene('Result').tweens.getTweens().length > 0);
  await page.waitForTimeout(2500);
  const bpos = await S(page, () => {
    const r = window.__mbaGame.scene.getScene('Result');
    const c = r.children.list.find((o) => o.list?.some((k) => k.text === 'REJOUER'));
    return { x: c.x, y: c.y + 4 };
  });
  await page.mouse.click(bpos.x, bpos.y);
  await waitFor(page, () => !window.__mbaGame.scene.isActive('Result') && window.__mba.scene.sys.isActive() && !window.__mba.state().ended);
  check('REJOUER relance immédiatement une partie', true);
  await waitFor(page, () => window.__mba.state().fighting);
  const fresh = await state(page);
  check('nouvelle partie : 5 ennemis en pleine forme', fresh.enemies.filter((e) => e.alive).length === 5 && fresh.player.hp === fresh.player.maxHp);
  // defeat
  await S(page, () => { const g = window.__mba.scene; g.player.takeDamage(1e6, g.enemies[0]); });
  await waitFor(page, () => window.__mbaGame.scene.isActive('Result'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + 'defeat.png' });
  const res2 = await S(page, () => window.__mbaGame.scene.getScene('Result').children.list.filter((o) => o.type === 'Text').map((t) => t.text));
  check('défaite quand la vie tombe à zéro', res2.includes('PERDU…'));
  check('aucune erreur JavaScript', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
}

// =====================================================================
async function touchTest(width, height, label) {
  console.log(`\n▶ 5. Écran tactile ${label} (${width}×${height})`);
  const page = await newPage({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 5, radiusY: 5, force: 1 })) });
  await page.goto(BASE + '?skipintro');
  await waitFor(page, () => window.__mbaGame?.scene.isActive('Select'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOTS + `select_${label}.png` });
  await startGame(page, 'zippy');
  await calmBots(page);
  check('mode tactile détecté (joysticks affichés)', (await state(page)).touchMode);
  await page.screenshot({ path: SHOTS + `touch_${label}.png` });
  await place(page, 'p', 960, 1400);
  await gameWait(page, 100);

  // left joystick: drag right and hold
  const s0 = await state(page);
  const lx = width * 0.2, ly = height * 0.75;
  await touch('touchStart', [{ x: lx, y: ly, id: 1 }]);
  await touch('touchMove', [{ x: lx + 60, y: ly, id: 1 }]);
  await gameWait(page, 600);
  const s1 = await state(page);
  check('joystick gauche : déplacement', s1.player.x - s0.player.x > 60, `Δx=${(s1.player.x - s0.player.x).toFixed(0)}`);

  // right joystick while still moving (multi-touch): drag up and release => aimed attack
  const ammo0 = s1.player.ammo;
  const rx = width * 0.8, ry = height * 0.6;
  await touch('touchStart', [{ x: lx + 60, y: ly, id: 1 }, { x: rx, y: ry, id: 2 }]);
  await touch('touchMove', [{ x: lx + 60, y: ly, id: 1 }, { x: rx, y: ry - 60, id: 2 }]);
  await gameWait(page, 100);
  const aiming = await S(page, () => window.__mba.scene.controls.aimActive);
  await touch('touchEnd', []); // lift both fingers (CDP can't lift only one)
  await gameWait(page, 150);
  const s2 = await state(page);
  check('multi-touch : viser pendant qu’on se déplace', aiming);
  check('joystick droit : relâcher = tir', s2.player.ammo < ammo0, `${ammo0.toFixed(2)} → ${s2.player.ammo.toFixed(2)}`);

  // quick tap on the right = auto-aim on the nearest enemy
  await place(page, 'p', 960, 1400);
  await place(page, 0, 960 + 100, 1400);
  await gameWait(page, 100);
  await S(page, () => { const p = window.__mba.scene.player; p.ammo = 3; p.lastAttackAt = -1e9; });
  const hp0 = (await state(page)).enemies[0].hp;
  await touch('touchStart', [{ x: rx, y: ry, id: 3 }]);
  await touch('touchEnd', []);
  await gameWait(page, 400);
  check('tape rapide = tir automatique sur l’ennemi le plus proche', (await state(page)).enemies[0].hp < hp0);

  // super button
  const btn = await S(page, () => { const ui = window.__mbaGame.scene.getScene('UI'); const b = ui.superBtn; const k = ui.scale.width / innerWidth; return { x: b.x, y: b.y, w: ui.scale.width, h: ui.scale.height, cx: b.x / k, cy: b.y / k }; });
  check('bouton SUPER visible à l’écran', btn.x > 30 && btn.x < btn.w - 30 && btn.y > 30 && btn.y < btn.h - 20, `(${btn.x.toFixed(0)}, ${btn.y.toFixed(0)})`);
  await S(page, () => { window.__mba.scene.player.superCharge = 1; });
  await touch('touchStart', [{ x: btn.cx, y: btn.cy, id: 4 }]);
  await touch('touchEnd', []);
  await gameWait(page, 400);
  check('bouton SUPER déclenche le super', (await state(page)).player.superCharge < 0.5);
  check('aucune erreur JavaScript', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
}
await touchTest(844, 390, 'paysage');
await touchTest(390, 844, 'portrait');

await browser.close();
server?.kill();
console.log(`\n${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
