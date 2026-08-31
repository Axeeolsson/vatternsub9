import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ensureSeeded } from "./db/db";
import { initSync } from "./db/sync";

ensureSeeded().finally(() => {
  // Offline-first: the app runs fully without this. If a Supabase session
  // exists (or arrives via magic link), this wires up cross-device sync.
  initSync();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
