/**
 * Arena layout. The left half is authored here and mirrored to guarantee a fair,
 * symmetric map.  Legend:  # wall · b bush · c crate · . floor
 */
export const TILE = 64;

const LEFT_HALF = [
  '###############',
  '#..............',
  '#..bbb.........',
  '#..bbb...##....',
  '#........##..c.',
  '#....c.........',
  '#.##.......bbb.',
  '#.##..cc...bbb.',
  '#..........bbb.',
  '#....###.......',
  '#....#.........',
  '#bb.....c......',
  '#bb.....c......',
  '#....#.........',
  '#....###.......',
  '#..........bbb.',
  '#.##..cc...bbb.',
  '#.##.......bbb.',
  '#....c.........',
  '#........##..c.',
  '#..bbb...##....',
  '#..bbb.........',
  '#..............',
  '###############',
];

export const ARENA_ROWS: string[] = LEFT_HALF.map((r) => r + r.split('').reverse().join(''));
export const COLS = ARENA_ROWS[0].length;
export const ROWS = ARENA_ROWS.length;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type Cell = '#' | 'b' | 'c' | '.';

export function cellAt(col: number, row: number): Cell {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
  return ARENA_ROWS[row][col] as Cell;
}

export const PLAYER_SPAWN = { x: WORLD_W / 2, y: WORLD_H - TILE * 2.5 };

export const ENEMY_SPAWNS = [
  { x: TILE * 4.5, y: TILE * 2.5 },
  { x: WORLD_W / 2, y: TILE * 2.5 },
  { x: WORLD_W - TILE * 4.5, y: TILE * 2.5 },
  { x: TILE * 3.5, y: TILE * 10.5 },
  { x: WORLD_W - TILE * 3.5, y: TILE * 10.5 },
];

export function worldToCell(x: number, y: number) {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

export function cellCenter(col: number, row: number) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}
