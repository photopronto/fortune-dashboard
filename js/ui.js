// Small DOM helpers shared by every page.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") throw new Error("html attr not allowed");
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "value") node.value = v;
    else if (k === "checked") node.checked = !!v;
    else if (k === "selected") node.selected = !!v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

export function mount(target, ...nodes) {
  target.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
}

export function toast(message, kind = "") {
  const box = document.getElementById("toasts");
  const t = el("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : "status", text: message });
  box.append(t);
  setTimeout(() => t.remove(), kind === "error" ? 6000 : 3000);
}

export function errorText(e) {
  if (!e) return "Something went wrong";
  return e.message || e.error_description || String(e);
}

// Run an async action with a busy button and a toast on error.
export async function act(button, fn, okMessage) {
  if (button) button.disabled = true;
  try {
    const out = await fn();
    if (okMessage) toast(okMessage);
    return out;
  } catch (e) {
    console.error(e);
    toast(errorText(e), "error");
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

export function field(label, input, hint) {
  return el("label", { class: "field" }, el("span", { text: label }), input, hint ? el("span", { class: "hint", text: hint }) : null);
}

export function toggle(label, checked, onchange) {
  const input = el("input", { type: "checkbox", checked });
  if (onchange) input.addEventListener("change", () => onchange(input.checked));
  return { node: el("label", { class: "toggle" }, input, el("span", { class: "track" }), el("span", { text: label })), input };
}

export function select(options, value) {
  const s = el("select");
  for (const o of options) {
    const [v, text] = Array.isArray(o) ? o : [o, o];
    s.append(el("option", { value: v ?? "", text, selected: (v ?? "") === (value ?? "") }));
  }
  return s;
}

export function confirmDialog(title, message, okText = "Delete", danger = true) {
  return new Promise((resolve) => {
    const ok = el("button", { class: `btn ${danger ? "dark" : "primary"}`, type: "button", text: okText });
    const cancel = el("button", { class: "btn", type: "button", text: "Cancel" });
    const d = el("dialog", {}, el("h2", { text: title }), el("p", { class: "muted", text: message }), el("div", { class: "btn-row end" }, cancel, ok));
    document.body.append(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    d.addEventListener("cancel", () => done(false));
    d.showModal();
  });
}

export function dialog(title, ...body) {
  const d = el("dialog", {}, el("h2", { text: title }), ...body);
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}

export function ago(iso) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function dateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function spinner() {
  return el("div", { class: "spinner", role: "status", "aria-label": "Loading" });
}

// Track unsaved changes on a page and warn before leaving it.
export function dirtyTracker(stateNode) {
  let dirty = false;
  const set = (v) => {
    dirty = v;
    if (stateNode) stateNode.textContent = v ? "Unsaved changes" : "";
    window.__ftDirty = v;
  };
  return { mark: () => set(true), clear: () => set(false), get dirty() { return dirty; } };
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
