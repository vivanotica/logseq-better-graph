import React, { useEffect, useRef } from "react";
import { GraphData, GraphNode, neighborhood, tagColor } from "./graph/model";
import { Position, regionBoundary, Point } from "./graph/layout";
import { reserveLabel } from "./graph/labels";
interface Props {
  graph: GraphData;
  distance: number;
  depth: number;
  dark: boolean;
  selected: string[];
  tagFocus: string | null;
  fitToken: number;
  onError: (message: string) => void;
  onSelect: (id: string | null, add: boolean) => void;
  onOpen: (node: GraphNode) => void;
}
export function GraphCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    latest = useRef(props);
  latest.current = props;
  const positions = useRef(new Map<string, Position>());
  const camera = useRef({ x: 0, y: 0, scale: 1, initialized: false });
  const render = useRef<() => void>(() => {}),
    fit = useRef<() => void>(() => {});
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context,
      graph = props.graph,
      nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const worker = new Worker(
      new URL("./graph/layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    let width = 1,
      height = 1,
      frame = 0,
      hover: string | null = null;
    let boundaries: {
      id: string;
      label: string;
      color: string;
      points: Point[];
    }[] = [];
    let active = new Set<string>();
    let lastSelection: string[] | undefined;
    let lastDepth = 0;
    let gesture: {
      id: string | null;
      x: number;
      y: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null = null;
    const visiblePositions = () =>
      graph.nodes
        .map((n) => positions.current.get(n.id))
        .filter((p): p is Position => !!p);
    const recalc = () => {
      boundaries = graph.regions.map((r) => ({
        id: r.id,
        label: r.label,
        color: r.color,
        points: regionBoundary(
          [...new Set([r.id, ...r.memberIds])]
            .map((id) => positions.current.get(id))
            .filter((p): p is Position => !!p),
        ),
      }));
    };
    function draw() {
      frame = 0;
      const p = latest.current,
        view = camera.current,
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (lastSelection !== p.selected || lastDepth !== p.depth) {
        active = neighborhood(graph, p.selected, p.depth);
        lastSelection = p.selected;
        lastDepth = p.depth;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      const occupied = new Set<string>();
      for (const region of boundaries) {
        if (!region.points.length) continue;
        ctx.beginPath();
        region.points.forEach((point, i) =>
          i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
        );
        ctx.closePath();
        ctx.fillStyle = region.color;
        ctx.globalAlpha = p.tagFocus === region.id ? 0.17 : 0.065;
        ctx.fill();
        ctx.globalAlpha = p.tagFocus === region.id ? 0.8 : 0.32;
        ctx.strokeStyle = region.color;
        ctx.lineWidth = 1 / view.scale;
        ctx.stroke();
        const top = region.points.reduce((a, b) => (a.y < b.y ? a : b));
        ctx.globalAlpha = 0.9;
        ctx.font = `${12 / view.scale}px system-ui`;
        const label = "# " + region.label;
        if (
          reserveLabel(
            occupied,
            top.x * view.scale + view.x,
            top.y * view.scale + view.y - 19,
            ctx.measureText(label).width * view.scale,
            16,
            p.tagFocus === region.id,
          )
        )
          ctx.fillText(label, top.x, top.y - 6 / view.scale);
      }
      ctx.globalAlpha = 1;
      for (const e of graph.edges) {
        const a = positions.current.get(e.source),
          b = positions.current.get(e.target);
        if (!a || !b) continue;
        const highlighted =
          p.selected.length > 0 && active.has(a.id) && active.has(b.id);
        ctx.globalAlpha =
          p.selected.length && !highlighted
            ? 0.08
            : e.kind === "hierarchy"
              ? 0.42
              : 0.65;
        ctx.strokeStyle = highlighted
          ? "#60a5fa"
          : e.kind === "hierarchy"
            ? p.dark
              ? "#64748b"
              : "#94a3b8"
            : p.dark
              ? "#94a3b8"
              : "#64748b";
        ctx.lineWidth = (highlighted ? 1.7 : 1) / view.scale;
        ctx.setLineDash(
          e.kind === "hierarchy" ? [] : [4 / view.scale, 4 / view.scale],
        );
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (a.id === b.id)
          ctx.arc(a.x, a.y - a.radius - 10, a.radius + 10, 0, Math.PI * 2);
        else ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (
          e.kind !== "hierarchy" &&
          a.id !== b.id &&
          (highlighted || view.scale > 0.65)
        ) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x),
            x = b.x - Math.cos(angle) * (b.radius + 3),
            y = b.y - Math.sin(angle) * (b.radius + 3),
            size = 5 / view.scale;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x - size * Math.cos(angle - 0.45),
            y - size * Math.sin(angle - 0.45),
          );
          ctx.lineTo(
            x - size * Math.cos(angle + 0.45),
            y - size * Math.sin(angle + 0.45),
          );
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
      const ordered = [...graph.nodes].sort(
        (a, b) =>
          Number(p.selected.includes(b.id) || b.id === hover) -
          Number(p.selected.includes(a.id) || a.id === hover),
      );
      for (const n of ordered) {
        const pos = positions.current.get(n.id);
        if (!pos) continue;
        const sx = pos.x * view.scale + view.x,
          sy = pos.y * view.scale + view.y;
        if (sx < -150 || sy < -50 || sx > width + 150 || sy > height + 50)
          continue;
        const selected = p.selected.includes(n.id),
          focused =
            !p.tagFocus || n.id === p.tagFocus || n.tagIds.includes(p.tagFocus);
        ctx.globalAlpha =
          !focused || (p.selected.length && !active.has(n.id) && n.id !== hover)
            ? 0.16
            : 1;
        ctx.fillStyle =
          n.kind === "tag"
            ? tagColor(n.id)
            : n.kind === "journal"
              ? "#38bdf8"
              : n.kind === "block"
                ? p.dark
                  ? "#94a3b8"
                  : "#94a3b8"
                : p.dark
                  ? "#cbd5e1"
                  : "#64748b";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
        ctx.fill();
        if (selected || n.id === hover) {
          ctx.strokeStyle = "#60a5fa";
          ctx.lineWidth = 2 / view.scale;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.radius + 4 / view.scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.font = `${12 / view.scale}px system-ui`;
        const max = n.id === hover || selected ? 96 : 24;
        const label =
          n.label.length > max ? n.label.slice(0, max) + "…" : n.label;
        const labelX = sx + pos.radius * view.scale + 5;
        if (
          (selected || n.id === hover || view.scale > 0.3) &&
          reserveLabel(
            occupied,
            labelX,
            sy - 9,
            ctx.measureText(label).width * view.scale,
            16,
            selected || n.id === hover,
          )
        ) {
          ctx.fillStyle = p.dark ? "#e2e8f0" : "#0f172a";
          ctx.fillText(
            label,
            pos.x + pos.radius + 5 / view.scale,
            pos.y + 4 / view.scale,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    render.current = schedule;
    fit.current = () => {
      const ps = visiblePositions();
      if (!ps.length) return;
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const p of ps) {
        x0 = Math.min(x0, p.x - 40);
        y0 = Math.min(y0, p.y - 40);
        x1 = Math.max(x1, p.x + 40);
        y1 = Math.max(y1, p.y + 40);
      }
      const scale = Math.min(
        1.6,
        Math.max(
          0.05,
          Math.min(
            (width - 100) / Math.max(x1 - x0, 1),
            (height - 100) / Math.max(y1 - y0, 1),
          ),
        ),
      );
      camera.current = {
        x: width / 2 - ((x0 + x1) / 2) * scale,
        y: height / 2 - ((y0 + y1) / 2) * scale,
        scale,
        initialized: true,
      };
      schedule();
    };
    let fitOnSettle = !camera.current.initialized;
    worker.onmessage = (
      event: MessageEvent<{ positions: Position[]; settled: boolean }>,
    ) => {
      for (const pos of event.data.positions)
        if (gesture?.id !== pos.id) positions.current.set(pos.id, pos);
      recalc();
      if (!camera.current.initialized || (fitOnSettle && event.data.settled)) {
        fit.current();
        if (event.data.settled) fitOnSettle = false;
      }
      schedule();
    };
    worker.onerror = () => {
      latest.current.onError("Graph layout failed. Please reopen the graph.");
    };
    worker.postMessage({
      type: "load",
      graph,
      distance: props.distance,
      previous: [...positions.current.values()],
    });
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const oldW = width,
        oldH = height;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (camera.current.initialized) {
        camera.current.x += (width - oldW) / 2;
        camera.current.y += (height - oldH) / 2;
      }
      schedule();
    });
    resize.observe(canvas);
    const point = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const world = (p: Point) => ({
      x: (p.x - camera.current.x) / camera.current.scale,
      y: (p.y - camera.current.y) / camera.current.scale,
    });
    const hit = (p: Point) => {
      const w = world(p);
      let best: string | null = null,
        min = Infinity;
      for (const pos of visiblePositions()) {
        const d = Math.hypot(pos.x - w.x, pos.y - w.y);
        if (d < pos.radius + 8 / camera.current.scale && d < min) {
          best = pos.id;
          min = d;
        }
      }
      return best;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      fitOnSettle = false;
      canvas.focus();
      const p = point(e);
      gesture = {
        id: hit(p),
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const p = point(e);
      if (gesture) {
        gesture.moved ||=
          Math.hypot(p.x - gesture.startX, p.y - gesture.startY) > 3;
        if (gesture.moved) {
          if (gesture.id) {
            const w = world(p),
              old = positions.current.get(gesture.id)!;
            positions.current.set(gesture.id, { ...old, ...w });
            worker.postMessage({
              type: "drag",
              id: gesture.id,
              ...w,
              release: false,
            });
            recalc();
          } else {
            camera.current.x += p.x - gesture.x;
            camera.current.y += p.y - gesture.y;
          }
        }
        gesture.x = p.x;
        gesture.y = p.y;
      } else {
        hover = hit(p);
        canvas.title = hover ? (nodes.get(hover)?.label ?? "") : "";
        canvas.style.cursor = hover ? "pointer" : "grab";
      }
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (g.id && g.moved) {
        const pos = positions.current.get(g.id)!;
        worker.postMessage({ type: "drag", ...pos, release: true });
      } else if (!g.moved)
        latest.current.onSelect(g.id, e.shiftKey || e.metaKey || e.ctrlKey);
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
    };
    const cancel = () => {
      if (gesture?.id) {
        const pos = positions.current.get(gesture.id);
        if (pos) worker.postMessage({ type: "drag", ...pos, release: true });
      }
      gesture = null;
    };
    const dbl = (e: MouseEvent) => {
      const id = hit(point(e));
      if (id) latest.current.onOpen(nodes.get(id)!);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      fitOnSettle = false;
      const p = point(e),
        w = world(p),
        scale = Math.min(
          3.6,
          Math.max(0.05, camera.current.scale * (e.deltaY > 0 ? 0.9 : 1.1)),
        );
      camera.current = {
        x: p.x - w.x * scale,
        y: p.y - w.y * scale,
        scale,
        initialized: true,
      };
      schedule();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const n = nodes.get(latest.current.selected[0]);
        if (n) latest.current.onOpen(n);
      } else if (e.key === "Escape" && latest.current.selected.length) {
        e.stopPropagation();
        latest.current.onSelect(null, false);
      } else if (e.key === "f") {
        fit.current();
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("dblclick", dbl);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", key);
    recalc();
    schedule();
    return () => {
      worker.terminate();
      resize.disconnect();
      cancelAnimationFrame(frame);
      render.current = () => {};
      fit.current = () => {};
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("dblclick", dbl);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
    };
  }, [props.graph, props.distance]);
  useEffect(
    () => render.current(),
    [props.selected, props.depth, props.dark, props.tagFocus],
  );
  useEffect(() => {
    if (props.fitToken) fit.current();
  }, [props.fitToken]);
  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      tabIndex={0}
      aria-label="Page and block graph. Select a node to inspect; double-click or Enter to open. F fits the graph."
    />
  );
}
