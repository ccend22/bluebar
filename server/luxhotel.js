import { createPublicKey, createVerify } from "node:crypto";
import { AppError } from "./commands.js";

// "Hyr me LuxHotel": the person signs in to LuxHotel (Firebase Auth of the LuxHotel PMS) in
// the browser; BlueBar receives Firebase's ID token and checks it here, as Firebase
// documents: RS256 signed by one of Google's current keys, for the LuxHotel project, not
// expired. Only then is the LuxHotel account (its uid) trusted.
const KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cache = { keys: null, until: 0 };
async function googleKeys() {
  if (cache.keys && Date.now() < cache.until) return cache.keys;
  const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new AppError("LuxHotel nuk u verifikua. Provoni pas pak.", 503);
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
  cache = { keys: (await response.json()).keys, until: Date.now() + maxAge * 1000 };
  return cache.keys;
}

const part = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
export async function verifyLuxHotelToken(token, projectId, keys = googleKeys, now = Date.now() / 1000) {
  const invalid = () => new AppError("Hyrja me LuxHotel nuk u pranua. Provoni përsëri.", 401);
  if (!projectId) throw new AppError("Hyrja me LuxHotel nuk është konfiguruar në server.", 503);
  const pieces = typeof token === "string" ? token.split(".") : [];
  if (pieces.length !== 3) throw invalid();
  let header, claims;
  try { [header, claims] = [part(pieces[0]), part(pieces[1])]; } catch { throw invalid(); }
  const jwk = header.alg === "RS256" && (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) throw invalid();
  const ok = createVerify("RSA-SHA256").update(`${pieces[0]}.${pieces[1]}`)
    .verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(pieces[2], "base64url"));
  if (
    !ok ||
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
    !(claims.exp > now) || !(claims.iat <= now + 60) || !(claims.auth_time <= now + 60)
  ) throw invalid();
  return { uid: claims.sub, email: claims.email || "", name: claims.name || "" };
}
