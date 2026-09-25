import "@logseq/libs";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
const preview =
  import.meta.env.DEV && new URLSearchParams(location.search).has("preview");
function main() {
  const root = createRoot(document.getElementById("app")!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  if (preview) return;
  const show = () => logseq.showMainUI({ autoFocus: true });
  logseq.provideModel({ show });
  logseq.setMainUIInlineStyle({ zIndex: 100 });
  logseq.App.registerUIItem("toolbar", {
    key: "better-graph-open",
    template:
      '<a data-on-click="show" title="Better Graph" aria-label="Open Better Graph"><i class="ti ti-chart-dots-3"></i></a>',
  });
  logseq.App.registerCommandPalette(
    {
      key: "better-graph-open",
      label: "Better Graph: Open pages, blocks & tags",
    },
    show,
  );
  logseq.beforeunload(async () => {
    root.unmount();
  });
}
if (preview) main();
else logseq.ready(main).catch(console.error);
