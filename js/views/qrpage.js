// The page guests see when they scan the QR code: branding, sign-up gate, how long photos are kept.
import * as api from "../api.js";
import { el, mount, act, field, select, toggle, dirtyTracker } from "../ui.js";

const HEX = /^#[0-9a-f]{6}$/i;

function colourField(label, value, onChange) {
  const picker = el("input", { type: "color", value: HEX.test(value) ? value : "#000000" });
  const text = el("input", { type: "text", value: value || "", maxlength: "7", style: { width: "110px" }, class: "mono" });
  picker.addEventListener("input", () => { text.value = picker.value; onChange(picker.value); });
  text.addEventListener("input", () => { if (HEX.test(text.value)) { picker.value = text.value; onChange(text.value); } });
  return field(label, el("div", { class: "btn-row" }, picker, text));
}

export async function render({ root, state }) {
  const acc = await api.account(state.accountId);
  const ms = JSON.parse(JSON.stringify(acc.microsite || {}));
  ms.colours ||= { background: "#1a1625", text: "#ffffff", accent: "#ffb000" };
  ms.gate ||= {};
  const g = ms.gate;
  const saveState = el("span", { class: "state" });
  const dirty = dirtyTracker(saveState);

  const heading = el("input", { type: "text", value: ms.heading || "Your fortune awaits", maxlength: "60" });
  const message = el("textarea", { rows: "2", maxlength: "300" }); message.value = ms.message || "";
  const download = el("input", { type: "text", value: ms.download_label || "Download your fortune", maxlength: "40" });
  const retention = el("input", { type: "number", min: "1", max: "365", value: acc.retention_days });

  const logoFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml" });
  const logoImg = el("img", { alt: "Current logo", style: { maxHeight: "60px", maxWidth: "200px", display: "block", background: ms.colours.background, padding: "8px", borderRadius: "10px" } });
  const logoRemove = el("button", { class: "btn small", type: "button", text: "Remove logo" });
  const showLogo = async () => {
    const has = !!ms.logo_path;
    logoImg.hidden = logoRemove.hidden = !has;
    if (has) logoImg.src = (await api.assetUrl(ms.logo_path)) || "";
  };
  logoRemove.onclick = () => { delete ms.logo_path; dirty.mark(); showLogo(); };
  logoFile.addEventListener("change", () => act(null, async () => {
    const f = logoFile.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) throw new Error("Please use a logo under 3 MB");
    ms.logo_path = await api.uploadAsset(state.accountId, f, "logos");
    dirty.mark(); await showLogo();
  }, "Logo uploaded"));

  const gateOn = toggle("Ask for details before showing the fortune", !!g.enabled);
  const kind = select([["newsletter", "Email sign-up"], ["competition", "Competition entry"]], g.kind || "newsletter");
  const gHeading = el("input", { type: "text", value: g.heading || "", maxlength: "60", placeholder: "e.g. Win a night for two" });
  const gIntro = el("textarea", { rows: "2", maxlength: "300", placeholder: "Optional line under the heading" }); gIntro.value = g.intro || "";
  const consent = el("textarea", { rows: "2", maxlength: "400" }); consent.value = g.consent_text || "I agree to receive emails from us. You can unsubscribe at any time.";
  const privacy = el("input", { type: "url", value: g.privacy_url || "", placeholder: "https://…" });
  const terms = el("input", { type: "url", value: g.terms_url || "", placeholder: "https://…" });
  const askName = toggle("Ask for their name", g.ask_name !== false);
  const allowSkip = toggle("Let guests skip it", g.allow_skip !== false);
  const gateBox = el("div", { class: "stack" },
    el("div", { class: "form-grid" }, field("Type", kind), field("Heading", gHeading)),
    field("Intro", gIntro),
    field("Agreement text", consent, "Guests must tick this to continue. Say who will contact them and how to opt out."),
    el("div", { class: "form-grid" }, field("Privacy policy link", privacy), field("Terms link", terms, "Needed for competitions")),
    el("div", { class: "btn-row", style: { gap: "20px" } }, askName.node, allowSkip.node));
  const syncGate = () => { gateBox.hidden = !gateOn.input.checked; };
  gateOn.input.addEventListener("change", syncGate); syncGate();

  const colours = el("div", { class: "form-grid" },
    colourField("Background", ms.colours.background, (v) => { ms.colours.background = v; logoImg.style.background = v; dirty.mark(); }),
    colourField("Text", ms.colours.text, (v) => { ms.colours.text = v; dirty.mark(); }),
    colourField("Buttons and highlights", ms.colours.accent, (v) => { ms.colours.accent = v; dirty.mark(); }));

  const recent = (await api.captures(state.accountId, { size: 1 }))[0];
  const previewLink = recent ? el("a", { class: "btn", href: `${window.FT_CONFIG.SHARE_BASE_URL}${recent.id}`, target: "_blank", rel: "noopener", text: "Open latest fortune's page" }) : null;

  const page = el("div", { class: "stack" },
    el("div", { class: "tile" }, el("h2", { text: "Look" }),
      el("div", { class: "form-grid" }, field("Heading", heading), field("Download button", download)),
      el("div", { style: { marginTop: "14px" } }, field("Message", message, "Shown under the heading, e.g. a thank you")),
      el("div", { style: { marginTop: "14px" } }, colours),
      el("div", { style: { marginTop: "14px" } }, field("Logo", logoFile), el("div", { class: "btn-row", style: { marginTop: "8px" } }, logoImg, logoRemove))),
    el("div", { class: "tile" }, el("h2", { text: "Sign-up before the fortune" }), gateOn.node, el("div", { style: { marginTop: "14px" } }, gateBox)),
    el("div", { class: "tile" }, el("h2", { text: "How long photos are kept" }),
      el("div", { class: "form-grid" }, field("Days", retention, "After this the page shows \"this fortune has faded\" and the photos are deleted. Applies to new fortunes."))),
  );
  page.addEventListener("input", dirty.mark);
  page.addEventListener("change", dirty.mark);

  const saveBtn = el("button", { class: "btn primary", type: "button", text: "Save QR page" });
  saveBtn.onclick = () => act(saveBtn, async () => {
    for (const [k, v] of Object.entries(ms.colours)) if (!HEX.test(v)) throw new Error(`The ${k} colour needs to look like #1a2b3c`);
    const days = Math.round(Number(retention.value));
    if (!(days >= 1 && days <= 365)) throw new Error("Keep photos for 1 to 365 days");
    for (const u of [privacy.value, terms.value]) if (u && !/^https:\/\//i.test(u)) throw new Error("Links need to start with https://");
    if (gateOn.input.checked && kind.value === "competition" && !terms.value) throw new Error("Add a link to the competition terms");
    if (gateOn.input.checked && !consent.value.trim()) throw new Error("Add the agreement text guests tick");
    const microsite = {
      ...ms,
      heading: heading.value.trim(), message: message.value.trim(), download_label: download.value.trim() || "Download",
      gate: { ...g, enabled: gateOn.input.checked, kind: kind.value, heading: gHeading.value.trim(), intro: gIntro.value.trim(),
        consent_text: consent.value.trim(), privacy_url: privacy.value.trim(), terms_url: terms.value.trim(),
        ask_name: askName.input.checked, allow_skip: allowSkip.input.checked },
    };
    delete microsite.logo_url;
    await api.updateAccount(state.accountId, { microsite, retention_days: days });
    dirty.clear();
  }, "Saved. Guests see the change straight away.");

  mount(root,
    el("div", { class: "page-head" },
      el("div", {}, el("h1", { text: "QR page" }), el("p", { class: "sub", text: "What guests see when they scan the QR code on their fortune. Only your branding shows." })),
      previewLink),
    page,
    el("div", { class: "save-bar" }, saveState, saveBtn),
  );
  showLogo();
}
