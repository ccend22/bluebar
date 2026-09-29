import { useEffect, useState } from "react";

const LAST_BUSINESS = "bluebar-last-business";
const INSTALL_DISMISSED = "bluebar-install-dismissed";
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the app still works, it just won't remember this.
  }
};

// Runs before the first render. The installed app always opens at the manifest's
// start_url ("/?source=pwa"), which has no venue in it — send it back to the venue
// this device last used instead of the "enter business code" screen.
// Returns false when it's navigating away (nothing to render).
export function launch() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("business")) write(LAST_BUSINESS, params.get("business"));
  else if (params.has("source")) {
    const last = read(LAST_BUSINESS);
    if (last) {
      window.location.replace(`/?business=${encodeURIComponent(last)}`);
      return false;
    }
  }
  // Production only: in development Vite serves unbundled modules the worker must not cache.
  if ("serviceWorker" in navigator && import.meta.env.PROD)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  return true;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
// iPadOS reports itself as a Mac; touch support gives it away.
const apple = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Chrome/Edge/Android offer a real install prompt; iPhone/iPad only install from the
// Share menu, so there the offer is a short how-to instead.
export function useInstall() {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => standalone() || read(INSTALL_DISMISSED) === "1");
  useEffect(() => {
    const offer = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const installed = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const dismiss = () => {
    write(INSTALL_DISMISSED, "1");
    setHidden(true);
  };
  if (hidden) return null;
  if (prompt)
    return {
      kind: "prompt",
      install: async () => {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        setPrompt(null);
        if (outcome === "accepted") setHidden(true);
      },
      dismiss,
    };
  if (apple()) return { kind: "ios", dismiss };
  return null;
}
