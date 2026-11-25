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
// BlueSquare's superadmin (/admin), loaded only there.
const AdminRoot = lazy(() => import("./Admin.jsx").then(({ AdminRoot }) => ({ default: AdminRoot })));
const adminEntry = window.location.pathname.replace(/\/+$/, "") === "/admin";
// The admin's code arrives as its own file: while it does, say so; if it can't (an old copy
// cached by the browser, a dropped connection), say that too and offer a fresh load.
class AdminLoadError extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <main className="database-setup"><span className="brand">BlueBar Admin</span><p role="alert">Paneli nuk u ngarkua.</p>
        <button type="button" onClick={() => window.location.reload()}>Rifresko</button></main>
    ) : this.props.children;
  }
}
const AdminLoad = () => (
  <AdminLoadError>
    <Suspense fallback={<main className="database-setup"><span className="brand">BlueBar Admin</span><p role="status">Po ngarkohet…</p></main>}>
      <AdminRoot />
    </Suspense>
  </AdminLoadError>
);
const params = new URLSearchParams(window.location.search);
const appEntry = ["business", "source", "desktop"].some((key) => params.has(key));
const onboardingEntry = params.has("hyr") || params.has("regjistro");

if (launch()) {
  createRoot(document.getElementById("root")).render(
    adminEntry ? (
      <AdminLoad />
    ) : appEntry ? (
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
