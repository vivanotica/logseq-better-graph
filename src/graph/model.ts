// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from Logseq graph_view.cljs; see NOTICE.
export type NodeKind = "page" | "block" | "tag" | "journal";
export interface Entity {
  id: string;
  uuid?: string;
  title: string;
  name?: string;
  ident?: string;
  parentId?: string;
  pageId?: string;
  tags: string[];
  refs: string[];
  linkId?: string;
  hidden: boolean;
  deleted: boolean;
  excluded: boolean;
  journal: boolean;
}
export interface GraphNode {
  id: string;
  uuid?: string;
  label: string;
  kind: NodeKind;
  parentId?: string;
  pageId?: string;
  tagIds: string[];
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "hierarchy" | "reference" | "embed";
}
export interface TagRegion {
  id: string;
  label: string;
  memberIds: string[];
  color: string;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  regions: TagRegion[];
}
export interface GraphSettings {
  selectedTagIds: string[] | null;
  linkDistance: number;
  depth: number;
  showJournals: boolean;
}
export const defaultSettings: GraphSettings = {
  selectedTagIds: null,
  linkDistance: 72,
  depth: 1,
  showJournals: false,
};
const hiddenClasses = new Set(
  ["Root", "Tag", "Property", "Page", "Whiteboard", "Comments", "Asset"].map(
    (s) => `logseq.class/${s}`,
  ),
);
const colors = [
  "#8b5cf6",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];
