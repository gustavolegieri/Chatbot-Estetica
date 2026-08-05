import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Recarrega automaticamente quando um chunk lazy fica com hash antigo
// após um novo deploy (evita tela branca em abas que estavam abertas).
const RELOAD_KEY = "__chunk_reload_at";
const shouldReload = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);

const tryReload = () => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return; // evita loop
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
};

window.addEventListener("error", (e) => {
  if (e?.message && shouldReload(e.message)) tryReload();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e as any)?.reason?.message || (e as any)?.reason || "");
  if (shouldReload(msg)) tryReload();
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

