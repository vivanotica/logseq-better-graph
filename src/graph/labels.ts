// Screen-space occupancy adapted from Logseq's select-label-node-ids.
// Reserve all cells touched by a label, including cells across bucket boundaries.
export function reserveLabel(
  occupied: Set<string>,
  x: number,
  y: number,
  width: number,
  height = 16,
  force = false,
): boolean {
  const keys: string[] = [];
  for (
    let row = Math.floor(y / 18);
    row <= Math.floor((y + height) / 18);
    row++
  ) {
    for (
      let col = Math.floor(x / 48);
      col <= Math.floor((x + width + 5) / 48);
      col++
    )
      keys.push(`${col}:${row}`);
  }
  if (!force && keys.some((key) => occupied.has(key))) return false;
  for (const key of keys) occupied.add(key);
  return true;
}
// Distances are CSS screen pixels, independent of zoom and device pixel ratio.
export function nearbyLabels(
  positions: Iterable<{ id: string; x: number; y: number }>,
  camera: { x: number; y: number; scale: number },
  pointer: { x: number; y: number } | null,
): Map<string, number> {
  const distances = new Map<string, number>();
  if (!pointer) return distances;
  for (const node of positions) {
    const distance = Math.hypot(
      node.x * camera.scale + camera.x - pointer.x,
      node.y * camera.scale + camera.y - pointer.y,
    );
    if (distance <= 200) distances.set(node.id, distance);
  }
  return distances;
}
export interface LabelFade {
  from: number;
  target: number;
  startedAt: number;
}

// Sample before retargeting so rapid pointer reversals never jump in opacity.
export function fadeLabel(
  state: LabelFade,
  target: number,
  now: number,
): number {
  const progress = Math.min(1, Math.max(0, (now - state.startedAt) / 180));
  const eased = progress * progress * (3 - 2 * progress);
  const opacity =
    progress === 1
      ? state.target
      : state.from + (state.target - state.from) * eased;
  if (state.target !== target) {
    state.from = opacity;
    state.target = target;
    state.startedAt = now;
  }
  return opacity;
}
