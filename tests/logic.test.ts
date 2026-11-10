import { describe, it, expect } from 'vitest';
import { ARENA_ROWS, COLS, ROWS, ENEMY_SPAWNS, PLAYER_SPAWN, worldToCell, cellAt, TILE } from '../src/game/arena';
import { findPath, hasLineOfSight } from '../src/systems/pathfinding';
import { CHARACTERS, CHARACTER_ORDER, ENEMY_DAMAGE_MULT } from '../src/game/characters';

const blocked = (c: number, r: number) => {
  const t = cellAt(c, r);
  return t === '#' || t === 'c';
};

describe('arena', () => {
  it('is a closed rectangle', () => {
    expect(ARENA_ROWS.every((r) => r.length === COLS)).toBe(true);
    expect(ARENA_ROWS[0]).toMatch(/^#+$/);
    expect(ARENA_ROWS[ROWS - 1]).toMatch(/^#+$/);
    ARENA_ROWS.forEach((r) => { expect(r[0]).toBe('#'); expect(r[COLS - 1]).toBe('#'); });
  });

  it('is left/right symmetric (fair)', () => {
    ARENA_ROWS.forEach((r) => expect(r).toBe(r.split('').reverse().join('')));
  });

  it('has walls, bushes and destructible crates', () => {
    const all = ARENA_ROWS.join('');
    expect(all.split('c').length - 1).toBeGreaterThanOrEqual(10);
    expect(all.split('b').length - 1).toBeGreaterThanOrEqual(20);
  });

  it('spawns are on free cells', () => {
    for (const p of [PLAYER_SPAWN, ...ENEMY_SPAWNS]) {
      const { col, row } = worldToCell(p.x, p.y);
      expect(blocked(col, row)).toBe(false);
    }
    expect(ENEMY_SPAWNS).toHaveLength(5);
  });

  it('every enemy can reach the player (pathfinding around obstacles)', () => {
    const goal = worldToCell(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    for (const sp of ENEMY_SPAWNS) {
      const path = findPath(COLS, ROWS, blocked, worldToCell(sp.x, sp.y), goal);
      expect(path).not.toBeNull();
      // path must never cross a blocked cell
      for (const pt of path!) expect(blocked(pt.col, pt.row)).toBe(false);
    }
  });
});

describe('pathfinding', () => {
  it('goes around a wall instead of through it', () => {
    // 5x5 grid with a vertical wall in the middle, open at the bottom
    const grid = ['..#..', '..#..', '..#..', '..#..', '.....'];
    const b = (c: number, r: number) => grid[r]?.[c] === '#';
    const path = findPath(5, 5, b, { col: 0, row: 0 }, { col: 4, row: 0 })!;
    expect(path).not.toBeNull();
    expect(path.some((p) => p.row === 4)).toBe(true);
    expect(path.every((p) => !b(p.col, p.row))).toBe(true);
  });

  it('returns null when unreachable', () => {
    const grid = ['..#..', '..#..', '..#..'];
    const b = (c: number, r: number) => grid[r]?.[c] === '#';
    expect(findPath(5, 3, b, { col: 0, row: 0 }, { col: 4, row: 2 })).toBeNull();
  });

  it('line of sight is blocked by walls', () => {
    const b = (c: number, r: number) => c === 2;
    expect(hasLineOfSight(10, 10, 300, 10, 64, b)).toBe(false);
    expect(hasLineOfSight(10, 10, 100, 10, 64, b)).toBe(true);
    expect(hasLineOfSight(TILE * 0.5, TILE * 0.5, TILE * 0.5, TILE * 10, TILE, () => false)).toBe(true);
  });
});

describe('characters', () => {
  it('has three distinct heroes matching their roles', () => {
    expect(CHARACTER_ORDER).toEqual(['blaze', 'zippy', 'tanko']);
    const { blaze, zippy, tanko } = CHARACTERS;
    expect(blaze.attackRange).toBeGreaterThan(tanko.attackRange); // the shooter has the longest reach
    expect(zippy.speed).toBeGreaterThan(blaze.speed);            // ninja is fastest
    expect(zippy.maxHp).toBeLessThan(blaze.maxHp);               // …and frailest
    expect(tanko.maxHp).toBeGreaterThan(blaze.maxHp);            // colossus is the tankiest
    expect(tanko.attackDamage).toBeGreaterThan(blaze.attackDamage);
    expect(tanko.reloadMs).toBeGreaterThan(blaze.reloadMs);      // …but slow
  });

  it('enemies hit softer than the player (child-friendly)', () => {
    expect(ENEMY_DAMAGE_MULT).toBeLessThan(1);
  });
});
