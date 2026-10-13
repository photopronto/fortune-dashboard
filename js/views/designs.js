// Receipt designs: what the printed fortune looks like.
import * as api from "../api.js";
import { el, mount, act, field, select, toggle, dirtyTracker, confirmDialog, toast, ago } from "../ui.js";
import { renderReceipt, drawSelection, loadFonts, FONT_CHOICES } from "../receipt.js";

const SAMPLE_FORTUNE = "The thing you keep putting off is smaller than it looks. Do it on Tuesday.";
const KIND_LABEL = { text: "Text", fortune: "Fortune", photo: "Photo", qr: "QR code", image: "Image", divider: "Divider" };

export const STARTER_LAYOUT = {
  width: 576, height: 1120, background: null,
  photo_settings: { brightness: 1.1, contrast: 1.3, dither: true },
  elements: [
    { type: "text", text: "THE FORTUNE TELLER", x: 24, y: 40, w: 528, font: "serif-bold", size: 46, align: "center", fit_one_line: true },
    { type: "divider", x: 120, y: 108, w: 336, style: "diamond" },
    { type: "photo", x: 48, y: 136, w: 480, h: 360, border: 3 },
    { type: "text", text: "YOUR FORTUNE", x: 0, y: 528, w: 576, font: "sans-bold", size: 22, align: "center", letter_spacing: 6 },
    { type: "fortune", x: 56, y: 572, w: 464, max_h: 230, font: "serif-italic", size: 36, min_size: 22, align: "center", line_spacing: 1.25 },
    { type: "divider", x: 120, y: 830, w: 336, style: "diamond" },
    { type: "qr", x: 208, y: 862, size: 160 },
    { type: "text", text: "Scan for your digital copy", x: 0, y: 1036, w: 576, font: "sans", size: 22, align: "center" },
    { type: "text", text: "{date}  ·  {time}", x: 0, y: 1072, w: 576, font: "sans", size: 18, align: "center" },
  ],
};

const NEW_ELEMENT = {
  text: () => ({ type: "text", text: "New text", x: 40, y: 40, w: 496, font: "sans", size: 26, align: "center" }),
  fortune: () => ({ type: "fortune", x: 56, y: 560, w: 464, max_h: 220, font: "serif-italic", size: 34, min_size: 20, align: "center", line_spacing: 1.25 }),
  photo: () => ({ type: "photo", x: 48, y: 140, w: 480, h: 360, border: 0 }),
  qr: () => ({ type: "qr", x: 208, y: 860, size: 160 }),
  image: () => ({ type: "image", src: null, x: 188, y: 20, w: 200 }),
  divider: () => ({ type: "divider", x: 120, y: 520, w: 336, style: "diamond" }),
};

const clone = (v) => JSON.parse(JSON.stringify(v));

async function renderList({ root, state }) {
  const list = await api.designs(state.accountId);
  const name = el("input", { type: "text", placeholder: "New design name", maxlength: "60", style: { width: "220px" } });
  const add = el("button", { class: "btn dark", type: "button", text: "Create design" });
  add.onclick = () => act(add, async () => {
    if (!name.value.trim()) throw new Error("Give the design a name");
    const d = await api.createDesign(state.accountId, name.value.trim(), { ...clone(STARTER_LAYOUT), name: name.value.trim() });
    location.hash = `#/designs/${d.id}`;
  });
  await loadFonts();
  const cards = list.map((d) => {
    const c = el("canvas", { style: { width: "100%", height: "auto", background: "#fff", display: "block", borderRadius: "6px" } });
    renderReceipt(c, d.layout, { fortune: SAMPLE_FORTUNE });
    return el("a", { class: "tile card-link", href: `#/designs/${d.id}` },
      el("div", { style: { maxWidth: "150px", margin: "0 auto 14px" } }, c),
      el("h2", { style: { margin: 0 }, text: d.name }),
      el("p", { class: "muted small", style: { margin: "4px 0 0" }, text: `Updated ${ago(d.updated_at)}` }));
  });
  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "Receipt designs" }), el("p", { class: "sub", text: "What gets printed. Each unit uses one design, and events can switch to another." })),
      el("div", { class: "btn-row" }, name, add)),
    list.length ? el("div", { class: "grid" }, cards) : el("div", { class: "tile empty" }, el("h2", { text: "No designs yet" }), el("p", { text: "Create one above to start from the standard layout." })),
  );
}

