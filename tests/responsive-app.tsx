import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/styles.css";

// Real production App, with only the root text scale changed for WCAG-oriented QA.
// Authentication, data access, and session authorization remain unchanged.
if (new URLSearchParams(location.search).get("text") === "200") document.documentElement.style.fontSize="32px";
const root=createRoot(document.getElementById("root")!);
root.render(<App />);
import.meta.hot?.dispose(()=>root.unmount());
