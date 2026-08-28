const PRODUCTS = {
  "team-tee": { name: "SoCal N Team Tee", amount: 3500, physical: true, fulfillment: "merch" },
  "paddock-hoodie": { name: "Paddock Hoodie", amount: 6800, physical: true, fulfillment: "merch" },
  "team-cap": { name: "Team Cap", amount: 3200, physical: true, fulfillment: "merch" },
  "driver-data-review": { name: "AI Driver Data Review", amount: 24900, physical: false, fulfillment: "digital-analysis" },
  "data-video-deep-dive": { name: "Data + Video Deep Dive", amount: 39900, physical: false, fulfillment: "digital-analysis" },
  "track-intelligence-pack": { name: "Track Intelligence Pack", amount: 4900, physical: false, fulfillment: "digital-pack" },
  "track-coaching-session": { name: "Track Coaching Session", amount: 49900, physical: false, fulfillment: "coaching" },
  "arrive-drive-deposit": { name: "Arrive & Drive Reservation Deposit", amount: 100000, physical: false, fulfillment: "race-reservation" }
};

const API_VERSION = "2026-08-19";
const STORE_ORIGIN = "https://socalnmotorsports.store";
const cors = {
  "Access-Control-Allow-Origin": STORE_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

function json(body, status = 200, extra = {}) {
  return Response.json(body, { status, headers: { ...cors, ...extra } });
}

function squareBase(env) {
  return env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function createCheckout(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== STORE_ORIGIN) return json({ error: "Origin not allowed" }, 403);

  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 20) return json({ error: "Invalid cart" }, 400);

  let needsShipping = false;
  const fulfillmentKinds = new Set();
  const line_items = [];

  for (const row of items) {
    const p = PRODUCTS[row.id];
    const qty = Number(row.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 10) {
      return json({ error: "Invalid product or quantity" }, 400);
    }
    if (p.physical) needsShipping = true;
    fulfillmentKinds.add(p.fulfillment);
    line_items.push({
      name: p.name,
      quantity: String(qty),
      item_type: "ITEM",
      base_price_money: { amount: p.amount, currency: "USD" }
    });
  }

  const payload = {
    idempotency_key: crypto.randomUUID(),
    description: "SoCal N Motorsports Store order",
    order: {
      location_id: env.SQUARE_LOCATION_ID,
      reference_id: `store-${Date.now()}`,
      line_items
    },
    checkout_options: {
      redirect_url: `${STORE_ORIGIN}/success.html`,
      ask_for_shipping_address: needsShipping
    },
    payment_note: `SoCal N Motorsports | ${[...fulfillmentKinds].join(", ")}`
  };

  const square = await fetch(`${squareBase(env)}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": API_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await square.json();
  if (!square.ok) return json({ error: "Square checkout failed", details: data.errors || [] }, 502);

  return json({
    url: data.payment_link.url,
    orderId: data.payment_link.order_id,
    checkoutId: data.payment_link.id
  });
}

function timingSafeEqualText(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(a || "");
  const bb = enc.encode(b || "");
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function webhookSignature(rawBody, notificationUrl, signatureKey) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(notificationUrl + rawBody)
  );
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function handleWebhook(request, env) {
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY || !env.SQUARE_WEBHOOK_URL) {
    return new Response("Webhook not configured", { status: 503 });
  }
  const rawBody = await request.text();
  const supplied = request.headers.get("x-square-hmacsha256-signature") || "";
  const expected = await webhookSignature(rawBody, env.SQUARE_WEBHOOK_URL, env.SQUARE_WEBHOOK_SIGNATURE_KEY);
  if (!timingSafeEqualText(supplied, expected)) return new Response("Invalid signature", { status: 403 });

  const event = JSON.parse(rawBody);
  // This is intentionally an integration hook, not fake fulfillment.
  // Connect this branch to the SoCal AI intake/fulfillment API when that endpoint is ready.
  if (["payment.updated", "order.updated"].includes(event.type)) {
    console.log(JSON.stringify({
      source: "square",
      eventId: event.event_id,
      type: event.type,
      createdAt: event.created_at,
      merchantId: event.merchant_id
    }));
  }
  return new Response("ok", { status: 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (url.pathname === "/checkout" && request.method === "POST") return await createCheckout(request, env);
      if (url.pathname === "/webhook" && request.method === "POST") return await handleWebhook(request, env);
      if (url.pathname === "/health") return json({ ok: true, environment: env.SQUARE_ENVIRONMENT || "sandbox" });
      return json({ error: "Not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Request failed" }, 500);
    }
  }
};
