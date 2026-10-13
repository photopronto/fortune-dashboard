// Sign-ups: emails and competition entries collected on the QR page.
import * as api from "../api.js";
import { el, mount, act, confirmDialog, dateTime } from "../ui.js";

function csvCell(v) {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function render({ root, state }) {
  let rows = await api.leads(state.accountId);
  const filter = el("select", { style: { width: "auto" }, "aria-label": "Show" },
    el("option", { value: "", text: "All sign-ups" }),
    el("option", { value: "newsletter", text: "Email sign-ups" }),
    el("option", { value: "competition", text: "Competition entries" }));
  const tbody = el("tbody");
  const count = el("span", { class: "muted small" });

  const shown = () => rows.filter((r) => !filter.value || r.kind === filter.value);
  function draw() {
    const list = shown();
    count.textContent = `${list.length} ${list.length === 1 ? "person" : "people"}`;
    mount(tbody, list.map((r) => el("tr", {},
      el("td", { class: "small", text: dateTime(r.created_at) }),
      el("td", { text: r.name || "" }),
      el("td", { text: r.email }),
      el("td", {}, el("span", { class: "badge", text: r.kind === "competition" ? "Competition" : "Email" })),
      el("td", {}, el("button", { class: "btn small danger", type: "button", text: "Delete", onclick: async (e) => {
        if (!(await confirmDialog("Delete this person?", `${r.email} will be removed from your list.`))) return;
        await act(e.target, async () => { await api.deleteLead(r.id); rows = rows.filter((x) => x.id !== r.id); draw(); }, "Deleted");
      } })))));
  }
  filter.addEventListener("change", draw);

  const exportBtn = el("button", { class: "btn dark", type: "button", text: "Download CSV" });
  exportBtn.onclick = () => {
    const list = shown();
    const header = ["Date", "Name", "Email", "Type", "Agreed to", "Fortune link"];
    const lines = [header.map(csvCell).join(",")].concat(list.map((r) => [
      new Date(r.created_at).toISOString(), r.name, r.email, r.kind, r.consent_text,
      r.capture_id ? `${window.FT_CONFIG.SHARE_BASE_URL}${r.capture_id}` : "",
    ].map(csvCell).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `fortune-sign-ups-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "Sign-ups" }), el("p", { class: "sub", text: "People who gave their details on the QR page. Each one ticked your agreement text." })),
      el("div", { class: "btn-row" }, filter, exportBtn)),
    rows.length
      ? el("div", { class: "stack" }, count, el("div", { class: "table-wrap" }, el("table", {},
          el("thead", {}, el("tr", {}, ["When", "Name", "Email", "Type", ""].map((h) => el("th", { text: h })))), tbody)))
      : el("div", { class: "tile empty" }, el("h2", { text: "No sign-ups yet" }), el("p", {}, "Turn on the sign-up on the ", el("a", { href: "#/qr", text: "QR page" }), " settings to start collecting them.")),
  );
  draw();
}
