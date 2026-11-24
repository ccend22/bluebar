# BlueBar in ChatGPT (Custom GPT with Actions)

A Custom GPT reads one business's sales, stock and staff figures through a read-only
REST API in the existing BlueBar service (`server/gpt.js`). There is no separate backend
and no MCP. ChatGPT signs in with a per-business API key.

## How it works

- `GET /api/gpt/*` routes on the existing Cloud Run service, next to `/api/*`.
- `Authorization: Bearer bbgpt_…`: the key names the business. BlueBar stores only its
  SHA-256 hash, in `bluebar_catalog.gpt_keys`, one key per business.
- Only `GET` is accepted. Any other method gets **405**. Nothing under `/api/gpt/` writes business data.
- The responses contain no database credentials, secrets, guest names or phone numbers,
  and no invoice-level detail. Waiters appear by name only.
- Money is in lek (`ALL`). Days are calendar days in `Europe/Tirane`, and weeks start on Monday.

| Operation | Route | Answers |
| --- | --- | --- |
| `getSales` | `/api/gpt/sales` | Sales, invoices, refunds, net, average invoice and top products (`rankBy=quantity\|revenue`, `top`). `compare=true` adds the previous period. |
| `getSalesBreakdown` | `/api/gpt/sales/breakdown` | `by=hour` (busiest hours), `weekday`, `day`, `month` |
| `getInventory` | `/api/gpt/inventory` | `status=low\|out\|all`, `q` for a product name |
| `getStaffSales` | `/api/gpt/staff` | Sales and average invoice per waiter |

Periods: `today` (the default), `yesterday`, `this_week`, `last_week`, `last_7_days`,
`last_30_days`, `this_month`, `last_month`, `this_year`, or `from`/`to` (`YYYY-MM-DD`,
inclusive, up to 366 days). The previous period is:
- yesterday, for `today`;
- the same weekdays last week, for `this_week`;
- the same days last month, for `this_month`;
- for any other period, an equally long stretch just before it.

The OpenAPI 3.1 spec is served publicly at `https://bar.bluesquareai.com/api/gpt/openapi.json`.
Its `servers` URL is the host that served it.

## Deploy (Cloud Run)

No new service, environment variable or secret is needed.

1. Run `npm run db:migrate` against Neon. It only adds the table `bluebar_catalog.gpt_keys`.
2. Build and deploy the image as usual (see the Cloud Run notes), then make sure traffic is on the new revision.
3. Check the deploy:
   - `curl https://bar.bluesquareai.com/api/gpt/openapi.json` returns the spec.
   - `curl https://bar.bluesquareai.com/api/gpt/sales` returns **401**.

**Rollback:** `gcloud run services update-traffic bluebar --to-revisions=<previous revision>=100 --region europe-west1 --project studio-3380920138-3317b`.
The empty `gpt_keys` table can stay. Older revisions ignore it.

## Connect ChatGPT

1. In BlueBar, sign in as manager. Go to **Cilësimet → Integrimet → ChatGPT** and choose
   **Krijo çelës**. Copy the key; it is shown only once.
2. In ChatGPT, go to **Explore GPTs → Create → Configure**.
   - Name: `BlueBar`.
   - Instructions: paste the block below.
   - **Actions → Create new action → Import from URL**: `https://bar.bluesquareai.com/api/gpt/openapi.json`.
   - **Authentication → API Key → Auth type: Bearer**, then paste the key.
   - Privacy policy: a public GPT needs a URL. A private one does not.
3. Save the GPT as **Only me**, or share it by link only with people allowed to see the
   business's sales. Anyone who can use the GPT can read that business's data.
4. To cut off access, choose **Çaktivizo**, or **Krijo çelës të ri** to replace the key.
   The old key stops working at once.

GPT instructions:

```
You answer questions about one BlueBar bar/restaurant using the BlueBar actions.
Reply in the user's language (often Albanian). Money is Albanian lek; write "L", e.g. 6 060 L.
- Totals, revenue, best sellers, average transaction: getSales. Use period names
  (today, yesterday, this_week, last_week, this_month, last_month, this_year, last_7_days,
  last_30_days) or from/to dates. For "compare", set compare=true. For "by revenue", rankBy=revenue.
- Busiest hours: getSalesBreakdown by=hour. Monthly revenue: by=month with period=this_year.
- Low / out of stock or one product's units: getInventory.
- Employee performance: getStaffSales.
salesLek is paid sales; netSalesLek subtracts refunds. Product totals are before invoice discounts.
You cannot change anything in BlueBar. If asked to, say it must be done in the BlueBar app.
Never invent numbers; if an action fails, say so.
```

Example prompts:
- Sa shitje kam bërë sot?
- How much revenue did we make this week compared with last week?
- Show me yesterday's sales.
- What was our best-selling product today? And by revenue?
- Show me monthly revenue this year.
- What are our busiest hours in the last 30 days?
- Which products are running low? Which are out of stock?
- How many units of Peroni do we have?
- Give me a daily sales report for yesterday.
- Summarize this month's performance.
- Top 10 products by revenue this month.
- Show employee sales for this month.

## Tests

`node --test server/gpt.test.js` covers:
- period maths in Tirana time, including a time just after midnight and month-end clamping;
- key issuing, hashing, replacing and revoking;
- that one business can't see another's data;
- the Tirana day boundaries in the SQL;
- every path in the spec;
- validation, and that non-GET requests are refused.
