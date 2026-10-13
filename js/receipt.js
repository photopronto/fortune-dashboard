// Draws a receipt design the same way the unit does (port of app/receipt.py),
// using the same DejaVu fonts the Raspberry Pi prints with.

const FONT_FILES = {
  serif: ["DejaVu Serif", "DejaVuSerif.ttf", "normal", "normal"],
  "serif-bold": ["DejaVu Serif", "DejaVuSerif-Bold.ttf", "bold", "normal"],
  "serif-italic": ["DejaVu Serif", "DejaVuSerif-Italic.ttf", "normal", "italic"],
  sans: ["DejaVu Sans", "DejaVuSans.ttf", "normal", "normal"],
  "sans-bold": ["DejaVu Sans", "DejaVuSans-Bold.ttf", "bold", "normal"],
};
export const FONT_CHOICES = [
  ["serif", "Serif"], ["serif-bold", "Serif bold"], ["serif-italic", "Serif italic"], ["sans", "Sans"], ["sans-bold", "Sans bold"],
];
const FALLBACK = { serif: "Georgia, 'Times New Roman', serif", sans: "Arial, Helvetica, sans-serif" };

let fontsReady;
export function loadFonts() {
  if (fontsReady) return fontsReady;
  const base = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/";
  fontsReady = Promise.allSettled(Object.values(FONT_FILES).map(([family, file, weight, style]) => {
    const f = new FontFace(family, `url(${base}${file})`, { weight, style });
    return f.load().then((loaded) => document.fonts.add(loaded));
  }));
  return fontsReady;
}

function cssFont(name, size) {
  const [family, , weight, style] = FONT_FILES[name] || FONT_FILES.sans;
  const fb = family.includes("Serif") ? FALLBACK.serif : FALLBACK.sans;
  return `${style} ${weight} ${size}px "${family}", ${fb}`;
}

function textWidth(ctx, text, spacing = 0) {
  if (!text) return 0;
  return ctx.measureText(text).width + spacing * (text.length - 1);
}

function drawSpaced(ctx, x, y, text, spacing) {
  if (!spacing) { ctx.fillText(text, x, y); return; }
  for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (textWidth(ctx, trial) <= maxW || !line) line = trial;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function lineX(el, w) {
  if (el.align === "center") return el.x + (el.w - w) / 2;
  if (el.align === "right") return el.x + el.w - w;
  return el.x;
}

function placeholders(text, now) {
  return text
    .replace("{date}", now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }))
    .replace("{time}", now.toTimeString().slice(0, 5))
    .replace("{unit_name}", "Fortune Teller");
}

// PIL draws text from the top of the ascender; match that.
function setFont(ctx, name, size) {
  ctx.font = cssFont(name, size);
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText("Hg");
  return m.fontBoundingBoxAscent ?? size * 0.93;
}

function drawText(ctx, el, text) {
  let size = el.size || 24;
  const spacing = el.letter_spacing || 0;
  let ascent = setFont(ctx, el.font || "sans", size);
  if (el.fit_one_line) {
    while (size > 10 && textWidth(ctx, text, spacing) > el.w) { size -= 1; ascent = setFont(ctx, el.font || "sans", size); }
    drawSpaced(ctx, lineX(el, textWidth(ctx, text, spacing)), el.y + ascent, text, spacing);
    return { h: size * 1.2 };
  }
  const lines = spacing ? [text] : wrap(ctx, text, el.w);
  const lh = size * (el.line_spacing || 1.2);
  lines.forEach((line, i) => drawSpaced(ctx, lineX(el, textWidth(ctx, line, spacing)), el.y + i * lh + ascent, line, spacing));
  return { h: Math.max(lh * lines.length, size) };
}

function drawFortune(ctx, el, text) {
  let size = el.size || 34;
  const min = el.min_size || 18, spacing = el.line_spacing || 1.25, maxH = el.max_h || 240;
  let lines, lh, total, ascent;
  for (;;) {
    ascent = setFont(ctx, el.font || "serif", size);
    lines = wrap(ctx, text, el.w);
    lh = size * spacing;
    total = lh * lines.length;
    if (total <= maxH || size <= min) break;
    size -= 2;
  }
  let y = el.y + Math.max(0, (maxH - total) / 2);
  for (const line of lines) { ctx.fillText(line, lineX(el, textWidth(ctx, line)), y + ascent); y += lh; }
  return { h: maxH };
}

function drawDivider(ctx, el) {
  const { x, y, w } = el;
  const mid = x + w / 2;
  ctx.fillStyle = "#000";
  if (el.style === "diamond") {
    ctx.fillRect(x, y - 1, mid - 16 - x, 2);
    ctx.fillRect(mid + 16, y - 1, x + w - mid - 16, 2);
    ctx.beginPath(); ctx.moveTo(mid, y - 8); ctx.lineTo(mid + 8, y); ctx.lineTo(mid, y + 8); ctx.lineTo(mid - 8, y); ctx.closePath(); ctx.fill();
  } else {
    const t = el.thickness || 2;
    ctx.fillRect(x, y - t / 2, w, t);
  }
  return { h: 16, yOff: -8 };
}

// Floyd–Steinberg dither of a greyscale buffer to black and white (what PIL's convert("1") does).
function dither(gray, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const nw = old < 128 ? 0 : 255;
      const err = old - nw;
      gray[i] = nw;
      if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) gray[i + w - 1] += (err * 3) / 16;
        gray[i + w] += (err * 5) / 16;
        if (x + 1 < w) gray[i + w + 1] += err / 16;
      }
    }
  }
}

