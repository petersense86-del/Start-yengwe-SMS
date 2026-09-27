import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// After a new version is deployed, an open tab may ask for page code that no
// longer exists. Reload once to pick up the new version instead of breaking.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "ypms-reloaded-at";
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10_000) return; // already tried; avoid a reload loop
    sessionStorage.setItem(key, String(Date.now()));
  } catch { /* storage blocked; reload anyway */ }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
