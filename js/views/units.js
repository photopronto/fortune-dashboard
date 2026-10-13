// Units: live status of each fortune teller, and its settings.
import * as api from "../api.js";
import { el, mount, act, field, toggle, select, ago, dirtyTracker, toast, dialog } from "../ui.js";
import { renderLights } from "./lights.js";

const ONLINE_MS = 3 * 60 * 1000;
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const STATE_TEXT = {
  idle: "Ready", low_paper: "Ready, paper low", countdown: "Counting down", capture: "Taking photo",
  printing: "Printing", finish: "Just printed", closed: "Closed (opening hours)", error: "Needs attention",
};

export function unitHealth(u) {
  const s = u.status || {};
  const online = u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < ONLINE_MS;
  if (!u.last_seen_at) return { level: "off", text: "Never connected" };
  if (!online) return { level: "off", text: `Offline · seen ${ago(u.last_seen_at)}` };
  if (s.state === "error" || s.paper === "out") return { level: "alert", text: s.error || "Needs attention" };
  if (s.paper === "low") return { level: "alert", text: "Paper running low" };
  return { level: "on", text: STATE_TEXT[s.state] || "Online" };
}

function paperMeter(u) {
  const s = u.status || {};
  if (s.paper_left_m == null) return null;
  const pct = Math.max(0, Math.min(100, (s.paper_left_m / 80) * 100));
  return el("div", {},
    el("div", { class: "btn-row", style: { justifyContent: "space-between" } },
      el("span", { class: "muted small", text: "Paper" }), el("span", { class: "mono", text: `${s.paper_left_m} m` })),
    el("div", { class: `meter ${s.paper === "low" || s.paper === "out" ? "low" : ""}` }, el("i", { style: { width: `${pct}%` } })));
}

function unitCard(u) {
  const h = unitHealth(u);
  const s = u.status || {};
  return el("a", { class: "tile card-link", href: `#/units/${u.id}` },
    el("div", { class: "btn-row", style: { justifyContent: "space-between" } },
      el("h2", { style: { margin: 0 }, text: u.name }),
      u.channel === "test" ? el("span", { class: "badge", text: "test updates" }) : null),
    el("div", { class: "status", style: { margin: "8px 0 14px" } }, el("span", { class: `dot ${h.level}` }), el("span", { text: h.text })),
    paperMeter(u),
    el("dl", { class: "kv" },
      s.event ? [el("dt", { text: "Event" }), el("dd", { text: s.event })] : null,
      el("dt", { text: "Waiting to upload" }), el("dd", { text: String(s.waiting_to_upload ?? "–") }),
      el("dt", { text: "Last check-in" }), el("dd", { text: ago(u.last_seen_at) })),
  );
}

async function renderList({ root, state }) {
  const list = await api.units(state.accountId);
  const code = el("input", { type: "text", inputmode: "numeric", maxlength: "6", placeholder: "Pairing code", style: { width: "150px" } });
  const addBtn = el("button", { class: "btn dark", type: "button", text: "Add unit" });
  addBtn.onclick = () => act(addBtn, async () => {
    if (!/^\d{6}$/.test(code.value.trim())) throw new Error("Pairing codes are 6 digits");
    await api.claimUnit(code.value.trim(), state.accountId);
    toast("Unit added to your account");
    renderList({ root, state });
  });
  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "Units" }), el("p", { class: "sub", text: "Each fortune teller checks in every minute." })),
      el("div", { class: "btn-row" }, code, addBtn)),
    list.length
      ? el("div", { class: "grid" }, list.map(unitCard))
      : el("div", { class: "tile empty" }, el("h2", { text: "No units yet" }),
          el("p", { text: "When you set up a new fortune teller, it shows a 6-digit pairing code. Enter it above to add it here." })),
  );
  // Keep the status fresh while the page is open
  clearInterval(window.__ftUnitsTimer);
  window.__ftUnitsTimer = setInterval(async () => {
    if (!document.body.contains(root) || !location.hash.startsWith("#/units") || location.hash.split("/").length > 2) return clearInterval(window.__ftUnitsTimer);
    const fresh = await api.units(state.accountId).catch(() => null);
    const grid = root.querySelector(".grid");
    if (fresh && grid) mount(grid, fresh.map(unitCard));
  }, 30000);
}

