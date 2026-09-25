import { defaultSettings, GraphSettings } from "./model";
export function decodeSettings(value: unknown): GraphSettings {
  const v =
    value && typeof value === "object" ? (value as Partial<GraphSettings>) : {};
  const number = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.round(Math.min(max, Math.max(min, n)))
      : fallback;
  return {
    selectedTagIds: Array.isArray(v.selectedTagIds)
      ? [
          ...new Set(
            v.selectedTagIds.filter((s): s is string => typeof s === "string"),
          ),
        ]
      : null,
    linkDistance: number(v.linkDistance, 36, 180, 72),
    depth: number(v.depth, 1, 5, 1),
    showJournals: v.showJournals === true,
  };
}
export function loadSettings(key: string): GraphSettings {
  try {
    return decodeSettings(
      JSON.parse(localStorage.getItem(`better-graph:${key}`) ?? "null"),
    );
  } catch {
    return { ...defaultSettings };
  }
}
export function saveSettings(key: string, settings: GraphSettings) {
  try {
    localStorage.setItem(`better-graph:${key}`, JSON.stringify(settings));
  } catch {
    /* Private browsing or full storage must not prevent navigation. */
  }
}
