/* =========================================================
   ThobeWear — Three.js backdrop + interactions + theming
   A slow, flowing "silk in low light" particle field with a
   warm gold sheen. Lightweight, GPU-friendly, theme-aware,
   and respectful of reduced-motion preferences.
   --------------------------------------------------------- */

/* Three.js is imported dynamically inside initScene() so that a missing
   or slow module can never take down the theme toggle, signup, or
   countdown. THREE is assigned once the module resolves. */
let THREE = null;

/* ---------- small helpers ------------------------------- */
const $ = (sel) => document.querySelector(sel);
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

/* Fill in the year placeholders */
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

/* Per-theme look for the page chrome + the 3D field.
   Additive blending glows beautifully on black but washes out
   on a light page, so light mode switches to normal blending
   with deeper gold so the silk still reads. */
const THEME = {
  dark: {
    logo: "assets/logo-dark.png",
    fog: 0x0a0a0b,
    colorLow: 0x8a6f33,
    colorHigh: 0xf2dca0,
    blending: "additive",
    alpha: 0.95,
    glint: 0.4,                  // hot white-gold core glint (glows on black)
    flare: [0.45, 0.36, 0.18],   // cursor wake lightens toward gold
  },
  light: {
    logo: "assets/logo-light.png",
    fog: 0xf4ede1,
    colorLow: 0x9a6f1c,          // warm bronze — clearly gold against cream
    colorHigh: 0xc99a30,         // rich gold at the bright twinkle
    blending: "normal",
    alpha: 1.0,
    glint: 0.0,                  // no core darkening (that turned them near-black)
    flare: [0.06, 0.04, 0.0],    // cursor wake gently warms the gold
  },
};

/* References shared between the scene and the theme switcher */
let sceneRefs = null;
let currentTheme = "dark";

/* ===========================================================
   1. THREE.JS SILK FIELD
   =========================================================== */
async function initScene() {
  const canvas = $("#scene");
  if (!canvas) return;

  try {
    THREE = await import("three");
  } catch (e) {
    // 3D is purely decorative — the page is fully usable without it.
    console.warn("ThobeWear: 3D backdrop unavailable —", e && e.message);
    return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0b, 0.055);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0.6, 9);

  /* --- Build the "silk" as a displaced particle plane --- */
  const COLS = 180;
  const ROWS = 110;
  const SPACING = 0.14;
  const count = COLS * ROWS;

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count); // per-point phase offset

  let i = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      positions[i * 3 + 0] = (x - COLS / 2) * SPACING;
      positions[i * 3 + 1] = (y - ROWS / 2) * SPACING;
      positions[i * 3 + 2] = 0;
      seeds[i] = Math.random() * Math.PI * 2;
      i++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));

  /* Round, soft, glowing point sprite drawn in the shader */
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColorLow: { value: new THREE.Color(0x6e5a2e) },
      uColorHigh: { value: new THREE.Color(0xe7cf95) },
      uAlpha: { value: 0.95 },
      uSize: { value: 25.0 * Math.min(window.devicePixelRatio, 2) },
      uCursor: { value: new THREE.Vector2(0, 0) },   // pointer in NDC (-1..1)
      uCursorActive: { value: 0 },                    // fades in/out with motion
      uAspect: { value: 1 },
      uGlint: { value: 0.4 },                         // core glint (theme-aware)
      uFlare: { value: new THREE.Vector3(0.45, 0.36, 0.18) }, // cursor wake tint
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      uniform vec2 uCursor;
      uniform float uCursorActive;
      uniform float uAspect;
      attribute float seed;
      varying float vGlow;
      varying float vTwinkle;
      varying float vInfluence;

      void main() {
        vec3 p = position;

        // Two crossing waves give a flowing, fabric-like ripple
        float w1 = sin(p.x * 0.55 + uTime * 0.6 + seed);
        float w2 = cos(p.y * 0.40 - uTime * 0.45 + seed * 0.5);
        p.z += (w1 + w2) * 0.9;

        // Subtle drift in the plane for life
        p.x += sin(uTime * 0.2 + seed) * 0.05;

        vGlow = (w1 + w2) * 0.5 * 0.5 + 0.5; // 0..1 for color mix

        // Per-point shimmer so the field reads as drifting sparkles.
        // Sharpened with pow() so most points are calm and a few flare.
        float tw = 0.5 + 0.5 * sin(uTime * 1.8 + seed * 6.2831);
        vTwinkle = pow(tw, 2.5);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // Cursor wake: points near the pointer (in screen space) flare and swell
        vec2 ndc = gl_Position.xy / gl_Position.w;
        vec2 dc = ndc - uCursor;
        dc.x *= uAspect;                       // keep the halo circular
        float infl = smoothstep(0.42, 0.0, length(dc)) * uCursorActive;
        vInfluence = infl;

        // bright points swell as they sparkle, and again near the cursor
        gl_PointSize = uSize * (0.7 + 0.6 * vTwinkle) * (1.0 + infl * 2.2) * (1.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      uniform float uAlpha;
      uniform float uGlint;
      uniform vec3 uFlare;
      varying float vGlow;
      varying float vTwinkle;
      varying float vInfluence;

      void main() {
        // soft round falloff with a brighter core for a sparkle glint
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float halo = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.16, 0.0, d);
        float alpha = (halo * 0.65 + core * 0.5) * uAlpha;

        // twinkle modulates brightness; cursor wake lifts it further
        alpha *= mix(0.35, 1.0, vTwinkle);
        alpha += halo * vInfluence * 0.5;

        vec3 col = mix(uColorLow, uColorHigh, smoothstep(0.2, 1.0, vGlow));
        col += core * vTwinkle * uGlint;       // glint: lightens on dark, deepens on light
        col += vInfluence * uFlare;            // cursor wake tint (theme-aware)
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.rotation.x = -1.05; // lay the silk back, almost flat to the eye
  scene.add(points);

  /* --- Resize handling --------------------------------- */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uAspect.value = w / h;
  }
  resize();
  window.addEventListener("resize", resize);

  /* --- Gentle mouse / device parallax + cursor wake ---- */
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    target.y = (e.clientY / window.innerHeight - 0.5) * 0.3;

    // pointer in normalized device coords for the sparkle wake
    material.uniforms.uCursor.value.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1)
    );
    material.uniforms.uCursorActive.value = 1.0;
  });

  /* --- Render loop ------------------------------------- */
  const clock = new THREE.Clock();

  function render() {
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;
    // the cursor wake fades out when the pointer goes still
    material.uniforms.uCursorActive.value *= 0.94;

    current.x += (target.x - current.x) * 0.04;
    current.y += (target.y - current.y) * 0.04;
    camera.position.x = current.x;
    camera.position.y = 0.6 - current.y;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    if (!prefersReduced) requestAnimationFrame(render);
  }

  sceneRefs = { scene, material, renderer, camera, render, redraw: () => renderer.render(scene, camera) };

  // the scene may finish loading after the theme was chosen — sync it now
  applySceneTheme(currentTheme);

  if (prefersReduced) {
    material.uniforms.uTime.value = 1.2;
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(render);
  }
}

