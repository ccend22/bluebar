import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for secrets a business gives us (its BlueBill token). The key lives only
// in the server environment, so a database dump alone reveals nothing. `context` (the
// tenant schema) is authenticated too: a row copied into another business won't open.
const keyOf = (secret) => createHash("sha256").update(secret).digest();

export function seal(secret, text, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

// Throws if the key, the context or the ciphertext don't match.
export function open(secret, sealed, context) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1") throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
