import React, { useRef, useState } from "react";
import { Icon } from "./components.jsx";

// "Hyr me LuxHotel": the person signs in with their LuxHotel PMS account (Firebase Auth:
// email + password, or Google). BlueBar only takes the ID token Firebase gives back and
// lets its own server check it; the Firebase session is dropped right after.
const config = {
  apiKey: import.meta.env.VITE_LUXHOTEL_API_KEY,
  authDomain: import.meta.env.VITE_LUXHOTEL_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_LUXHOTEL_PROJECT_ID,
  appId: import.meta.env.VITE_LUXHOTEL_APP_ID,
};
export const luxhotelReady = Boolean(config.apiKey && config.projectId);

let firebase;
const load = async () => {
  // Loaded on the first press only: nobody else downloads Firebase.
  if (!firebase) {
    const [{ initializeApp }, auth] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    firebase = { ...auth, auth: auth.getAuth(initializeApp(config, "luxhotel")) };
  }
  return firebase;
};
const tokenOf = async (fb, credential) => {
  const token = await credential.user.getIdToken();
  await fb.signOut(fb.auth).catch(() => {});
  return token;
};
const MESSAGES = {
  "auth/invalid-credential": "Email-i ose fjalëkalimi i LuxHotel nuk është i saktë.",
  "auth/wrong-password": "Email-i ose fjalëkalimi i LuxHotel nuk është i saktë.",
  "auth/user-not-found": "Email-i ose fjalëkalimi i LuxHotel nuk është i saktë.",
  "auth/invalid-email": "Shkruani një email të vlefshëm.",
  "auth/user-disabled": "Kjo llogari LuxHotel është çaktivizuar.",
  "auth/too-many-requests": "Shumë përpjekje. Provoni pas pak minutash.",
  "auth/network-request-failed": "Nuk ka lidhje me LuxHotel. Kontrolloni internetin.",
  "auth/popup-blocked": "Shfletuesi bllokoi dritaren e Google. Lejoni dritaret për këtë faqe.",
  "auth/unauthorized-domain": "Kjo adresë nuk është e lejuar te LuxHotel. Shtojeni te Firebase → Authentication → Authorized domains.",
};
const quiet = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

export function LuxHotelMark({ size = 22 }) {
  return (
    <svg className="lux-mark" width={size * 1.5} height={size} viewBox="-20 0 120 80" aria-hidden="true">
      <g transform="skewX(-28)">
        <rect x="22" y="4" width="20" height="72" rx="10" fill="#d4d8dd" />
        <rect x="50" y="4" width="20" height="72" rx="10" fill="#1f8fe5" />
        <rect x="78" y="4" width="20" height="72" rx="10" fill="#7fd13b" />
      </g>
    </svg>
  );
}

// label: what the button says ("Hyr me LuxHotel" / "Regjistrohu me LuxHotel"); onToken gets
// the ID token and does the BlueBar part, throwing an Error whose message is shown.
export function LuxHotelButton({ label, onToken, variant = "button" }) {
  const dialog = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!luxhotelReady) return null;
  const run = async (signIn) => {
    setBusy(true);
    setError("");
    try {
      const fb = await load();
      await onToken(await tokenOf(fb, await signIn(fb)));
      dialog.current?.close();
    } catch (e) {
      if (!quiet.has(e.code)) setError(MESSAGES[e.code] || e.message || "Hyrja me LuxHotel nuk u krye.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={variant === "link" ? "lux-link" : "lux-button"} onClick={() => (setError(""), dialog.current?.showModal())}>
        <LuxHotelMark size={variant === "link" ? 14 : 18} />
        {label}
      </button>
      <dialog ref={dialog} className="lux-dialog" aria-labelledby="lux-title">
        <button type="button" className="icon-button lux-close" aria-label="Mbyll" onClick={() => dialog.current?.close()}>
          <Icon name="close" size={18} />
        </button>
        <header>
          <LuxHotelMark size={44} />
          <h2 id="lux-title">{label}</h2>
          <p>Përdorni llogarinë tuaj të LuxHotel System.</p>
        </header>
        {error && <p className="onboard-error" role="alert">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run((fb) => fb.signInWithEmailAndPassword(fb.auth, email.trim(), password));
          }}
        >
          <input className="onboard-input" type="email" aria-label="Email-i i LuxHotel" placeholder="Email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          <input className="onboard-input" type="password" aria-label="Fjalëkalimi i LuxHotel" placeholder="Fjalëkalimi" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
          <button className="onboard-primary" disabled={busy}>{busy ? "Po hyhet…" : "Vazhdo"}</button>
        </form>
        <div className="lux-or"><span>ose</span></div>
        <button type="button" className="lux-google" disabled={busy}
          onClick={() => run((fb) => fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()))}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Vazhdo me Google
        </button>
      </dialog>
    </>
  );
}
