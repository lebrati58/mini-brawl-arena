/** Shared input state written by the touch UI / keyboard and read by the game. */
export interface FireRequest { auto: boolean; angle: number; power: number }

export class Controls {
  moveX = 0;
  moveY = 0;
  /** touch aim joystick currently dragged */
  aimActive = false;
  aimAngle = 0;
  aimPower = 0; // 0..1 how far the stick is pushed
  superAimActive = false;
  fire: FireRequest | null = null;
  superFire: FireRequest | null = null;
  touchMode = false;

  reset() {
    this.moveX = this.moveY = 0;
    this.aimActive = this.superAimActive = false;
    this.fire = this.superFire = null;
  }
}
