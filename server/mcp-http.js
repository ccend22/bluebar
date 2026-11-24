import express from "express";
import { createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOAuthMetadata, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { bluebarMcpTools, MCP_SCOPE, MCP_SCOPES } from "./mcp-tools.js";
import { createMcpOAuth } from "./mcp-oauth.js";

const MCP_PATHS = new Set([
  "/mcp", "/authorize", "/register", "/token", "/revoke",
  "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration",
  "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
  "/oauth/bluebar/consent", "/oauth/bluebar/connections",
]);
export const isMcpPath = (path) => MCP_PATHS.has(path);
const MCP_CALLS_PER_MINUTE = 120;
const DEFAULT_REDIRECTS = [
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "https://claude.ai/api/mcp/auth_callback",
];

export function createMcpHttp({
  pool, origin, signingKey, extraRedirects = [], secureCookies = true, trustProxy = false,
}) {
  if (!pool || !/^[A-Za-z0-9_-]{43}$/.test(signingKey ?? "") ||
    Buffer.from(signingKey, "base64url").length !== 32) {
    throw new Error("BlueBar MCP requires a database pool and BLUEBAR_MCP_SIGNING_KEY (32 random bytes, base64url).");
  }
  const issuer = new URL(origin);
  const loopback = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (issuer.href !== issuer.origin + "/" || issuer.username || issuer.password ||
    (issuer.protocol !== "https:" && (secureCookies || issuer.protocol !== "http:" || !loopback(issuer)))) {
    throw new Error("BLUEBAR_MCP_ORIGIN must be the public HTTPS origin of BlueBar.");
  }
  const redirects = [...DEFAULT_REDIRECTS, ...extraRedirects];
  for (const redirect of redirects) {
    const url = new URL(redirect);
    if (url.username || url.password || url.hash ||
      (url.protocol !== "https:" && (secureCookies || url.protocol !== "http:" || !loopback(url)))) {
      throw new Error("Invalid BlueBar MCP callback URL.");
    }
  }
  const resource = new URL("/mcp", issuer);
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp", issuer);
  const oauth = createMcpOAuth({ pool, resource, signingKey, redirects, secureCookies });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.set("strict routing", true);
  app.set("case sensitive routing", true);
  app.use((req, res, next) => {
    if (req.headers.host !== issuer.host) return res.sendStatus(403);
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      ...(secureCookies && { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }),
    });
    next();
  });

  const form = express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 8 });
  app.post("/oauth/bluebar/consent", oauth.sameOrigin, form, oauth.consent);
  app.get("/oauth/bluebar/connections", oauth.connections);
  app.post("/oauth/bluebar/connections", oauth.sameOrigin, form, oauth.disconnect);
  // This service publishes OAuth metadata. It is not an OpenID Connect provider.
  app.get("/.well-known/openid-configuration", (_req, res) => res.sendStatus(404));
  app.get("/.well-known/oauth-protected-resource", (_req, res) => res.json({
    resource: resource.href, authorization_servers: [issuer.href], scopes_supported: MCP_SCOPES,
    resource_name: "BlueBar", bearer_methods_supported: ["header"],
  }));
  const authOptions = {
    provider: oauth.provider, issuerUrl: issuer, resourceServerUrl: resource,
    resourceName: "BlueBar", scopesSupported: MCP_SCOPES,
    clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
  };
  app.get("/.well-known/oauth-authorization-server", (_req, res) => res.json({
    ...createOAuthMetadata(authOptions), authorization_response_iss_parameter_supported: true,
  }));
  // The SDK handles OAuth validation and redirects errors only after the callback is verified.
  // Attach RFC 9207 issuer identification to those redirects as well as our consent responses.
  app.use("/authorize", (_req, res, next) => {
    const redirect = res.redirect.bind(res);
    res.redirect = (status, target) => {
      const url = new URL(target);
      url.searchParams.set("iss", issuer.href);
      return redirect(status, url.href);
    };
    next();
  });
  app.use(mcpAuthRouter(authOptions));

  app.all("/mcp", (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== issuer.origin) return res.sendStatus(403);
    next();
  }, requireBearerAuth({
    verifier: oauth.provider, requiredScopes: [MCP_SCOPE],
    resourceMetadataUrl: metadata.href, expectedResource: resource,
  }));
  // ponytail: per-instance fixed window, keyed by a hash of the access token. Cloud Run's
  // instances each count separately; move it to the database if abuse ever spans instances.
  const calls = new Map();
  app.post("/mcp", (req, res, next) => {
    const key = createHash("sha256").update(req.auth.token).digest("base64url"), now = Date.now();
    if (calls.size > 10000) for (const [k, v] of calls) if (v.reset < now) calls.delete(k);
    const slot = calls.get(key)?.reset > now ? calls.get(key) : { n: 0, reset: now + 60000 };
    calls.set(key, slot);
    if (++slot.n > MCP_CALLS_PER_MINUTE) return res.set("Retry-After", String(Math.ceil((slot.reset - now) / 1000))).sendStatus(429);
    next();
  }, (req, res, next) => {
    if (!req.is("application/json")) return res.sendStatus(415);
    next();
  }, express.json({ limit: "32kb" }), async (req, res) => {
    // Stateless transport, so any Cloud Run instance can handle the next call.
    const server = bluebarMcpTools({ ...req.auth.extra, scopes: req.auth.scopes, resourceMetadataUrl: metadata.href });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once("close", () => { server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all("/mcp", (_req, res) => res.set("Allow", "POST").sendStatus(405));

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = [400, 413, 415].includes(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "server_error" : "invalid_request" });
  });
  return app;
}
