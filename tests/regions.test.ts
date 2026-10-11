import { test } from "node:test";
import assert from "node:assert/strict";
import { regionBoundary, buildRegionBoundaries } from "../src/graph/regions";
const node = (id: string, x: number, y = 0, radius = 10) => ({
  id,
  x,
  y,
  radius,
});
function contains(
  islands: ReturnType<typeof regionBoundary>,
  x: number,
  y: number,
) {
  return islands.some((island) => {
    let inside = false;
    for (const ring of island.rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (
          a.y > y !== b.y > y &&
          x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside;
      }
    return inside;
  });
}
test("distant members connect without a distance cutoff", () => {
  const islands = regionBoundary([node("a", 0), node("b", 400)]);
  assert.equal(islands.length, 1);
  assert.ok(contains(islands, 0, 0));
  assert.ok(contains(islands, 400, 0));
  assert.ok(contains(islands, 100, 0));
});
test("nearby members merge and singletons stay visible", () => {
  assert.equal(regionBoundary([node("a", 0)]).length, 1);
  assert.equal(regionBoundary([node("a", 0), node("b", 40)]).length, 1);
  assert.deepEqual(regionBoundary([]), []);
});
test("tag regions gain more padding around each member", () => {
  const members = [node("a", 0), node("b", 400)];
  const tight = regionBoundary(members, [], 24);
  const wide = regionBoundary(members, [], 48);
  assert.ok(contains(tight, 0, 25));
  assert.ok(contains(wide, 0, 45));
  assert.ok(!contains(tight, 0, 45));
  assert.equal(wide.length, 1);
});
test("non-members cut holes but shared members are never excluded by identity", () => {
  const members = [node("a", 0, 0, 60)];
  const islands = regionBoundary(members, [
    ...members,
    node("other", 40, 0, 4),
  ]);
  assert.equal(islands.length, 1);
  assert.ok(islands[0].rings.length > 1);
  assert.equal(contains(islands, 40, 0), false);
  assert.ok(contains(islands, 0, 0));
  assert.ok(contains(regionBoundary(members, members), 0, 0));
});
test("moving, filtering and removing members rebuilds islands without stale geometry", () => {
  const regions = [
    { id: "tag", label: "Tag", color: "red", memberIds: ["a", "b"] },
  ];
  assert.equal(
    buildRegionBoundaries(regions, [node("a", 0), node("b", 40)])[0].islands
      .length,
    1,
  );
  assert.equal(
    buildRegionBoundaries(regions, [node("a", 0), node("b", 400)])[0].islands
      .length,
    1,
  );
  assert.equal(buildRegionBoundaries(regions, [])[0].islands.length, 0);
  assert.deepEqual(buildRegionBoundaries([], [node("a", 0)]), []);
});
test("coarse grids still connect distant members", () => {
  const islands = regionBoundary([node("a", 0), node("b", 1e6)]);
  assert.equal(islands.length, 1);
  assert.ok(contains(islands, 0, 0));
  assert.ok(contains(islands, 1e6, 0));
  const mixed = regionBoundary([node("a", 0), node("b", 400, 0, 70)]);
  assert.equal(mixed.length, 1);
});

test("shared nodes belong to both tag regions without duplicated graph nodes", () => {
  const positions = [
    node("shared", 0),
    node("onlyA", -150),
    node("onlyB", 150),
  ];
  const regions = [
    { id: "A", label: "A", color: "red", memberIds: ["shared", "onlyA"] },
    { id: "B", label: "B", color: "blue", memberIds: ["shared", "onlyB"] },
  ];
  const before = structuredClone(positions);
  const boundaries = buildRegionBoundaries(regions, positions);
  assert.ok(boundaries.every((b) => contains(b.islands, 0, 0)));
  assert.equal(contains(boundaries[0].islands, 150, 0), false);
  assert.equal(contains(boundaries[1].islands, -150, 0), false);
  assert.deepEqual(positions, before);
});

test("nearby islands form one mass with a broad connection", () => {
  const islands = regionBoundary([node("a", 0), node("b", 160)]);
  assert.equal(islands.length, 1);
  assert.ok([-24, -16, -8, 0, 8, 16, 24].some((y) => contains(islands, 80, y)));
  const crossSection = Array.from({ length: 121 }, (_, i) => i - 60).filter(
    (y) => contains(islands, 80, y),
  );
  assert.ok(crossSection.length >= 48);
  assert.equal(contains(islands, 80, 60), false);
});
test("corridors allow long detours around non-member nodes", () => {
  const members = [node("a", 0), node("b", 160)];
  const islands = regionBoundary(members, [node("obstacle", 80, 0, 10)]);
  assert.equal(islands.length, 1);
  assert.equal(contains(islands, 80, 0), false);
  assert.ok(contains(islands, 0, 0));
  assert.ok(contains(islands, 160, 0));
  assert.equal(regionBoundary(members, [node("wall", 80, 0, 55)]).length, 1);
});

test("crossing tag corridors stay separate and preserve every member", () => {
  const positions = [
    node("a1", -160),
    node("a2", 160),
    node("b1", 0, -160),
    node("b2", 0, 160),
  ];
  const regions = [
    { id: "A", label: "A", color: "red", memberIds: ["a1", "a2"] },
    { id: "B", label: "B", color: "blue", memberIds: ["b1", "b2"] },
  ];
  const result = buildRegionBoundaries(regions, positions);
  for (let i = 0; i < regions.length; i++)
    for (const id of regions[i].memberIds) {
      const n = positions.find((p) => p.id === id)!;
      assert.ok(contains(result[i].islands, n.x, n.y));
    }
  for (let x = -200; x <= 200; x += 4)
    for (let y = -200; y <= 200; y += 4)
      assert.ok(
        !(
          contains(result[0].islands, x + 0.1, y + 0.1) &&
          contains(result[1].islands, x + 0.1, y + 0.1)
        ),
      );
  assert.deepEqual(
    buildRegionBoundaries(
      [...regions].reverse(),
      [...positions].reverse(),
    ).reverse(),
    result,
  );
  assert.ok(
    result.some((r) => r.islands.length > 1),
    "separation may leave disconnected islands",
  );
});

test("overlap is confined to a shared member's padding, including three tags", () => {
  const positions = [
    node("ab", -35),
    node("bc", 35),
    node("a", -140, 100),
    node("b", 0, -140),
    node("c", 140, 100),
  ];
  const regions = [
    { id: "A", label: "A", color: "red", memberIds: ["ab", "a"] },
    { id: "B", label: "B", color: "blue", memberIds: ["ab", "bc", "b"] },
    { id: "C", label: "C", color: "green", memberIds: ["bc", "c"] },
  ];
  const result = buildRegionBoundaries(regions, positions);
  for (let i = 0; i < regions.length; i++) {
    for (const id of regions[i].memberIds) {
      const n = positions.find((p) => p.id === id)!;
      assert.ok(
        contains(result[i].islands, n.x, n.y),
        `${id} in ${regions[i].id}`,
      );
    }
    for (let j = i + 1; j < regions.length; j++) {
      const shared = positions.filter(
        (p) =>
          regions[i].memberIds.includes(p.id) &&
          regions[j].memberIds.includes(p.id),
      );
      for (let x = -180; x <= 180; x += 4)
        for (let y = -180; y <= 180; y += 4)
          if (
            contains(result[i].islands, x + 0.1, y + 0.1) &&
            contains(result[j].islands, x + 0.1, y + 0.1)
          )
            assert.ok(
              shared.some(
                (n) =>
                  Math.hypot(x + 0.1 - n.x, y + 0.1 - n.y) <= n.radius + 24,
              ),
            );
    }
  }
});

test("separated compact tags each form one mass", () => {
  const positions = [
    node("a1", -200),
    node("a2", -80),
    node("b1", 80),
    node("b2", 200),
  ];
  const regions = [
    { id: "A", label: "A", color: "red", memberIds: ["a1", "a2"] },
    { id: "B", label: "B", color: "blue", memberIds: ["b1", "b2"] },
  ];
  assert.ok(
    buildRegionBoundaries(regions, positions).every(
      (r) => r.islands.length === 1,
    ),
  );
});