/* Apply a theme's palette to the live 3D scene */
function applySceneTheme(name) {
  if (!sceneRefs || !THREE) return;
  const t = THEME[name] || THEME.dark;
  const { scene, material } = sceneRefs;

  scene.fog.color.setHex(t.fog);
  material.uniforms.uColorLow.value.setHex(t.colorLow);
  material.uniforms.uColorHigh.value.setHex(t.colorHigh);
  material.uniforms.uAlpha.value = t.alpha;
  material.uniforms.uGlint.value = t.glint;
  material.uniforms.uFlare.value.set(t.flare[0], t.flare[1], t.flare[2]);
  material.blending = t.blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.needsUpdate = true;

  // static-frame users need an explicit redraw
  if (prefersReduced) sceneRefs.redraw();
}

/* ===========================================================
   2. THEME TOGGLE (light / dark)
   The initial theme is set pre-paint by the inline <head>
   script; here we wire the button and keep the scene + logo
   in sync.
   =========================================================== */
function initTheme() {
  const btn = $("#themeToggle");
  const logo = $("#brandLogo");

  function apply(name, persist) {
    currentTheme = name;
    root.setAttribute("data-theme", name);
    if (logo && !logo.classList.contains("is-missing")) {
      logo.src = THEME[name].logo;
    }
    applySceneTheme(name);
    if (persist) {
      try { localStorage.setItem("tw_theme", name); } catch (e) {}
    }
  }

  // sync scene + logo to whatever the inline script chose
  apply(root.getAttribute("data-theme") || "dark", false);

  if (btn) {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next, true);
    });
  }

  // follow the OS if the user hasn't explicitly chosen
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    let chosen = null;
    try { chosen = localStorage.getItem("tw_theme"); } catch (err) {}
    if (!chosen) apply(e.matches ? "light" : "dark", false);
  });
}

/* ===========================================================
   3. CUSTOM CURSOR  (elegant gold dot + trailing ring + glow)
   Mouse-only and motion-safe: skipped on touch devices and when
   the visitor prefers reduced motion (native cursor stays).
   =========================================================== */
