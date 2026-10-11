import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionTags, selectedNodeDetails } from "../src/graph/menu";
import { GraphData, GraphNode } from "../src/graph/model";

const node = (
  id: string,
  kind: GraphNode["kind"],
  extra: Partial<GraphNode> = {},
): GraphNode => ({ id, kind, label: id, tagIds: [], ...extra });

const graph: GraphData = {
  nodes: [
    node("page", "page"),
    node("block", "block", {
      pageId: "page",
      parentId: "page",
      tagIds: ["tag"],
    }),
    node("asset", "asset", { pageId: "page", tagIds: ["tag"] }),
    node("orphan", "block"),
  ],
  edges: [
    { id: "parent", source: "page", target: "block", kind: "hierarchy" },
    { id: "reference", source: "block", target: "asset", kind: "reference" },
  ],
  regions: [
    {
      id: "tag",
      label: "Research",
      color: "purple",
      memberIds: ["block", "asset"],
    },
    {
      id: "code",
      label: "Code",
      color: "blue",
      memberIds: ["block"],
      builtIn: true,
    },
  ],
};

test("built-in tags are separated from user tags and remain read-only", () => {
  const groups = partitionTags(graph);
  assert.deepEqual(groups.user.map(({ label }) => label), ["Research"]);
  assert.deepEqual(groups.builtIn.map(({ label, memberIds }) => ({ label, count: memberIds.length })), [
    { label: "Code", count: 1 },
  ]);
});

test("selected node details preserve selection order and show page, tags and direct links", () => {
  const details = selectedNodeDetails(graph, ["asset", "block", "orphan"]);
  assert.deepEqual(
    details.map(({ node }) => node.id),
    ["asset", "block", "orphan"],
  );
  assert.deepEqual(
    details.map(({ pageLabel, connectionCount, tags }) => ({
      pageLabel,
      connectionCount,
      tags,
    })),
    [
      { pageLabel: "page", connectionCount: 1, tags: ["Research"] },
      { pageLabel: "page", connectionCount: 2, tags: ["Research"] },
      { pageLabel: undefined, connectionCount: 0, tags: [] },
    ],
  );
});
