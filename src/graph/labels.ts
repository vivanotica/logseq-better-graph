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
// Try nearby baselines before accepting overlap: page titles must never disappear.
export function placePageLabel(
  occupied: Set<string>,
  x: number,
  y: number,
  width: number,
): { x: number; y: number } {
  for (const offset of [0, -18, 18, -36, 36]) {
    if (reserveLabel(occupied, x, y + offset - 13, width))
      return { x, y: y + offset };
  }
  reserveLabel(occupied, x, y - 13, width, 16, true);
  return { x, y };
}
