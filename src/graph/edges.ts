import type { Position, Point } from "./layout";

interface Edge {
  id: string;
  source: string;
  target: string;
}

// Stable lanes across pointer/selection changes, including opposite directions.
export function edgeLanes(edges: Edge[]): Map<string, number> {
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = JSON.stringify([edge.source, edge.target].sort());
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const lanes = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((edge, i) =>
      lanes.set(
        edge.id,
        edge.source === edge.target
          ? i
          : (i - (group.length - 1) / 2) * (edge.source < edge.target ? 1 : -1),
      ),
    );
  }
  return lanes;
}

// Curve endpoints stop outside the node; arrow direction follows its tangent.
export function edgeCurve(
  a: Position,
  b: Position,
  lane: number,
  scale: number,
) {
  if (a.id === b.id) {
    const r = a.radius + 3 / scale;
    const reach = r + (28 + Math.abs(lane) * 18) / scale;
    return {
      start: { x: a.x - r * 0.7, y: a.y - r * 0.7 },
      c1: { x: a.x - reach, y: a.y - reach * 2 },
      c2: { x: a.x + reach, y: a.y - reach * 2 },
      end: { x: a.x + r * 0.7, y: a.y - r * 0.7 },
    };
  }
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = (lane * 32) / scale;
  const c1 = {
    x: a.x + dx / 3 - (dy / length) * bend,
    y: a.y + dy / 3 + (dx / length) * bend,
  };
  const c2 = {
    x: a.x + (dx * 2) / 3 - (dy / length) * bend,
    y: a.y + (dy * 2) / 3 + (dx / length) * bend,
  };
  const trim = (node: Position, toward: Point) => {
    const angle = Math.atan2(toward.y - node.y, toward.x - node.x);
    const radius = Math.min(node.radius + 3 / scale, length / 3);
    return {
      x: node.x + Math.cos(angle) * radius,
      y: node.y + Math.sin(angle) * radius,
    };
  };
  return { start: trim(a, c1), c1, c2, end: trim(b, c2) };
}
