import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  filterGraph,
  defaultSettings,
  Entity,
  neighborhood,
} from "../src/graph/model";
import {
  normalizeEntities,
  readEntities,
  DB_PROBE,
  ENTITY_QUERY,
  UnsupportedGraph,
} from "../src/graph/source";
import { decodeSettings } from "../src/graph/settings";
import { createLayout, regionBoundary } from "../src/graph/layout";
const entity = (id: string, extra: Partial<Entity> = {}): Entity => ({
  id,
  title: id,
  tags: [],
  refs: [],
  hidden: false,
  deleted: false,
  excluded: false,
  journal: false,
  ...extra,
});
const base = () => [
  entity("tagClass", { ident: "logseq.class/Tag", name: "Tag" }),
  entity("t1", { name: "t1", tags: ["tagClass"] }),
  entity("t2", { name: "t2", tags: ["tagClass"] }),
  entity("A", { name: "A", tags: ["t1"] }),
  entity("B", { name: "B" }),
  entity("parent", { pageId: "A", parentId: "A" }),
  entity("a1", {
    pageId: "A",
    parentId: "parent",
    refs: ["B", "b2", "b2", "missing"],
    tags: ["t1", "t2"],
  }),
  entity("b2", { pageId: "B", parentId: "B", tags: ["t2"] }),
  entity("unused", { pageId: "A", parentId: "A" }),
  entity("embed", { pageId: "A", parentId: "A", refs: ["b2"], linkId: "b2" }),
];
test("reference endpoints and original nesting survive without duplicate block nodes", () => {
  const g = buildGraph(base());
  assert.ok(
    g.edges.some(
      (e) => e.source === "a1" && e.target === "b2" && e.kind === "reference",
    ),
  );
  assert.ok(g.edges.some((e) => e.source === "a1" && e.target === "B"));
  for (const [source, target] of [
    ["A", "parent"],
    ["parent", "a1"],
    ["B", "b2"],
  ])
    assert.ok(
      g.edges.some(
        (e) =>
          e.source === source && e.target === target && e.kind === "hierarchy",
      ),
    );
  assert.equal(
    g.edges.filter((e) => e.source === "a1" && e.target === "b2").length,
    1,
  );
  assert.equal(g.nodes.filter((n) => n.id === "a1").length, 1);
  assert.ok(
    !g.nodes.some(
      (n) => n.id === "unused" || n.id === "missing" || n.id === "tagClass",
    ),
  );
  assert.equal(
    g.edges.filter((e) => e.source === "embed" && e.target === "b2").length,
    1,
  );
  assert.equal(
    g.edges.find((e) => e.source === "embed" && e.target === "b2")?.kind,
    "embed",
  );
});
test("page and block embeds link original entities without recursive cloning", () => {
  const g = buildGraph([
    ...base(),
    entity("pageEmbed", { parentId: "A", pageId: "A", linkId: "B" }),
    entity("self", { pageId: "B", parentId: "B", linkId: "self" }),
  ]);
  assert.ok(
    g.edges.some(
      (e) => e.source === "pageEmbed" && e.target === "B" && e.kind === "embed",
    ),
  );
  assert.equal(g.nodes.filter((n) => n.id === "b2").length, 1);
  assert.ok(g.edges.some((e) => e.source === "self" && e.target === "self"));
});
test("multi-tag regions share one node, do not inherit page tags, and filters keep ancestors", () => {
  const g = buildGraph(base());
  assert.ok(g.regions.find((r) => r.id === "t1")!.memberIds.includes("a1"));
  assert.ok(g.regions.find((r) => r.id === "t2")!.memberIds.includes("a1"));
  assert.deepEqual(g.nodes.find((n) => n.id === "parent")!.tagIds, []);
  const filtered = filterGraph(g, {
    ...defaultSettings,
    selectedTagIds: ["t2"],
  });
  for (const id of ["a1", "parent", "A", "b2", "B"])
    assert.ok(filtered.nodes.some((n) => n.id === id));
  assert.ok(!filtered.nodes.some((n) => n.id === "embed"));
  assert.equal(filtered.regions.length, 1);
  assert.equal(
    filterGraph(g, { ...defaultSettings, selectedTagIds: [] }).nodes.length,
    0,
  );
  assert.ok(
    filterGraph(g, defaultSettings).nodes.some((n) => n.id === "embed"),
  );
});
test("visibility exclusions apply to ancestors and containing pages", () => {
  for (const flag of ["hidden", "deleted", "excluded"] as const) {
    const entities = base().map((e) =>
      e.id === "parent" ? { ...e, [flag]: true } : e,
    );
    const g = buildGraph(entities);
    assert.ok(!g.nodes.some((n) => n.id === "a1" || n.id === "parent"));
  }
  const g = buildGraph(
    base().map((e) => (e.id === "B" ? { ...e, excluded: true } : e)),
  );
  assert.ok(!g.nodes.some((n) => n.id === "b2" || n.id === "B"));
  assert.ok(!g.edges.some((e) => e.target === "b2"));
});
test("cycles terminate and edits remove old endpoints and parent links", () => {
  const g = buildGraph([
    ...base(),
    entity("x", { parentId: "y", refs: ["a1"] }),
    entity("y", { parentId: "x", refs: ["x"] }),
  ]);
  assert.ok(g.nodes.some((n) => n.id === "x"));
  assert.ok(neighborhood(g, ["x"], 5).has("a1"));
  const moved = buildGraph(
    base()
      .filter((e) => e.id !== "b2")
      .map((e) => (e.id === "a1" ? { ...e, parentId: "B", pageId: "B" } : e)),
  );
  assert.ok(
    moved.edges.some(
      (e) => e.source === "B" && e.target === "a1" && e.kind === "hierarchy",
    ),
  );
  assert.ok(
    !moved.edges.some((e) => e.target === "b2" || e.source === "parent"),
  );
});
test("journal filtering removes its blocks even when reached through references", () => {
  const g = buildGraph([
    ...base(),
    entity("J", { name: "J", journal: true }),
    entity("j1", { parentId: "J", pageId: "J", refs: ["A"] }),
  ]);
  assert.ok(!filterGraph(g, defaultSettings).nodes.some((n) => n.id === "j1"));
  assert.ok(
    filterGraph(g, { ...defaultSettings, showJournals: true }).nodes.some(
      (n) => n.id === "j1",
    ),
  );
});
test("SDK pull normalization handles namespaced fields, refs, tags, links and flags", () => {
  const result = normalizeEntities([
    [
      {
        "db/id": 1,
        "block/uuid": "uuid",
        "block/title": "test",
        "block/parent": { "db/id": 2 },
        "block/page": { "db/id": 3 },
        "block/refs": [{ "db/id": 4 }],
        "block/tags": [{ "db/id": 5 }],
        "block/link": { "db/id": 4 },
        "logseq.property/exclude-from-graph-view": true,
      },
    ],
  ]);
  assert.equal(result[0].parentId, "2");
  assert.deepEqual(result[0].refs, ["4"]);
  assert.equal(result[0].linkId, "4");
  assert.equal(result[0].excluded, true);
  assert.throws(() => normalizeEntities(null));
  assert.throws(() => normalizeEntities([[{}]]));
});
test("DB guard distinguishes file graph, empty DB graph and failed query", async () => {
  await assert.rejects(() => readEntities(async () => []), UnsupportedGraph);
  assert.deepEqual(
    await readEntities(async (q) => (q === DB_PROBE ? [[1]] : [])),
    [],
  );
  await assert.rejects(
    () =>
      readEntities(async () => {
        throw new Error("offline");
      }),
    /offline/,
  );
  assert.ok(ENTITY_QUERY.includes(":block/link"));
});
test("settings tolerate corrupted storage and clamp values", () => {
  assert.deepEqual(decodeSettings(null), defaultSettings);
  assert.deepEqual(
    decodeSettings({
      depth: 99,
      linkDistance: NaN,
      selectedTagIds: ["1", 2, "1"],
      showJournals: "yes",
    }),
    { ...defaultSettings, depth: 5, selectedTagIds: ["1"] },
  );
});
test("layout preserves initial positions and every member fits inside its region bounds", () => {
  const graph = buildGraph(base());
  const layout = createLayout(graph, 72, [
    { id: "a1", x: 123, y: 456, radius: 3 },
  ]);
  assert.equal(layout.nodes.find((n) => n.id === "a1")!.x, 123);
  layout.simulation.tick(20);
  layout.simulation.stop();
  assert.ok(
    layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  );
  const bounds = regionBoundary([
    { id: "a", x: 0, y: 0, radius: 4 },
    { id: "b", x: 100, y: 100, radius: 4 },
  ]);
  assert.ok(Math.min(...bounds.map((p) => p.x)) < 0);
  assert.ok(Math.max(...bounds.map((p) => p.y)) > 100);
});
test("5,000 blocks are retained and layout can stop without truncation", () => {
  const entities = [
    entity("P", { name: "P" }),
    ...Array.from({ length: 5000 }, (_, i) =>
      entity(String(i), {
        parentId: "P",
        pageId: "P",
        refs: [String((i + 1) % 5000)],
      }),
    ),
  ];
  const start = performance.now(),
    g = buildGraph(entities),
    built = performance.now();
  assert.equal(g.nodes.length, 5001);
  assert.equal(g.edges.length, 10000);
  const layout = createLayout(g, 72, []);
  layout.simulation.tick(10);
  layout.simulation.stop();
  assert.equal(layout.nodes.length, 5001);
  assert.ok(layout.nodes.every((n) => Number.isFinite(n.x)));
  console.info(
    `5001 nodes / 10000 edges: build ${Math.round(built - start)}ms; setup + 10 force ticks ${Math.round(performance.now() - built)}ms`,
  );
});

