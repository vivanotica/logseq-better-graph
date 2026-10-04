import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeCurve, edgeLanes } from "../src/graph/edges";
const a = { id: "a", x: 0, y: 0, radius: 10 };
const b = { id: "b", x: 200, y: 0, radius: 10 };
test("opposite directions occupy different physical lanes", () => {
  const edges = [
    { id: "ab", source: "a", target: "b" },
    { id: "ba", source: "b", target: "a" },
  ];
  const lanes = edgeLanes(edges);
  const forward = edgeCurve(a, b, lanes.get("ab")!, 1);
  const reverse = edgeCurve(b, a, lanes.get("ba")!, 1);
  assert.ok(forward.c1.y * reverse.c1.y < 0);
  assert.deepEqual(edgeLanes([...edges].reverse()), lanes);
});
test("parallel relationships separate and endpoints remain outside nodes", () => {
  const edges = ["reference", "embed"].map((id) => ({
    id,
    source: "a",
    target: "b",
  }));
  const lanes = edgeLanes(edges);
  assert.notEqual(lanes.get("reference"), lanes.get("embed"));
  for (const scale of [0.05, 1, 3.6]) {
    const curve = edgeCurve(a, b, 0, scale);
    assert.ok(curve.start.x > a.radius);
    assert.ok(curve.end.x < b.x - b.radius);
    assert.ok(curve.start.x < curve.end.x);
  }
});
test("self references have distinct endpoints and a nonzero arrow tangent", () => {
  const curve = edgeCurve(a, a, 0, 1);
  assert.notDeepEqual(curve.start, curve.end);
  assert.notDeepEqual(curve.c2, curve.end);
  for (const point of Object.values(curve)) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});

test("multiple self relationships use different loop sizes", () => {
  const edges = ["reference", "embed"].map((id) => ({
    id,
    source: "a",
    target: "a",
  }));
  const lanes = edgeLanes(edges);
  assert.notDeepEqual(
    edgeCurve(a, a, lanes.get("reference")!, 1),
    edgeCurve(a, a, lanes.get("embed")!, 1),
  );
});
