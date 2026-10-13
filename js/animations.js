// The same light animations the unit runs (a direct port of app/animations.py),
// so the preview in the dashboard matches what the real lights do.

export const PRESETS = [
  ["off", "Off"], ["solid", "Solid"], ["pulse", "Pulse"], ["flash", "Flash"], ["spin", "Spin"],
  ["chase", "Chase"], ["fill", "Fill up (countdown)"], ["sparkle", "Sparkle"], ["rainbow", "Rainbow"], ["custom", "Custom frames"],
];

export function hexToRgb(v) {
  let h = String(v || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}
export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
const lerp = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
const scale = (c, f) => c.map((v) => v * f);
function gradient(colours, f) {
  if (!colours.length) return [0, 0, 0];
  if (colours.length === 1) return colours[0];
  f = Math.min(Math.max(f, 0), 1) * (colours.length - 1);
  const i = Math.min(Math.floor(f), colours.length - 2);
  return lerp(colours[i], colours[i + 1], f - i);
}
function hash01(...vals) {
  let h = 0x9e3779b9;
  for (const v of vals) {
    h = (h ^ (v >>> 0)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 0xffffffff;
}
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map((x) => x * 255);
}

export function buildLayout(settings = {}) {
  let pixels = [];
  if (Array.isArray(settings.pixels) && settings.pixels.length) {
    pixels = settings.pixels.map((p) => ({ ...p }));
  } else {
    const n = settings.ring_count ?? 16;
    const start = ((settings.ring_start_angle ?? -90) * Math.PI) / 180;
    for (let k = 0; k < n; k++) {
      const a = start + (2 * Math.PI * k) / n;
      pixels.push({ group: "ring", x: 0.5 + 0.42 * Math.cos(a), y: 0.5 + 0.42 * Math.sin(a) });
    }
    if (settings.button ?? true) pixels.push({ group: "button", x: 0.5, y: 0.5 });
    if (settings.status_pixel) pixels.push({ group: "status", x: 0.92, y: 0.08 });
  }
  const groups = { all: pixels.map((_, i) => i) };
  pixels.forEach((p, i) => (groups[p.group] ||= []).push(i));
  return { pixels, groups };
}

function layerColour(preset, colours, k, m, t, elapsed, speed, layer, ctx) {
  const c0 = colours[0] || [255, 255, 255];
  switch (preset) {
    case "off": return [0, 0, 0];
    case "solid": return colours.length > 1 ? gradient(colours, k / Math.max(m - 1, 1)) : c0;
    case "pulse": return scale(c0, 0.12 + 0.88 * (0.5 + 0.5 * Math.sin(2 * Math.PI * speed * t)));
    case "flash": return ((t * speed * 2) % 2) < 1 ? c0 : [0, 0, 0];
    case "spin": {
      const head = (t * speed * m) % m;
      const behind = (((head - k) % m) + m) % m;
      const tail = Math.max(1, m * (layer.tail ?? 0.4));
      if (behind > tail) return [0, 0, 0];
      const f = behind / tail;
      return scale(gradient(colours, f), (1 - f) ** 1.6);
    }
    case "chase": {
      const step = Math.floor(t * speed * 8);
      return (k + step) % (layer.gap ?? 3) === 0 ? c0 : [0, 0, 0];
    }
    case "fill": {
      const duration = layer.duration || ctx.countdown_seconds || 8;
      const p = Math.min(elapsed / duration, 1);
      const lit = p * m;
      const colour = gradient(colours, p);
      if (k < Math.floor(lit)) return colour;
      if (k === Math.floor(lit)) return scale(colour, lit - Math.floor(lit));
      return [0, 0, 0];
    }
    case "sparkle": {
      const tick = Math.floor(t * speed * 12);
      const r = hash01(k, tick);
      if (r > 0.7) {
        const idx = colours.length ? Math.floor(hash01(k, tick, 7) * colours.length) : 0;
        return scale(colours[Math.min(idx, colours.length - 1)] || c0, (r - 0.7) / 0.3);
      }
      return [0, 0, 0];
    }
    case "rainbow": return hsv((k / Math.max(m, 1) + t * speed * 0.2) % 1, 1, 1);
    case "custom": {
      const frames = layer.frames || [];
      if (!frames.length) return [0, 0, 0];
      const frame = frames[Math.floor((t * 1000) / Math.max(layer.frame_ms || 100, 10)) % frames.length];
      return k < frame.length && frame[k] ? hexToRgb(frame[k]) : [0, 0, 0];
    }
  }
  return [0, 0, 0];
}

export function renderFrame(layout, layers, t, elapsed, ctx = {}) {
  const out = layout.pixels.map(() => [0, 0, 0]);
  for (const layer of layers || []) {
    const idxs = layout.groups[layer.target || "all"] || [];
    const colours = (layer.colours || []).map(hexToRgb);
    const speed = Number(layer.speed ?? 1);
    idxs.forEach((i, k) => { out[i] = layerColour(layer.preset || "off", colours, k, idxs.length, t, elapsed, speed, layer, ctx); });
  }
  return out;
}

// Draw the cabinet's lights onto a canvas (dark panel, glowing pixels).
export function drawLights(canvas, layout, frame, { highlight = -1 } = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#16131d";
  ctx.fillRect(0, 0, W, H);
  layout.pixels.forEach((p, i) => {
    const [r, g, b] = frame[i] || [0, 0, 0];
    const x = p.x * W, y = p.y * H;
    const isButton = p.group === "button";
    const radius = isButton ? W * 0.11 : W * 0.032;
    const level = Math.max(r, g, b);
    if (isButton) {
      ctx.beginPath(); ctx.arc(x, y, radius * 1.22, 0, Math.PI * 2);
      ctx.fillStyle = "#5c5c66"; ctx.fill();
    }
    if (level > 8) {
      const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2.6);
      glow.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${0.55 * level / 255})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = level > 8 ? `rgb(${Math.max(r, 40) | 0},${Math.max(g, 36) | 0},${Math.max(b, 50) | 0})` : "#2c2838";
    ctx.fill();
    if (i === highlight) {
      ctx.lineWidth = 3; ctx.strokeStyle = "#0078ff"; ctx.stroke();
    }
  });
}

export function pixelAt(layout, canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  let best = -1, bestD = Infinity;
  layout.pixels.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    const limit = p.group === "button" ? 0.14 : 0.06;
    if (d < limit && d < bestD) { best = i; bestD = d; }
  });
  return best;
}
