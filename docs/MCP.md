# BlueBar for ChatGPT and Claude (MCP)

BlueBar runs a remote MCP server (Streamable HTTP) at `https://bar.bluesquareai.com/mcp`.
It runs inside the BlueBar Cloud Run service: same container, same database, same sign-in.
Any BlueBar business can connect its own account. A signed-in manager approves read-only
access for that one business.

```
ChatGPT / Claude ──OAuth 2.0 + PKCE──▶ /authorize, /token     (server/mcp-oauth.js)
                 ──Bearer token──────▶ /mcp → tools           (server/mcp-http.js, mcp-tools.js)
                                         └─ reports shared with /api/gpt (server/gpt.js)
                                             └─ that business's Postgres schema only
```

## Tools

All tools are read-only (`readOnlyHint: true`, `destructiveHint: false`). None of them takes a business as input.

| Tool | Scope | Answers |
| --- | --- | --- |
| `get_business_summary` | sales | Today: sales against yesterday, top 5 products, cash/card split, open tables, low stock, reservations |
| `get_sales_summary` | sales | Sales, invoices, refunds, net sales, average invoice, cash/card/mixed split with tips, top products by units or revenue; `compare` adds the previous period |
| `get_sales_breakdown` | sales | Sales per hour (busiest hours), weekday, day or month |
| `get_staff_sales` | sales | Sales, invoices and average invoice per waiter (name only) |
| `list_inventory` | read | Stock on hand, quantities in open orders, available units, low and out-of-stock flags, name search |
| `list_tables` | read | Tables, seats, room, and whether each has an open order |
| `list_reservations` | read | Times, party sizes and tables on a date; no guest names or phones |

Periods for the sales tools: `today` (the default), `yesterday`, `this_week`, `last_week`,
`last_7_days`, `last_30_days`, `this_month`, `last_month`, `this_year`, or `from`/`to` (inclusive,
up to 366 days). Every business uses Europe/Tirane, because BlueBar has no per-business timezone.

**Not available**, because the data or permission doesn't exist:
- a timezone per business;
- connections for waiter accounts (only managers can connect);
- changing anything: orders, stock, bookings, money or settings.

## Security model

- **One business per connection.** The business is fixed when its manager approves. Each
  request reads only that business's schema. A business sent in a header or a tool argument
  is ignored.
- **OAuth 2.0:**
  - authorization code flow with PKCE (S256), and dynamic client registration;
  - only ChatGPT's and Claude's callbacks are accepted, plus any in `BLUEBAR_MCP_REDIRECT_URIS`;
  - authorization codes last 2 minutes and work once;
  - access tokens last 1 hour; refresh tokens rotate on every use;
  - a connection lasts at most 30 days;
  - only SHA-256 hashes of codes and tokens are stored, in `bluebar_catalog.mcp_connections`.
- **Permissions:**
  - `bluebar.read` covers tables, stock and reservations;
  - `bluebar.sales.read` covers sales, payments and per-waiter sales, and needs a separate manager approval;
  - refreshing a token never adds a permission.
- **Revocation:** a manager disconnects under Cilësimet → Integrimet → Menaxho lidhjet, which
  is `/oauth/bluebar/connections`. Deactivating the manager also ends their connections at once.
- **Limits and errors:**
  - 120 tool calls a minute per connection, per instance; beyond that the server answers 429 with `Retry-After`;
  - request bodies are limited to 32 KB;
  - invalid dates or periods return a clear message;
  - database errors return a generic one, never SQL or stack traces.
- **Logging:** questions, answers and tokens are not logged. Cloud Run's request log keeps only method, path and status.
- **Secrets:** `BLUEBAR_MCP_SIGNING_KEY` and `DATABASE_URL` come from Secret Manager. Nothing secret is sent to the assistant.

## Cloud Run configuration

| Variable | Source | Purpose |
| --- | --- | --- |
| `BLUEBAR_MCP_ORIGIN` | plain value | `https://bar.bluesquareai.com`. The MCP answers only on this host; other hosts, including run.app, get 403 |
| `BLUEBAR_MCP_SIGNING_KEY` | Secret Manager `bluebar-mcp-signing-key` | Signs client IDs and approval tickets. Keep it stable: replacing it means every client registers again |
| `BLUEBAR_MCP_REDIRECT_URIS` | plain value, optional | Extra OAuth callbacks, comma-separated, if ChatGPT shows a different one |
| `BLUEBAR_OPENAI_APPS_CHALLENGE` | plain value, optional | Domain-verification token from the OpenAI Platform, served at `/.well-known/openai-apps-challenge` |

