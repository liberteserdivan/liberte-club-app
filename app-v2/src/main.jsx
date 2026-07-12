import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/tokens.css";
import "./styles/app.css";
import { warmApi } from "./services/bootService.js";
import { hideNativeSplash } from "./lib/nativeSplash.js";

warmApi().catch(() => {});

window.addEventListener("error", () => { hideNativeSplash(); });
window.addEventListener("unhandledrejection", () => { hideNativeSplash(); });

const rootEl = document.getElementById("root");
if (!rootEl) {
  hideNativeSplash();
  throw new Error("root elementi yok");
}

createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

setTimeout(() => { hideNativeSplash(); }, 2500);