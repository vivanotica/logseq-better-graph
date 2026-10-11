import { Entity, buildGraph } from "./model";
export function previewGraph() {
  const entity = (
    id: string,
    title: string,
    extra: Partial<Entity> = {},
  ): Entity => ({
    id,
    title,
    uuid: `preview-${id}`,
    tags: [],
    refs: [],
    hidden: false,
    deleted: false,
    excluded: false,
    journal: false,
    ...extra,
  });
  return buildGraph([
    entity("class", "Tag", { ident: "logseq.class/Tag", name: "tag" }),
    entity("assetClass", "Asset", { ident: "logseq.class/Asset" }),
    entity("codeClass", "Code", { ident: "logseq.class/Code-block" }),
    entity("mathClass", "Math", { ident: "logseq.class/Math-block" }),
    entity("quoteClass", "Quote", { ident: "logseq.class/Quote-block" }),
    entity("research", "Research", { name: "research", tags: ["class"] }),
    entity("ideas", "Ideas", { name: "ideas", tags: ["class"] }),
    entity("A", "Knowledge systems", {
      name: "knowledge systems",
      tags: ["research"],
    }),
    entity("B", "Connected thinking", {
      name: "connected thinking",
      tags: ["ideas"],
    }),
    entity("C", "Daily practice", { name: "daily practice" }),
    entity("a0", "How ideas connect", { parentId: "A", pageId: "A" }),
    entity("a1", "A reference keeps its source", {
      parentId: "a0",
      pageId: "A",
      refs: ["B", "b2"],
      tags: ["research", "ideas", "codeClass"],
    }),
    entity("b0", "Connections", { parentId: "B", pageId: "B" }),
    entity("b2", "A block is a node of its own", {
      parentId: "b0",
      pageId: "B",
      tags: ["ideas", "quoteClass"],
    }),
    entity("c1", "Embedded original", {
      parentId: "C",
      pageId: "C",
      linkId: "b2",
    }),
    entity("a3", "A second observation", {
      parentId: "A",
      pageId: "A",
      tags: ["research"],
      refs: ["c1", "asset"],
    }),
    entity("asset", "Reference guide.pdf", {
      parentId: "A",
      pageId: "A",
      tags: ["assetClass"],
      assetType: "pdf",
    }),
  ]);
}
