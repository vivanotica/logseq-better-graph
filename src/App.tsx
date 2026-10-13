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
import { nodeColor } from "./graph/colors";
import { partitionTags, selectedNodeDetails } from "./graph/menu";
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
    [selectedDetailId, setSelectedDetailId] = useState<string | null>(null),
    [dark, setDark] = useState(false),
    [panel, setPanel] = useState(true),
    [tagQuery, setTagQuery] = useState(""),
    [nodeQuery, setNodeQuery] = useState(""),
    [tagFocus, setTagFocus] = useState<string | null>(null),
    [fitToken, setFitToken] = useState(0),
    [error, setError] = useState("");
  const [tagChoices, setTagChoices] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    token: number;
  } | null>(null);
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
    setSelectedDetailId(null);
    setFocusRequest(null);
    setTagChoices([]);
    setError("");
    setNodeQuery("");
    setTagFocus(null);
  }, [snapshot.graphKey]);
  const graph = useMemo(
    () =>
      snapshot.data
        ? filterGraph(snapshot.data, {
            selectedTagIds: settings.selectedTagIds,
            showJournals: settings.showJournals,
          })
        : null,
    [snapshot.data, settings.selectedTagIds, settings.showJournals],
  );
  const selectionDetails = useMemo(
    () => (graph ? selectedNodeDetails(graph, selected) : []),
    [graph, selected],
  );
  const activeDetail =
    selectionDetails.find(({ node }) => node.id === selectedDetailId) ??
    selectionDetails[0];
  const tagGroups = useMemo(
    () =>
      snapshot.data ? partitionTags(snapshot.data) : { builtIn: [], user: [] },
    [snapshot.data],
  );
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
      if (event.key !== "Escape") return;
      if (tagChoices.length) setTagChoices([]);
      else if (!selected.length) close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected.length, tagChoices.length]);
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
  const tags = tagGroups.user;
  const builtInTags = tagGroups.builtIn;
  const allTags = [...tags, ...builtInTags];
  const selectedTags = new Set(
    settings.selectedTagIds ?? allTags.map((t) => t.id),
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
            title="Graph settings"
          >
            ⚙
          </button>
          <button onClick={close} aria-label="Close graph" title="Close graph">
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
              focusRequest={focusRequest}
              onError={setError}
              onOpen={(node) => void open(node)}
              onSelectTags={(ids) => {
                setSelected([]);
                setTagFocus(null);
                if (ids.length === 1) {
                  updateSettings({ selectedTagIds: ids });
                  setTagChoices([]);
                } else setTagChoices(ids);
              }}
              onSelect={(id, add) => {
                setTagChoices([]);
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
                );
              }}
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
              <p>Try selecting all tags or including journal pages and blocks.</p>
              <button
                onClick={() =>
                  updateSettings({ selectedTagIds: null, showJournals: true })
                }
              >
                Show all
              </button>
            </div>
          )}
          <details className="graph-help">
            <summary
              aria-label="Graph legend and controls"
              title="Legend and controls"
            >
              ?
            </summary>
            <div className="graph-legend">
              <span>
                <i
                  className="node-page"
                  style={{ background: nodeColor("page", dark) }}
                />{" "}
                Page
              </span>
              <span>
                <i
                  className="node-block"
                  style={{ background: nodeColor("block", dark) }}
                />{" "}
                Block
              </span>
              <span>
                <i
                  className="node-journal"
                  style={{ background: nodeColor("journal", dark) }}
                />{" "}
                Journal
              </span>
              <span>
                <i
                  className="node-asset"
                  style={{ background: nodeColor("asset", dark) }}
                />{" "}
                Asset
              </span>
              <span>
                <i className="solid" /> Page connections →
              </span>
              <span>
                <i className="reference-line" /> Reference →
              </span>
              <span>
                <i className="embed-line" /> Embed →
              </span>
              <span>
                <i className="hierarchy-line" /> Parent–child
              </span>
              <span>
                <i className="region" /> Tag region
              </span>
            </div>
            <div className="graph-hint">
              Drag to move · Scroll to zoom · Click a region to filter tags ·
              Click to select · Double-click to open
            </div>
          </details>
          {!!tagChoices.length && (
            <div
              className="graph-selection"
              role="group"
              aria-label="Choose a tag"
            >
              <div className="selection-header">
                <div>
                  <strong>Choose a tag</strong>
                </div>
                <button
                  aria-label="Cancel tag selection"
                  onClick={() => setTagChoices([])}
                >
                  ×
                </button>
              </div>
              {tagChoices.map((id) => {
                const tag = tags.find((t) => t.id === id);
                return tag ? (
                  <button
                    key={id}
                    className="selected-node"
                    onClick={() => {
                      updateSettings({ selectedTagIds: [id] });
                      setTagChoices([]);
                    }}
                  >
                    #{tag.label}
                  </button>
                ) : null;
              })}
            </div>
          )}
          {activeDetail && (
            <div
              className="graph-selection"
              aria-live="polite"
              aria-label="Selected node details"
            >
              <div className="selection-header">
                <div>
                  <strong>{selectionDetails.length} selected</strong>
                </div>
                <button
                  aria-label="Clear selection"
                  onClick={() => setSelected([])}
                >
                  ×
                </button>
              </div>
              <article className="selection-detail">
                <div className="selection-meta">
                  <span
                    className={`selection-kind kind-${activeDetail.node.kind}`}
                    style={{
                      color: nodeColor(activeDetail.node.kind, dark),
                    }}
                  >
                    {activeDetail.node.kind}
                  </span>
                  <span className="selection-connections">
                    {activeDetail.connectionCount} direct{" "}
                    {activeDetail.connectionCount === 1
                      ? "connection"
                      : "connections"}
                  </span>
                </div>
                <h3>{activeDetail.node.label}</h3>
                <div className="selection-page">
                  <small>PAGE</small>
                  <span>
                    {activeDetail.node.kind === "page" ||
                    activeDetail.node.kind === "journal"
                      ? "Current page"
                      : activeDetail.pageLabel || "No page association"}
                  </span>
                </div>
                <div className="selection-tags">
                  <small>TAGS</small>
                  <div>
                    {activeDetail.tags.length ? (
                      activeDetail.tags.map((tag) => (
                        <span className="selection-tag" key={tag}>
                          #{tag}
                        </span>
                      ))
                    ) : (
                      <span className="selection-empty">No direct tags</span>
                    )}
                  </div>
                </div>
                <button
                  className="selection-open"
                  onClick={() => void open(activeDetail.node)}
                >
                  Open in Logseq <span aria-hidden="true">↗</span>
                </button>
              </article>
              {selectionDetails.length > 1 && (
                <div className="selection-list" aria-label="Selected nodes">
                  {selectionDetails.map(({ node }) => (
                    <button
                      key={node.id}
                      className={
                        node.id === activeDetail.node.id ? "active" : ""
                      }
                      aria-pressed={node.id === activeDetail.node.id}
                      onClick={() => setSelectedDetailId(node.id)}
                    >
                      <span
                        className={`selection-dot kind-${node.kind}`}
                        style={{ background: nodeColor(node.kind, dark) }}
                      />
                      <span>{node.label}</span>
                      <small>{node.kind}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        {panel && (
          <aside className="graph-settings" aria-label="Graph settings">
            <section>
              <input
                type="search"
                placeholder="Find a node"
                aria-label="Find a node"
                value={nodeQuery}
                onChange={(e) => setNodeQuery(e.target.value)}
              />
              {!!matches?.length && (
                <div className="node-results">
                  {matches.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelected([n.id]);
                        setSelectedDetailId(n.id);
                        setFocusRequest((old) => ({
                          id: n.id,
                          token: (old?.token ?? 0) + 1,
                        }));
                      }}
                    >
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
                Tags{" "}
                <small>
                  {allTags.filter((t) => selectedTags.has(t.id)).length}/
                  {allTags.length}
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
              <div className="tag-group-heading">
                <strong>My tags</strong>
                <small>{tags.length}</small>
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
              <div className="tag-group-heading default-tags-heading">
                <strong>Default tags</strong>
                <small>{builtInTags.length}</small>
              </div>
              <div className="tag-list" aria-label="Default tags">
                {builtInTags.map((tag) => (
                  <label className="tag-row" key={tag.id}>
                    <input
                      type="checkbox"
                      checked={selectedTags.has(tag.id)}
                      onChange={() => {
                        const next = new Set(selectedTags);
                        if (next.has(tag.id)) next.delete(tag.id);
                        else next.add(tag.id);
                        updateSettings({ selectedTagIds: [...next] });
                      }}
                    />
                    <i style={{ background: tag.color }} />
                    <span>{tag.label}</span>
                    <small>{tag.memberIds.length}</small>
                  </label>
                ))}
              </div>
            </section>
            <section>
              <h2>Layout</h2>
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
              <label
                className="journal-toggle"
                title="Include daily journal pages and their blocks in the graph. Tag filters still apply."
              >
                <input
                  type="checkbox"
                  checked={settings.showJournals}
                  onChange={(e) =>
                    updateSettings({ showJournals: e.target.checked })
                  }
                />{" "}
                Include journal pages &amp; blocks
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
