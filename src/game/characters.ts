export type CharacterId = 'blaze' | 'zippy' | 'tanko';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  emoji: string;
  role: string;
  tagline: string;
  superName: string;
  superDesc: string;
  attackDesc: string;
  color: number;        // main body color
  accent: number;       // secondary color
  glow: number;         // projectile / fx color
  maxHp: number;
  speed: number;        // px / s
  radius: number;       // collision radius
  reloadMs: number;     // time to reload one ammo
  attackCooldownMs: number;
  attackRange: number;
  attackDamage: number;
  superChargeNeeded: number; // damage to deal to fill super
  stats: { hp: number; speed: number; power: number; range: number }; // 1..5 for UI
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  blaze: {
    id: 'blaze',
    name: 'BLAZE',
    emoji: '🔥',
    role: 'Le tireur',
    tagline: 'Rapide de la gâchette, chaud comme la braise !',
    attackDesc: 'Rafale de 3 boules de feu à longue portée',
    superName: 'Pluie de Météores',
    superDesc: 'Fait pleuvoir 9 bombes explosives sur la zone visée',
    color: 0xff6a2b,
    accent: 0xffd23f,
    glow: 0xffa51f,
    maxHp: 3400,
    speed: 245,
    radius: 26,
    reloadMs: 850,
    attackCooldownMs: 330,
    attackRange: 620,
    attackDamage: 380,
    superChargeNeeded: 3000,
    stats: { hp: 3, speed: 3, power: 3, range: 5 },
  },
  zippy: {
    id: 'zippy',
    name: 'ZIPPY',
    emoji: '⚡',
    role: 'Le ninja',
    tagline: 'Plus vite que l’éclair, attention à ses lames !',
    attackDesc: 'Double coup de lame éclair au corps à corps',
    superName: 'Dash Foudroyant',
    superDesc: 'Traverse l’arène comme un éclair et frappe tout sur son passage',
    color: 0x8f5bff,
    accent: 0x3ff0ff,
    glow: 0x5cf6ff,
    maxHp: 2700,
    speed: 330,
    radius: 24,
    reloadMs: 650,
    attackCooldownMs: 260,
    attackRange: 135,
    attackDamage: 820,
    superChargeNeeded: 2600,
    stats: { hp: 2, speed: 5, power: 4, range: 1 },
  },
  tanko: {
    id: 'tanko',
    name: 'TANKO',
    emoji: '💥',
    role: 'Le colosse',
    tagline: 'Un mur de muscles qui fait trembler le sol !',
    attackDesc: 'Coup de poing sismique lent mais dévastateur',
    superName: 'Onde de Choc',
    superDesc: 'Frappe le sol : une onde géante repousse et écrase tout autour',
    color: 0x3fbf5a,
    accent: 0xb8c4d6,
    glow: 0x9dff6b,
    maxHp: 5600,
    speed: 205,
    radius: 32,
    reloadMs: 1350,
    attackCooldownMs: 600,
    attackRange: 360,
    attackDamage: 1150,
    superChargeNeeded: 3400,
    stats: { hp: 5, speed: 2, power: 5, range: 2 },
  },
};

export const CHARACTER_ORDER: CharacterId[] = ['blaze', 'zippy', 'tanko'];

export const MAX_AMMO = 3;
/** Enemies hit softer so a child can win — still challenging enough to be fun. */
export const ENEMY_DAMAGE_MULT = 0.38;
export const ENEMY_HP_MULT = 0.62;
export const ENEMY_SPEED_MULT = 0.78;
export const REGEN_DELAY_MS = 3000;
export const REGEN_PER_SEC = 0.13; // fraction of max hp
