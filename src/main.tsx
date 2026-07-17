import React from "react";
import { createRoot } from "react-dom/client";
import { SpeechDeckApp } from "../app/SpeechDeckApp";
import "../app/globals.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SpeechDeckApp />
  </React.StrictMode>,
);
