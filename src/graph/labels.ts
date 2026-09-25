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
