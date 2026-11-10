import Phaser from 'phaser';
import { generateTextures } from '../systems/textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    generateTextures(this);
    document.getElementById('loading')?.remove();
    const skipIntro = new URLSearchParams(location.search).has('skipintro');
    this.scene.start(skipIntro ? 'Select' : 'Title');
  }
}