test("actual DB SDK strips block/db namespaces while retaining custom property namespaces", () => {
  const entities = normalizeEntities([
    [
      {
        id: 1,
        uuid: "u",
        title: "Page",
        name: "page",
        tags: [{ id: 2 }],
        refs: [{ id: 3 }],
        parent: { id: 4 },
        page: { id: 5 },
        link: { id: 3 },
        ":logseq.property/hide?": true,
      },
    ],
    [{ id: 2, ident: ":logseq.class/Tag", title: "Tag" }],
  ]);
  assert.equal(entities[0].name, "page");
  assert.deepEqual(entities[0].tags, ["2"]);
  assert.equal(entities[0].hidden, true);
  assert.equal(entities[1].ident, "logseq.class/Tag");
});

test("resolved full-title and empty embed titles retain readable names", () => {
  const entities = normalizeEntities([
    [
      {
        id: 1,
        uuid: "u",
        title: "[[unresolved]]",
        "full-title": "Resolved label",
        name: "page",
      },
    ],
  ]);
  assert.equal(entities[0].title, "Resolved label");
  const g = buildGraph([
    entity("A", { name: "A" }),
    entity("target", { title: "Original block", parentId: "A", pageId: "A" }),
    entity("link", { title: "", parentId: "A", pageId: "A", linkId: "target" }),
  ]);
  assert.equal(g.nodes.find((n) => n.id === "link")?.label, "Original block");
});
