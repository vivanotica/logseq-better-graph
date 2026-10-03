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
import { derivePages } from "./pages";
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
  const pages = derivePages(graph);
  const saved = new Map(previous.map((p) => [p.id, p]));
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
      // Use the full label, independent of zoom, truncation, or link count.
      // A bounded logarithmic scale keeps long blocks readable in dense graphs.
      radius:
        5 +
        Math.min(15, 2 * Math.log2(1 + Array.from(n.label.trim()).length / 8)),
    };
  });
  const clusterRadius = (id: string) =>
    40 + Math.sqrt(pages.members.get(id)?.length ?? 1) * 18;
  const links: (SimulationLinkDatum<LayoutNode> & {
    kind: string;
    span: number;
  })[] = [...graph.edges, ...pages.connections].map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
    span:
      e.kind === "page-reference"
        ? clusterRadius(e.source) + clusterRadius(e.target) + distance
        : distance,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = graph.regions.map((region) =>
    region.memberIds
      .map((id) => byId.get(id))
      .filter((n): n is LayoutNode => !!n),
  );
  const pageNodes = nodes.filter((n) => n.kind !== "block");
  const pageCollision = forceCollide<LayoutNode>()
    .radius((n) => clusterRadius(n.id))
    .strength(0.8);
  pageCollision.initialize(pageNodes, Math.random);
  const simulation = forceSimulation(nodes)
    .stop()
    .force(
      "link",
      forceLink<LayoutNode, (typeof links)[number]>(links)
        .id((n) => n.id)
        .distance((e) => (e.kind === "hierarchy" ? distance * 0.65 : e.span))
        .strength((e) =>
          e.kind === "page-reference"
            ? 0.6
            : e.kind === "hierarchy"
              ? 0.6
              : 0.025,
        ),
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
    .force("pageCollision", (alpha) => pageCollision(alpha))
    .force("pageMembership", (alpha) => {
      for (const n of nodes) {
        const owner = byId.get(pages.owners.get(n.id) ?? "");
        if (!owner || owner === n) continue;
        n.vx = (n.vx ?? 0) + (owner.x - n.x) * 0.18 * alpha;
        n.vy = (n.vy ?? 0) + (owner.y - n.y) * 0.18 * alpha;
      }
    })
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
        n.vx = (n.vx ?? 0) + (pull.x / pull.count) * 0.025 * alpha;
        n.vy = (n.vy ?? 0) + (pull.y / pull.count) * 0.025 * alpha;
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
