/// <reference types="vite-plugin-pwa/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import "./design.css";

// Registrer service worker og se etter ny versjon hver time,
// slik at PWA-en ikke blir sittende fast på gammel kode.
try {
  const updateSW = registerSW({ immediate: true });
  setInterval(() => updateSW(), 60 * 60 * 1000);
} catch {
  // Ingen service worker (f.eks. i dev) – helt ok.
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
