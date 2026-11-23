# BlueBar MCP

BlueBar offers a remote Streamable HTTP MCP endpoint at `https://<bluebar-host>/mcp`.
The connector can read one venue after a signed-in BlueBar manager approves the
`bluebar.read` scope. List tools return `venue`, `items`, and `nextOffset` for pagination.
Sales aggregates require the additional `bluebar.sales.read` scope, granted by a manager.

| Tool | What it returns | Example question |
| --- | --- | --- |
| `list_tables` | Active tables, seats, room, and whether each has an open order | Which tables are occupied in Salla? |
| `list_inventory` | Counted stock, reserved and available units, and low stock flags | Which drinks are below their stock threshold? |
| `list_reservations` | Times, party sizes, and table assignments on a specified date | What reservations are on 2026-11-23? |
| `get_sales_summary` | Paid sales, invoice count, refunds, net sales, average invoice, and top 20 products by paid quantity | Sa shitje kam sot? |

A table marked free has no open order. Check reservations separately before treating
it as available for a booking. Reservation results omit guest names and phone
numbers. The connector cannot edit orders, stock, bookings, money, or settings.
The sales summary defaults to the current day in Europe/Tirane and accepts an
inclusive range of up to 366 days. Sales and average invoice use paid invoice
totals. Refunds are counted on the day they were issued. Product amounts use paid
quantities and line prices before invoice-level discounts and refunds.

## Cloud Run setup

1. Apply BlueBar's catalog schema with `npm run db:migrate` before enabling the
   endpoint. Use the usual direct migration connection to the intended database.
2. Set `BLUEBAR_MCP_ORIGIN` to the canonical public HTTPS origin used for
   BlueBar sign-in. Bind `BLUEBAR_MCP_SIGNING_KEY` from Secret Manager for every
   Cloud Run instance. Generate a key with
   `node -p 'require("node:crypto").randomBytes(32).toString("base64url")'`.
   Keep it stable across revisions. Replacing it requires registering clients again.
3. Publish the BlueBar revision. Check protected-resource metadata at
   `/.well-known/oauth-protected-resource/mcp`. A request to `/mcp` without a
   token must return **401** and include `WWW-Authenticate`.

Leave `BLUEBAR_MCP_ORIGIN` unset to keep the routes disabled. The canonical
origin must match the host a manager signs into because the consent page uses
the existing BlueBar session.

## Connect or disconnect

- In ChatGPT Plugins, add a custom MCP server with the full `/mcp` URL and choose
  OAuth with dynamic client registration (DCR). See
  [OpenAI's custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server).
- In Claude, use Customize → Connectors → Add custom connector with the same
  full URL, then choose **Register automatically** under OAuth client. See
  [Claude's custom connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- On BlueBar's approval page, enter the business code and approve read access.
  If prompted, open the linked BlueBar tab, sign in as a manager for that
  business, and return to the approval page. After approving, click **Vazhdo te
  ChatGPT** or **Vazhdo te Claude** to complete the connection.
- After adding the sales tool, refresh the MCP server's tool metadata in ChatGPT
  Plugins and start a new chat with the plugin. Existing grants need manager
  approval for the new scope before a sales tool call can return data.
- As a manager, open `/oauth/bluebar/connections?business=<venue>` on the same
  host to review and disconnect active connections.

The default callbacks are the stable ChatGPT and Claude URLs. If a management
page shows a different callback, add that exact URL to the comma-separated
`BLUEBAR_MCP_REDIRECT_URIS`. Authorization codes expire after two minutes and
can be used once. Access tokens expire after one hour. Refresh tokens rotate
on use and the connection expires after 30 days. Disconnecting it invalidates
its credentials immediately.

## Verify locally

`node --test server/mcp.test.js` runs the SDK client and OAuth flow over a
temporary loopback listener with disposable PostgreSQL data. It covers two
venues, read-only scope, PKCE, credentials, client discovery, pagination,
reservation contact exclusion, and revocation.
