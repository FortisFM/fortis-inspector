import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for offline launch and push notifications.
// Wrapped in a guard so the app still runs where service workers are not
// available (for example inside some sandboxed preview frames).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", document.baseURI).toString();
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn("Service worker registration skipped:", err?.message || err);
    });
  });
}
