import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTargetError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { cookieName, findSession, readCookie } from "./auth.js";
import { tenantPool, validSlug } from "./tenants.js";
import { MCP_SCOPE, MCP_SALES_SCOPE, MCP_SCOPES } from "./mcp-tools.js";

const ACCESS_SECONDS = 3600;
const secret = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("base64url");
const isToken = (value) => typeof value === "string" && /^[\w-]{43}$/.test(value);
const clientName = (redirect) => {
  const { hostname } = new URL(redirect);
  if (hostname === "chatgpt.com") return "ChatGPT";
  if (hostname === "claude.ai") return "Claude";
  return hostname;
};

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

function page(response, title, body, status = 200) {
  response.status(status).type("html").send(`<!doctype html>
<html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · BlueBar</title>
<style>
:root{font:16px system-ui,sans-serif;color:#142637;background:#f4f6f8}
main{box-sizing:border-box;max-width:32rem;margin:6vh auto;padding:1.75rem;background:#fff;border:1px solid #dfe4e8;border-radius:1rem}
h1{font-size:1.6rem;line-height:1.15}p,li{line-height:1.5}
form{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center;margin-top:1rem}
label{width:100%;display:grid;gap:.45rem}input,button{font:inherit;padding:.65rem .85rem;border:1px solid #a9b6c3;border-radius:.5rem;background:#fff;color:inherit;min-height:2.75rem;box-sizing:border-box}
button{cursor:pointer}button[value=allow]{background:#0057ad;color:white;border-color:#0057ad}
a{color:#0057ad}.return-link{display:inline-block;padding:.7rem .9rem;border-radius:.5rem;background:#0057ad;color:white;text-decoration:none}.brand{color:#0057ad;font-size:1.25rem;letter-spacing:-.04em}footer{border-top:1px solid #dfe4e8;margin-top:1.25rem;padding-top:.85rem}
@media(max-width:36rem){main{margin:1rem}}
</style><main><b class="brand">BlueBar</b><h1>${escape(title)}</h1>${body}</main></html>`);
}

