import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveLabel } from "../src/graph/labels";
test("labels crossing occupancy cell boundaries cannot overlap", () => {
  const occupied = new Set<string>();
  assert.ok(reserveLabel(occupied, 47, 17, 150));
  assert.equal(reserveLabel(occupied, 190, 20, 80), false);
  assert.ok(reserveLabel(occupied, 300, 17, 80));
  assert.ok(reserveLabel(occupied, 47, 17, 150, 16, true));
});
