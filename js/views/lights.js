// Lights designer: pick an animation for each state, or draw your own frame by frame.
import * as api from "../api.js";
import { el, mount, act, field, select, dirtyTracker, toggle } from "../ui.js";
import { PRESETS, buildLayout, renderFrame, drawLights, pixelAt } from "../animations.js";

const STATES = [
  ["idle", "Waiting", "Ready for the next guest"],
  ["countdown", "Countdown", "After the button is pressed, before the photo"],
  ["capture", "Photo flash", "A split second while the photo is taken"],
  ["printing", "Printing", "While the fortune prints"],
  ["finish", "Finished", "Just after the fortune comes out"],
  ["low_paper", "Paper low", "Ready, but the roll is nearly finished"],
  ["error", "Needs attention", "Out of paper or a printer fault"],
  ["closed", "Closed", "Outside opening hours"],
];
const TARGET_LABELS = { all: "All lights", ring: "Circle", button: "Button", status: "Status light" };
const DEFAULT_LAYER = { target: "ring", preset: "spin", colours: ["#7b2cff"], speed: 1 };

function clone(v) { return JSON.parse(JSON.stringify(v)); }

export async function renderLights(box, unit, ctx) {
  const settings = unit.settings || {};
  let animations = clone(settings.animations || {});
  for (const [key] of STATES) animations[key] ||= [{ target: "all", preset: "off" }];
  let layoutSettings = clone(unit.light_layout || {});
  let layout = buildLayout(layoutSettings);
  let current = "idle";
  let editFrame = { layer: -1, frame: 0, colour: "#ff2fa0" };

  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);

  // ---- preview -------------------------------------------------------------
  const canvas = el("canvas", { width: "600", height: "600", "aria-label": "Light preview" });
  const caption = el("p", { class: "muted small", style: { textAlign: "center", margin: "10px 0 0" } });
  let started = performance.now();
  let raf;
  const tick = (now) => {
    if (!document.body.contains(canvas)) return cancelAnimationFrame(raf);
    const t = (now - started) / 1000;
    const countdown = Number(settings.countdown_seconds || 8);
    // Loop the countdown so its fill-up plays again and again
    const elapsed = current === "countdown" ? t % (countdown + 1) : t;
    const layers = animations[current];
    let frame;
    const layer = layers[editFrame.layer];
    if (layer && layer.preset === "custom") {
      // While editing frames, show the frame being edited, not the playback
      frame = renderFrame(layout, layers.map((l, i) => i === editFrame.layer ? { ...l, frames: [l.frames[editFrame.frame] || []], frame_ms: 1e9 } : l), t, elapsed, { countdown_seconds: countdown });
    } else {
      frame = renderFrame(layout, layers, t, elapsed, { countdown_seconds: countdown });
    }
    drawLights(canvas, layout, frame);
    raf = requestAnimationFrame(tick);
  };

  canvas.addEventListener("pointerdown", (e) => {
    const layer = animations[current][editFrame.layer];
    if (!layer || layer.preset !== "custom") return;
    const i = pixelAt(layout, canvas, e.clientX, e.clientY);
    if (i < 0) return;
    const idxs = layout.groups[layer.target || "all"] || [];
    const k = idxs.indexOf(i);
    if (k < 0) return;
    const frame = layer.frames[editFrame.frame];
    frame[k] = frame[k] && frame[k] === editFrame.colour ? null : editFrame.colour;
    dirty.mark();
  });

  // ---- state picker & layers -------------------------------------------------
  const pills = el("div", { class: "state-pills" });
  const stateHint = el("p", { class: "muted small", style: { margin: "8px 0 14px" } });
  const layersBox = el("div", { class: "stack" });

  function drawPills() {
    mount(pills, STATES.map(([key, label]) => el("button", {
      type: "button", class: key === current ? "active" : "", text: label,
      onclick: () => { current = key; editFrame.layer = -1; started = performance.now(); drawAll(); },
    })));
    const s = STATES.find((x) => x[0] === current);
    stateHint.textContent = s[2];
    caption.textContent = `Preview: ${s[1]}`;
  }

  function colourInputs(layer) {
    const wrap = el("div", { class: "colours" });
    const draw = () => {
      mount(wrap,
        (layer.colours || []).map((c, ci) => {
          const input = el("input", { type: "color", value: c, "aria-label": `Colour ${ci + 1}` });
          input.addEventListener("input", () => { layer.colours[ci] = input.value; dirty.mark(); });
          return el("span", { class: "btn-row", style: { gap: "2px" } }, input,
            layer.colours.length > 1 ? el("button", { class: "btn icon small", type: "button", "aria-label": "Remove colour", text: "×",
              onclick: () => { layer.colours.splice(ci, 1); dirty.mark(); draw(); } }) : null);
        }),
        (layer.colours || []).length < 4 ? el("button", { class: "btn small", type: "button", text: "+ colour",
          onclick: () => { (layer.colours ||= []).push("#ffffff"); dirty.mark(); draw(); } }) : null,
      );
    };
    draw();
    return wrap;
  }

  function frameEditor(layer, li) {
    layer.frames ||= [[]];
    if (!layer.frames.length) layer.frames.push([]);
    const wrap = el("div", { class: "stack" });
    const draw = () => {
      const frameBtns = layer.frames.map((_, fi) => el("button", {
        type: "button", class: editFrame.layer === li && editFrame.frame === fi ? "active" : "", text: String(fi + 1),
        "aria-label": `Edit frame ${fi + 1}`, onclick: () => { editFrame = { ...editFrame, layer: li, frame: fi }; draw(); },
      }));
      const paint = el("input", { type: "color", value: editFrame.colour, "aria-label": "Paint colour" });
      paint.addEventListener("input", () => { editFrame.colour = paint.value; });
      const ms = el("input", { type: "number", min: "30", max: "5000", step: "10", value: layer.frame_ms || 150, style: { width: "100px" } });
      ms.addEventListener("input", () => { layer.frame_ms = Math.max(30, Number(ms.value) || 150); dirty.mark(); });
      const editing = editFrame.layer === li;
      mount(wrap,
        el("div", { class: "frames" }, frameBtns),
        el("div", { class: "btn-row" },
          el("button", { class: "btn small", type: "button", text: "Add frame", onclick: () => { layer.frames.push([]); editFrame = { ...editFrame, layer: li, frame: layer.frames.length - 1 }; dirty.mark(); draw(); } }),
          el("button", { class: "btn small", type: "button", text: "Copy frame", onclick: () => {
            const src = layer.frames[editing ? editFrame.frame : 0] || [];
            layer.frames.splice((editing ? editFrame.frame : 0) + 1, 0, [...src]);
            editFrame = { ...editFrame, layer: li, frame: (editing ? editFrame.frame : 0) + 1 }; dirty.mark(); draw(); } }),
          layer.frames.length > 1 ? el("button", { class: "btn small danger", type: "button", text: "Delete frame", onclick: () => {
            layer.frames.splice(editing ? editFrame.frame : layer.frames.length - 1, 1);
            editFrame = { ...editFrame, layer: li, frame: 0 }; dirty.mark(); draw(); } }) : null,
          editing ? el("button", { class: "btn small", type: "button", text: "Play", onclick: () => { editFrame.layer = -1; draw(); } }) : null),
        el("div", { class: "form-grid" },
          field("Paint colour", paint, editing ? "Tap a light in the preview to paint it; tap again to turn it off" : "Choose a frame number to start painting"),
          field("Time per frame (ms)", ms)),
      );
    };
    draw();
    return wrap;
  }

  function layerCard(layer, li, layers) {
    const groups = Object.keys(layout.groups).filter((g) => layout.groups[g].length);
    const target = select(groups.map((g) => [g, TARGET_LABELS[g] || g]), layer.target || "all");
    const preset = select(PRESETS, layer.preset || "off");
    target.addEventListener("change", () => { layer.target = target.value; dirty.mark(); });
    preset.addEventListener("change", () => {
      layer.preset = preset.value;
      if (layer.preset === "custom") { layer.frames ||= [[]]; layer.frame_ms ||= 150; editFrame = { ...editFrame, layer: li, frame: 0 }; }
      if (!layer.colours || !layer.colours.length) layer.colours = ["#ffffff"];
      dirty.mark(); drawLayers();
    });
    const speed = el("input", { type: "range", min: "0.1", max: "3", step: "0.1", value: layer.speed ?? 1 });
    const speedLabel = el("span", { class: "mono", text: `${Number(layer.speed ?? 1).toFixed(1)}×` });
    speed.addEventListener("input", () => { layer.speed = Number(speed.value); speedLabel.textContent = `${layer.speed.toFixed(1)}×`; dirty.mark(); });

    const p = layer.preset || "off";
    const needsColours = !["off", "rainbow", "custom"].includes(p);
    const hasSpeed = ["pulse", "flash", "spin", "chase", "sparkle", "rainbow"].includes(p);
    const extras = [];
    if (p === "spin") {
      const tail = el("input", { type: "range", min: "0.1", max: "1", step: "0.05", value: layer.tail ?? 0.4 });
      tail.addEventListener("input", () => { layer.tail = Number(tail.value); dirty.mark(); });
      extras.push(field("Tail length", tail));
    }
    if (p === "chase") {
      const gap = el("input", { type: "number", min: "2", max: "8", value: layer.gap ?? 3 });
      gap.addEventListener("input", () => { layer.gap = Math.max(2, Number(gap.value) || 3); dirty.mark(); });
      extras.push(field("Gap between lights", gap));
    }
    const move = (d) => { const j = li + d; if (j < 0 || j >= layers.length) return; [layers[li], layers[j]] = [layers[j], layers[li]]; dirty.mark(); drawLayers(); };
    return el("div", { class: "layer" },
      el("div", { class: "layer-head" }, target, preset,
        el("span", { style: { flex: "1" } }),
        layers.length > 1 ? [
          el("button", { class: "btn icon small", type: "button", "aria-label": "Move up", text: "↑", onclick: () => move(-1) }),
          el("button", { class: "btn icon small", type: "button", "aria-label": "Move down", text: "↓", onclick: () => move(1) }),
          el("button", { class: "btn icon small danger", type: "button", "aria-label": "Remove layer", text: "×", onclick: () => { layers.splice(li, 1); editFrame.layer = -1; dirty.mark(); drawLayers(); } }),
        ] : null),
      needsColours ? field(p === "fill" ? "Colours (start to end of countdown)" : "Colours", colourInputs(layer)) : null,
      hasSpeed ? el("label", { class: "field" }, el("span", { class: "btn-row", style: { justifyContent: "space-between" } }, "Speed", speedLabel), speed) : null,
      extras.length ? el("div", { class: "form-grid" }, extras) : null,
      p === "custom" ? frameEditor(layer, li) : null,
      p === "fill" ? el("p", { class: "muted small", style: { margin: 0 }, text: "Fills the lights one by one over the countdown time." }) : null,
    );
  }

  function drawLayers() {
    const layers = animations[current];
    mount(layersBox,
      layers.map((l, i) => layerCard(l, i, layers)),
      el("div", { class: "btn-row" },
        el("button", { class: "btn small", type: "button", text: "+ Add layer", onclick: () => { layers.push(clone(DEFAULT_LAYER)); dirty.mark(); drawLayers(); } }),
        el("span", { class: "muted small", text: "Later layers draw on top of earlier ones." })),
    );
  }

  function drawAll() { drawPills(); drawLayers(); }

  // ---- light layout (Photo Pronto only) -------------------------------------
  let layoutTile = null;
  if (ctx.state.admin) {
    const count = el("input", { type: "number", min: "1", max: "120", value: layoutSettings.ring_count ?? 16 });
    const angle = el("input", { type: "number", min: "-360", max: "360", step: "15", value: layoutSettings.ring_start_angle ?? -90 });
    const btn = toggle("Light inside the button", layoutSettings.button ?? true);
    const status = toggle("Separate status light", !!layoutSettings.status_pixel);
    const apply = () => {
      layoutSettings = { ...layoutSettings, ring_count: Math.max(1, Math.min(120, Number(count.value) || 16)), ring_start_angle: Number(angle.value) || 0, button: btn.input.checked, status_pixel: status.input.checked };
      layout = buildLayout(layoutSettings);
      dirty.mark(); drawLayers();
    };
    [count, angle, btn.input, status.input].forEach((i) => i.addEventListener("change", apply));
    layoutTile = el("div", { class: "tile" }, el("h2", { text: "Light layout (Photo Pronto only)" }),
      el("p", { class: "muted small", style: { marginTop: "-6px" }, text: "Match this to how the unit is wired: circle lights first in wiring order, then the button, then the status light." }),
      el("div", { class: "form-grid" }, field("Lights in the circle", count), field("First light position (degrees)", angle, "-90 is the top")),
      el("div", { class: "btn-row", style: { marginTop: "12px", gap: "18px" } }, btn.node, status.node));
  }

  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save lights" });
  saveBtn.onclick = () => act(saveBtn, async () => {
    const patch = { settings: { ...(unit.settings || {}), animations } };
    if (ctx.state.admin) patch.light_layout = layoutSettings;
    const saved = await api.updateUnit(unit.id, patch);
    Object.assign(unit, saved);
    dirty.clear();
  }, "Lights saved. The unit picks them up within a minute.");

  mount(box, el("div", { class: "editor" },
    el("div", { class: "canvas-wrap", style: { flexDirection: "column", background: "#16131d" } },
      el("div", { class: "lights-preview", style: { padding: 0 } }, canvas), caption),
    el("div", { class: "stack" },
      el("div", { class: "tile" }, el("h2", { text: "Animation for each moment" }), pills, stateHint, layersBox),
      layoutTile,
      el("div", { class: "save-bar" }, saveState, saveBtn)),
  ));
  drawAll();
  raf = requestAnimationFrame(tick);
}
