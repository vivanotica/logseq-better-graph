// SPDX-License-Identifier: AGPL-3.0-only
import { Entity } from "./model";
export type Query = (query: string) => Promise<unknown>;
// DB SDK strips block/db namespaces, retains hyphenated names, and prefixes other namespaces with a colon.
// Accept namespaced pulls as well for host-version compatibility.
const pull =
  "[:db/id :db/ident :block/uuid :block/name :block/title :block/journal-day :logseq.property/hide? :logseq.property/deleted-at :logseq.property/exclude-from-graph-view {:block/parent [:db/id]} {:block/page [:db/id]} {:block/refs [:db/id]} {:block/tags [:db/id]} {:block/link [:db/id]}]";
export const DB_PROBE = "[:find ?id :where [?id :db/ident :logseq.class/Page]]";
export const ENTITY_QUERY = `[:find (pull ?e ${pull}) :where [?e :block/uuid]]`;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function field(value: Record<string, unknown>, key: string) {
  return (
    value[key] ??
    value[":" + key] ??
    (/^(block|db)\//.test(key) ? value[key.split("/")[1]] : undefined)
  );
}
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function id(value: unknown): string | undefined {
  if (typeof value === "number" || typeof value === "string")
    return String(value);
  const r = record(value);
  const v = field(r, "db/id") ?? r.id;
  return typeof v === "number" || typeof v === "string" ? String(v) : undefined;
}
export function normalizeEntities(result: unknown): Entity[] {
  if (!Array.isArray(result))
    throw new Error("Logseq returned an invalid DB query result.");
  return result.map((row) => {
    const r = record(Array.isArray(row) ? row[0] : row);
    const entityId = id(r);
    if (!entityId) throw new Error("Logseq DB result is missing db/id.");
    const refs = (key: string) => {
      const v = field(r, key);
      return (Array.isArray(v) ? v : [])
        .map(id)
        .filter((x): x is string => x !== undefined);
    };
    const ident = text(field(r, "db/ident"))?.replace(/^:/, "");
    return {
      id: entityId,
      uuid: text(field(r, "block/uuid")),
      title:
        text(field(r, "block/full-title")) ??
        text(field(r, "block/title")) ??
        "",
      name: text(field(r, "block/name")),
      ident,
      parentId: id(field(r, "block/parent")),
      pageId: id(field(r, "block/page")),
      tags: refs("block/tags"),
      refs: refs("block/refs"),
      linkId: id(field(r, "block/link")),
      hidden: field(r, "logseq.property/hide?") === true,
      deleted: field(r, "logseq.property/deleted-at") !== undefined,
      excluded: field(r, "logseq.property/exclude-from-graph-view") === true,
      journal: field(r, "block/journal-day") !== undefined,
    };
  });
}
export class UnsupportedGraph extends Error {}
export async function readEntities(query: Query): Promise<Entity[]> {
  const probe = await query(DB_PROBE);
  if (!Array.isArray(probe))
    throw new Error("Could not check the current graph.");
  if (probe.length === 0)
    throw new UnsupportedGraph("Better Graph supports Logseq DB graphs only.");
  return normalizeEntities(await query(ENTITY_QUERY));
}
