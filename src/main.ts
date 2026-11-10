import Phaser from 'phaser';
import '@fontsource/lilita-one/400.css'; // bundled locally (SIL Open Font License) → works offline, no external request
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SelectScene } from './scenes/SelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { ResultScene } from './scenes/ResultScene';
import { DPR } from './game/ui';

/** The canvas is rendered at DPR× the screen size and displayed at 1/DPR zoom → crisp on phones. */
function fit(game: Phaser.Game) {
  game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
  game.scale.setZoom(1 / DPR);
}

async function waitForFont() {
  try {
    await Promise.race([
      document.fonts.load('40px "Lilita One"'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fallback font is fine */ }
}

async function start() {
  await waitForFont();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1b1446',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(window.innerWidth * DPR),
      height: Math.round(window.innerHeight * DPR),
      zoom: 1 / DPR,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    physics: { default: 'arcade', arcade: { debug: false } },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    input: { activePointers: 4 },
    scene: [BootScene, TitleScene, SelectScene, GameScene, UIScene, ResultScene],
  });
  (window as unknown as { __mbaGame: Phaser.Game }).__mbaGame = game;
  let t: number | undefined;
  const onResize = () => { clearTimeout(t); t = window.setTimeout(() => fit(game), 60); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => window.setTimeout(() => fit(game), 250));
}

void start();
