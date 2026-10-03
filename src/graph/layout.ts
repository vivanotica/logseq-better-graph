// SPDX-License-Identifier: AGPL-3.0-only
// Force parameters adapted from Logseq graph/pixi/logic.cljs; see NOTICE.
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceCenter,
  forceY,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";
import { GraphData, GraphNode } from "./model";
export interface Position {
  id: string;
  x: number;
  y: number;
  radius: number;
}
export type LayoutNode = SimulationNodeDatum &
  Position & { kind: GraphNode["kind"]; tagIds: string[] };
export function createLayout(
  graph: GraphData,
  distance: number,
  previous: Position[],
) {
  const saved = new Map(previous.map((p) => [p.id, p]));
  const degree = new Map<string, number>();
  for (const e of graph.edges)
    for (const id of [e.source, e.target])
      degree.set(id, (degree.get(id) ?? 0) + 1);
  const nodes: LayoutNode[] = graph.nodes.map((n, i) => {
    const p = saved.get(n.id);
    const parent = saved.get(n.parentId ?? "");
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const spread = 12 * Math.sqrt(i + 1);
    return {
      id: n.id,
      kind: n.kind,
      tagIds: n.tagIds,
      x:
        p?.x ??
        (parent ? parent.x + 25 * Math.cos(angle) : spread * Math.cos(angle)),
      y:
        p?.y ??
        (parent ? parent.y + 25 * Math.sin(angle) : spread * Math.sin(angle)),
      radius:
        (n.kind === "block" ? 3.8 : 4.4) +
        Math.min(10, 2 * Math.sqrt(degree.get(n.id) ?? 0)),
    };
  });
  const links: (SimulationLinkDatum<LayoutNode> & { kind: string })[] =
    graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
    }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = graph.regions.map((region) =>
    region.memberIds
      .map((id) => byId.get(id))
      .filter((n): n is LayoutNode => !!n),
  );
  const simulation = forceSimulation(nodes)
    .stop()
    .force(
      "link",
      forceLink<LayoutNode, (typeof links)[number]>(links)
        .id((n) => n.id)
        .distance((e) => (e.kind === "hierarchy" ? distance * 0.8 : distance))
        .strength((e) => (e.kind === "hierarchy" ? 0.82 : 0.45)),
    )
    .force(
      "charge",
      forceManyBody<LayoutNode>().strength(-140).distanceMax(420),
    )
    .force(
      "collision",
      forceCollide<LayoutNode>()
        .radius((n) => n.radius + 10)
        .strength(0.86)
        .iterations(2),
    )
    .force("center", forceCenter(0, 0))
    .force("y", forceY<LayoutNode>(0).strength(0.018))
    .force("tags", (alpha) => {
      // Each region follows its members, with no fixed anchor or parent node.
      // Average overlapping memberships so multi-tag nodes are not pulled harder.
      const pulls = new Map<
        LayoutNode,
        { x: number; y: number; count: number }
      >();
      for (const members of groups) {
        if (members.length < 2) continue;
        const x = members.reduce((sum, n) => sum + n.x, 0) / members.length;
        const y = members.reduce((sum, n) => sum + n.y, 0) / members.length;
        for (const n of members) {
          const pull = pulls.get(n) ?? { x: 0, y: 0, count: 0 };
          pull.x += x - n.x;
          pull.y += y - n.y;
          pull.count++;
          pulls.set(n, pull);
        }
      }
      for (const [n, pull] of pulls) {
        n.vx = (n.vx ?? 0) + (pull.x / pull.count) * 0.08 * alpha;
        n.vy = (n.vy ?? 0) + (pull.y / pull.count) * 0.08 * alpha;
      }
    });
  return { simulation, nodes };
}
export interface Point {
  x: number;
  y: number;
}
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
export function regionBoundary(members: Position[]): Point[] {
  return convexHull(
    members.flatMap((n) =>
      Array.from({ length: 8 }, (_, i) => ({
        x: n.x + (n.radius + 28) * Math.cos((i * Math.PI) / 4),
        y: n.y + (n.radius + 28) * Math.sin((i * Math.PI) / 4),
      })),
    ),
  );
}