function hoursEditor(hours) {
  const h = hours || {};
  const enabled = toggle("Use opening hours", !!h.enabled);
  const rows = DAYS.map(([key, label]) => {
    const v = h[key];
    const open = el("input", { type: "checkbox", checked: v !== null && v !== undefined ? true : !h.enabled });
    const start = el("input", { type: "time", value: (v && v[0]) || "09:00" });
    const end = el("input", { type: "time", value: (v && v[1]) || "23:00" });
    const sync = () => { start.disabled = end.disabled = !open.checked; };
    open.addEventListener("change", sync);
    sync();
    return { key, open, start, end, node: el("tr", {},
      el("td", {}, el("label", { class: "check" }, open, el("span", { text: label }))),
      el("td", {}, start), el("td", {}, end)) };
  });
  const table = el("div", { class: "table-wrap", style: { background: "var(--inner)", border: "1px solid var(--line)" } },
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "Day" }), el("th", { text: "Opens" }), el("th", { text: "Closes" }))),
      el("tbody", {}, rows.map((r) => r.node))));
  const syncAll = () => { table.hidden = !enabled.input.checked; };
  enabled.input.addEventListener("change", syncAll);
  syncAll();
  return {
    node: el("div", { class: "stack" }, enabled.node,
      el("p", { class: "muted small", style: { margin: "6px 0 0" }, text: "Outside these times the lights go to their closed pattern and the button does nothing. Closing earlier than opening runs past midnight." }),
      table),
    value() {
      const out = { enabled: enabled.input.checked };
      for (const r of rows) out[r.key] = r.open.checked ? [r.start.value || "00:00", r.end.value || "23:59"] : null;
      return out;
    },
    inputs: [enabled.input, ...rows.flatMap((r) => [r.open, r.start, r.end])],
  };
}

async function renderSettings(box, u, ctx) {
  const { state } = ctx;
  const [designs, sets] = u.account_id
    ? await Promise.all([api.designs(u.account_id), api.fortuneSets(u.account_id)])
    : [[], []];
  const s = u.settings || {};
  const name = el("input", { type: "text", value: u.name, maxlength: "60" });
  const countdown = el("input", { type: "number", min: "1", max: "30", step: "1", value: s.countdown_seconds ?? 8 });
  const finish = el("input", { type: "number", min: "1", max: "15", step: "1", value: s.finish_seconds ?? 2 });
  const design = select(designs.map((d) => [d.id, d.name]), u.default_design_id);
  const set = select(sets.map((x) => [x.id, x.name]), u.default_fortune_set_id);
  const hours = hoursEditor(s.opening_hours);

  // Admin-only
  let channel, accountSel, serial, ringCount, startAngle, hasButton, hasStatus;
  if (state.admin) {
    channel = select([["live", "Live (normal updates)"], ["test", "Test (try new software first)"]], u.channel);
    accountSel = select([["", "No account"], ...state.accounts.map((a) => [a.id, a.name])], u.account_id || "");
    serial = el("input", { type: "text", value: u.serial || "", maxlength: "40" });
  }

  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);
  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save settings" });
  const formNode = el("div", { class: "stack" },
    el("div", { class: "tile" }, el("h2", { text: "General" }),
      el("div", { class: "form-grid" },
        field("Name", name),
        field("Countdown (seconds)", countdown, "How long the lights run before the photo"),
        field("Finish lights (seconds)", finish, "After printing, before it's ready again"))),
    el("div", { class: "tile" }, el("h2", { text: "What it prints" }),
      el("p", { class: "muted small", style: { marginTop: "-6px" }, text: "Used whenever no event is running." }),
      el("div", { class: "form-grid" },
        field("Receipt design", design),
        field("Fortune set", set))),
    el("div", { class: "tile" }, el("h2", { text: "Opening hours" }), hours.node),
    state.admin ? el("div", { class: "tile" }, el("h2", { text: "Photo Pronto only" }),
      el("div", { class: "form-grid" },
        field("Account", accountSel),
        field("Software updates", channel),
        field("Serial number", serial))) : null,
    el("div", { class: "save-bar" }, saveState, saveBtn),
  );
  formNode.addEventListener("input", dirty.mark);
  formNode.addEventListener("change", dirty.mark);

  saveBtn.onclick = () => act(saveBtn, async () => {
    const cd = Math.round(Number(countdown.value));
    const fin = Math.round(Number(finish.value));
    if (!(cd >= 1 && cd <= 30)) throw new Error("Countdown must be 1 to 30 seconds");
    if (!(fin >= 1 && fin <= 15)) throw new Error("Finish lights must be 1 to 15 seconds");
    const patch = {
      name: name.value.trim() || "Fortune Teller",
      default_design_id: design.value || null,
      default_fortune_set_id: set.value || null,
      settings: { ...s, countdown_seconds: cd, finish_seconds: fin, opening_hours: hours.value() },
    };
    if (state.admin) Object.assign(patch, { channel: channel.value, account_id: accountSel.value || null, serial: serial.value.trim() || null });
    const saved = await api.updateUnit(u.id, patch);
    Object.assign(u, saved);
    dirty.clear();
  }, "Saved. The unit picks this up within a minute.");
  mount(box, formNode);
}

