import { createLayout, Position } from "./layout";
import { GraphData } from "./model";
let layout: ReturnType<typeof createLayout> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function tick() {
  if (!layout) return;
  const started = performance.now();
  do {
    layout.simulation.tick();
  } while (
    performance.now() - started < 12 &&
    layout.simulation.alpha() > 0.015
  );
  self.postMessage({
    positions: layout.nodes.map(({ id, x, y, radius }) => ({
      id,
      x,
      y,
      radius,
    })),
    settled: layout.simulation.alpha() <= 0.015,
  });
  timer = undefined;
  if (layout.simulation.alpha() > 0.015) timer = setTimeout(tick, 24);
}
self.onmessage = (
  event: MessageEvent<
    | { type: "load"; graph: GraphData; distance: number; previous: Position[] }
    | { type: "drag"; id: string; x: number; y: number; release: boolean }
  >,
) => {
  const data = event.data;
  if (data.type === "load") {
    clearTimeout(timer);
    layout?.simulation.stop();
    layout = createLayout(data.graph, data.distance, data.previous);
    tick();
  } else if (layout) {
    const n = layout.nodes.find((n) => n.id === data.id);
    if (n) {
      n.x = data.x;
      n.y = data.y;
      n.fx = data.release ? null : data.x;
      n.fy = data.release ? null : data.y;
      layout.simulation.alpha(0.2);
      if (timer === undefined) tick();
    }
  }
};
