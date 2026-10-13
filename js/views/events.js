// Events: switch the design, fortunes or settings for a date range or times of day.
import * as api from "../api.js";
import { el, mount, act, field, select, toggle, confirmDialog, dirtyTracker, dateTime } from "../ui.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Same rules the unit uses (app/schedule.py active_event)
function inWindow(start, end, now) {
  if (!start || !end) return true;
  const t = now.toTimeString().slice(0, 8);
  const s = start.length === 5 ? start + ":00" : start, e = end.length === 5 ? end + ":00" : end;
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}
export function eventStatus(ev, now = new Date()) {
  if (!ev.active) return ["Off", ""];
  if (ev.ends_at && now >= new Date(ev.ends_at)) return ["Finished", ""];
  if (ev.starts_at && now < new Date(ev.starts_at)) return ["Upcoming", "blue"];
  const iso = ((now.getDay() + 6) % 7) + 1;
  if (ev.days && ev.days.length && !ev.days.includes(iso)) return ["Scheduled", "blue"];
  if (!inWindow(ev.daily_start, ev.daily_end, now)) return ["Scheduled", "blue"];
  return ["Running now", "black"];
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

function whenText(ev) {
  const parts = [];
  if (ev.starts_at || ev.ends_at) parts.push(`${ev.starts_at ? dateTime(ev.starts_at) : "Now"} – ${ev.ends_at ? dateTime(ev.ends_at) : "no end"}`);
  else parts.push("Always");
  if (ev.days && ev.days.length && ev.days.length < 7) parts.push(ev.days.map((d) => DAY_LABELS[d - 1]).join(", "));
  if (ev.daily_start && ev.daily_end) parts.push(`${ev.daily_start.slice(0, 5)}–${ev.daily_end.slice(0, 5)}`);
  return parts.join(" · ");
}

async function renderList({ root, state }) {
  const [evs, designs, sets] = await Promise.all([api.events(state.accountId), api.designs(state.accountId), api.fortuneSets(state.accountId)]);
  const dName = Object.fromEntries(designs.map((d) => [d.id, d.name]));
  const sName = Object.fromEntries(sets.map((s) => [s.id, s.name]));
  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "Events" }), el("p", { class: "sub", text: "While an event runs, its design and fortunes replace the unit's usual ones. If two overlap, the higher priority wins." })),
      el("a", { class: "btn dark", href: "#/events/new", text: "New event" })),
    evs.length
      ? el("div", { class: "table-wrap" }, el("table", {},
          el("thead", {}, el("tr", {}, ["Event", "When", "Design", "Fortunes", "Status"].map((h) => el("th", { text: h })))),
          el("tbody", {}, evs.map((ev) => {
            const [label, cls] = eventStatus(ev);
            return el("tr", {},
              el("td", {}, el("a", { href: `#/events/${ev.id}`, text: ev.name })),
              el("td", { class: "small", text: whenText(ev) }),
              el("td", { text: dName[ev.design_id] || "Unit default" }),
              el("td", { text: sName[ev.fortune_set_id] || "Unit default" }),
              el("td", {}, el("span", { class: `badge ${cls}`, text: label })));
          }))))
      : el("div", { class: "tile empty" }, el("h2", { text: "No events yet" }), el("p", { text: "Create one for a party, a season or a brand takeover, and it switches on and off by itself." })),
  );
}

