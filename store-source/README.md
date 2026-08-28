# SoCal N Motorsports Store V1

GitHub Pages storefront for `https://socalnmotorsports.store`, visually matched to the current `socalnmotorsports.com` marketing site.

## Included
- Merchandise, coaching, race-experience and digital-product catalog
- Dedicated product pages
- Three customer-facing digital product samples, clearly marked as fictional/demo data
- Browser cart
- Square-hosted checkout backend example using a Cloudflare Worker
- Server-side authoritative product/price allowlist
- GitHub Pages `CNAME` and `.nojekyll`
- Success, shipping/returns and privacy placeholders

## Square sandbox
Square currently recommends the Checkout API `CreatePaymentLink` flow for first-time hosted-checkout integrations. The worker uses API version `2026-08-19` and the Square sandbox endpoint.

1. Create/select a Square Developer application and Sandbox location.
2. `cd square-worker && npm install`
3. `npx wrangler secret put SQUARE_ACCESS_TOKEN`
4. `npx wrangler secret put SQUARE_LOCATION_ID`
5. `npm run deploy`
6. Copy the Worker URL into `CONFIG.squareCheckoutEndpoint` in `assets/store.js`.
7. Test the complete cart → Square sandbox → redirect flow.
8. Before production, change `connect.squareupsandbox.com` to `connect.squareup.com`, use production credentials/location, verify taxes/shipping, and configure Square webhooks for fulfillment.

Do not trust browser-submitted prices. The worker intentionally derives price from its own product allowlist.

## Digital product fulfillment
The current product pages are customer-facing mocks. Before accepting orders, define supported telemetry formats, upload workflow, delivery SLA, revision policy, data retention/privacy terms, and exactly what analysis is guaranteed versus dependent on available channels.

## Race products
The store uses a $1,000 arrive-and-drive reservation deposit instead of a full event checkout. Finalize deposit/refund/cancellation language before launch.

## Production plumbing added in V1.1

The Worker now exposes:
- `POST /checkout` — validates cart items/prices server-side and creates a Square-hosted checkout page.
- `POST /webhook` — validates Square's `x-square-hmacsha256-signature` using the exact webhook URL + raw body + signature key, then exposes a safe fulfillment integration hook.
- `GET /health` — confirms Worker/environment availability without exposing secrets.

`success.html` clears the local browser cart, but it does **not** claim that a browser redirect proves payment. Fulfillment should only begin after a trusted Square order/payment event.

### One-command Worker deployment after exporting credentials

```bash
cd square-worker && ./deploy-square.sh
```

Required environment variables before running it:
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`

After the Worker is deployed, set the exact `/checkout` URL in `assets/store.js`. Then create a Square webhook subscription for the exact Worker `/webhook` URL, copy the subscription signature key, and add both `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL` as Worker secrets.

Keep `SQUARE_ENVIRONMENT = "sandbox"` until sandbox checkout and webhook validation pass end-to-end. Change to `production` only with production credentials and after taxes, shipping, refund/cancellation terms, fulfillment, and event-deposit rules are final.


## V1.2 automated intake + fulfillment
See `V1.2_INTAKE_FULFILLMENT.md`. Successful orders now route to digital analysis intake, coaching intake, or Arrive & Drive onboarding.


## V1.3 R2 -> Strix -> delivery pipeline
See `V1.3_R2_STRIX_PIPELINE.md`. This version adds direct multipart customer video upload to private R2, outbound-only local Strix job polling, local task creation, and delivery asset publishing.
