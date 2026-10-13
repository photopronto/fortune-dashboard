// Gallery: every fortune taken, with simple stats.
import * as api from "../api.js";
import { el, mount, act, confirmDialog, dateTime, dialog } from "../ui.js";

const PAGE = 48;

function statTile(label, value, sub, hero) {
  return el("div", { class: "tile", style: hero ? { background: "var(--accent)", color: "#fff" } : {} },
    el("div", { class: "small", style: { color: hero ? "rgba(255,255,255,.8)" : "var(--muted)" }, text: label }),
    el("div", { style: { fontSize: "34px", fontWeight: 700, lineHeight: 1.1, margin: "10px 0 4px", fontVariantNumeric: "tabular-nums" }, text: String(value) }),
    sub ? el("div", { class: "mono", style: { color: hero ? "rgba(255,255,255,.8)" : "var(--muted)" }, text: sub }) : null);
}

function busiestHour(rows) {
  const counts = new Array(24).fill(0);
  for (const r of rows) counts[new Date(r.captured_at).getHours()] += 1;
  const max = Math.max(...counts);
  if (!max) return "–";
  const h = counts.indexOf(max);
  return `${String(h).padStart(2, "0")}:00`;
}

export async function render({ root, state }) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [first, stats, unitList] = await Promise.all([
    api.captures(state.accountId, { from: 0, size: PAGE }),
    api.captureStats(state.accountId, since),
    api.units(state.accountId),
  ]);
  const unitName = Object.fromEntries(unitList.map((u) => [u.id, u.name]));
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 86400000;
  const today = stats.filter((r) => new Date(r.captured_at) >= startOfDay).length;
  const week = stats.filter((r) => new Date(r.captured_at).getTime() >= weekAgo).length;
  const views = stats.reduce((n, r) => n + (r.views || 0), 0);
  const scanned = stats.filter((r) => (r.views || 0) > 0).length;

  let items = first;
  const grid = el("div", { class: "gallery" });
  const more = el("button", { class: "btn", type: "button", text: "Load more" });

  function card(c) {
    const node = el("div", { class: "shot" },
      c.photo_url ? el("img", { src: c.photo_url, alt: "", loading: "lazy" }) : el("img", { alt: "" }),
      el("div", { class: "meta" },
        el("p", { text: c.fortune_text || "" }),
        el("span", { class: "muted", text: `${dateTime(c.captured_at)} · ${unitName[c.unit_id] || "Unit"}` }),
        el("span", { class: "muted", text: c.status !== "ready" ? "Uploading…" : `${c.views || 0} ${c.views === 1 ? "view" : "views"}` }),
        el("div", { class: "btn-row", style: { marginTop: "6px", gap: "6px" } },
          c.receipt_url ? el("button", { class: "btn small", type: "button", text: "Receipt", onclick: () => {
            const d = dialog("Printed fortune", el("img", { src: c.receipt_url, alt: c.fortune_text || "", style: { width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", background: "#fff" } }),
              el("div", { class: "btn-row end", style: { marginTop: "14px" } }, el("button", { class: "btn primary", type: "button", text: "Close", onclick: () => d.close() })));
          } }) : null,
          el("a", { class: "btn small", href: `${window.FT_CONFIG.SHARE_BASE_URL}${c.id}`, target: "_blank", rel: "noopener", text: "Page" }),
          el("button", { class: "btn small danger", type: "button", text: "Delete", onclick: async (e) => {
            if (!(await confirmDialog("Delete this fortune?", "The photo, receipt and guest page are removed for good."))) return;
            await act(e.target, async () => { await api.deleteCapture(c); items = items.filter((x) => x.id !== c.id); node.remove(); }, "Deleted");
          } }))));
    return node;
  }
  const draw = () => { mount(grid, items.map(card)); more.hidden = items.length % PAGE !== 0 || !items.length; };
  more.onclick = () => act(more, async () => {
    const next = await api.captures(state.accountId, { from: items.length, size: PAGE });
    items = items.concat(next);
    grid.append(...next.map(card));
    more.hidden = next.length < PAGE;
  });

  mount(root,
    el("div", { class: "page-head" }, el("div", {}, el("h1", { text: "Gallery" }), el("p", { class: "sub", text: "Every fortune taken, newest first. Photos are removed automatically when they expire." }))),
    el("div", { class: "grid", style: { gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: "18px" } },
      statTile("Today", today, null, true),
      statTile("Last 7 days", week),
      statTile("Last 30 days", stats.length, `busiest at ${busiestHour(stats)}`),
      statTile("QR scans", views, stats.length ? `${Math.round((scanned / stats.length) * 100)}% of fortunes scanned` : null)),
    items.length ? grid : el("div", { class: "tile empty" }, el("h2", { text: "No fortunes yet" }), el("p", { text: "They'll appear here as guests use your fortune tellers." })),
    el("div", { class: "btn-row", style: { justifyContent: "center", marginTop: "18px" } }, more),
  );
  draw();
}