function renderOverview(box, u, ctx) {
  const s = u.status || {};
  const h = unitHealth(u);
  const rows = [
    ["State", STATE_TEXT[s.state] || s.state || "–"],
    ["Problem", s.error || "None"],
    ["Paper", s.paper_left_m != null ? `${s.paper_left_m} m left (${s.prints_this_roll ?? 0} prints this roll)` : "–"],
    ["Waiting to upload", s.waiting_to_upload ?? "–"],
    ["Running event", s.event || "None"],
    ["Fortunes since restart", s.fortunes_since_start ?? "–"],
    ["Camera", s.camera || "–"],
    ["Printer", s.printer || "–"],
    ["Software", u.app_version ? `${u.app_version} (${u.channel})` : "–"],
    ["Last check-in", u.last_seen_at ? `${ago(u.last_seen_at)} · ${new Date(u.last_seen_at).toLocaleString("en-GB")}` : "Never"],
  ];
  const pairBtn = ctx.state.admin ? el("button", { class: "btn", type: "button", text: "New pairing code" }) : null;
  if (pairBtn) pairBtn.onclick = () => act(pairBtn, async () => {
    const code = await api.newPairingCode(u.id);
    dialog("Pairing code", el("p", { class: "muted", text: "Give this to the buyer. They enter it on their Units page. It works for 7 days." }),
      el("p", { class: "secret-box", style: { fontSize: "22px", textAlign: "center", letterSpacing: "6px" }, text: code }),
      el("form", { method: "dialog", class: "btn-row end" }, el("button", { class: "btn primary", text: "Done" })));
  });
  mount(box, el("div", { class: "grid-2" },
    el("div", { class: "tile" },
      el("div", { class: "status", style: { marginBottom: "10px" } }, el("span", { class: `dot ${h.level}` }), el("span", { text: h.text })),
      paperMeter(u),
      el("dl", { class: "kv" }, rows.map(([k, v]) => [el("dt", { text: k }), el("dd", { text: String(v) })]))),
    el("div", { class: "tile" }, el("h2", { text: "Tips" }),
      el("ul", { class: "muted", style: { paddingLeft: "18px", margin: 0 } },
        el("li", { text: "Changes made here reach the unit within a minute while it's online." }),
        el("li", { text: "If the internet drops, the unit keeps working with its last settings and uploads fortunes when it's back." }),
        el("li", { text: "A new paper roll is detected automatically when the printer reports paper again." })),
      pairBtn ? el("div", { class: "btn-row", style: { marginTop: "16px" } }, pairBtn) : null),
  ));
}

async function renderDetail(ctx, id, tab) {
  const { root } = ctx;
  const u = await api.unit(id);
  const tabs = [["", "Overview"], ["settings", "Settings"], ["lights", "Lights"]];
  const box = el("div");
  mount(root,
    el("a", { class: "back", href: "#/units", text: "← All units" }),
    el("div", { class: "page-head" }, el("div", {}, el("h1", { text: u.name }), el("p", { class: "sub", text: u.serial ? `Serial ${u.serial}` : "" }))),
    el("div", { class: "tabs" }, tabs.map(([t, label]) => el("a", { href: `#/units/${id}${t ? "/" + t : ""}`, class: (tab || "") === t ? "active" : "", text: label }))),
    box,
  );
  if (tab === "settings") return renderSettings(box, u, ctx);
  if (tab === "lights") return renderLights(box, u, ctx);
  renderOverview(box, u, ctx);
}

export async function render(ctx) {
  const [id, tab] = ctx.params;
  if (id) return renderDetail(ctx, id, tab);
  return renderList(ctx);
}
