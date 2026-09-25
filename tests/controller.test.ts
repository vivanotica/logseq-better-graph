import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraphController, Snapshot } from "../src/graph/controller";
import { DB_PROBE } from "../src/graph/source";
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
test("graph switch discards old result, debounces transactions, and unsubscribes", async () => {
  let graph = "A",
    changed = () => {},
    switched = () => {},
    off = 0,
    calls = 0;
  let resolveOld: (value: unknown) => void = () => {};
  const snapshots: Snapshot[] = [];
  const controller = createGraphController(
    {
      currentGraph: async () => ({ url: graph, name: graph }),
      query: async (q) => {
        if (q === DB_PROBE) return [[1]];
        calls++;
        if (graph === "A")
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        return [[{ "db/id": 2, "block/name": "B", "block/title": "B" }]];
      },
      onChanged: (cb) => {
        changed = cb;
        return () => {
          off++;
        };
      },
      onGraphChanged: (cb) => {
        switched = cb;
        return () => {
          off++;
        };
      },
    },
    (s) => snapshots.push(s),
    1,
  );
  await wait();
  graph = "B";
  switched();
  await wait();
  resolveOld([[{ "db/id": 1, "block/name": "A" }]]);
  await wait();
  assert.equal(snapshots.at(-1)?.graphKey, "B");
  assert.equal(snapshots.at(-1)?.data?.nodes[0].label, "B");
  const before = calls;
  changed();
  changed();
  changed();
  await wait();
  assert.equal(calls, before + 1);
  controller.dispose();
  const count = snapshots.length;
  changed();
  await wait();
  assert.equal(snapshots.length, count);
  assert.equal(off, 2);
});
test("closing during query prevents publication", async () => {
  let resolve: (value: unknown) => void = () => {};
  const snapshots: Snapshot[] = [];
  const controller = createGraphController(
    {
      currentGraph: async () => ({ url: "A", name: "A" }),
      query: () =>
        new Promise((r) => {
          resolve = r;
        }),
      onChanged: () => () => {},
      onGraphChanged: () => () => {},
    },
    (s) => snapshots.push(s),
  );
  await wait();
  controller.dispose();
  const before = snapshots.length;
  resolve([[1]]);
  await wait();
  assert.equal(snapshots.length, before);
});
