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
const SPREAD = 1.8;
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
    const spread = 24 * Math.sqrt(i + 1);
    return {
      id: n.id,
      kind: n.kind,
      tagIds: n.tagIds,
      x:
        p?.x ??
        (parent ? parent.x + 45 * Math.cos(angle) : spread * Math.cos(angle)),
      y:
        p?.y ??
        (parent ? parent.y + 45 * Math.sin(angle) : spread * Math.sin(angle)),
      // Use the full label, independent of zoom, truncation, or link count.
      // A bounded logarithmic scale keeps long blocks readable in dense graphs.
      radius:
        (5 +
          Math.min(
            15,
            2 * Math.log2(1 + Array.from(n.label.trim()).length / 8),
          )) *
        (n.kind === "block" ? 1 : 4),
    };
  });
  const clusterRadius = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id);
    const members = pages.members.get(id)?.length ?? 1;
    return Math.max(40 + Math.sqrt(members) * 18, (node?.radius ?? 0) + 24);
  };
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
  const groups = [...graph.regions]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((region) =>
      region.memberIds
        .map((id) => byId.get(id))
        .filter((n): n is LayoutNode => !!n),
    );
  const memberships = new Map<LayoutNode, number>();
  for (const group of groups)
    for (const n of group) memberships.set(n, (memberships.get(n) ?? 0) + 1);
  const pageNodes = nodes.filter(
    (n) => n.kind === "page" || n.kind === "journal",
  );
  const pageCollision = forceCollide<LayoutNode>()
    .radius((n) => clusterRadius(n.id))
    .strength(0.8);
  pageCollision.initialize(pageNodes, Math.random);
  const linkForce = forceLink<LayoutNode, (typeof links)[number]>(links)
    .id((n) => n.id)
    .distance((e) =>
      e.kind === "hierarchy" ? distance * 0.65 * SPREAD : e.span * SPREAD,
    )
    .strength((e) => {
      const source = e.source as LayoutNode,
        target = e.target as LayoutNode;
      // Keep the edges, but let tagged endpoints leave their page cluster.
      if (memberships.has(source) || memberships.has(target))
        return e.kind === "hierarchy" ? 0.035 : 0.025;
      return e.kind === "page-reference" || e.kind === "hierarchy"
        ? 0.6
        : 0.025;
    });
  const simulation = forceSimulation(nodes)
    .stop()
    .force("link", linkForce)
    .force(
      "charge",
      forceManyBody<LayoutNode>().strength(-420).distanceMax(1200),
    )
    .force(
      "collision",
      forceCollide<LayoutNode>()
        .radius((n) => n.radius + (n.kind === "block" ? 10 : 24))
        .strength(0.86)
        .iterations(2),
    )
    .force("pageCollision", (alpha) => pageCollision(alpha))
    .force("pageMembership", (alpha) => {
      for (const n of nodes) {
        const owner = byId.get(pages.owners.get(n.id) ?? "");
        if (!owner || owner === n) continue;
        const strength = memberships.has(n) ? 0.012 : 0.14;
        n.vx = (n.vx ?? 0) + (owner.x - n.x) * strength * alpha;
        n.vy = (n.vy ?? 0) + (owner.y - n.y) * strength * alpha;
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
        if (!members.length) continue;
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
        n.vx = (n.vx ?? 0) + (pull.x / pull.count) * 0.34 * alpha;
        n.vy = (n.vy ?? 0) + (pull.y / pull.count) * 0.34 * alpha;
      }
    })
    .force("tagSeparation", (alpha) => {
      // Shared members remain governed by averaged attraction, not repulsion.
      const clusters = groups.map((members) => {
        const exclusive = members.filter((n) => memberships.get(n) === 1);
        const centerMembers = exclusive.length ? exclusive : members;
        const x =
          centerMembers.reduce((sum, n) => sum + n.x, 0) /
          (centerMembers.length || 1);
        const y =
          centerMembers.reduce((sum, n) => sum + n.y, 0) /
          (centerMembers.length || 1);
        const spread = Math.sqrt(
          centerMembers.reduce(
            (sum, n) => sum + (n.x - x) ** 2 + (n.y - y) ** 2,
            0,
          ) / (centerMembers.length || 1),
        );
        return {
          exclusive,
          x,
          y,
          radius: Math.min(spread, 30 * Math.sqrt(members.length)) + 48,
        };
      });
      const deltas = new Map<LayoutNode, { x: number; y: number }>();
      for (let i = 0; i < clusters.length; i++) {
        const a = clusters[i];
        if (!a.exclusive.length) continue;
        for (let j = i + 1; j < clusters.length; j++) {
          const b = clusters[j];
          if (!b.exclusive.length) continue;
          let dx = b.x - a.x,
            dy = b.y - a.y;
          const length = Math.hypot(dx, dy);
          const overlap = a.radius + b.radius - length;
          if (overlap <= 0) continue;
          if (length < 1e-6) {
            // Stable symmetry breaking, independent of region input order.
            const angle = (i * 31 + j) * 2.399963229728653;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          } else {
            dx /= length;
            dy /= length;
          }
          const push = Math.min(36, overlap * 0.2);
          for (const [cluster, sign] of [
            [a, -1],
            [b, 1],
          ] as const)
            for (const n of cluster.exclusive) {
              const delta = deltas.get(n) ?? { x: 0, y: 0 };
              delta.x += dx * push * sign;
              delta.y += dy * push * sign;
              deltas.set(n, delta);
            }
        }
      }
      for (const [n, delta] of deltas) {
        const scale =
          Math.min(1, 36 / (Math.hypot(delta.x, delta.y) || 1)) * alpha;
        n.vx = (n.vx ?? 0) + delta.x * scale;
        n.vy = (n.vy ?? 0) + delta.y * scale;
      }
    });
  const initialDistance = distance;
  function setDistance(next: number) {
    distance = next;
    // d3 caches link distances; reset the accessor without replacing nodes or velocities.
    linkForce.distance((e) =>
      e.kind === "hierarchy"
        ? distance * 0.65 * SPREAD
        : e.kind === "page-reference"
          ? (e.span - initialDistance + distance) * SPREAD
          : distance * SPREAD,
    );
    simulation.alpha(Math.max(simulation.alpha(), 0.2));
  }
  return { simulation, nodes, setDistance };
}
export interface Point {
  x: number;
  y: number;
}
export { regionBoundary } from "./regions";
