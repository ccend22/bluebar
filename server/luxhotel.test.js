import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyLuxHotelToken } from "./luxhotel.js";

// A token signed like Firebase signs one, with a key of our own standing in for Google's.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keys = async () => [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" }];
const now = 1_800_000_000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (claims, header = { alg: "RS256", kid: "k1" }) => {
  const body = `${b64(header)}.${b64({ aud: "pms-test", iss: "https://securetoken.google.com/pms-test", sub: "uid-1",
    iat: now - 10, auth_time: now - 10, exp: now + 3600, email: "a@hotel.al", ...claims })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
};
const check = (token) => verifyLuxHotelToken(token, "pms-test", keys, now);

test("a LuxHotel token is trusted only when Google signed it for LuxHotel and it is current", async () => {
  assert.deepEqual(await check(sign({})), { uid: "uid-1", email: "a@hotel.al", name: "" });
  await assert.rejects(check(sign({ aud: "other-project", iss: "https://securetoken.google.com/other-project" })), /nuk u pranua/);
  await assert.rejects(check(sign({ exp: now - 1 })), /nuk u pranua/);
  await assert.rejects(check(sign({ sub: "" })), /nuk u pranua/);
  await assert.rejects(check(sign({}, { alg: "none", kid: "k1" })), /nuk u pranua/);
  await assert.rejects(check(sign({}, { alg: "RS256", kid: "unknown" })), /nuk u pranua/);
  // Claims changed after signing: the signature no longer matches.
  const [h, , s] = sign({}).split(".");
  await assert.rejects(check(`${h}.${b64({ sub: "someone-else" })}.${s}`), /nuk u pranua/);
  await assert.rejects(check("not-a-token"), /nuk u pranua/);
  await assert.rejects(verifyLuxHotelToken(sign({}), "", keys, now), /nuk është konfiguruar/);
});
