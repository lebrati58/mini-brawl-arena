# 💥 Mini Brawl Arena

Un mini-jeu de combat en arène, cartoon et nerveux, jouable directement dans le navigateur — sur ordinateur, Android et iPhone. Aucune inscription, aucune installation.

Entièrement développé par une IA (Claude) : code, personnages, illustrations, effets sonores et musique sont **100 % originaux et générés par le code** (aucun fichier image ou audio externe, aucun asset Supercell).

## Les héros

| | Héros | Attaque | Super |
|---|---|---|---|
| 🔥 | **Blaze** — le tireur | rafale de 3 boules de feu à longue portée | **Pluie de Météores** : 9 bombes explosives sur la zone visée |
| ⚡ | **Zippy** — le ninja | double coup de lame au corps à corps (très rapide, peu de vie) | **Dash Foudroyant** : traverse l’arène et frappe tout sur son passage |
| 💥 | **Tanko** — le colosse | coup de poing sismique lent mais dévastateur (énormément de vie) | **Onde de Choc** : saute et écrase tout autour de lui |

Le but : éliminer les 5 robots de l’arène. 3 munitions qui se rechargent, un super qui se charge en infligeant des dégâts, des buissons pour se cacher, des caisses à casser qui libèrent des bonus de soin, et la vie qui remonte quand on ne se bat plus.

## Commandes

**Ordinateur** — `ZQSD` / `WASD` / flèches : bouger · Souris : viser et tirer (maintenir = tir continu) · `Espace` ou clic droit : SUPER · `Maj` : voir la zone du super

**Téléphone** — Joystick gauche : bouger · Joystick droit : glisser pour viser, relâcher pour tirer (une tape rapide = tir automatique sur l’ennemi le plus proche) · Bouton ★ : SUPER (tape = automatique, glisser = viser)

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests unitaires (carte, pathfinding, équilibrage)
npm run build      # build de production dans dist/
npm run test:e2e   # playtest automatisé dans Chrome (clavier, souris, multi-touch) — après le build
```

Stack : Phaser 3 · TypeScript · Vite. Déploiement automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`).

### Architecture

```
src/
  main.ts                 configuration Phaser (rendu net sur écrans haute densité)
  game/
    characters.ts         statistiques des héros et réglages de difficulté
    arena.ts              plan de l’arène (symétrique), coordonnées
    Fighter.ts            héros & robots : mouvement, combat, animations, IA
    fx.ts                 particules, explosions, nombres de dégâts
    controls.ts           état des commandes partagé (clavier / tactile)
    ui.ts                 police, boutons
  systems/
    textures.ts           tous les dessins (Canvas 2D) générés au démarrage
    audio.ts              effets sonores et musique synthétisés (Web Audio)
    pathfinding.ts        A* + ligne de vue pour l’IA
  scenes/                 Boot → Title → Select → Game (+ UI) → Result
tests/
  logic.test.ts           tests unitaires (Vitest)
  e2e.mjs                 playtest de bout en bout (Playwright + Chrome)
```

## Idées pour la suite

Mode deux joueurs, nouveaux héros, plusieurs arènes, niveaux de difficulté, trophées.
