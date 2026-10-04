import { bridgeRegions, REGION_BRIDGE_RADIUS } from "./region-bridges";
import type { Point, Position } from "./layout";
import type { GraphData } from "./model";

export interface RegionIsland {
  rings: Point[][];
  area: number;
  label: Point;
}
export interface RegionBoundary {
  id: string;
  label: string;
  color: string;
  islands: RegionIsland[];
}

// World-space raster union. Each connected component retains its holes.
export function regionBoundary(
  members: Position[],
  others: Position[] = [],
): RegionIsland[] {
  if (!members.length) return [];
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of members) {
    const r = n.radius + 24;
    x0 = Math.min(x0, n.x - r);
    y0 = Math.min(y0, n.y - r);
    x1 = Math.max(x1, n.x + r);
    y1 = Math.max(y1, n.y + r);
  }
  // Include nearby obstacles in the routing bounds so a long detour is possible.
  const memberIds = new Set(members.map((n) => n.id));
  const bounds = { x0, y0, x1, y1 };
  for (const n of others) {
    if (memberIds.has(n.id)) continue;
    const r = n.radius + 6 + REGION_BRIDGE_RADIUS;
    if (
      n.x + r < bounds.x0 ||
      n.x - r > bounds.x1 ||
      n.y + r < bounds.y0 ||
      n.y - r > bounds.y1
    )
      continue;
    x0 = Math.min(x0, n.x - r);
    y0 = Math.min(y0, n.y - r);
    x1 = Math.max(x1, n.x + r);
    y1 = Math.max(y1, n.y + r);
  }
  // Keep routing space outside the obstacle clearance.
  x0 -= 32;
  y0 -= 32;
  x1 += 32;
  y1 += 32;
  const step = Math.max(8, (x1 - x0) / 508, (y1 - y0) / 508);
  const cols = Math.ceil((x1 - x0) / step) + 2;
  const rows = Math.ceil((y1 - y0) / step) + 2;
  x0 -= step;
  y0 -= step;
  const mask = new Uint8Array(cols * rows);
  const paint = (
    n: Position,
    padding: number,
    value: number,
    target = mask,
  ) => {
    const radius = n.radius + padding;
    const left = Math.max(0, Math.floor((n.x - radius - x0) / step));
    const right = Math.min(cols - 1, Math.floor((n.x + radius - x0) / step));
    const top = Math.max(0, Math.floor((n.y - radius - y0) / step));
    const bottom = Math.min(rows - 1, Math.floor((n.y + radius - y0) / step));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        if (
          Math.hypot(
            x0 + (x + 0.5) * step - n.x,
            y0 + (y + 0.5) * step - n.y,
          ) <= radius
        )
          target[y * cols + x] = value;
      }
    // Preserve tiny, isolated members when a very large extent coarsens the grid.
    if (value && radius < step) {
      const x = Math.floor((n.x - x0) / step),
        y = Math.floor((n.y - y0) / step);
      if (x >= 0 && x < cols && y >= 0 && y < rows)
        target[y * cols + x] = value;
    }
  };
  for (const n of members) paint(n, 24, 1);
  const ids = new Set(members.map((n) => n.id));
  for (const n of others) if (!ids.has(n.id)) paint(n, 6, 0);
  const blocked = new Uint8Array(mask.length);
  for (const n of others)
    if (!ids.has(n.id))
      paint(n, 6 + REGION_BRIDGE_RADIUS + step / 2, 1, blocked);
  bridgeRegions(mask, blocked, cols, rows, step);
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const islands: RegionIsland[] = [];
  const stride = cols + 1;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    visited[seed] = 1;
    const edges = new Map<number, { to: number; dir: number }[]>();
    const edge = (from: number, to: number, dir: number) => {
      const list = edges.get(from) ?? [];
      list.push({ to, dir });
      edges.set(from, list);
    };
    while (head < tail) {
      const cell = queue[head++],
        x = cell % cols,
        y = Math.floor(cell / cols);
      const vertex = y * stride + x;
      const neighbors = [
        y > 0 ? cell - cols : -1,
        x + 1 < cols ? cell + 1 : -1,
        y + 1 < rows ? cell + cols : -1,
        x > 0 ? cell - 1 : -1,
      ];
      const starts = [vertex, vertex + 1, vertex + stride + 1, vertex + stride];
      const ends = [vertex + 1, vertex + stride + 1, vertex + stride, vertex];
      neighbors.forEach((next, dir) => {
        if (next < 0 || !mask[next]) edge(starts[dir], ends[dir], dir);
        else if (!visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      });
    }
    const rings: Point[][] = [];
    while (edges.size) {
      const start = edges.keys().next().value as number;
      let current = start,
        direction = -1;
      const ring: Point[] = [];
      do {
        ring.push({
          x: x0 + (current % stride) * step,
          y: y0 + Math.floor(current / stride) * step,
        });
        const choices = edges.get(current)!;
        const preferred = [
          (direction + 1) % 4,
          direction,
          (direction + 3) % 4,
          (direction + 2) % 4,
        ];
        const index =
          direction < 0
            ? 0
            : preferred
                .map((d) => choices.findIndex((e) => e.dir === d))
                .find((i) => i >= 0)!;
        const next = choices.splice(index, 1)[0];
        if (!choices.length) edges.delete(current);
        current = next.to;
        direction = next.dir;
      } while (current !== start);
      rings.push(ring);
    }
    const top = rings.flat().reduce((a, b) => (b.y < a.y ? b : a));
    islands.push({ rings, area: tail * step * step, label: top });
  }
  return islands.sort((a, b) => b.area - a.area);
}

export function buildRegionBoundaries(
  regions: GraphData["regions"],
  positions: Position[],
): RegionBoundary[] {
  const byId = new Map(positions.map((n) => [n.id, n]));
  return regions.map((region) => ({
    id: region.id,
    label: region.label,
    color: region.color,
    islands: regionBoundary(
      region.memberIds
        .map((id) => byId.get(id))
        .filter((n): n is Position => !!n),
      positions,
    ),
  }));
}
