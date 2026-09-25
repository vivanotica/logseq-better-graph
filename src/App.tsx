import React, { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { useAppVisible } from "./utils";
import {
  defaultSettings,
  filterGraph,
  GraphNode,
  GraphSettings,
} from "./graph/model";
import { createGraphController, Snapshot } from "./graph/controller";
import { loadSettings, saveSettings } from "./graph/settings";
import { previewGraph } from "./graph/fixture";
const preview =
  import.meta.env.DEV && new URLSearchParams(location.search).has("preview");
function GraphScreen() {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    preview
      ? {
          graphKey: "preview",
          graphName: "Preview · sample data",
          data: previewGraph(),
          status: "ready",
        }
      : { graphKey: "", graphName: "", data: null, status: "loading" },
  );
  const [settingsState, setSettingsState] = useState<{
    key: string;
    value: GraphSettings;
  }>({ key: "", value: defaultSettings });
  const [selected, setSelected] = useState<string[]>([]),
    [dark, setDark] = useState(false),
    [panel, setPanel] = useState(true),
    [tagQuery, setTagQuery] = useState(""),
    [nodeQuery, setNodeQuery] = useState(""),
    [tagFocus, setTagFocus] = useState<string | null>(null),
    [fitToken, setFitToken] = useState(0),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const settings = useMemo(
    () =>
      settingsState.key === snapshot.graphKey
        ? settingsState.value
        : loadSettings(snapshot.graphKey),
    [settingsState, snapshot.graphKey],
  );
  const updateSettings = (patch: Partial<GraphSettings>) => {
    const next = { ...settings, ...patch };
    setSettingsState({ key: snapshot.graphKey, value: next });
    saveSettings(snapshot.graphKey, next);
  };
  useEffect(() => {
    if (preview) return;
    const controller = createGraphController(
      {
        currentGraph: () => logseq.App.getCurrentGraph(),
        query: (q) => logseq.DB.datascriptQuery(q),
        onChanged: (cb) => logseq.DB.onChanged(cb),
        onGraphChanged: (cb) => logseq.App.onCurrentGraphChanged(cb),
      },
      setSnapshot,
    );
    return controller.dispose;
  }, [retry]);
  useEffect(() => {
    if (preview) return;
    let disposed = false;
    logseq.App.getUserConfigs()
      .then((c) => {
        if (!disposed) setDark(c.preferredThemeMode === "dark");
      })
      .catch(() => {});
    const off = logseq.App.onThemeModeChanged(({ mode }) =>
      setDark(mode === "dark"),
    );
    const offTheme = logseq.App.onThemeChanged(({ mode }) => {
      if (mode) setDark(mode === "dark");
    });
    return () => {
      disposed = true;
      off();
      offTheme();
    };
  }, []);
  useEffect(() => {
    setSelected([]);
    setError("");
    setNodeQuery("");
    setTagFocus(null);
  }, [snapshot.graphKey]);
  const graph = useMemo(
    () => (snapshot.data ? filterGraph(snapshot.data, settings) : null),
    [snapshot.data, settings],
  );
  const selectedNodes =
    graph?.nodes.filter((n) => selected.includes(n.id)) ?? [];
  useEffect(() => {
    if (graph)
      setSelected((old) => {
        const ids = new Set(graph.nodes.map((n) => n.id));
        const next = old.filter((id) => ids.has(id));
        return next.length === old.length ? old : next;
      });
  }, [graph]);
  const close = () => {
    if (!preview) logseq.hideMainUI();
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !selected.length) close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected.length]);
  const open = async (node: GraphNode) => {
    if (preview) {
      setError(
        "Sample data only. Install the plugin in Logseq to open real nodes.",
      );
      return;
    }
    if (!node.uuid) {
      setError("This node has no UUID and cannot be opened.");
      return;
    }
    try {
      await logseq.App.pushState("page", { name: node.uuid });
      logseq.hideMainUI();
    } catch (e) {
      setError(`Could not open node: ${String(e)}`);
    }
  };
  const tags = snapshot.data?.regions ?? [];
  const selectedTags = new Set(
    settings.selectedTagIds ?? tags.map((t) => t.id),
  );
  const matches = nodeQuery.trim()
    ? graph?.nodes
        .filter((n) =>
          n.label.toLocaleLowerCase().includes(nodeQuery.toLocaleLowerCase()),
        )
        .slice(0, 40)
    : [];
  return (
    <main className={`better-graph ${dark ? "dark" : ""}`}>
      <header className="graph-header">
        <div className="graph-heading">
          <span className="graph-mark">⌘</span>
          <div>
            <h1>Better Graph</h1>
            <p>
              {snapshot.graphName || "Logseq DB"}{" "}
              <span>Pages, blocks & tags</span>
            </p>
          </div>
        </div>
        <div className="graph-toolbar">
          {snapshot.status === "loading" && (
            <span className="loading-label" role="status">
              Updating…
            </span>
          )}
          {preview && <button onClick={() => setDark((v) => !v)}>Theme</button>}
          <button
            onClick={() => setFitToken((v) => v + 1)}
            title="Fit graph (F)"
            aria-label="Fit graph"
          >
            ⤢
          </button>
          <button
            onClick={() => setPanel((v) => !v)}
            aria-expanded={panel}
            aria-label="Graph settings"
          >
            ⚙
          </button>
          <button onClick={close} aria-label="Close graph">
            ×
          </button>
        </div>
      </header>
      <div className="graph-body">
        <section className="graph-stage">
          {graph && graph.nodes.length > 0 && (
            <GraphCanvas
              key={snapshot.graphKey}
              graph={graph}
              distance={settings.linkDistance}
              depth={settings.depth}
              selected={selected}
              dark={dark}
              tagFocus={tagFocus}
              fitToken={fitToken}
              onError={setError}
              onOpen={(node) => void open(node)}
              onSelect={(id, add) =>
                setSelected((old) =>
                  id === null
                    ? []
                    : add
                      ? old.includes(id)
                        ? old.filter((n) => n !== id)
                        : [...old, id]
                      : old.length === 1 && old[0] === id
                        ? []
                        : [id],
                )
              }
            />
          )}
          {!graph && snapshot.status === "loading" && (
            <div className="graph-message" role="status">
              <h2>Building your graph</h2>
              <p>Reading pages, blocks and their connections…</p>
            </div>
          )}
          {(snapshot.status === "error" ||
            snapshot.status === "unsupported") && (
            <div className="graph-message" role="alert">
              <h2>
                {snapshot.status === "unsupported"
                  ? "Logseq DB required"
                  : "Could not load graph"}
              </h2>
              <p>{snapshot.error}</p>
              <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
            </div>
          )}
          {graph && graph.nodes.length === 0 && (
            <div className="graph-message">
              <h2>No nodes to display</h2>
              <p>Try selecting all tags or showing journals.</p>
              <button
                onClick={() =>
                  updateSettings({ selectedTagIds: null, showJournals: true })
                }
              >
                Show all
              </button>
            </div>
          )}
          <div className="graph-legend">
            <span>
              <i className="solid" /> Parent / child
            </span>
            <span>
              <i className="dashed" /> Reference / embed
            </span>
            <span>
              <i className="region" /> Tag region
            </span>
          </div>
          <div className="graph-hint">
            Drag to move · Scroll to zoom · Click to select · Double-click to
            open
          </div>
          {!!selectedNodes.length && (
            <div className="graph-selection" aria-live="polite">
              <div>
                <strong>{selectedNodes.length} selected</strong>
                <button
                  aria-label="Clear selection"
                  onClick={() => setSelected([])}
                >
                  ×
                </button>
              </div>
              {selectedNodes.map((n) => (
                <button
                  className="selected-node"
                  key={n.id}
                  onClick={() => void open(n)}
                >
                  {n.label}
                  <span>↗</span>
                </button>
              ))}
              <p>
                {selectedNodes[0].tagIds
                  .map((t) => tags.find((r) => r.id === t)?.label)
                  .filter(Boolean)
                  .map((label) => "#" + label)
                  .join(" · ") || "No direct tags"}
              </p>
            </div>
          )}
        </section>
        {panel && (
          <aside className="graph-settings" aria-label="Graph settings">
            <section>
              <h2>View mode</h2>
              <div className="mode-active">Pages, blocks & tags</div>
              <p className="muted">Original hierarchy. Shared tag regions.</p>
            </section>
            <section>
              <h2>Find a node</h2>
              <input
                type="search"
                placeholder="Search pages and blocks"
                aria-label="Find a node"
                value={nodeQuery}
                onChange={(e) => setNodeQuery(e.target.value)}
              />
              {!!matches?.length && (
                <div className="node-results">
                  {matches.map((n) => (
                    <button key={n.id} onClick={() => setSelected([n.id])}>
                      {n.label}
                      <small>{n.kind}</small>
                    </button>
                  ))}
                </div>
              )}
              {nodeQuery && !matches?.length && (
                <p className="muted">No matching visible nodes.</p>
              )}
            </section>
            <section>
              <h2>
                Displayed tags{" "}
                <small>
                  {tags.filter((t) => selectedTags.has(t.id)).length}/
                  {tags.length}
                </small>
              </h2>
              <input
                type="search"
                placeholder="Search tags"
                aria-label="Search tags"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
              />
              <div className="tag-actions">
                <button
                  onClick={() => updateSettings({ selectedTagIds: null })}
                >
                  Select all
                </button>
                <button onClick={() => updateSettings({ selectedTagIds: [] })}>
                  Clear
                </button>
              </div>
              <div className="tag-list">
                {tags
                  .filter((t) =>
                    t.label
                      .toLocaleLowerCase()
                      .includes(tagQuery.toLocaleLowerCase()),
                  )
                  .map((t) => (
                    <label
                      key={t.id}
                      className="tag-row"
                      onMouseEnter={() => setTagFocus(t.id)}
                      onMouseLeave={() => setTagFocus(null)}
                      onFocus={() => setTagFocus(t.id)}
                      onBlur={() => setTagFocus(null)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTags.has(t.id)}
                        onChange={() => {
                          const next = new Set(selectedTags);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          updateSettings({ selectedTagIds: [...next] });
                        }}
                      />
                      <i style={{ background: t.color }} />
                      <span>{t.label}</span>
                      <small>{t.memberIds.length}</small>
                    </label>
                  ))}
              </div>
              <p className="muted">
                Select all also includes untagged nodes. Hover a tag to
                highlight actual members.
              </p>
            </section>
            <section>
              <h2>
                Layout <small>Force</small>
              </h2>
              <div className="graph-stats">
                <span>{graph?.nodes.length ?? 0} nodes</span>
                <span>{graph?.edges.length ?? 0} links</span>
              </div>
              <label className="slider-label">
                Depth <strong>{settings.depth}</strong>
                <input
                  type="range"
                  min="1"
                  max="5"
                  disabled={!selected.length}
                  value={settings.depth}
                  onChange={(e) =>
                    updateSettings({ depth: Number(e.target.value) })
                  }
                />
              </label>
              <label className="slider-label">
                Link distance <strong>{settings.linkDistance}</strong>
                <input
                  type="range"
                  min="36"
                  max="180"
                  step="6"
                  value={settings.linkDistance}
                  onChange={(e) =>
                    updateSettings({ linkDistance: Number(e.target.value) })
                  }
                />
              </label>
              <label className="journal-toggle">
                <input
                  type="checkbox"
                  checked={settings.showJournals}
                  onChange={(e) =>
                    updateSettings({ showJournals: e.target.checked })
                  }
                />{" "}
                Show journals
              </label>
            </section>
          </aside>
        )}
      </div>
      {error && (
        <div className="graph-toast" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </main>
  );
}
export default function App() {
  const visible = useAppVisible();
  return visible || preview ? <GraphScreen /> : null;
}
