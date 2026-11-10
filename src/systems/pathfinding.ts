/** Small, allocation-light A* on a grid with 8-way moves and no corner cutting. */
export interface GridPoint { col: number; row: number }

export function findPath(
  cols: number,
  rows: number,
  blocked: (c: number, r: number) => boolean,
  start: GridPoint,
  goal: GridPoint,
  maxIter = 4000,
): GridPoint[] | null {
  if (blocked(goal.col, goal.row)) {
    // Retarget to the nearest free neighbour of the goal.
    let best: GridPoint | null = null;
    let bd = Infinity;
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const c = goal.col + dc, r = goal.row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows || blocked(c, r)) continue;
        const d = dc * dc + dr * dr;
        if (d < bd) { bd = d; best = { col: c, row: r }; }
      }
    if (!best) return null;
    goal = best;
  }
  const idx = (c: number, r: number) => r * cols + c;
  const n = cols * rows;
  const g = new Float32Array(n).fill(Infinity);
  const f = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - goal.col), dy = Math.abs(r - goal.row);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const s = idx(start.col, start.row);
  g[s] = 0; f[s] = h(start.col, start.row); open.push(s);
  const goalI = idx(goal.col, goal.row);
  let iter = 0;
  while (open.length && iter++ < maxIter) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === goalI) {
      const path: GridPoint[] = [];
      let k = cur;
      while (k !== -1) { path.push({ col: k % cols, row: Math.floor(k / cols) }); k = came[k]; }
      return path.reverse();
    }
    closed[cur] = 1;
    const cc = cur % cols, cr = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (blocked(nc, nr)) continue;
        if (dc && dr && (blocked(cc + dc, cr) || blocked(cc, cr + dr))) continue; // no corner cutting
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        const ng = g[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          if (g[ni] === Infinity) open.push(ni);
          g[ni] = ng; f[ni] = ng + h(nc, nr); came[ni] = cur;
        }
      }
  }
  return null;
}

/** Bresenham-ish line of sight test across the grid. */
export function hasLineOfSight(
  x0: number, y0: number, x1: number, y1: number, tile: number,
  blocked: (c: number, r: number) => boolean,
): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(dist / (tile / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (blocked(Math.floor(x / tile), Math.floor(y / tile))) return false;
  }
  return true;
}