async function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderEditor({ root, state }, id) {
  const d = await api.design(id);
  const layout = clone(d.layout);
  layout.elements ||= [];
  layout.photo_settings ||= {};
  let selected = layout.elements.length ? 0 : -1;
  let boxes = [];
  const images = {};          // "asset:path" -> loaded image
  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);

  await loadFonts();
  async function ensureImage(ref) {
    if (!ref || images[ref] !== undefined) return;
    images[ref] = null;
    const url = ref.startsWith("asset:") ? await api.assetUrl(ref.slice(6)) : null;
    if (url) images[ref] = await loadImage(url);
    redraw();
  }

  // ---- preview --------------------------------------------------------------
  const canvas = el("canvas", { "aria-label": "Receipt preview" });
  function redraw() {
    boxes = renderReceipt(canvas, layout, { fortune: SAMPLE_FORTUNE, images });
    if (selected >= 0) drawSelection(canvas, boxes[selected]);
  }
  let drag = null;
  const toDesign = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const p = toDesign(e);
    let hit = -1;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (b && p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) { hit = i; break; }
    }
    selected = hit;
    drawElements(); drawProps(); redraw();
    if (hit >= 0) {
      const el0 = layout.elements[hit];
      drag = { start: p, x: el0.x, y: el0.y };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || selected < 0) return;
    const p = toDesign(e);
    const elx = layout.elements[selected];
    elx.x = Math.round(drag.x + p.x - drag.start.x);
    elx.y = Math.round(drag.y + p.y - drag.start.y);
    dirty.mark(); redraw(); syncPosInputs();
  });
  const endDrag = () => { drag = null; canvas.style.cursor = ""; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---- element list -----------------------------------------------------------
  const elList = el("div", { class: "el-list" });
  function drawElements() {
    mount(elList, layout.elements.map((e, i) => el("button", {
      type: "button", class: `el-item ${i === selected ? "sel" : ""}`,
      onclick: () => { selected = i; drawElements(); drawProps(); redraw(); },
    }, el("span", { class: "kind", text: KIND_LABEL[e.type] || e.type }),
       el("span", { class: "label", text: e.type === "text" ? e.text : e.type === "fortune" ? "The guest's fortune" : e.type === "image" ? (e.src ? "Uploaded image" : "No image yet") : "" }))));
  }
  const addSel = select([["", "Add an element…"], ...Object.keys(NEW_ELEMENT).map((k) => [k, KIND_LABEL[k]])], "");
  addSel.addEventListener("change", () => {
    if (!addSel.value) return;
    layout.elements.push(NEW_ELEMENT[addSel.value]());
    selected = layout.elements.length - 1;
    addSel.value = "";
    dirty.mark(); drawElements(); drawProps(); redraw();
  });

  // ---- properties ---------------------------------------------------------------
  const props = el("div", { class: "stack" });
  let posInputs = {};
  function syncPosInputs() {
    const e = layout.elements[selected];
    if (!e) return;
    if (posInputs.x) posInputs.x.value = e.x;
    if (posInputs.y) posInputs.y.value = e.y;
  }
  function num(e, key, label, opts = {}) {
    const input = el("input", { type: "number", value: e[key] ?? opts.def ?? 0, step: opts.step || "1", min: opts.min, max: opts.max });
    input.addEventListener("input", () => { e[key] = input.value === "" ? undefined : Number(input.value); dirty.mark(); redraw(); });
    posInputs[key] = input;
    return field(label, input, opts.hint);
  }
  function drawProps() {
    posInputs = {};
    const e = layout.elements[selected];
    if (!e) { mount(props, el("p", { class: "muted", text: "Click an element on the receipt, or in the list, to edit it." })); return; }
    const fields = [];
    if (e.type === "text") {
      const t = el("input", { type: "text", value: e.text || "", maxlength: "200" });
      t.addEventListener("input", () => { e.text = t.value; dirty.mark(); redraw(); drawElements(); });
      fields.push(field("Text", t, "You can use {date}, {time} and {unit_name}"));
    }
    if (e.type === "text" || e.type === "fortune") {
      const f = select(FONT_CHOICES, e.font || "sans");
      f.addEventListener("change", () => { e.font = f.value; dirty.mark(); redraw(); });
      const a = select([["left", "Left"], ["center", "Centre"], ["right", "Right"]], e.align || "left");
      a.addEventListener("change", () => { e.align = a.value; dirty.mark(); redraw(); });
      fields.push(el("div", { class: "form-grid" }, field("Font", f), field("Align", a), num(e, "size", e.type === "fortune" ? "Largest size" : "Size", { min: 8, max: 160 })));
    }
    if (e.type === "fortune") {
      fields.push(el("div", { class: "form-grid" }, num(e, "min_size", "Smallest size", { min: 8, max: 120, hint: "Long fortunes shrink down to this" }),
        num(e, "max_h", "Box height", { min: 20, max: 1000 }), num(e, "line_spacing", "Line spacing", { step: "0.05", min: 0.8, max: 3, def: 1.25 })));
    }
    if (e.type === "text") {
      const fit = toggle("Shrink to fit on one line", !!e.fit_one_line, (v) => { e.fit_one_line = v; dirty.mark(); redraw(); });
      fields.push(el("div", { class: "form-grid" }, num(e, "letter_spacing", "Letter spacing", { min: 0, max: 40 }), num(e, "line_spacing", "Line spacing", { step: "0.05", min: 0.8, max: 3, def: 1.2 })), fit.node);
    }
    if (e.type === "photo") {
      fields.push(el("div", { class: "form-grid" }, num(e, "h", "Height", { min: 20, max: 1500 }), num(e, "border", "Border", { min: 0, max: 20 })));
    }
    if (e.type === "qr") fields.push(el("div", { class: "form-grid" }, num(e, "size", "Size", { min: 80, max: 400, hint: "Keep it at least 120 so phones scan it easily" })));
    if (e.type === "divider") {
      const s = select([["diamond", "Line with diamond"], ["line", "Plain line"]], e.style || "line");
      s.addEventListener("change", () => { e.style = s.value; dirty.mark(); redraw(); });
      fields.push(field("Style", s));
    }
    if (e.type === "image") {
      const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
      file.addEventListener("change", () => act(null, async () => {
        const f = file.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) throw new Error("Please use an image under 5 MB");
        const path = await api.uploadAsset(state.accountId, f, "images");
        e.src = `asset:${path}`;
        dirty.mark(); await ensureImage(e.src); drawElements();
      }, "Image uploaded"));
      fields.push(field("Image", file, "PNG with a transparent background works best for logos. It prints in black and white."));
    }
    const geo = [num(e, "x", "Left", { min: -600, max: 1200 }), num(e, "y", "Top", { min: -600, max: 3000 })];
    if (e.type !== "qr") geo.push(num(e, "w", "Width", { min: 10, max: 576 }));
    const move = (dlt) => { const j = selected + dlt; if (j < 0 || j >= layout.elements.length) return; const arr = layout.elements; [arr[selected], arr[j]] = [arr[j], arr[selected]]; selected = j; dirty.mark(); drawElements(); redraw(); };
    const centre = el("button", { class: "btn small", type: "button", text: "Centre across", onclick: () => { const w = e.type === "qr" ? e.size : e.w; e.x = Math.round(((layout.width || 576) - w) / 2); dirty.mark(); syncPosInputs(); redraw(); } });
    mount(props,
      el("h3", { text: KIND_LABEL[e.type] }),
      fields,
      el("div", { class: "form-grid" }, geo),
      el("div", { class: "btn-row" }, centre,
        el("button", { class: "btn small", type: "button", text: "Send back", onclick: () => move(-1) }),
        el("button", { class: "btn small", type: "button", text: "Bring forward", onclick: () => move(1) }),
        el("button", { class: "btn small", type: "button", text: "Duplicate", onclick: () => { layout.elements.splice(selected + 1, 0, { ...clone(e), y: e.y + 20 }); selected += 1; dirty.mark(); drawElements(); drawProps(); redraw(); } }),
        el("button", { class: "btn small danger", type: "button", text: "Remove", onclick: () => { layout.elements.splice(selected, 1); selected = -1; dirty.mark(); drawElements(); drawProps(); redraw(); } })),
    );
  }

  // ---- whole-design settings ------------------------------------------------------
  const name = el("input", { type: "text", value: d.name, maxlength: "60" });
  name.addEventListener("input", dirty.mark);
  const height = el("input", { type: "number", min: "200", max: "3000", step: "10", value: layout.height || 1100 });
  height.addEventListener("input", () => { layout.height = Math.max(200, Math.min(3000, Number(height.value) || 1100)); dirty.mark(); redraw(); });
  const mm = el("span", { class: "muted small" });
  const updateMm = () => { mm.textContent = `${Math.round((layout.height || 1100) / 8)} mm of paper per fortune`; };
  height.addEventListener("input", updateMm); updateMm();
  const ps = layout.photo_settings;
  const bright = el("input", { type: "range", min: "0.5", max: "1.8", step: "0.05", value: ps.brightness ?? 1.1 });
  const contrast = el("input", { type: "range", min: "0.5", max: "2.5", step: "0.05", value: ps.contrast ?? 1.3 });
  bright.addEventListener("input", () => { ps.brightness = Number(bright.value); dirty.mark(); redraw(); });
  contrast.addEventListener("input", () => { ps.contrast = Number(contrast.value); dirty.mark(); redraw(); });
  const dith = toggle("Dither the photo (shades of grey as dots)", ps.dither !== false, (v) => { ps.dither = v; dirty.mark(); redraw(); });
  const bgFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
  const bgRemove = el("button", { class: "btn small", type: "button", text: "Remove background", onclick: () => { layout.background = null; dirty.mark(); redraw(); bgRemove.hidden = true; } });
  bgRemove.hidden = !layout.background;
  bgFile.addEventListener("change", () => act(null, async () => {
    const f = bgFile.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) throw new Error("Please use an image under 8 MB");
    const path = await api.uploadAsset(state.accountId, f, "backgrounds");
    layout.background = `asset:${path}`;
    bgRemove.hidden = false;
    dirty.mark(); await ensureImage(layout.background);
  }, "Background uploaded"));

  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save design" });
  saveBtn.onclick = () => act(saveBtn, async () => {
    if (!name.value.trim()) throw new Error("Give the design a name");
    if (!layout.elements.some((e) => e.type === "fortune")) throw new Error("The design needs a Fortune element, or no fortune will print");
    layout.name = name.value.trim();
    await api.updateDesign(id, { name: name.value.trim(), layout });
    dirty.clear();
  }, "Design saved. Units pick it up within a minute.");
  const dup = el("button", { class: "btn", type: "button", text: "Duplicate design" });
  dup.onclick = () => act(dup, async () => {
    const copy = await api.createDesign(state.accountId, `${name.value.trim() || d.name} copy`, { ...clone(layout), name: `${name.value.trim()} copy` });
    dirty.clear();
    location.hash = `#/designs/${copy.id}`;
    toast("Copy created");
  });
  const del = el("button", { class: "btn danger", type: "button", text: "Delete" });
  del.onclick = async () => {
    if (!(await confirmDialog("Delete this design?", `"${d.name}" will be deleted. Units or events using it will fall back to another design.`))) return;
    await act(del, async () => { await api.deleteDesign(id); dirty.clear(); location.hash = "#/designs"; }, "Design deleted");
  };

  mount(root,
    el("a", { class: "back", href: "#/designs", text: "← All designs" }),
    el("div", { class: "page-head" }, el("h1", { text: d.name }), el("div", { class: "btn-row" }, dup, del)),
    el("div", { class: "editor" },
      el("div", { class: "canvas-wrap", style: { flexDirection: "column", alignItems: "center", gap: "10px" } }, canvas,
        el("p", { class: "muted small", style: { margin: 0, textAlign: "center" }, text: "Drag elements to move them. The QR code here is a stand-in; every fortune gets its own." })),
      el("div", { class: "stack" },
        el("div", { class: "tile" }, el("h2", { text: "Design" }),
          el("div", { class: "form-grid" }, field("Name", name), el("div", {}, field("Length (dots)", height), mm))),
        el("div", { class: "tile" }, el("div", { class: "page-head", style: { marginBottom: "10px" } }, el("h2", { style: { margin: 0 }, text: "Elements" }), addSel), elList),
        el("div", { class: "tile" }, props),
        el("div", { class: "tile" }, el("h2", { text: "Photo and background" }),
          el("div", { class: "form-grid" }, field("Photo brightness", bright), field("Photo contrast", contrast)),
          el("div", { style: { margin: "12px 0" } }, dith.node),
          field("Background image", bgFile, "Fills the whole receipt behind everything else, in black and white"),
          el("div", { class: "btn-row", style: { marginTop: "8px" } }, bgRemove)),
        el("div", { class: "save-bar" }, saveState, saveBtn))),
  );
  drawElements(); drawProps(); redraw();
  if (layout.background) ensureImage(layout.background);
  for (const e of layout.elements) if (e.type === "image" && e.src) ensureImage(e.src);
}

export async function render(ctx) {
  const [id] = ctx.params;
  return id ? renderEditor(ctx, id) : renderList(ctx);
}
