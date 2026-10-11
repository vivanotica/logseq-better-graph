import type { Position } from "./layout";
import type { GraphData } from "./model";

type Grid = {
  x0: number;
  y0: number;
  step: number;
  cols: number;
  rows: number;
};
type Site = Position & { tags: number[]; rank: number };
type Tree = { site: Site; axis: "x" | "y"; left?: Tree; right?: Tree };

// A kd-tree avoids comparing every grid cell with every graph node.
function tree(sites: Site[], depth = 0): Tree | undefined {
  if (!sites.length) return;
  const axis = depth % 2 ? "y" : "x";
  sites.sort((a, b) => a[axis] - b[axis] || a.rank - b.rank);
  const middle = Math.floor(sites.length / 2);
  return {
    site: sites[middle],
    axis,
    left: tree(sites.slice(0, middle), depth + 1),
    right: tree(sites.slice(middle + 1), depth + 1),
  };
}
function nearest(root: Tree, x: number, y: number): Site {
  let best = root.site,
    distance = Infinity;
  function visit(node?: Tree) {
    if (!node) return;
    const d = (node.site.x - x) ** 2 + (node.site.y - y) ** 2;
    if (d < distance || (d === distance && node.site.rank < best.rank)) {
      best = node.site;
      distance = d;
    }
    const delta = (node.axis === "x" ? x : y) - node.site[node.axis];
    visit(delta < 0 ? node.left : node.right);
    if (delta * delta <= distance) visit(delta < 0 ? node.right : node.left);
  }
  visit(root);
  return best;
}

// All tags share one lattice and nearest-member partition, including routing
// space. Boundaries cannot cross another tag's territory to join distant islands.
export function regionTerritories(
  regions: GraphData["regions"],
  groups: Position[][],
  grid: Grid,
) {
  const sorted = regions
    .map((r, i) => ({ id: r.id, i }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sites = new Map<string, Site>();
  sorted.forEach(({ i }, rank) => {
    for (const n of groups[i]) {
      const site = sites.get(n.id) ?? { ...n, tags: [], rank };
      site.tags.push(i);
      sites.set(n.id, site);
    }
  });
  const allSites = [...sites.values()];
  const indices = new Map(allSites.map((site, i) => [site, i]));
  const root = tree([...allSites])!;
  const { x0, y0, step, cols, rows } = grid;
  const owners = new Int32Array(cols * rows);
  const shared = new Uint8Array(owners.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const wx = x0 + (x + 0.5) * step,
        wy = y0 + (y + 0.5) * step;
      const site = nearest(root, wx, wy);
      const cell = y * cols + x;
      owners[cell] = indices.get(site)!;
      // The entire cell must fit in the nearest shared member's disk.
      // A single shared owner also prevents accidental three-tag overlaps.
      if (
        site.tags.length > 1 &&
        Math.hypot(
          Math.abs(wx - site.x) + step / 2,
          Math.abs(wy - site.y) + step / 2,
        ) <=
          site.radius + 24
      )
        shared[cell] = 1;
    }
  return (tag: number) =>
    Uint8Array.from(owners, (owner, cell) => {
      const site = allSites[owner];
      return Number(
        site.tags[0] === tag || (shared[cell] && site.tags.includes(tag)),
      );
    });
}
