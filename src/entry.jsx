import "./uuid.js";
import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./Landing.jsx";
import { Login } from "./Login.jsx";
import { launch } from "./pwa.js";
import "./style.css";

// Visitors can read the public page without loading the POS or checking a session.
// Business links and installed-app launches retain the existing authenticated flow.
const AppRoot = lazy(() => import("./main.jsx").then(({ Root }) => ({ default: Root })));
const params = new URLSearchParams(window.location.search);
const appEntry = ["business", "source", "desktop"].some((key) => params.has(key));
const onboardingEntry = params.has("hyr") || params.has("regjistro");

if (launch()) {
  createRoot(document.getElementById("root")).render(
    appEntry ? (
      <Suspense fallback={<main className="database-setup"><span className="brand">BlueBar</span><p role="status">Po ngarkohet…</p></main>}>
        <AppRoot />
      </Suspense>
    ) : onboardingEntry ? (
      <Login onSignedIn={() => window.location.reload()} />
    ) : (
      <Landing />
    ),
  );
}