export function tagColor(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
export function buildGraph(entities: Entity[]): GraphData {
  const all = new Map(entities.map((e) => [e.id, e]));
  const classIdents = (e: Entity) => e.tags.map((id) => all.get(id)?.ident);
  const visibleCache = new Map<string, boolean>();
  const blocked = (e: Entity) => e.hidden || e.deleted || e.excluded;
  function visible(id: string): boolean {
    if (visibleCache.has(id)) return visibleCache.get(id)!;
    const path: string[] = [];
    const seen = new Set<string>();
    let current = all.get(id);
    let result = true;
    while (current && !seen.has(current.id)) {
      if (visibleCache.has(current.id)) {
        result = visibleCache.get(current.id)!;
        break;
      }
      seen.add(current.id);
      path.push(current.id);
      if (
        blocked(current) ||
        (current.pageId &&
          all.has(current.pageId) &&
          blocked(all.get(current.pageId)!))
      ) {
        result = false;
        break;
      }
      current = all.get(current.parentId ?? "");
    }
    for (const item of path) visibleCache.set(item, result);
    return result;
  }
  const allowed = new Map(
    entities
      .filter(
        (e) =>
          visible(e.id) &&
          !hiddenClasses.has(e.ident ?? "") &&
          !classIdents(e).includes("logseq.class/Property"),
      )
      .map((e) => [e.id, e]),
  );
  const tags = new Set(
    [...allowed.values()]
      .filter((e) => classIdents(e).includes("logseq.class/Tag"))
      .map((e) => e.id),
  );
  const nodeIds = new Set<string>();
  const expanded = new Set<string>();
  const edges = new Map<string, GraphEdge>();
  function addPath(id: string) {
    const seen = new Set<string>();
    let current = allowed.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const already = expanded.has(current.id);
      nodeIds.add(current.id);
      expanded.add(current.id);
      if (current.pageId && allowed.has(current.pageId))
        nodeIds.add(current.pageId);
      if (already) break;
      current = allowed.get(current.parentId ?? current.pageId ?? "");
    }
  }
  function edge(source: string, target: string, kind: GraphEdge["kind"]) {
    if (!allowed.has(source) || !allowed.has(target)) return;
    addPath(source);
    addPath(target);
    const id = `${kind}:${source}:${target}`;
    edges.set(id, { id, source, target, kind });
  }
  for (const e of allowed.values()) {
    if (
      e.name !== undefined ||
      tags.has(e.id) ||
      e.tags.some((id) => tags.has(id))
    )
      addPath(e.id);
    for (const target of e.refs)
      edge(e.id, target, target === e.linkId ? "embed" : "reference");
    if (e.linkId) edge(e.id, e.linkId, "embed");
  }
  for (const id of [...nodeIds]) {
    const e = allowed.get(id)!;
    const parent = e.parentId ?? e.pageId;
    if (parent && parent !== id && nodeIds.has(parent))
      edge(parent, id, "hierarchy");
  }
  const uuidTitles = new Map(
    entities.filter((e) => e.uuid).map((e) => [e.uuid!, e.title]),
  );
  const nodes: GraphNode[] = [...nodeIds].map((id) => {
    const e = allowed.get(id)!;
    const displayTitle =
      e.title || (e.linkId ? all.get(e.linkId)?.title : "") || "";
    const label = displayTitle.replace(
      /#?\[\[([^\]]+)\]\]/g,
      (_, ref: string) => uuidTitles.get(ref) ?? ref,
    );
    return {
      id,
      uuid: e.uuid,
      label: label || e.name || "(Untitled)",
      kind: tags.has(id)
        ? "tag"
        : e.journal || classIdents(e).includes("logseq.class/Journal")
          ? "journal"
          : e.name !== undefined
            ? "page"
            : "block",
      parentId: e.parentId ?? (e.pageId !== id ? e.pageId : undefined),
      pageId: e.pageId,
      tagIds: e.tags.filter((t) => tags.has(t)),
    };
  });
  const members = new Map<string, string[]>();
  for (const n of nodes)
    for (const t of n.tagIds) {
      const list = members.get(t) ?? [];
      list.push(n.id);
      members.set(t, list);
    }
  const regions = [...tags]
    .filter((id) => nodeIds.has(id))
    .map((id) => ({
      id,
      label: allowed.get(id)!.title,
      memberIds: members.get(id) ?? [],
      color: tagColor(id),
    }));
  return { nodes, edges: [...edges.values()], regions };
}
export function filterGraph(
  graph: GraphData,
  settings: GraphSettings,
): GraphData {
  const all = new Map(graph.nodes.map((n) => [n.id, n]));
  const selected =
    settings.selectedTagIds === null ? null : new Set(settings.selectedTagIds);
  const journalCache = new Map<string, boolean>();
  function inJournal(node: GraphNode): boolean {
    const path: string[] = [];
    const seen = new Set<string>();
    let n: GraphNode | undefined = node;
    let result = false;
    while (n && !seen.has(n.id)) {
      if (journalCache.has(n.id)) {
        result = journalCache.get(n.id)!;
        break;
      }
      if (n.kind === "journal" || all.get(n.pageId ?? "")?.kind === "journal") {
        result = true;
        break;
      }
      seen.add(n.id);
      path.push(n.id);
      n = all.get(n.parentId ?? "");
    }
    for (const id of path) journalCache.set(id, result);
    return result;
  }
  const eligible = new Set(
    graph.nodes
      .filter((n) => settings.showJournals || !inJournal(n))
      .map((n) => n.id),
  );
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (!eligible.has(n.id)) continue;
    if (
      selected !== null &&
      !(n.kind === "tag"
        ? selected.has(n.id)
        : n.tagIds.some((t) => selected.has(t)))
    )
      continue;
    let current: GraphNode | undefined = n;
    while (current && eligible.has(current.id) && !ids.has(current.id)) {
      ids.add(current.id);
      current = all.get(current.parentId ?? "");
    }
  }
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    regions: graph.regions
      .filter((r) => selected === null || selected.has(r.id))
      .map((r) => ({
        ...r,
        memberIds: r.memberIds.filter((id) => ids.has(id)),
      })),
  };
}
export function neighborhood(
  graph: GraphData,
  selected: string[],
  depth: number,
): Set<string> {
  const neighbors = new Map<string, string[]>();
  for (const e of graph.edges) {
    for (const [a, b] of [
      [e.source, e.target],
      [e.target, e.source],
    ]) {
      const list = neighbors.get(a) ?? [];
      list.push(b);
      neighbors.set(a, list);
    }
  }
  const seen = new Set(selected);
  let frontier = selected;
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const n of neighbors.get(id) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    frontier = next;
  }
  return seen;
}
