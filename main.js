/* =========================================================
   ThobeWear — Three.js backdrop + interactions
   A slow, flowing "silk in low light" particle field with a
   warm gold sheen. Lightweight, GPU-friendly, and respectful
   of reduced-motion preferences.
   --------------------------------------------------------- */

import * as THREE from "three";

/* ---------- small helpers ------------------------------- */
const $ = (sel) => document.querySelector(sel);
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Fill in the year placeholders */
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

/* ===========================================================
   1. THREE.JS SILK FIELD
   =========================================================== */
function initScene() {
  const canvas = $("#scene");
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0b, 0.085);

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
      uColorLow: { value: new THREE.Color(0x6e5a2e) },   // shadowed gold
      uColorHigh: { value: new THREE.Color(0xe7cf95) },  // champagne highlight
      uSize: { value: 14.0 * Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      attribute float seed;
      varying float vGlow;

      void main() {
        vec3 p = position;

        // Two crossing waves give a flowing, fabric-like ripple
        float w1 = sin(p.x * 0.55 + uTime * 0.6 + seed);
        float w2 = cos(p.y * 0.40 - uTime * 0.45 + seed * 0.5);
        p.z += (w1 + w2) * 0.9;

        // Subtle drift in the plane for life
        p.x += sin(uTime * 0.2 + seed) * 0.05;

        vGlow = (w1 + w2) * 0.5 * 0.5 + 0.5; // 0..1 for color mix

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      varying float vGlow;

      void main() {
        // soft round falloff
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float alpha = smoothstep(0.5, 0.0, d);
        alpha *= 0.55;

        vec3 col = mix(uColorLow, uColorHigh, smoothstep(0.2, 1.0, vGlow));
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

    // ease camera toward parallax target
    current.x += (target.x - current.x) * 0.04;
    current.y += (target.y - current.y) * 0.04;
    camera.position.x = current.x;
    camera.position.y = 0.6 - current.y;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    if (!prefersReduced) requestAnimationFrame(render);
  }

  if (prefersReduced) {
    // draw a single static frame for reduced-motion users
    material.uniforms.uTime.value = 1.2;
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(render);
  }
}

/* ===========================================================
   2. PRE-LAUNCH SIGNUP
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
   3. SOFT COUNTDOWN  (anticipation, not pressure)
   Set your real launch date below.
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
initScene();
initSignup();
initCountdown();
