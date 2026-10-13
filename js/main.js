// App shell: login, account picker, navigation and routing.
import * as api from "./api.js";
import { el, mount, toast, errorText, spinner } from "./ui.js";

const root = document.getElementById("root");
export const state = { user: null, admin: false, accounts: [], accountId: null };

const ROUTES = [
  { path: "units", label: "Units", load: () => import("./views/units.js") },
  { path: "fortunes", label: "Fortunes", load: () => import("./views/fortunes.js") },
  { path: "designs", label: "Receipt designs", load: () => import("./views/designs.js") },
  { path: "events", label: "Events", load: () => import("./views/events.js") },
  { path: "qr", label: "QR page", load: () => import("./views/qrpage.js") },
  { path: "gallery", label: "Gallery", load: () => import("./views/gallery.js") },
  { path: "signups", label: "Sign-ups", load: () => import("./views/signups.js") },
  { path: "account", label: "Account", load: () => import("./views/account.js") },
  { path: "admin", label: "Admin", load: () => import("./views/admin.js"), admin: true },
];

// ---- login --------------------------------------------------------------------
function renderLogin(message = "") {
  const email = el("input", { type: "email", autocomplete: "username", required: true, placeholder: "Email" });
  const password = el("input", { type: "password", autocomplete: "current-password", required: true, placeholder: "Password" });
  const err = el("p", { class: "form-error", role: "alert", text: message });
  const btn = el("button", { class: "btn primary", type: "submit", text: "Sign in" });
  const form = el("form", { class: "form" }, email, password, err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    try {
      await api.signIn(email.value.trim(), password.value);
      if (await api.needsSecondFactor()) return renderSecondFactor();
      await start();
    } catch (ex) {
      err.textContent = /invalid/i.test(errorText(ex)) ? "That email and password don't match" : errorText(ex);
      btn.disabled = false;
    }
  });
  mount(root, el("div", { class: "login-wrap" }, el("div", { class: "login-card" },
    el("img", { src: "logo.png", alt: "Photo Pronto" }),
    el("h1", { text: "Fortune Teller" }),
    el("p", { text: "Sign in to manage your fortune tellers." }),
    form,
  )));
  email.focus();
}

function renderSecondFactor() {
  const code = el("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", placeholder: "6-digit code", required: true });
  const err = el("p", { class: "form-error", role: "alert" });
  const btn = el("button", { class: "btn primary", type: "submit", text: "Continue" });
  const form = el("form", { class: "form" }, code, err, btn,
    el("button", { class: "btn", type: "button", text: "Use a different login", onclick: async () => { await api.signOut(); renderLogin(); } }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    try {
      await api.verifySecondFactor(code.value.replace(/\s/g, ""));
      await start();
    } catch (ex) {
      err.textContent = "That code didn't work. Check your authenticator app and try again.";
      btn.disabled = false;
    }
  });
  mount(root, el("div", { class: "login-wrap" }, el("div", { class: "login-card" },
    el("img", { src: "logo.png", alt: "Photo Pronto" }),
    el("h1", { text: "Two-step check" }),
    el("p", { text: "Enter the code from your authenticator app." }),
    form,
  )));
  code.focus();
}

// ---- shell --------------------------------------------------------------------
function currentPath() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { route: parts[0] || "units", params: parts.slice(1) };
}

function accountPicker() {
  if (state.accounts.length < 2) {
    return state.accounts[0] ? el("span", { class: "muted small", text: state.accounts[0].name }) : null;
  }
  const s = el("select", { "aria-label": "Account", style: { width: "auto", minWidth: "180px" } });
  for (const a of state.accounts) s.append(el("option", { value: a.id, text: a.name, selected: a.id === state.accountId }));
  s.addEventListener("change", () => {
    if (window.__ftDirty && !confirm("You have unsaved changes. Leave without saving?")) { s.value = state.accountId; return; }
    window.__ftDirty = false;
    state.accountId = s.value;
    try { localStorage.setItem("ft-account", s.value); } catch {}
    location.hash = "#/units";
    route();
  });
  return s;
}

let content;
function renderShell() {
  const { route: active } = currentPath();
  const nav = el("nav", { class: "side", "aria-label": "Sections" });
  for (const r of ROUTES) {
    if (r.admin && !state.admin) continue;
    if (r.admin) nav.append(el("div", { class: "sep" }));
    nav.append(el("a", { href: `#/${r.path}`, class: r.path === active ? "active" : "", text: r.label }));
  }
  content = el("main", { id: "content" });
  mount(root,
    el("header", { class: "topbar" },
      el("a", { class: "brand", href: "#/units" }, el("img", { src: "logo.png", alt: "Photo Pronto" }), el("span", { text: "Fortune Teller" })),
      el("div", { class: "top-actions" },
        accountPicker(),
        el("button", { class: "btn", type: "button", text: "Sign out", onclick: async () => { await api.signOut(); location.hash = ""; renderLogin(); } }),
      ),
    ),
    el("div", { class: "shell" }, nav, content),
  );
}

async function route() {
  const { route: name, params } = currentPath();
  const r = ROUTES.find((x) => x.path === name && (!x.admin || state.admin)) || ROUTES[0];
  renderShell();
  if (!state.accountId && r.path !== "admin") {
    mount(content, el("div", { class: "empty" },
      el("h2", { text: "No account yet" }),
      el("p", { text: state.admin ? "Create a buyer account on the Admin page to get started." : "Your login isn't linked to an account yet. Please contact Photo Pronto." }),
      state.admin ? el("a", { class: "btn primary", href: "#/admin", text: "Go to Admin" }) : null,
    ));
    return;
  }
  mount(content, spinner());
  try {
    const mod = await r.load();
    await mod.render({ root: content, params, state, refreshAccounts });
    document.title = `${r.label} · Fortune Teller`;
  } catch (e) {
    console.error(e);
    mount(content, el("div", { class: "empty" }, el("h2", { text: "Couldn't load this page" }), el("p", { text: errorText(e) }),
      el("button", { class: "btn", type: "button", text: "Try again", onclick: route })));
  }
}

export async function refreshAccounts() {
  state.accounts = await api.accounts();
  if (!state.accounts.find((a) => a.id === state.accountId)) state.accountId = state.accounts[0]?.id ?? null;
}

async function start() {
  state.user = await api.currentUser();
  if (!state.user) return renderLogin();
  if (await api.needsSecondFactor()) return renderSecondFactor();
  state.admin = await api.isAdmin();
  let saved = null;
  try { saved = localStorage.getItem("ft-account"); } catch {}
  state.accountId = saved;
  await refreshAccounts();
  route();
}

window.addEventListener("hashchange", () => {
  if (!state.user) return;
  route();
});
window.addEventListener("beforeunload", (e) => {
  if (window.__ftDirty) { e.preventDefault(); e.returnValue = ""; }
});
// Ask before leaving a page with unsaved edits via the nav links
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a[href^='#/']");
  if (a && window.__ftDirty) {
    if (!confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
    else window.__ftDirty = false;
  }
}, true);

start().catch((e) => { console.error(e); toast(errorText(e), "error"); renderLogin(); });
