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

test("page labels move around occupied space and remain visible when every slot is full", async () => {
  const { placePageLabel } = await import("../src/graph/labels");
  const occupied = new Set<string>();
  const first = placePageLabel(occupied, 100, 100, 100);
  const second = placePageLabel(occupied, 100, 100, 100);
  assert.deepEqual(first, { x: 100, y: 100 });
  assert.notDeepEqual(second, first);
  for (let y = 40; y <= 160; y += 10)
    reserveLabel(occupied, 100, y, 100, 16, true);
  assert.deepEqual(placePageLabel(occupied, 100, 100, 100), first);
});
