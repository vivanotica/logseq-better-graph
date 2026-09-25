import { GraphData, buildGraph } from "./model";
import { Query, readEntities, UnsupportedGraph } from "./source";
export interface Snapshot {
  graphKey: string;
  graphName: string;
  data: GraphData | null;
  status: "loading" | "ready" | "unsupported" | "error";
  error?: string;
}
export interface GraphHost {
  currentGraph: () => Promise<{ url: string; name: string } | null>;
  query: Query;
  onChanged: (callback: () => void) => () => void;
  onGraphChanged: (callback: () => void) => () => void;
}
// Only the most recent request may publish. Graph switches invalidate requests immediately.
export function createGraphController(
  host: GraphHost,
  publish: (snapshot: Snapshot) => void,
  delay = 250,
) {
  let disposed = false,
    generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let current: Snapshot = {
    graphKey: "",
    graphName: "",
    data: null,
    status: "loading",
  };
  function emit(value: Snapshot) {
    current = value;
    publish(value);
  }
  async function refresh() {
    if (disposed) return;
    const token = ++generation;
    try {
      const info = await host.currentGraph();
      if (disposed || token !== generation) return;
      if (!info) {
        emit({
          graphKey: "",
          graphName: "",
          data: null,
          status: "error",
          error: "Open a Logseq DB graph first.",
        });
        return;
      }
      const same = info.url === current.graphKey;
      emit({
        graphKey: info.url,
        graphName: info.name,
        data: same ? current.data : null,
        status: "loading",
      });
      const entities = await readEntities(host.query);
      const after = await host.currentGraph();
      if (disposed || token !== generation) return;
      if (after?.url !== info.url) {
        schedule(true);
        return;
      }
      emit({
        graphKey: info.url,
        graphName: info.name,
        data: buildGraph(entities),
        status: "ready",
      });
    } catch (error) {
      if (!disposed && token === generation)
        emit({
          ...current,
          data: null,
          status: error instanceof UnsupportedGraph ? "unsupported" : "error",
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  function schedule(switched = false) {
    if (disposed) return;
    generation++;
    clearTimeout(timer);
    if (switched)
      emit({ graphKey: "", graphName: "", data: null, status: "loading" });
    timer = setTimeout(
      () => {
        void refresh();
      },
      switched ? 0 : delay,
    );
  }
  const offData = host.onChanged(() => schedule()),
    offGraph = host.onGraphChanged(() => schedule(true));
  void refresh();
  return {
    refresh: () => {
      clearTimeout(timer);
      void refresh();
    },
    dispose: () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      offData();
      offGraph();
    },
  };
}
