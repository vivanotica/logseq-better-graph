// Broad connections make reachable components read as one region.
export const REGION_BRIDGE_RADIUS = 28;
export function bridgeRegions(
  mask: Uint8Array,
  blocked: Uint8Array,
  cols: number,
  rows: number,
  step: number,
) {
  const owner = new Int32Array(mask.length);
  const parent = new Int32Array(mask.length).fill(-1);
  const distance = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const neighbors = (cell: number) => {
    const x = cell % cols,
      y = Math.floor(cell / cols);
    return [
      x > 0 ? cell - 1 : -1,
      x + 1 < cols ? cell + 1 : -1,
      y > 0 ? cell - cols : -1,
      y + 1 < rows ? cell + cols : -1,
    ];
  };
  let components = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || owner[seed]) continue;
    components++;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    owner[seed] = components;
    while (head < tail)
      for (const next of neighbors(queue[head++])) {
        if (next >= 0 && mask[next] && !owner[next]) {
          owner[next] = components;
          queue[tail++] = next;
        }
      }
  }
  if (components < 2) return;
  let head = 0,
    tail = 0;
  for (let i = 0; i < mask.length; i++)
    if (owner[i] && !blocked[i]) queue[tail++] = i;
  const candidates = new Map<
    string,
    { a: number; b: number; length: number }
  >();
  while (head < tail) {
    const cell = queue[head++];
    for (const next of neighbors(cell)) {
      if (next < 0 || blocked[next]) continue;
      if (owner[next] && owner[next] !== owner[cell]) {
        const length = distance[cell] + distance[next] + 1;
        const key = [owner[cell], owner[next]].sort((a, b) => a - b).join(":");
        if (!candidates.has(key) || candidates.get(key)!.length > length)
          candidates.set(key, { a: cell, b: next, length });
      } else if (!owner[next]) {
        owner[next] = owner[cell];
        parent[next] = cell;
        distance[next] = distance[cell] + 1;
        queue[tail++] = next;
      }
    }
  }
  const roots = Array.from({ length: components + 1 }, (_, i) => i);
  const root = (i: number): number => {
    while (roots[i] !== i) {
      roots[i] = roots[roots[i]];
      i = roots[i];
    }
    return i;
  };
  const stamp = (cell: number) => {
    const cx = cell % cols,
      cy = Math.floor(cell / cols);
    const radius = Math.ceil(REGION_BRIDGE_RADIUS / step);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) * step > REGION_BRIDGE_RADIUS) continue;
        const x = cx + dx,
          y = cy + dy,
          i = y * cols + x;
        if (x >= 0 && y >= 0 && x < cols && y < rows && !blocked[i])
          mask[i] = 1;
      }
  };
  for (const edge of [...candidates.values()].sort(
    (a, b) => a.length - b.length,
  )) {
    const a = root(owner[edge.a]),
      b = root(owner[edge.b]);
    if (a === b) continue;
    roots[a] = b;
    for (const endpoint of [edge.a, edge.b]) {
      for (let cell = endpoint; cell !== -1; cell = parent[cell]) stamp(cell);
    }
  }
}
