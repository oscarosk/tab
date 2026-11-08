import "./polyfill";
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Load the app after the Buffer polyfill is in place.
import("./App").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