function drawImageBW(ctx, img, dx, dy, dw, dh, { cover = false, brightness = 1, contrast = 1, doDither = true } = {}) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(dw)); off.height = Math.max(1, Math.round(dh));
  const o = off.getContext("2d");
  o.fillStyle = "#fff"; o.fillRect(0, 0, off.width, off.height);
  if (cover) {
    const s = Math.max(off.width / img.width, off.height / img.height);
    const sw = off.width / s, sh = off.height / s;
    o.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, off.width, off.height);
  } else {
    o.drawImage(img, 0, 0, off.width, off.height);
  }
  const data = o.getImageData(0, 0, off.width, off.height);
  const px = data.data;
  const gray = new Float32Array(off.width * off.height);
  let lo = 255, hi = 0;
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    gray[i] = g; if (g < lo) lo = g; if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) {
    let g = ((gray[i] - lo) / range) * 255;        // autocontrast
    g *= brightness;                                // brightness
    g = (g - 128) * contrast + 128;                 // contrast around mid grey
    gray[i] = Math.max(0, Math.min(255, g));
  }
  if (doDither) dither(gray, off.width, off.height);
  for (let i = 0; i < gray.length; i++) {
    const v = doDither ? gray[i] : gray[i] > 128 ? 255 : 0;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v < 128 ? 0 : 255;
    px[i * 4 + 3] = 255;
  }
  o.putImageData(data, 0, 0);
  ctx.drawImage(off, dx, dy);
}

// A stand-in QR code (real ones are made on the unit, one per fortune)
function drawQr(ctx, x, y, size) {
  const n = 29, cell = size / n;
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#000";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 1; r < n - 1; r++) for (let c = 1; c < n - 1; c++) if (rnd() > 0.52) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5);
  const finder = (fx, fy) => {
    ctx.fillStyle = "#000"; ctx.fillRect(x + fx * cell, y + fy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + (fx + 1) * cell, y + (fy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#000"; ctx.fillRect(x + (fx + 2) * cell, y + (fy + 2) * cell, 3 * cell, 3 * cell);
  };
  finder(1, 1); finder(n - 8, 1); finder(1, n - 8);
}

export function samplePhoto() {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 480;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 480);
  grad.addColorStop(0, "#4a3a6a"); grad.addColorStop(1, "#c8b8e8");
  g.fillStyle = grad; g.fillRect(0, 0, 640, 480);
  g.fillStyle = "#28283c"; g.beginPath(); g.ellipse(320, 560, 170, 250, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#c8a08c"; g.fillRect(285, 280, 70, 70);
  g.fillStyle = "#e1b9a0"; g.beginPath(); g.ellipse(320, 215, 85, 105, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#3c281e"; g.beginPath(); g.ellipse(320, 140, 95, 60, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1e1e1e"; g.beginPath(); g.arc(285, 210, 10, 0, Math.PI * 2); g.arc(355, 210, 10, 0, Math.PI * 2); g.fill();
  return c;
}

/**
 * Render a design onto a canvas. Returns the bounding box of every element
 * (in design pixels) so the editor can select and drag them.
 * images: { [ref]: HTMLImageElement } for backgrounds and logos
 */
export function renderReceipt(canvas, design, { fortune, photo, images = {}, now = new Date() } = {}) {
  const W = design.width || 576, H = design.height || 1100;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  if (design.background && images[design.background]) drawImageBW(ctx, images[design.background], 0, 0, W, H, { cover: true });
  ctx.fillStyle = "#000";
  const boxes = [];
  (design.elements || []).forEach((el, i) => {
    ctx.fillStyle = "#000";
    let box = { x: el.x, y: el.y, w: el.w || 0, h: 0 };
    if (el.type === "text") box.h = drawText(ctx, el, placeholders(el.text || "", now)).h;
    else if (el.type === "fortune") box.h = drawFortune(ctx, el, fortune || "Your fortune text appears here.").h;
    else if (el.type === "photo") {
      const ps = design.photo_settings || {};
      drawImageBW(ctx, photo || samplePhoto(), el.x, el.y, el.w, el.h, { cover: true, brightness: ps.brightness ?? 1.1, contrast: ps.contrast ?? 1.3, doDither: ps.dither !== false });
      const b = el.border || 0;
      if (b) { ctx.strokeStyle = "#000"; ctx.lineWidth = b; ctx.strokeRect(el.x - b / 2, el.y - b / 2, el.w + b, el.h + b); }
      box.h = el.h;
    } else if (el.type === "qr") { drawQr(ctx, el.x, el.y, el.size); box = { x: el.x, y: el.y, w: el.size, h: el.size }; }
    else if (el.type === "image") {
      const img = images[el.src];
      if (img) {
        const h = (img.height * el.w) / img.width;
        drawImageBW(ctx, img, el.x, el.y, el.w, h, { contrast: 1, brightness: 1 });
        box.h = h;
      } else {
        ctx.strokeStyle = "#999"; ctx.setLineDash([6, 6]); ctx.strokeRect(el.x, el.y, el.w, 60); ctx.setLineDash([]);
        box.h = 60;
      }
    } else if (el.type === "divider") { const r = drawDivider(ctx, el); box = { x: el.x, y: el.y - 8, w: el.w, h: 16 }; }
    boxes[i] = box;
  });
  return boxes;
}

export function drawSelection(canvas, box) {
  if (!box) return;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.strokeStyle = "#0078ff"; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
  ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
  ctx.restore();
}