`GET /healthz` returns `ok`. It doesn't touch the database.

**Deploy:** use the same image and service as the rest of BlueBar (see the Cloud Run notes). This
change has no migration. To set the challenge token:
`gcloud run services update bluebar --update-env-vars BLUEBAR_OPENAI_APPS_CHALLENGE=<token> --region europe-west1`.

**Rollback:** `gcloud run services update-traffic bluebar --to-revisions=<previous>=100 --region europe-west1`.

## Connect (any BlueBar business)

1. In ChatGPT, open **Plugins → + → Add custom MCP server**. Enter `https://bar.bluesquareai.com/mcp`
   and choose OAuth. Once BlueBar is listed in the directory, choosing BlueBar and **Connect** does the same.
2. On the BlueBar page, enter the business code and sign in as a manager if asked. Approve access,
   and approve sales access too for the sales tools.
3. Choose **Vazhdo te ChatGPT** and ask, for example, "Sa shitje kam sot?"

In Claude: Customize → Connectors → Add custom connector, with the same URL and **Register automatically**.

## Publishing in ChatGPT's directory

Creating the server does not publish it. OpenAI reviews each app, and BlueBar is **not public until
OpenAI approves it**. The package is in `chatgpt-plugin/bluebar/`, and `chatgpt-plugin/bluebar-plugin.zip`
is ready to upload.

Ready in the code:
- [x] Public HTTPS MCP with OAuth (DCR) and read-only tool annotations
- [x] Privacy, terms and support pages at `/privacy.html`, `/terms.html` and `/support.html`.
  Contact: endicikalleshi@gmail.com.
- [x] Domain-verification route, which needs the token from OpenAI
- [x] Manifest (`plugin.json`, `mcp.json`) and a skill telling ChatGPT which tool answers what

You need to do these on platform.openai.com/plugins:
- [ ] Organisation or individual verification, as an owner or a member with Apps Management Write
- [ ] Upload the ZIP. Then connect the MCP, put the challenge token in `BLUEBAR_OPENAI_APPS_CHALLENGE`, deploy, and verify the domain
- [ ] A reviewer test account: a test business with sample data, its business code and a manager PIN.
  No MFA is needed, since BlueBar sign-in is a PIN. Enter these in the dashboard, never in the ZIP.
- [ ] A demo video URL, release notes, and the test cases below
- [ ] Submit, and publish after approval

Review test cases (5 positive, 3 negative):

| # | Prompt | Tools | Expected |
| --- | --- | --- | --- |
| P1 | "Sa shitje kam sot?" | `get_sales_summary` | Today's paid sales, invoice count and average in lek |
| P2 | "Compare this week with last week" | `get_sales_summary` (`period: this_week`, `compare: true`) | Both totals and the difference |
| P3 | "Which waiter sold the most this month?" | `get_staff_sales` | Waiters ranked by sales |
| P4 | "Which products are low on stock?" | `list_inventory` (`lowOnly`) | Products at or below their threshold |
| P5 | "What are our busiest hours in the last 30 days?" | `get_sales_breakdown` (`by: hour`) | Hours ranked by sales |
| N1 | "Delete yesterday's invoices" | none | Explains that BlueBar is read-only in ChatGPT |
| N2 | "Show me sales for another bar" | none | Only the connected business is available |
| N3 | "What's the weather in Tirana?" | none | Doesn't use BlueBar |

## Verify locally

`node --test server/mcp.test.js server/gpt.test.js` runs the SDK client and the OAuth flow over a
temporary loopback listener with two businesses in PGlite. It covers:
- PKCE, client discovery, code replay, rotating refresh tokens and revocation;
- a deactivated manager;
- the sales permission locking all four sales tools;
- cross-business isolation: another business's waiters and sales never appear, and a business header is ignored;
- Tirana day boundaries, hourly buckets and the payment split;
- invalid periods, and the 429 rate limit.
