// Fortune sets: the fortunes a unit prints, and how it picks them.
import * as api from "../api.js";
import { el, mount, act, field, select, dirtyTracker, confirmDialog, dialog, toast, ago } from "../ui.js";

const MODES = [
  ["no_repeat", "No repeats (every fortune once before any repeat)"],
  ["random", "Fully random (repeats can happen)"],
  ["weighted", "Weighted (some fortunes come up more often)"],
];

async function renderList({ root, state }) {
  const sets = await api.fortuneSets(state.accountId);
  const name = el("input", { type: "text", placeholder: "New set name, e.g. Halloween", maxlength: "60", style: { width: "240px" } });
  const add = el("button", { class: "btn dark", type: "button", text: "Create set" });
  add.onclick = () => act(add, async () => {
    if (!name.value.trim()) throw new Error("Give the set a name");
    const s = await api.createFortuneSet(state.accountId, name.value.trim());
    location.hash = `#/fortunes/${s.id}`;
  });
  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "Fortunes" }), el("p", { class: "sub", text: "Group fortunes into sets. Each unit uses one set, and events can switch to another." })),
      el("div", { class: "btn-row" }, name, add)),
    sets.length
      ? el("div", { class: "grid" }, sets.map((s) => el("a", { class: "tile card-link", href: `#/fortunes/${s.id}` },
          el("h2", { text: s.name }),
          el("p", { class: "muted", style: { margin: "0 0 10px" }, text: `${s.ft_fortunes?.[0]?.count ?? 0} fortunes` }),
          el("span", { class: "badge", text: (MODES.find((m) => m[0] === s.mode) || MODES[0])[1].split(" (")[0] }),
          el("p", { class: "muted small", style: { margin: "10px 0 0" }, text: `Updated ${ago(s.updated_at)}` }))))
      : el("div", { class: "tile empty" }, el("h2", { text: "No fortune sets yet" }), el("p", { text: "Create one above, then paste in your fortunes." })),
  );
}

function autoGrow(t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }

