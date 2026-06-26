/* =========================================================
   ThobeWear — signup proxy (Cloudflare Worker)
   Sits between the static site and Kit (ConvertKit) so that:
     - the Kit API key lives ONLY here as a secret, never in the browser,
     - email is validated server-side (a spoofed client can't bypass it),
     - submissions are rate-limited per IP,
     - and we read Kit's REAL response, so the page can show a truthful
       success or error (no opaque no-cors guessing).
   --------------------------------------------------------- */

/* Browser origins allowed to call this Worker. Add/remove as needed. */
const ALLOWED_ORIGINS = [
  "https://www.thobewear.com",
  "https://thobewear.com",
];

/* Same pragmatic check as the client, enforced authoritatively here. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validEmail(v) {
  return (
    typeof v === "string" &&
    v.length <= 254 &&
    EMAIL_RE.test(v) &&
    !/\.\./.test(v) &&
    !/(^\.|\.$|@\.|\.@)/.test(v)
  );
}

/* Max submissions per IP per window (seconds). Tune to taste. */
const RATE_MAX = 5;
const RATE_WINDOW = 60;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "bad_request" }, 400, headers);
    }

    const email = String(body.email || "").trim().toLowerCase();
    const honeypot = String(body.company || "").trim();

    // Honeypot: pretend success so we don't tip off the bot, but never call Kit.
    if (honeypot) return json({ ok: true }, 200, headers);

    if (!validEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 422, headers);
    }

    // Per-IP rate limit (optional: only if a KV namespace named RL is bound).
    if (env.RL) {
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const key = "rl:" + ip;
      const count = parseInt((await env.RL.get(key)) || "0", 10);
      if (count >= RATE_MAX) {
        return json({ ok: false, error: "rate_limited" }, 429, headers);
      }
      await env.RL.put(key, String(count + 1), { expirationTtl: RATE_WINDOW });
    }

    // Call Kit server-side with the secret key and read the real response.
    let kitRes;
    try {
      kitRes = await fetch(
        `https://api.convertkit.com/v3/forms/${env.KIT_FORM_ID}/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: env.KIT_API_KEY, email }),
        }
      );
    } catch {
      return json({ ok: false, error: "provider_unreachable" }, 502, headers);
    }

    if (!kitRes.ok) {
      return json({ ok: false, error: "provider_error" }, 502, headers);
    }
    return json({ ok: true }, 200, headers);
  },
};
