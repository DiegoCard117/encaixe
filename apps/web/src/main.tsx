import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LocaleProvider } from "./i18n";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { readConnectionLink } from "./sync/supabase";

// Link de conexão: nada é salvo aqui. A pessoa confirma o projeto antes (ConnectionPrompt),
// porque um link pode apontar para o Supabase de outra pessoa.
if (location.hash === "#/conectar" || location.hash.startsWith("#/conectar?")) {
  const connection = readConnectionLink(location.hash);
  try {
    if (connection) sessionStorage.setItem("encaixe.pendingConnection", JSON.stringify(connection));
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
