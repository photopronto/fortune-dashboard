// Account: name and who can sign in.
import * as api from "../api.js";
import { el, mount, act, field, select, confirmDialog } from "../ui.js";

export async function render({ root, state, refreshAccounts }) {
  const acc = await api.account(state.accountId);
  const people = await api.members(state.accountId);
  const name = el("input", { type: "text", value: acc.name, maxlength: "80", disabled: !state.admin });

  const saveBtn = state.admin ? el("button", { class: "btn primary", type: "button", text: "Save name" }) : null;
  if (saveBtn) saveBtn.onclick = () => act(saveBtn, async () => {
    if (!name.value.trim()) throw new Error("The account needs a name");
    await api.updateAccount(acc.id, { name: name.value.trim() });
    await refreshAccounts();
  }, "Saved");

  let addBox = null;
  if (state.admin) {
    const email = el("input", { type: "email", placeholder: "their@email.com" });
    const role = select([["owner", "Owner"], ["staff", "Staff"]], "owner");
    const add = el("button", { class: "btn dark", type: "button", text: "Give access" });
    add.onclick = () => act(add, async () => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) throw new Error("Enter their email address");
      await api.addMember(acc.id, email.value.trim(), role.value);
      render({ root, state, refreshAccounts });
    }, "Access given");
    addBox = el("div", { class: "stack" },
      el("div", { class: "form-grid" }, field("Email", email, "They need a login first: create it in Supabase under Authentication > Users."), field("Role", role)),
      el("div", { class: "btn-row" }, add));
  }

  mount(root,
    el("div", { class: "page-head" }, el("div", {}, el("h1", { text: "Account" }), el("p", { class: "sub", text: "Your business details and who can sign in." }))),
    el("div", { class: "stack" },
      el("div", { class: "tile" }, el("h2", { text: "Details" }),
        el("div", { class: "form-grid" }, field("Business name", name, state.admin ? null : "Contact Photo Pronto to change this")),
        saveBtn ? el("div", { class: "save-bar" }, saveBtn) : null),
      el("div", { class: "tile" }, el("h2", { text: "People with access" }),
        el("div", { class: "table-wrap", style: { background: "var(--inner)", border: "1px solid var(--line)", marginBottom: "16px" } },
          el("table", {}, el("thead", {}, el("tr", {}, ["Email", "Role", ""].map((h) => el("th", { text: h })))),
            el("tbody", {}, people.map((p) => el("tr", {},
              el("td", { text: p.email }), el("td", { text: p.role === "staff" ? "Staff" : "Owner" }),
              el("td", {}, state.admin && p.user_id !== state.user.id ? el("button", { class: "btn small danger", type: "button", text: "Remove", onclick: async (e) => {
                if (!(await confirmDialog("Remove access?", `${p.email} will no longer be able to sign in to this account.`, "Remove"))) return;
                await act(e.target, async () => { await api.removeMember(acc.id, p.user_id); render({ root, state, refreshAccounts }); }, "Access removed");
              } }) : null)))))),
        addBox)),
  );
}