async function renderEditor({ root, state }, id) {
  const [designs, sets, unitList] = await Promise.all([api.designs(state.accountId), api.fortuneSets(state.accountId), api.units(state.accountId)]);
  const ev = id === "new"
    ? { name: "", active: true, design_id: null, fortune_set_id: null, starts_at: null, ends_at: null, days: null, daily_start: null, daily_end: null, unit_ids: null, settings_override: {}, priority: 0 }
    : (await api.events(state.accountId)).find((e) => e.id === id);
  if (!ev) throw new Error("Event not found");

  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);
  const name = el("input", { type: "text", value: ev.name, maxlength: "80", placeholder: "e.g. Halloween party" });
  const active = toggle("Event switched on", ev.active);
  const design = select([["", "Keep the unit's design"], ...designs.map((d) => [d.id, d.name])], ev.design_id || "");
  const set = select([["", "Keep the unit's fortunes"], ...sets.map((s) => [s.id, s.name])], ev.fortune_set_id || "");
  const starts = el("input", { type: "datetime-local", value: toLocalInput(ev.starts_at) });
  const ends = el("input", { type: "datetime-local", value: toLocalInput(ev.ends_at) });
  const dailyStart = el("input", { type: "time", value: ev.daily_start ? ev.daily_start.slice(0, 5) : "" });
  const dailyEnd = el("input", { type: "time", value: ev.daily_end ? ev.daily_end.slice(0, 5) : "" });
  const dayInputs = DAY_LABELS.map((d, i) => el("input", { type: "checkbox", checked: !ev.days || ev.days.includes(i + 1) }));
  const countdown = el("input", { type: "number", min: "1", max: "30", placeholder: "Unit default", value: ev.settings_override?.countdown_seconds ?? "" });
  const priority = el("input", { type: "number", min: "-100", max: "100", value: ev.priority ?? 0 });
  const allUnits = toggle("All units in this account", !ev.unit_ids);
  const unitChecks = unitList.map((u) => ({ u, input: el("input", { type: "checkbox", checked: !ev.unit_ids || ev.unit_ids.includes(u.id) }) }));
  const unitBox = el("div", { class: "btn-row", style: { gap: "16px" } }, unitChecks.map(({ u, input }) => el("label", { class: "check" }, input, el("span", { text: u.name }))));
  const syncUnits = () => { unitBox.hidden = allUnits.input.checked; };
  allUnits.input.addEventListener("change", syncUnits);
  syncUnits();

  const form = el("div", { class: "stack" },
    el("div", { class: "tile" }, el("div", { class: "form-grid" }, field("Event name", name)),
      el("div", { style: { marginTop: "12px" } }, active.node)),
    el("div", { class: "tile" }, el("h2", { text: "What changes" }),
      el("div", { class: "form-grid" }, field("Receipt design", design), field("Fortune set", set),
        field("Countdown (seconds)", countdown, "Leave empty to keep the unit's"))),
    el("div", { class: "tile" }, el("h2", { text: "When" }),
      el("div", { class: "form-grid" }, field("Starts", starts, "Empty = straight away"), field("Ends", ends, "Empty = keeps going")),
      el("div", { style: { margin: "14px 0" } }, el("span", { class: "small", style: { fontWeight: 500, display: "block", marginBottom: "6px" }, text: "Days" }),
        el("div", { class: "days" }, DAY_LABELS.map((d, i) => el("label", {}, dayInputs[i], el("span", { text: d }))))),
      el("div", { class: "form-grid" }, field("Daily from", dailyStart, "Optional"), field("Daily until", dailyEnd, "Optional"))),
    el("div", { class: "tile" }, el("h2", { text: "Which units" }), allUnits.node, el("div", { style: { marginTop: "12px" } }, unitBox),
      el("div", { class: "form-grid", style: { marginTop: "14px" } }, field("Priority", priority, "If events overlap, the highest number wins"))),
  );
  form.addEventListener("input", dirty.mark);
  form.addEventListener("change", dirty.mark);

  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save event" });
  saveBtn.onclick = () => act(saveBtn, async () => {
    if (!name.value.trim()) throw new Error("Give the event a name");
    if (!design.value && !set.value && !countdown.value) throw new Error("Choose at least one thing for the event to change");
    const s = fromLocalInput(starts.value), e = fromLocalInput(ends.value);
    if (s && e && new Date(e) <= new Date(s)) throw new Error("The end must be after the start");
    if (!!dailyStart.value !== !!dailyEnd.value) throw new Error("Set both daily times, or neither");
    const days = dayInputs.map((d, i) => (d.checked ? i + 1 : 0)).filter(Boolean);
    if (!days.length) throw new Error("Pick at least one day");
    const unitIds = allUnits.input.checked ? null : unitChecks.filter((x) => x.input.checked).map((x) => x.u.id);
    if (unitIds && !unitIds.length) throw new Error("Pick at least one unit");
    const override = { ...(ev.settings_override || {}) };
    if (countdown.value) {
      const c = Math.round(Number(countdown.value));
      if (!(c >= 1 && c <= 30)) throw new Error("Countdown must be 1 to 30 seconds");
      override.countdown_seconds = c;
    } else delete override.countdown_seconds;
    const row = {
      ...(ev.id ? { id: ev.id } : { account_id: state.accountId }),
      name: name.value.trim(), active: active.input.checked,
      design_id: design.value || null, fortune_set_id: set.value || null,
      starts_at: s, ends_at: e, days: days.length === 7 ? null : days,
      daily_start: dailyStart.value || null, daily_end: dailyEnd.value || null,
      unit_ids: unitIds, settings_override: override, priority: Math.round(Number(priority.value) || 0),
    };
    const saved = await api.saveEvent(row);
    dirty.clear();
    if (!ev.id) location.hash = `#/events/${saved.id}`;
    else Object.assign(ev, saved);
  }, "Event saved. Units pick it up within a minute.");

  const del = ev.id ? el("button", { class: "btn danger", type: "button", text: "Delete event" }) : null;
  if (del) del.onclick = async () => {
    if (!(await confirmDialog("Delete this event?", `"${ev.name}" will be removed. Units go back to their usual design and fortunes.`))) return;
    await act(del, async () => { await api.deleteEvent(ev.id); dirty.clear(); location.hash = "#/events"; }, "Event deleted");
  };

  mount(root,
    el("a", { class: "back", href: "#/events", text: "← All events" }),
    el("div", { class: "page-head" }, el("h1", { text: ev.id ? ev.name : "New event" }), del),
    form,
    el("div", { class: "save-bar" }, saveState, saveBtn),
  );
}

export async function render(ctx) {
  const [id] = ctx.params;
  return id ? renderEditor(ctx, id) : renderList(ctx);
}
