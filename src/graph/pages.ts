import { GraphData, neighborhood } from "./model";

export interface PageConnection {
  id: string;
  source: string;
  target: string;
  kind: "page-reference";
  edgeIds: string[];
}
export interface PageGraph {
  owners: Map<string, string>;
  members: Map<string, string[]>;
  connections: PageConnection[];
}

// Derive only from visible nodes and edges; never rewrite the original graph.
export function derivePages(graph: GraphData): PageGraph {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const owners = new Map<string, string>();
  const resolved = new Set<string>();
  const isPage = (id: string | undefined) =>
    !!id &&
    nodes.get(id)?.kind !== undefined &&
    nodes.get(id)?.kind !== "block";
  for (const node of graph.nodes) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current = nodes.get(node.id);
    let owner: string | undefined;
    while (current && !seen.has(current.id)) {
      if (resolved.has(current.id)) {
        owner = owners.get(current.id);
        break;
      }
      path.push(current.id);
      seen.add(current.id);
      if (isPage(current.id)) {
        owner = current.id;
        break;
      }
      if (isPage(current.pageId)) {
        owner = current.pageId;
        break;
      }
      current = nodes.get(current.parentId ?? "");
    }
    for (const id of path) {
      resolved.add(id);
      if (owner) owners.set(id, owner);
    }
  }
  const members = new Map<string, string[]>();
  for (const [id, owner] of owners) {
    const group = members.get(owner) ?? [];
    group.push(id);
    members.set(owner, group);
  }
  const pairs = new Map<string, PageConnection>();
  for (const edge of graph.edges) {
    if (edge.kind === "hierarchy") continue;
    const source = owners.get(edge.source),
      target = owners.get(edge.target);
    if (!source || !target || source === target) continue;
    const id = JSON.stringify([source, target]);
    const connection = pairs.get(id) ?? {
      id: `page:${id}`,
      source,
      target,
      kind: "page-reference",
      edgeIds: [],
    };
    connection.edgeIds.push(edge.id);
    pairs.set(id, connection);
  }
  return { owners, members, connections: [...pairs.values()] };
}

export function explorePages(
  graph: GraphData,
  pages: PageGraph,
  selected: string[],
  depth: number,
) {
  const seeds = new Set<string>();
  for (const id of selected) {
    seeds.add(id);
    if (pages.owners.get(id) === id)
      for (const member of pages.members.get(id) ?? []) seeds.add(member);
  }
  const nodes = neighborhood(graph, [...seeds], depth);
  const edgeIds = new Set(
    graph.edges
      .filter((e) => nodes.has(e.source) && nodes.has(e.target))
      .map((e) => e.id),
  );
  return { nodes, edgeIds };
}
