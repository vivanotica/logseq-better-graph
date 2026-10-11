import { derivePages } from "./pages";
import { GraphData, GraphNode } from "./model";

export function partitionTags(graph: GraphData) {
  return {
    builtIn: graph.regions.filter((tag) => tag.builtIn),
    user: graph.regions.filter((tag) => !tag.builtIn),
  };
}

export interface SelectedNodeDetail {
  node: GraphNode;
  pageLabel?: string;
  connectionCount: number;
  tags: string[];
}

export function selectedNodeDetails(
  graph: GraphData,
  selectedIds: readonly string[],
): SelectedNodeDetail[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const pages = derivePages(graph);
  const connectionCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    connectionCounts.set(
      edge.source,
      (connectionCounts.get(edge.source) ?? 0) + 1,
    );
    connectionCounts.set(
      edge.target,
      (connectionCounts.get(edge.target) ?? 0) + 1,
    );
  }
  const tags = new Map(
    graph.regions.map((region) => [region.id, region.label]),
  );
  return selectedIds.flatMap((id) => {
    const node = nodes.get(id);
    if (!node) return [];
    const owner = pages.owners.get(id);
    return [
      {
        node,
        pageLabel: owner ? nodes.get(owner)?.label : undefined,
        connectionCount: connectionCounts.get(id) ?? 0,
        tags: node.tagIds
          .map((tagId) => tags.get(tagId))
          .filter((label): label is string => !!label),
      },
    ];
  });
}