async function renderSet({ root, state }, id) {
  const [set, rows] = await Promise.all([api.fortuneSet(id), api.fortunes(id)]);
  let items = rows.map((r) => ({ ...r }));
  const deleted = [];

  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);
  const name = el("input", { type: "text", value: set.name, maxlength: "60" });
  const mode = select(MODES, set.mode);
  const search = el("input", { type: "search", placeholder: "Search fortunes", style: { width: "200px" } });
  const counter = el("span", { class: "muted small" });
  const list = el("div", { class: "fortune-list" });

  function drawList() {
    const q = search.value.trim().toLowerCase();
    const weighted = mode.value === "weighted";
    const active = items.filter((f) => f.active).length;
    counter.textContent = `${items.length} fortunes, ${active} in use`;
    const visible = items.filter((f) => !q || f.text.toLowerCase().includes(q));
    mount(list, visible.length ? visible.map((f) => {
      const n = items.indexOf(f) + 1;
      const text = el("textarea", { rows: "1", value: f.text, "aria-label": `Fortune ${n}`, maxlength: "400" });
      text.addEventListener("input", () => { f.text = text.value; autoGrow(text); dirty.mark(); });
      const on = el("input", { type: "checkbox", checked: f.active, "aria-label": "In use", title: "In use" });
      on.addEventListener("change", () => { f.active = on.checked; row.classList.toggle("off", !f.active); dirty.mark(); counter.textContent = `${items.length} fortunes, ${items.filter((x) => x.active).length} in use`; });
      const weight = el("input", { type: "number", min: "0", max: "100", step: "1", value: f.weight ?? 1, "aria-label": "Weight", title: "Weight: higher comes up more often" });
      weight.addEventListener("input", () => { f.weight = Math.max(0, Number(weight.value) || 0); dirty.mark(); });
      const del = el("button", { class: "btn icon small danger", type: "button", "aria-label": "Delete fortune", text: "×" });
      del.onclick = () => { items.splice(items.indexOf(f), 1); if (f.id) deleted.push(f.id); dirty.mark(); drawList(); };
      const row = el("div", { class: `fortune-row ${f.active ? "" : "off"}` },
        el("span", { class: "num", text: String(n) }), text,
        el("div", { class: "btn-row", style: { gap: "6px", flexWrap: "nowrap" } }, weighted ? weight : null, el("label", { class: "check" }, on)),
        del);
      requestAnimationFrame(() => autoGrow(text));
      return row;
    }) : el("p", { class: "muted", text: q ? "No fortunes match your search." : "No fortunes yet. Add one or paste a list." }));
  }

  const addOne = el("button", { class: "btn small", type: "button", text: "+ Add fortune" });
  addOne.onclick = () => {
    items.push({ text: "", weight: 1, active: true });
    dirty.mark(); search.value = ""; drawList();
    const last = list.querySelectorAll("textarea");
    last[last.length - 1]?.focus();
  };
  const paste = el("button", { class: "btn small", type: "button", text: "Paste a list" });
  paste.onclick = () => {
    const area = el("textarea", { rows: "10", placeholder: "One fortune per line" });
    const replace = el("input", { type: "checkbox" });
    const go = el("button", { class: "btn primary", type: "button", text: "Add fortunes" });
    const d = dialog("Paste fortunes",
      el("p", { class: "muted", text: "One fortune per line. Blank lines are ignored." }), area,
      el("label", { class: "check", style: { margin: "12px 0" } }, replace, el("span", { text: "Replace all existing fortunes in this set" })),
      el("div", { class: "btn-row end" }, el("button", { class: "btn", type: "button", text: "Cancel", onclick: () => d.close() }), go));
    go.onclick = () => {
      const lines = area.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return d.close();
      const tooLong = lines.filter((l) => l.length > 400).length;
      if (replace.checked) { for (const f of items) if (f.id) deleted.push(f.id); items = []; }
      for (const l of lines) items.push({ text: l.slice(0, 400), weight: 1, active: true });
      dirty.mark(); drawList(); d.close();
      toast(`${lines.length} fortunes added${tooLong ? ` (${tooLong} cut to 400 characters)` : ""}. Remember to save.`);
    };
    area.focus();
  };

  mode.addEventListener("change", () => { dirty.mark(); drawList(); });
  name.addEventListener("input", dirty.mark);
  search.addEventListener("input", drawList);

  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save fortunes" });
  saveBtn.onclick = () => act(saveBtn, async () => {
    if (!name.value.trim()) throw new Error("Give the set a name");
    const clean = items.map((f) => ({ ...f, text: f.text.trim() })).filter((f) => f.text);
    if (!clean.some((f) => f.active)) throw new Error("At least one fortune needs to be in use");
    clean.forEach((f, i) => { f.position = i; });
    await api.updateFortuneSet(id, { name: name.value.trim(), mode: mode.value });
    await api.saveFortunes(id, clean, deleted.splice(0));
    items = (await api.fortunes(id)).map((r) => ({ ...r }));
    dirty.clear(); drawList();
  }, "Fortunes saved. Units pick them up within a minute.");

  const delSet = el("button", { class: "btn danger", type: "button", text: "Delete set" });
  delSet.onclick = async () => {
    if (!(await confirmDialog("Delete this set?", `"${set.name}" and all its fortunes will be deleted. Units or events using it will fall back to another set.`))) return;
    await act(delSet, async () => { await api.deleteFortuneSet(id); dirty.clear(); location.hash = "#/fortunes"; }, "Set deleted");
  };

  mount(root,
    el("a", { class: "back", href: "#/fortunes", text: "← All fortune sets" }),
    el("div", { class: "page-head" }, el("h1", { text: set.name }), delSet),
    el("div", { class: "stack" },
      el("div", { class: "tile" }, el("div", { class: "form-grid" }, field("Set name", name), field("How fortunes are picked", mode))),
      el("div", { class: "tile" },
        el("div", { class: "page-head", style: { marginBottom: "12px" } },
          el("div", {}, el("h2", { style: { margin: 0 }, text: "Fortunes" }), counter),
          el("div", { class: "btn-row" }, search, paste, addOne)),
        list),
      el("div", { class: "save-bar" }, saveState, saveBtn)),
  );
  drawList();
}

export async function render(ctx) {
  const [id] = ctx.params;
  return id ? renderSet(ctx, id) : renderList(ctx);
}
