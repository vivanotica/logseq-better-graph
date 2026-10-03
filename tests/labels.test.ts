import { test } from "node:test";
import assert from "node:assert/strict";
import { fadeLabel, nearbyLabels, reserveLabel } from "../src/graph/labels";
test("labels fade in and out over 180ms and settle at the exact target", () => {
  const fade = { from: 0, target: 1, startedAt: 0 };
  assert.equal(fadeLabel(fade, 1, 0), 0);
  assert.equal(fadeLabel(fade, 1, 90), 0.5);
  assert.equal(fadeLabel(fade, 1, 180), 1);
  assert.equal(fadeLabel(fade, 0.16, 1000), 1);
  assert.equal(fadeLabel(fade, 0.16, 1180), 0.16);
  assert.equal(fadeLabel(fade, 0, 1200), 0.16);
  assert.equal(fadeLabel(fade, 0, 1380), 0);
});
test("rapid pointer reversals preserve the current opacity", () => {
  const fade = { from: 0, target: 1, startedAt: 0 };
  assert.equal(fadeLabel(fade, 0, 90), 0.5);
  assert.equal(fadeLabel(fade, 0, 180), 0.25);
  assert.equal(fadeLabel(fade, 1, 180), 0.25);
  assert.equal(fadeLabel(fade, 1, 270), 0.625);
  assert.equal(fadeLabel(fade, 1, 360), 1);
});
test("browsing includes the 200px boundary and hides labels after pointer exit", () => {
  const nodes = [
    { id: "inside", x: 10, y: 10 },
    { id: "boundary", x: 120, y: 160 },
    { id: "outside", x: 201, y: 0 },
  ];
  const camera = { x: 0, y: 0, scale: 1 };
  const nearby = nearbyLabels(nodes, camera, { x: 0, y: 0 });
  assert.deepEqual([...nearby.keys()], ["inside", "boundary"]);
  assert.equal(nearby.get("boundary"), 200);
  assert.equal(nearbyLabels(nodes, camera, null).size, 0);
});
test("browsing radius uses projected screen positions after pan, zoom and layout changes", () => {
  const nodes = [{ id: "node", x: 100, y: 0 }];
  const pointer = { x: 50, y: 40 };
  assert.ok(
    nearbyLabels(nodes, { x: 50, y: 40, scale: 2 }, pointer).has("node"),
  );
  assert.equal(
    nearbyLabels(nodes, { x: 50, y: 40, scale: 3 }, pointer).size,
    0,
  );
  assert.ok(
    nearbyLabels(nodes, { x: -50, y: 40, scale: 3 }, pointer).has("node"),
  );
  nodes[0].x = 101;
  assert.equal(
    nearbyLabels(nodes, { x: -50, y: 40, scale: 3 }, pointer).size,
    0,
  );
  assert.ok(
    nearbyLabels(nodes, { x: 50, y: 40, scale: 0.1 }, pointer).has("node"),
  );
});
test("labels crossing occupancy cell boundaries cannot overlap", () => {
  const occupied = new Set<string>();
  assert.ok(reserveLabel(occupied, 47, 17, 150));
  assert.equal(reserveLabel(occupied, 190, 20, 80), false);
  assert.ok(reserveLabel(occupied, 300, 17, 80));
  assert.ok(reserveLabel(occupied, 47, 17, 150, 16, true));
});
