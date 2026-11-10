import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LocaleProvider } from "./i18n";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { clearLastSync, loadSyncConfig, readConnectionLink, saveSyncConfig } from "./sync/supabase";

if (location.hash === "#/conectar" || location.hash.startsWith("#/conectar?")) {
  const connection = readConnectionLink(location.hash);
  try {
    if (connection) {
      if (loadSyncConfig()?.url !== connection.config.url) clearLastSync();
      if (saveSyncConfig(connection.config)) {
        if (connection.email) sessionStorage.setItem("encaixe.connectEmail", connection.email);
        else sessionStorage.removeItem("encaixe.connectEmail");
        sessionStorage.setItem("encaixe.openSettings", "1");
      }
    }
  } catch {
    /* Storage may be unavailable. */
  } finally {
    history.replaceState(history.state, "", location.pathname + location.search + "#/");
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
