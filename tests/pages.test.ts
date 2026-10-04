import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GraphData,
  GraphNode,
  filterGraph,
  defaultSettings,
} from "../src/graph/model";
import { derivePages, explorePages } from "../src/graph/pages";
import { createLayout } from "../src/graph/layout";
const node = (
  id: string,
  kind: GraphNode["kind"],
  extra: Partial<GraphNode> = {},
): GraphNode => ({ id, kind, label: id, tagIds: [], ...extra });
const fixture = (): GraphData => ({
  nodes: [
    node("A", "page"),
    node("B", "page"),
    node("J", "journal"),
    node("a", "block", { pageId: "A", parentId: "A", tagIds: ["tag"] }),
    node("a2", "block", { parentId: "a" }),
    node("b", "block", { pageId: "B", parentId: "B" }),
    node("j", "block", { pageId: "J" }),
  ],
  edges: [
    { id: "ha", source: "A", target: "a", kind: "hierarchy" },
    { id: "ha2", source: "a", target: "a2", kind: "hierarchy" },
    { id: "hb", source: "B", target: "b", kind: "hierarchy" },
    { id: "ab", source: "a", target: "b", kind: "reference" },
    { id: "embed", source: "a2", target: "B", kind: "embed" },
    { id: "direct", source: "A", target: "B", kind: "reference" },
    { id: "back", source: "b", target: "a", kind: "reference" },
    { id: "internal", source: "a", target: "a2", kind: "reference" },
    { id: "journal", source: "j", target: "a", kind: "reference" },
  ],
  regions: [{ id: "tag", label: "Tag", color: "red", memberIds: ["a"] }],
});
test("page connections aggregate directions and preserve original edges", () => {
  const graph = fixture(),
    original = JSON.stringify(graph);
  const pages = derivePages(graph);
  assert.deepEqual(
    pages.connections.find((e) => e.source === "A" && e.target === "B")
      ?.edgeIds,
    ["ab", "embed", "direct"],
  );
  assert.deepEqual(
    pages.connections.find((e) => e.source === "B" && e.target === "A")
      ?.edgeIds,
    ["back"],
  );
  assert.equal(pages.connections.length, 3);
  assert.equal(pages.owners.get("a2"), "A");
  assert.equal(JSON.stringify(graph), original);
  assert.equal(
    derivePages(filterGraph(graph, defaultSettings)).connections.length,
    2,
  );
  assert.equal(
    derivePages(
      filterGraph(graph, { ...defaultSettings, selectedTagIds: ["tag"] }),
    ).connections.length,
    0,
  );
});
test("ownership prefers valid pages and handles missing owners and cycles", () => {
  const graph = fixture();
  graph.nodes.push(
    node("priority", "block", { pageId: "B", parentId: "a" }),
    node("fallback", "block", { pageId: "missing", parentId: "a2" }),
    node("orphan", "block", { pageId: "missing" }),
    node("x", "block", { parentId: "y" }),
    node("y", "block", { parentId: "x" }),
  );
  const pages = derivePages(graph);
  assert.equal(pages.owners.get("priority"), "B");
  assert.equal(pages.owners.get("fallback"), "A");
  for (const id of ["orphan", "x", "y"])
    assert.equal(pages.owners.has(id), false);
});
test("page and block click exploration preserves depth and supports multiple selections", () => {
  const graph = fixture(),
    pages = derivePages(graph);
  assert.equal(explorePages(graph, pages, [], 2).nodes.size, 0);
  const page = explorePages(graph, pages, ["A"], 0);
  assert.deepEqual([...page.nodes].sort(), ["A", "a", "a2"]);
  assert.ok(!page.edgeIds.has("ab"));
  assert.ok(explorePages(graph, pages, ["A"], 1).edgeIds.has("ab"));
  const block = explorePages(graph, pages, ["a2"], 0);
  assert.deepEqual([...block.nodes], ["a2"]);
  assert.ok(explorePages(graph, pages, ["a2"], 1).nodes.has("B"));
  assert.ok(!explorePages(graph, pages, ["a2"], 1).nodes.has("b"));
  assert.ok(explorePages(graph, pages, ["a2"], 2).nodes.has("b"));
  assert.ok(explorePages(graph, pages, ["a2", "J"], 0).nodes.has("j"));
  assert.deepEqual(explorePages(graph, pages, ["a2"], 0), block);
});
test("page membership force follows page movement while leaving orphan blocks independent", () => {
  const graph = fixture();
  graph.nodes.push(node("orphan", "block"));
  const layout = createLayout(
    graph,
    72,
    graph.nodes.map((n) => ({ id: n.id, x: 0, y: 0, radius: 5 })),
  );
  const page = layout.nodes.find((n) => n.id === "A")!;
  page.x = 300;
  page.y = 150;
  layout.simulation.force("pageMembership")!(1);
  assert.ok(layout.nodes.find((n) => n.id === "a2")!.vx! > 0);
  assert.ok(layout.nodes.find((n) => n.id === "a")!.vy! > 0);
  assert.equal(layout.nodes.find((n) => n.id === "orphan")!.vx, 0);
  layout.simulation.tick(100);
  assert.ok(
    layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  );
  layout.simulation.stop();
});

test("distance updates keep simulation identity, positions, velocity and pinned nodes", () => {
  const layout = createLayout(fixture(), 72, []);
  layout.simulation.tick(10);
  layout.nodes[0].fx = layout.nodes[0].x;
  layout.nodes[0].fy = layout.nodes[0].y;
  const simulation = layout.simulation;
  const nodes = [...layout.nodes];
  const before = structuredClone(layout.nodes);
  const links = simulation.force("link") as import("d3-force").ForceLink<
    import("../src/graph/layout").LayoutNode,
    any
  >;
  const distances = () =>
    links.links().map((link, index, all) => links.distance()(link, index, all));
  const initial = distances();
  layout.simulation.alpha(0.01);
  layout.setDistance(120);
  assert.equal(layout.simulation, simulation);
  assert.deepEqual(layout.nodes, before);
  layout.nodes.forEach((node, i) => assert.equal(node, nodes[i]));
  assert.equal(layout.simulation.alpha(), 0.2);
  links.links().forEach((link, i) => {
    assert.ok(
      Math.abs(
        distances()[i] -
          initial[i] -
          (link.kind === "hierarchy" ? 48 * 0.65 : 48),
      ) < 1e-8,
    );
  });
  layout.setDistance(72);
  assert.deepEqual(distances(), initial);
  layout.simulation.stop();
});