export function createMcpOAuth({ pool, resource, signingKey, redirects, secureCookies }) {
  const issuer = new URL("/", resource).href;
  const allowed = new Set(redirects);
  const mac = (kind, data) => createHmac("sha256", signingKey).update(kind).update(".").update(data).digest("base64url");
  const pack = (kind, value) => {
    const body = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${body}.${mac(kind, body)}`;
  };
  const unpack = (kind, packed) => {
    if (typeof packed !== "string" || packed.length > 11000) return null;
    const parts = packed.split(".");
    if (parts.length !== 2 || !isToken(parts[1])) return null;
    const [body, sig] = parts;
    if (!timingSafeEqual(Buffer.from(mac(kind, body)), Buffer.from(sig))) return null;
    try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
    catch { return null; }
  };
  const requireResource = (requested) => {
    // Some clients omit resource on exchange. Every credential still has a fixed audience.
    if (requested && requested.href !== resource.href) throw new InvalidTargetError("Resource does not match BlueBar.");
  };
  const readScopes = (scopes) => {
    if (scopes?.some((scope) => scope && !MCP_SCOPES.includes(scope))) throw new InvalidScopeError("Requested scope is not supported.");
    return scopes?.includes(MCP_SALES_SCOPE) ? MCP_SCOPES : [MCP_SCOPE];
  };
  const clientStore = {
    registerClient(metadata) {
      const method = metadata.token_endpoint_auth_method || "client_secret_post";
      if (metadata.redirect_uris.length !== 1 || !allowed.has(metadata.redirect_uris[0]) ||
        !["none", "client_secret_post"].includes(method)) {
        throw new InvalidClientMetadataError("Register one allowed HTTPS callback and a supported authentication method.");
      }
      const clientId = pack("client", { redirect: metadata.redirect_uris[0], method, nonce: randomUUID(), issuer });
      return this.getClient(clientId);
    },
    getClient(clientId) {
      const client = unpack("client", clientId);
      if (!client || client.issuer !== issuer || !allowed.has(client.redirect)) return undefined;
      return {
        client_id: clientId,
        client_name: clientName(client.redirect),
        redirect_uris: [client.redirect],
        token_endpoint_auth_method: client.method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: MCP_SCOPES.join(" "),
        ...(client.method === "client_secret_post" && {
          client_secret: mac("client-secret", clientId), client_secret_expires_at: 0,
        }),
      };
    },
  };

  const managerAt = async (request, slug) => {
    if (!validSlug(slug)) return null;
    const session = readCookie(request, cookieName(secureCookies, slug));
    if (!isToken(session)) return null;
    const { rows: [venue] } = await pool.query("SELECT slug, name, schema_name FROM bluebar_catalog.venues WHERE slug=$1", [slug]);
    if (!venue) return null;
    const user = await findSession(tenantPool(pool, venue.schema_name), session);
    return user?.role === "manager" ? { venue, user } : null;
  };
  const returnToClient = (response, grant, params) => {
    const url = new URL(grant.redirect);
    if (grant.state !== undefined) url.searchParams.set("state", grant.state);
    for (const [key, value] of Object.entries({ ...params, iss: issuer })) url.searchParams.set(key, value);
    const name = clientName(grant.redirect);
    // A new document lets the user follow a GET link. Some browsers apply the
    // original form's navigation policy to cross-origin POST redirect chains.
    response.set("Referrer-Policy", "no-referrer");
    page(response, params.code ? "Qasja u miratua" : "Lidhja u anulua", `
      <p>${params.code ? "Kthehuni te aplikacioni për të përfunduar lidhjen." : "Mund të ktheheni te aplikacioni."}</p>
      <p><a class="return-link" href="${escape(url.href)}">Vazhdo te ${escape(name)}</a></p>`);
  };
  const consentPage = (response, ticket, grant, slug = "", signIn = false) => {
    const signinHint = signIn
      ? `<p>Hyni si menaxher në <a href="/?business=${escape(slug)}" target="_blank" rel="noopener">BlueBar për këtë biznes</a>, pastaj kthehuni këtu për të dhënë lejen.</p>`
      : "";
    page(response, `Lidh ${clientName(grant.redirect)} me BlueBar`, `
      <p>Lejo qasje vetëm për lexim te tavolinat, stoku dhe oraret e rezervimeve të një biznesi.</p>
      ${grant.scopes?.includes(MCP_SALES_SCOPE) ? "<p>Kjo leje përfshin edhe raportin e shitjeve me xhiron, rimbursimet dhe produktet më të shitura.</p>" : ""}
      <p>Emrat dhe telefonat e rezervimeve përjashtohen. Mund ta shkëputni lidhjen kur të doni.</p>
      ${signinHint}
      <form method="post" action="/oauth/bluebar/consent">
        <input type="hidden" name="ticket" value="${escape(ticket)}">
        <label>Kodi i biznesit<input name="business" value="${escape(slug)}" maxlength="40" autocomplete="off" autocapitalize="none" required></label>
        <button name="decision" value="deny" formnovalidate>Anulo</button>
        <button name="decision" value="allow">Lejo leximin</button>
      </form>
      <footer><a href="/oauth/bluebar/connections">Menaxho lidhjet</a></footer>`, signIn ? 401 : 200);
  };
  const sameOrigin = (request, response, next) => {
    if (request.headers.origin !== resource.origin) return response.sendStatus(403);
    next();
  };

  async function rotateTokens(where, values, requestedScopes = null) {
    const access = secret(), refresh = secret();
    const { rows: [connection] } = await pool.query(`
      UPDATE bluebar_catalog.mcp_connections
      SET code_hash=NULL, access_hash=$1, refresh_hash=$2, access_expires_at=now() + interval '1 hour',
        scopes=COALESCE($4::text[], scopes)
      WHERE revoked_at IS NULL AND expires_at > now() AND resource=$3
        AND ($4::text[] IS NULL OR scopes @> $4::text[]) AND ${where}
      RETURNING scopes
    `, [hash(access), hash(refresh), resource.href, requestedScopes, ...values]);
    if (!connection) throw new InvalidGrantError("Authorization grant is invalid, expired or missing the requested scope.");
    return { access_token: access, refresh_token: refresh, expires_in: ACCESS_SECONDS, token_type: "Bearer", scope: connection.scopes.join(" ") };
  }

  const provider = {
    clientsStore: clientStore,
    async authorize(client, params, response) {
      requireResource(params.resource);
      const scopes = readScopes(params.scopes);
      if (!client.redirect_uris.includes(params.redirectUri) || !isToken(params.codeChallenge) ||
        params.state?.length > 1024) throw new InvalidRequestError("Invalid redirect, state or PKCE challenge.");
      const grant = {
        client: client.client_id, redirect: params.redirectUri, challenge: params.codeChallenge, state: params.state,
        scopes, nonce: secret(), exp: Date.now() + 10 * 60 * 1000,
      };
      consentPage(response, pack("consent", grant), grant);
    },
    async challengeForAuthorizationCode(client, code) {
      if (!isToken(code)) throw new InvalidGrantError("Invalid authorization code.");
      const { rows: [row] } = await pool.query(`
        SELECT code_challenge FROM bluebar_catalog.mcp_connections
        WHERE code_hash=$1 AND client_id=$2 AND resource=$3 AND code_expires_at > now() AND revoked_at IS NULL
      `, [hash(code), client.client_id, resource.href]);
      if (!row) throw new InvalidGrantError("Invalid authorization code.");
      return row.code_challenge;
    },
    async exchangeAuthorizationCode(client, code, _verifier, redirect, requested) {
      requireResource(requested);
      if (!client.redirect_uris.includes(redirect)) throw new InvalidGrantError("Missing or invalid redirect URI.");
      return rotateTokens("code_hash=$5 AND client_id=$6 AND redirect_uri=$7 AND code_expires_at > now()", [
        hash(code), client.client_id, redirect,
      ]);
    },
    async exchangeRefreshToken(client, refresh, scopes, requested) {
      requireResource(requested);
      const requestedScopes = scopes?.length ? readScopes(scopes) : null;
      if (!isToken(refresh)) throw new InvalidGrantError("Invalid refresh token.");
      return rotateTokens("refresh_hash=$5 AND client_id=$6", [hash(refresh), client.client_id], requestedScopes);
    },
    async verifyAccessToken(token) {
      if (!isToken(token)) throw new InvalidTokenError("Invalid or expired BlueBar token.");
      const { rows: [connection] } = await pool.query(`
        SELECT c.manager_id, c.client_id, c.venue_slug, c.access_expires_at, c.scopes, v.schema_name, v.name
        FROM bluebar_catalog.mcp_connections c JOIN bluebar_catalog.venues v ON c.venue_slug=v.slug
        WHERE c.access_hash=$1 AND c.resource=$2 AND c.revoked_at IS NULL
          AND c.expires_at > now() AND c.access_expires_at > now()
      `, [hash(token), resource.href]);
      if (!connection || !clientStore.getClient(connection.client_id))
        throw new InvalidTokenError("Invalid or expired BlueBar token.");
      const db = tenantPool(pool, connection.schema_name);
      const { rowCount } = await db.query("SELECT id FROM bluebar.accounts WHERE id=$1 AND role='manager' AND active", [connection.manager_id]);
      if (!rowCount) throw new InvalidTokenError("BlueBar manager access is no longer active.");
      return {
        token, clientId: connection.client_id, resource, scopes: connection.scopes,
        expiresAt: new Date(connection.access_expires_at).getTime() / 1000,
        extra: { db, venue: { slug: connection.venue_slug, name: connection.name } },
      };
    },
    async revokeToken(client, { token }) {
      if (!isToken(token)) return;
      await pool.query(`
        UPDATE bluebar_catalog.mcp_connections SET revoked_at=now(), code_hash=NULL, access_hash=NULL, refresh_hash=NULL
        WHERE client_id=$1 AND resource=$2 AND (access_hash=$3 OR refresh_hash=$3)
      `, [client.client_id, resource.href, hash(token)]);
    },
  };

  const consent = async (request, response) => {
    const { ticket, business, decision } = request.body || {};
    const grant = unpack("consent", ticket);
    if (!grant || grant.exp <= Date.now() || !clientStore.getClient(grant.client)?.redirect_uris.includes(grant.redirect))
      return page(response, "Kërkesa ka skaduar", "<p>Niseni lidhjen përsëri nga ChatGPT ose Claude.</p>", 400);
    if (decision === "deny") return returnToClient(response, grant, { error: "access_denied" });
    if (decision !== "allow" || !validSlug(business))
      return page(response, "Kodi i biznesit është i pavlefshëm", "<p>Kthehuni te kërkesa dhe kontrolloni kodin.</p>", 400);
    const authorized = await managerAt(request, business);
    if (!authorized) return consentPage(response, ticket, grant, business, true);

    const code = secret();
    await pool.query("DELETE FROM bluebar_catalog.mcp_connections WHERE expires_at < now()");
    const result = await pool.query(`
      INSERT INTO bluebar_catalog.mcp_connections
        (id, venue_slug, manager_id, client_id, redirect_uri, resource, approval_hash, code_hash,
          code_challenge, code_expires_at, expires_at, scopes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now() + interval '2 minutes',now() + interval '30 days',$10)
      ON CONFLICT (approval_hash) DO NOTHING
    `, [randomUUID(), authorized.venue.slug, authorized.user.id, grant.client, grant.redirect, resource.href,
      hash(grant.nonce), hash(code), grant.challenge, grant.scopes ?? [MCP_SCOPE]]);
    if (!result.rowCount) return page(response, "Kërkesa është përdorur", "<p>Niseni lidhjen përsëri nga ChatGPT ose Claude.</p>", 400);
    returnToClient(response, grant, { code });
  };

  const connections = async (request, response) => {
    const slug = request.query.business;
    if (!slug) return page(response, "Lidhjet e BlueBar", `
      <form method="get"><label>Kodi i biznesit<input name="business" maxlength="40" required></label><button>Shiko lidhjet</button></form>`);
    const authorized = await managerAt(request, slug);
    if (!authorized) return page(response, "Kërkohet hyrja e menaxherit", validSlug(slug)
      ? `<p>Hyni në <a href="/?business=${escape(slug)}" target="_blank" rel="noopener">BlueBar</a> dhe rifreskoni këtë faqe.</p>`
      : "<p>Kontrolloni kodin e biznesit.</p>", 401);
    const { rows } = await pool.query(`
      SELECT id, redirect_uri, scopes, to_char(created_at, 'YYYY-MM-DD') AS created
      FROM bluebar_catalog.mcp_connections
      WHERE venue_slug=$1 AND resource=$2 AND revoked_at IS NULL AND expires_at > now()
        AND (refresh_hash IS NOT NULL OR code_hash IS NOT NULL AND code_expires_at > now())
      ORDER BY created_at DESC
    `, [slug, resource.href]);
    const items = rows.map((row) => `
      <li>${escape(clientName(row.redirect_uri))} (${escape(row.created)})${row.scopes.includes(MCP_SALES_SCOPE) ? " · Me lexim të shitjeve" : ""}
        <form method="post" action="/oauth/bluebar/connections">
          <input type="hidden" name="business" value="${escape(slug)}">
          <input type="hidden" name="id" value="${escape(row.id)}">
          <button>Shkëput</button>
        </form>
      </li>`).join("");
    page(response, `Lidhjet për ${authorized.venue.name}`, items ? `<ul>${items}</ul>` : "<p>Nuk ka lidhje aktive.</p>");
  };

  const disconnect = async (request, response) => {
    const { business, id } = request.body || {};
    if (typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id)) return response.sendStatus(400);
    if (!await managerAt(request, business)) return response.sendStatus(403);
    await pool.query(`
      UPDATE bluebar_catalog.mcp_connections SET revoked_at=now(), code_hash=NULL, access_hash=NULL, refresh_hash=NULL
      WHERE id=$1 AND venue_slug=$2 AND resource=$3 AND revoked_at IS NULL
    `, [id, business, resource.href]);
    response.redirect(303, `/oauth/bluebar/connections?business=${encodeURIComponent(business)}`);
  };
  return { provider, sameOrigin, consent, connections, disconnect };
}
