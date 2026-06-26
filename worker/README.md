# ThobeWear signup proxy (Cloudflare Worker)

A tiny serverless proxy between the static site and Kit (ConvertKit). It exists
so the site can do the things a static page alone cannot:

- **Hide the API key** — it lives here as an encrypted secret, never in the browser.
- **Validate server-side** — a spoofed/bypassed client can't push a bad address through.
- **Rate-limit per IP** — stops repeat spam (optional, needs a KV namespace).
- **Read Kit's real response** — so the site shows a truthful success/error instead
  of the opaque `no-cors` guess.

It's free on Cloudflare's plan at launch-page volumes.

## Deploy (about 5–10 minutes)

You'll need [Node.js](https://nodejs.org) installed. All commands run from this
`worker/` folder.

```bash
cd worker

# 1. Log in to Cloudflare (opens a browser once)
npx wrangler login

# 2. Store your Kit API key as an encrypted secret (paste the key when asked)
npx wrangler secret put KIT_API_KEY

# 3. (Optional but recommended) enable per-IP rate limiting:
npx wrangler kv namespace create RL
#    -> copy the printed id into wrangler.toml, and uncomment the
#       [[kv_namespaces]] block there.

# 4. Deploy
npx wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.
`https://thobewear-signup.<your-subdomain>.workers.dev`.

## Point the site at it

1. Open `../main.js` and set:
   ```js
   const SIGNUP_ENDPOINT = "https://thobewear-signup.<your-subdomain>.workers.dev";
   ```
2. Now that the key is server-side, you can delete the `KIT_API_KEY` line from
   `main.js` (the proxy path no longer uses it).
3. Bump the `?v=` cache number on `main.js` in `index.html` and `confirmed.html`,
   commit, and push.

That's it. The form will now submit through the proxy, show real success/error,
and keep your key private.

## Config reference

- `wrangler.toml` → `KIT_FORM_ID` — your Kit form id (not secret).
- Secret `KIT_API_KEY` — set via `wrangler secret put`, never committed.
- `RATE_MAX` / `RATE_WINDOW` in `src/worker.js` — tune the rate limit.
- `ALLOWED_ORIGINS` in `src/worker.js` — domains allowed to call the Worker.

## Note

This proxy is optional and meant for the static launch page. Once you move to
Shopify, Shopify handles signups, validation, and rate limiting natively, and
you can retire both this Worker and the Kit integration.
