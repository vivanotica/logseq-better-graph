import { NodeKind } from "./model";

const light: Record<NodeKind, string> = {
  page: "#7c3aed",
  block: "#059669",
  journal: "#d97706",
};

const dark: Record<NodeKind, string> = {
  page: "#a78bfa",
  block: "#34d399",
  journal: "#fbbf24",
};

export function nodeColor(kind: NodeKind, isDark: boolean): string {
  return (isDark ? dark : light)[kind];
}