function initCursor() {
  const fine = window.matchMedia("(pointer: fine)").matches;
  if (!fine || prefersReduced) return;

  const dot = document.createElement("div");
  const ring = document.createElement("div");
  const glow = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  glow.className = "cursor-glow";
  document.body.append(glow, ring, dot);
  root.classList.add("cursor-on");

  let mx = window.innerWidth / 2, my = window.innerHeight / 2; // target
  let rx = mx, ry = my;   // ring (lagging)
  let gx = mx, gy = my;   // glow (more lag)
  let visible = false;

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (!visible) { visible = true; root.classList.add("cursor-visible"); }
    // the dot tracks 1:1 for precision
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
  });

  window.addEventListener("pointerdown", () => root.classList.add("cursor-down"));
  window.addEventListener("pointerup", () => root.classList.remove("cursor-down"));
  document.addEventListener("pointerleave", () => {
    visible = false; root.classList.remove("cursor-visible");
  });

  // grow the ring over interactive elements
  const interactive = "a, button, input, .theme-toggle";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(interactive)) root.classList.add("cursor-hover");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(interactive)) root.classList.remove("cursor-hover");
  });

  (function follow() {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    gx += (mx - gx) * 0.08; gy += (my - gy) * 0.08;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    glow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
    requestAnimationFrame(follow);
  })();
}

/* ===========================================================
   4. PRE-LAUNCH SIGNUP
   For now this validates + stores locally and shows a graceful
   confirmation. Wire `submitEmail()` to your provider (Formspree,
   Mailchimp, Beehiiv, ConvertKit…) when ready — see README.
   =========================================================== */
function initSignup() {
  const form = $("#signup");
  const input = $("#email");
  const note = $("#formNote");
  if (!form) return;

  const valid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();

    note.classList.remove("is-success", "is-error");

    if (!valid(email)) {
      note.textContent = "Please enter a valid email address.";
      note.classList.add("is-error");
      input.focus();
      return;
    }

    try {
      await submitEmail(email);
      input.value = "";
      // Swap the form for a prominent confirmation card.
      form.hidden = true;
      note.hidden = true;
      const done = $("#signupDone");
      if (done) {
        done.hidden = false;
      } else {
        // Fallback if the card markup isn't present.
        note.textContent = "You're on the list — check your inbox (and spam) to confirm.";
        note.classList.add("is-success");
        note.hidden = false;
      }
    } catch (err) {
      note.textContent = "Something went wrong — please try again shortly.";
      note.classList.add("is-error");
    }
  });
}

/* ----- Kit (ConvertKit) waitlist ----------------------------------------
   Values from your Kit account:
   - KIT_API_KEY: Kit → Settings → Advanced → "API Key" (the public key; safe
     to expose in client code — it is NOT the secret API Secret).
   - KIT_FORM_ID: the number in the form editor URL
     (e.g. app.kit.com/forms/designers/<FORM_ID>/edit).
   If either is blank, signups are kept only in the browser as a fallback. */
const KIT_API_KEY = "9II37xp8cQ3m7r2_0vfROA";
const KIT_FORM_ID = "9608878";

async function submitEmail(email) {
  // Always keep a local backup first, so an email is never lost even if the
  // network request below fails for any reason.
  const list = JSON.parse(localStorage.getItem("tw_waitlist") || "[]");
  if (!list.includes(email)) list.push(email);
  localStorage.setItem("tw_waitlist", JSON.stringify(list));

  if (KIT_API_KEY && KIT_FORM_ID) return kitSubscribe(email);
  return new Promise((r) => setTimeout(r, 300));
}

/* Kit's API doesn't return CORS headers, so the browser can't read the
   response. We send a "simple" request (urlencoded body, no custom headers =>
   no CORS preflight) in no-cors mode: Kit records the subscriber, but the
   response is opaque, so there's nothing to wait on or act on. We fire it and
   resolve right away — the localStorage backup above is the safety net, and
   we cap the request so a slow network can never leave it dangling. */
function kitSubscribe(email) {
  const body =
    "api_key=" + encodeURIComponent(KIT_API_KEY) +
    "&email=" + encodeURIComponent(email);

  const ctrl = new AbortController();
  const cap = setTimeout(() => ctrl.abort(), 8000);
  fetch(`https://api.convertkit.com/v3/forms/${KIT_FORM_ID}/subscribe`, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: ctrl.signal,
    keepalive: true, // let it finish even if the page is navigating away
  })
    .catch(() => {}) // opaque/failed: nothing to act on; backup covers it
    .finally(() => clearTimeout(cap));

  return Promise.resolve(); // confirm to the user immediately
}

/* ---------- boot ---------------------------------------- */
initTheme();      // theme + logo first — never depends on 3D
initSignup();
initCursor();     // mouse-only, motion-safe
initScene();      // async, decorative, isolated failure
