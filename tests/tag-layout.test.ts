import { test } from "node:test";
import assert from "node:assert/strict";
import { createLayout } from "../src/graph/layout";
import { GraphData } from "../src/graph/model";
import { previewGraph } from "../src/graph/fixture";

function fixture(): GraphData {
  return {
    nodes: [
      { id: "P", kind: "page", label: "P", tagIds: [] },
      { id: "Q", kind: "page", label: "Q", tagIds: [] },
      ...["a", "b", "c", "d"].map((id, i) => ({
        id,
        kind: "block" as const,
        label: id,
        tagIds: [i < 2 ? "A" : "B"],
        pageId: i % 2 ? "Q" : "P",
        parentId: i % 2 ? "Q" : "P",
      })),
    ],
    edges: ["a", "b", "c", "d"].map((id, i) => ({
      id: `h${id}`,
      source: i % 2 ? "Q" : "P",
      target: id,
      kind: "hierarchy",
    })),
    regions: [
      { id: "A", label: "A", color: "red", memberIds: ["a", "b"] },
      { id: "B", label: "B", color: "blue", memberIds: ["c", "d"] },
    ],
  };
}
const previous = [
  { id: "P", x: -400, y: 0, radius: 10 },
  { id: "Q", x: 400, y: 0, radius: 10 },
  { id: "a", x: -390, y: -20, radius: 10 },
  { id: "b", x: 390, y: -20, radius: 10 },
  { id: "c", x: -390, y: 20, radius: 10 },
  { id: "d", x: 390, y: 20, radius: 10 },
];
test("tags overcome cross-page nesting, separate, and do not rewrite connections", () => {
  const graph = fixture(),
    before = structuredClone(graph);
  const layout = createLayout(graph, 72, previous);
  // Prior force strengths are retained as a behavioral comparison fixture.
  const legacy = createLayout(graph, 72, previous);
  const byId = new Map(legacy.nodes.map((n) => [n.id, n]));
  legacy.simulation.force("tagSeparation", null);
  legacy.simulation.force("pageMembership", (alpha) => {
    for (const n of graph.nodes.filter((n) => n.pageId)) {
      const current = byId.get(n.id)!,
        page = byId.get(n.pageId!)!;
      current.vx! += (page.x - current.x) * 0.18 * alpha;
      current.vy! += (page.y - current.y) * 0.18 * alpha;
    }
  });
  const links = legacy.simulation.force("link") as import("d3-force").ForceLink<
    any,
    any
  >;
  links.strength(0.6);
  legacy.simulation.force("tags", (alpha) => {
    for (const r of graph.regions) {
      const members = r.memberIds.map((id) => byId.get(id)!);
      const x = members.reduce((s, n) => s + n.x, 0) / members.length;
      const y = members.reduce((s, n) => s + n.y, 0) / members.length;
      for (const n of members) {
        n.vx! += (x - n.x) * 0.025 * alpha;
        n.vy! += (y - n.y) * 0.025 * alpha;
      }
    }
  });
  layout.simulation.tick(300);
  legacy.simulation.tick(300);
  const spread = (l: typeof layout) => {
    const a = l.nodes.find((n) => n.id === "a")!,
      b = l.nodes.find((n) => n.id === "b")!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  assert.ok(
    spread(layout) < spread(legacy) * 0.65,
    `${spread(layout)} vs ${spread(legacy)}`,
  );
  const a = layout.nodes.filter((n) => n.tagIds.includes("A")),
    b = layout.nodes.filter((n) => n.tagIds.includes("B"));
  const mean = (ns: typeof a) => ns.reduce((s, n) => s + n.y, 0) / ns.length;
  assert.ok(Math.abs(mean(a) - mean(b)) > 60);
  assert.deepEqual(graph, before);
  layout.simulation.stop();
  legacy.simulation.stop();
});

test("region order is stable and pinned members stay fixed during settling", () => {
  const graph = fixture();
  const layout = createLayout(graph, 72, previous);
  const reversed = createLayout(
    { ...graph, regions: [...graph.regions].reverse() },
    72,
    previous,
  );
  assert.deepEqual(
    layout.nodes.map(({ x, y }) => ({ x, y })),
    previous.map(({ x, y }) => ({ x, y })),
  );
  layout.nodes[2].fx = reversed.nodes[2].fx = -390;
  layout.nodes[2].fy = reversed.nodes[2].fy = -20;
  layout.simulation.tick(200);
  reversed.simulation.tick(200);
  assert.equal(layout.nodes[2].x, -390);
  assert.equal(layout.nodes[2].y, -20);
  assert.deepEqual(layout.nodes, reversed.nodes);
  layout.simulation.stop();
  reversed.simulation.stop();
});

test("identical memberships do not multiply attraction on shared nodes", () => {
  const graph = fixture();
  graph.regions = [graph.regions[0]];
  const single = createLayout(graph, 72, previous);
  const shared = createLayout(
    {
      ...graph,
      regions: [graph.regions[0], { ...graph.regions[0], id: "second" }],
    },
    72,
    previous,
  );
  single.simulation.force("tags")!(1);
  shared.simulation.force("tags")!(1);
  assert.deepEqual(
    single.nodes.map((n) => [n.vx, n.vy]),
    shared.nodes.map((n) => [n.vx, n.vy]),
  );
  single.simulation.stop();
  shared.simulation.stop();
});

test("layout spreads the whole graph beyond the previous force distances", () => {
  const graph = previewGraph();
  const spread = createLayout(graph, 72, []);
  const baseline = createLayout(graph, 72, []);
  const charge = baseline.simulation.force(
    "charge",
  ) as import("d3-force").ForceManyBody<any>;
  charge.strength(-140).distanceMax(420);
  const links = baseline.simulation.force(
    "link",
  ) as import("d3-force").ForceLink<any, any>;
  links.distance((edge) => (edge.kind === "hierarchy" ? 72 * 0.65 : edge.span));
  baseline.simulation.force("tags", (alpha) => {
    for (const region of graph.regions) {
      const members = region.memberIds
        .map((id) => baseline.nodes.find((node) => node.id === id))
        .filter((node): node is (typeof baseline.nodes)[number] => !!node);
      if (!members.length) continue;
      const x = members.reduce((sum, node) => sum + node.x, 0) / members.length;
      const y = members.reduce((sum, node) => sum + node.y, 0) / members.length;
      for (const node of members) {
        node.vx! += (x - node.x) * 0.24 * alpha;
        node.vy! += (y - node.y) * 0.24 * alpha;
      }
    }
  });
  spread.simulation.tick(300);
  baseline.simulation.tick(300);
  const area = (nodes: typeof spread.nodes) => {
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    return (
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    );
  };
  assert.ok(area(spread.nodes) > area(baseline.nodes) * 1.2);
  assert.ok(
    spread.nodes.every(
      (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
    ),
  );
  spread.simulation.stop();
  baseline.simulation.stop();
});
