// Admin (Photo Pronto only): buyer accounts and every unit.
import * as api from "../api.js";
import { el, mount, act, field, select, dialog, ago, toast } from "../ui.js";
import { unitHealth } from "./units.js";
import { STARTER_LAYOUT } from "./designs.js";

const DEVICE_URL = `${window.FT_CONFIG.SUPABASE_URL}/functions/v1/ft-device`;

function cloudJson(unitId, secret) {
  return JSON.stringify({
    enabled: true, api_url: DEVICE_URL, unit_id: unitId, unit_secret: secret,
    sync_every_seconds: 60, heartbeat_every_seconds: 60,
  }, null, 2);
}

function showNewUnit(unitId, secret) {
  const text = cloudJson(unitId, secret);
  const download = el("button", { class: "btn", type: "button", text: "Download cloud.json" });
  download.onclick = () => {
    const a = el("a", { href: URL.createObjectURL(new Blob([text + "\n"], { type: "application/json" })), download: "cloud.json" });
    document.body.append(a); a.click(); a.remove();
  };
  const copy = el("button", { class: "btn", type: "button", text: "Copy", onclick: async () => { await navigator.clipboard.writeText(text); toast("Copied"); } });
  const d = dialog("Unit created",
    el("p", { class: "muted", text: "Put this cloud.json in the unit's app folder. The password is only shown now, so save it before closing." }),
    el("pre", { class: "secret-box", style: { whiteSpace: "pre-wrap", margin: "0 0 14px" }, text }),
    el("div", { class: "btn-row end" }, copy, download, el("button", { class: "btn primary", type: "button", text: "Done", onclick: () => d.close() })));
}

export async function render({ root, state, refreshAccounts }) {
  const [accs, unitsAll] = await Promise.all([api.accounts(), api.allUnits()]);
  const unitCount = {};
  for (const u of unitsAll) unitCount[u.account_id] = (unitCount[u.account_id] || 0) + 1;

  // New account
  const accName = el("input", { type: "text", placeholder: "Business name, e.g. The Grand Hotel", maxlength: "80" });
  const accBtn = el("button", { class: "btn dark", type: "button", text: "Create account" });
  accBtn.onclick = () => act(accBtn, async () => {
    if (!accName.value.trim()) throw new Error("Enter the business name");
    const acc = await api.createAccount(accName.value.trim());
    // Give every new account a design and an empty fortune set to start from
    await api.createDesign(acc.id, "Standard", { ...JSON.parse(JSON.stringify(STARTER_LAYOUT)), name: "Standard" });
    await api.createFortuneSet(acc.id, "Fortunes");
    await api.updateAccount(acc.id, { microsite: {
      heading: "Your fortune awaits", message: "", download_label: "Download your fortune",
      colours: { background: "#1a1625", text: "#ffffff", accent: "#ffb000" },
      gate: { enabled: false, kind: "newsletter", consent_text: `I agree to receive emails from ${acc.name}. You can unsubscribe at any time.`, allow_skip: true },
    } });
    await refreshAccounts();
    render({ root, state, refreshAccounts });
  }, "Account created with a starter design and an empty fortune set");

  // New unit
  const unitName = el("input", { type: "text", placeholder: "Unit name", maxlength: "60" });
  const unitSerial = el("input", { type: "text", placeholder: "Serial, e.g. FT-0002", maxlength: "40" });
  const unitAcc = select([["", "Not assigned yet"], ...accs.map((a) => [a.id, a.name])], "");
  const unitBtn = el("button", { class: "btn dark", type: "button", text: "Create unit" });
  unitBtn.onclick = () => act(unitBtn, async () => {
    const res = await api.createUnit(unitName.value.trim() || "Fortune Teller", unitAcc.value || null, unitSerial.value.trim());
    showNewUnit(res.unit_id, res.unit_secret);
    render({ root, state, refreshAccounts });
  });

  mount(root,
    el("div", { class: "page-head" }, el("div", {}, el("h1", { text: "Admin" }), el("p", { class: "sub", text: "Only Photo Pronto sees this page." }))),
    el("div", { class: "grid-2", style: { marginBottom: "14px" } },
      el("div", { class: "tile" }, el("h2", { text: "New buyer account" }), el("div", { class: "form" }, accName, el("div", { class: "btn-row" }, accBtn))),
      el("div", { class: "tile" }, el("h2", { text: "New unit" }),
        el("div", { class: "form" }, el("div", { class: "form-grid" }, unitName, unitSerial), field("Account", unitAcc), el("div", { class: "btn-row" }, unitBtn)))),
    el("h2", { style: { marginTop: "24px" }, text: "Accounts" }),
    el("div", { class: "table-wrap", style: { marginBottom: "24px" } }, el("table", {},
      el("thead", {}, el("tr", {}, ["Account", "Units", "Keeps photos", "Created", ""].map((h) => el("th", { text: h })))),
      el("tbody", {}, accs.map((a) => el("tr", {},
        el("td", { text: a.name }), el("td", { text: String(unitCount[a.id] || 0) }),
        el("td", { text: `${a.retention_days} days` }), el("td", { class: "small", text: ago(a.created_at) }),
        el("td", {}, el("button", { class: "btn small", type: "button", text: "Open", onclick: () => {
          state.accountId = a.id; try { localStorage.setItem("ft-account", a.id); } catch {}
          location.hash = "#/units";
        } }))))))),
    el("h2", { text: "All units" }),
    el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Unit", "Account", "Status", "Updates", "Software", "Last check-in"].map((h) => el("th", { text: h })))),
      el("tbody", {}, unitsAll.map((u) => {
        const h = unitHealth(u);
        return el("tr", {},
          el("td", {}, el("a", { href: "#", text: u.name, onclick: (e) => {
            e.preventDefault();
            if (u.account_id) { state.accountId = u.account_id; try { localStorage.setItem("ft-account", u.account_id); } catch {} }
            location.hash = `#/units/${u.id}`;
          } }), u.serial ? el("div", { class: "mono muted", text: u.serial }) : null),
          el("td", { text: u.ft_accounts?.name || "Not assigned" }),
          el("td", {}, el("span", { class: "status" }, el("span", { class: `dot ${h.level}` }), el("span", { text: h.text }))),
          el("td", { text: u.channel }),
          el("td", { class: "mono", text: u.app_version || "–" }),
          el("td", { class: "small", text: ago(u.last_seen_at) }));
      })))),
  );
}
