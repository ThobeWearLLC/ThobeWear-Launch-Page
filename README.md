# ThobeWear — Pre-Launch Landing Page

A custom, dependency-free pre-launch landing page for **ThobeWear**, a luxury
modest-menswear house. Built to be hosted on **GitHub Pages** at
`www.thobewear.com`, replacing the GoDaddy default page.

> Concept, copy, palette, typography, and the Three.js backdrop were drafted
> with **Claude Opus 4.8** from the brand brief below, then committed here.

---

## Brand brief

| | |
|---|---|
| **Name** | ThobeWear |
| **Category** | Luxury modest menswear — the thobe, reimagined |
| **Voice** | Quiet luxury. Heritage with restraint. Confident, never loud. |
| **Audience** | The modern man who values craft, dignity, and considered design |
| **Tagline** | *The Thobe, Reimagined.* |

### Visual language

- **Palette** — Obsidian `#0a0a0b`, Onyx `#141416`, Warm Ivory `#f5efe6`,
  Desert Sand `#cbb9a3`, signature Champagne Gold `#c9a24b` → `#e7cf95`.
- **Type** — *Cormorant Garamond* (display serif) paired with *Jost*
  (humanist sans) for clean, modern body and UI.
- **Motion** — A slow "silk in low light" particle field rendered in
  **Three.js** with a warm gold sheen, gentle pointer parallax, and full
  `prefers-reduced-motion` support.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, meta/OG tags, signup form |
| `styles.css` | Full design system (palette, type, layout, animation) |
| `main.js` | Three.js backdrop, signup logic, soft countdown |
| `404.html` | On-brand not-found page (auto-redirects home) |
| `CNAME` | Custom domain for GitHub Pages (`www.thobewear.com`) |
| `.nojekyll` | Tells Pages to serve files as-is (no Jekyll processing) |

---

## 1. Publish on GitHub Pages

1. Merge this branch into your **default branch** (`main`).
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch = `main`** and **Folder = `/ (root)`**, then **Save**.
5. Wait ~1 minute. The **Custom domain** field will read `www.thobewear.com`
   (from the `CNAME` file). Once DNS is verified, tick
   **Enforce HTTPS**.

## 2. Point GoDaddy DNS at GitHub Pages

In GoDaddy: **My Products → Domain → DNS / Manage Zones**.

**For `www` (your chosen host) — add a CNAME record:**

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `www` | `thobewearllc.github.io` | 1 hour |

> Replace `thobewearllc` with your GitHub **owner** (user or org) name if
> different. It is your `<owner>.github.io`, **not** the repo name.

**Recommended — also make the apex (`thobewear.com`) work and redirect to www.**
Add four `A` records pointing at GitHub's Pages IPs:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Then in GoDaddy, remove any old **Forwarding** / parked-page records and the
default GoDaddy A record that points the apex at their landing service.

DNS can take from a few minutes up to ~48 hours to propagate. Check progress
with `dig www.thobewear.com +short` (should resolve to GitHub IPs).

## 3. Wire up the signup form (optional but recommended)

Out of the box the form validates and stores emails in the visitor's browser
(`localStorage`) so nothing is lost while you choose a provider. To collect
real signups, open `main.js`, find `submitEmail()`, and uncomment the
**Formspree** example (or swap in Mailchimp / Beehiiv / ConvertKit):

```js
const res = await fetch("https://formspree.io/f/XXXXXXXX", {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
if (!res.ok) throw new Error("submit failed");
```

## 4. Customize

- **Launch date** — `initCountdown()` in `main.js` (`const LAUNCH = ...`).
- **Social links** — the `.social` nav in `index.html`.
- **Social preview image** — drop an `og-image.jpg` (1200×630) in the root;
  it's already referenced in the `<head>`.
- **Gold intensity / particle density** — `COLS`, `ROWS`, and the
  `uColorHigh` / `uColorLow` uniforms in `main.js`.

---

## Local preview

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Open via a server, not `file://`, so the ES-module `import` of Three.js works.)
