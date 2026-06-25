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
  },
  light: {
    logo: "assets/logo-light.png",
    fog: 0xf4ede1,
    colorLow: 0x9c7a2e,
    colorHigh: 0xc79a3a,
    blending: "normal",
    alpha: 0.8,
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
      uSize: { value: 18.0 * Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      attribute float seed;
      varying float vGlow;
      varying float vTwinkle;

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
        // bright points swell slightly as they sparkle
        gl_PointSize = uSize * (0.7 + 0.6 * vTwinkle) * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      uniform float uAlpha;
      varying float vGlow;
      varying float vTwinkle;

      void main() {
        // soft round falloff with a brighter core for a sparkle glint
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float halo = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.16, 0.0, d);
        float alpha = (halo * 0.65 + core * 0.5) * uAlpha;

        // twinkle modulates brightness so points shimmer in and out
        alpha *= mix(0.35, 1.0, vTwinkle);

        vec3 col = mix(uColorLow, uColorHigh, smoothstep(0.2, 1.0, vGlow));
        col += core * vTwinkle * 0.4; // hot white-gold glint at the center
        gl_FragColor = vec4(col, alpha);
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
  }
  resize();
  window.addEventListener("resize", resize);

  /* --- Gentle mouse / device parallax ------------------ */
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    target.y = (e.clientY / window.innerHeight - 0.5) * 0.3;
  });

  /* --- Render loop ------------------------------------- */
  const clock = new THREE.Clock();

  function render() {
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;

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
   3. PRE-LAUNCH SIGNUP
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
      form.classList.add("is-done");
      input.value = "";
      input.disabled = true;
      note.textContent = "You're on the list. We'll be in touch privately.";
      note.classList.add("is-success");
    } catch (err) {
      note.textContent = "Something went wrong — please try again shortly.";
      note.classList.add("is-error");
    }
  });
}

/* Default no-backend handler: remembers the signup in the browser.
   Replace the body with a fetch() to your email provider. */
async function submitEmail(email) {
  // --- Example Formspree wiring (uncomment + add your form id):
  // const res = await fetch("https://formspree.io/f/XXXXXXXX", {
  //   method: "POST",
  //   headers: { "Accept": "application/json", "Content-Type": "application/json" },
  //   body: JSON.stringify({ email }),
  // });
  // if (!res.ok) throw new Error("submit failed");

  const list = JSON.parse(localStorage.getItem("tw_waitlist") || "[]");
  if (!list.includes(email)) list.push(email);
  localStorage.setItem("tw_waitlist", JSON.stringify(list));
  return new Promise((r) => setTimeout(r, 500));
}

/* ===========================================================
   4. SOFT COUNTDOWN  (anticipation, not pressure)
   =========================================================== */
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;

  const LAUNCH = new Date("2026-09-01T09:00:00Z");

  function tick() {
    const diff = LAUNCH - new Date();
    if (diff <= 0) {
      el.innerHTML = "The house is open. <b>Welcome.</b>";
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    el.innerHTML = `Unveiling in <b>${d}</b> days · <b>${h}</b> hours`;
  }
  tick();
  setInterval(tick, 60 * 1000);
}

/* ---------- boot ---------------------------------------- */
initTheme();      // theme + logo first — never depends on 3D
initSignup();
initCountdown();
initScene();      // async, decorative, isolated failure
