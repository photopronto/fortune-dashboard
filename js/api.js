// Everything the dashboard reads or writes goes through here.
// Access is enforced by the database's row level security: buyers only
// ever see their own account; Photo Pronto admins see all accounts.

const C = window.FT_CONFIG;
export const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "ft-dashboard-auth" },
});

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---- auth -------------------------------------------------------------------
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data?.session?.user ?? null;
}
export async function signIn(email, password) {
  return unwrap(await sb.auth.signInWithPassword({ email, password }));
}
export async function needsSecondFactor() {
  const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
export async function verifySecondFactor(code) {
  const factors = unwrap(await sb.auth.mfa.listFactors());
  const factor = (factors.totp || []).find((f) => f.status === "verified");
  if (!factor) throw new Error("No authenticator app is set up for this login");
  return unwrap(await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code }));
}
export async function signOut() {
  await sb.auth.signOut();
}
export async function isAdmin() {
  const user = await currentUser();
  if (!user) return false;
  const rows = unwrap(await sb.from("ft_admins").select("user_id").eq("user_id", user.id));
  return rows.length > 0;
}

// ---- accounts ---------------------------------------------------------------
export async function accounts() {
  return unwrap(await sb.from("ft_accounts").select("id, name, retention_days, microsite, created_at").order("name"));
}
export async function account(id) {
  return unwrap(await sb.from("ft_accounts").select("*").eq("id", id).single());
}
export async function updateAccount(id, patch) {
  return unwrap(await sb.from("ft_accounts").update(patch).eq("id", id).select().single());
}
export async function createAccount(name) {
  return unwrap(await sb.from("ft_accounts").insert({ name }).select().single());
}
export async function members(accountId) {
  return unwrap(await sb.rpc("ft_account_members", { p_account: accountId }));
}
export async function addMember(accountId, email, role) {
  return unwrap(await sb.rpc("ft_add_member", { p_account: accountId, p_email: email, p_role: role }));
}
export async function removeMember(accountId, userId) {
  return unwrap(await sb.from("ft_members").delete().eq("account_id", accountId).eq("user_id", userId));
}

// ---- units ------------------------------------------------------------------
export async function units(accountId) {
  let q = sb.from("ft_units").select("*").order("name");
  if (accountId) q = q.eq("account_id", accountId);
  return unwrap(await q);
}
export async function allUnits() {
  return unwrap(await sb.from("ft_units").select("*, ft_accounts(name)").order("name"));
}
export async function unit(id) {
  return unwrap(await sb.from("ft_units").select("*").eq("id", id).single());
}
export async function updateUnit(id, patch) {
  return unwrap(await sb.from("ft_units").update(patch).eq("id", id).select().single());
}
export async function createUnit(name, accountId, serial) {
  const rows = unwrap(await sb.rpc("ft_create_unit", { p_name: name, p_account: accountId || null, p_serial: serial || null }));
  return rows[0];
}
export async function newPairingCode(unitId) {
  return unwrap(await sb.rpc("ft_new_pairing_code", { p_unit: unitId }));
}
export async function claimUnit(code, accountId) {
  return unwrap(await sb.rpc("ft_claim_unit", { code, acc: accountId }));
}

// ---- fortunes ---------------------------------------------------------------
export async function fortuneSets(accountId) {
  return unwrap(await sb.from("ft_fortune_sets").select("id, name, mode, updated_at, ft_fortunes(count)").eq("account_id", accountId).order("name"));
}
export async function fortuneSet(id) {
  return unwrap(await sb.from("ft_fortune_sets").select("*").eq("id", id).single());
}
export async function createFortuneSet(accountId, name) {
  return unwrap(await sb.from("ft_fortune_sets").insert({ account_id: accountId, name }).select().single());
}
export async function updateFortuneSet(id, patch) {
  return unwrap(await sb.from("ft_fortune_sets").update(patch).eq("id", id).select().single());
}
export async function deleteFortuneSet(id) {
  return unwrap(await sb.from("ft_fortune_sets").delete().eq("id", id));
}
export async function fortunes(setId) {
  return unwrap(await sb.from("ft_fortunes").select("*").eq("set_id", setId).order("position").order("created_at"));
}
export async function saveFortunes(setId, rows, deletedIds) {
  if (deletedIds.length) unwrap(await sb.from("ft_fortunes").delete().in("id", deletedIds));
  const existing = rows.filter((r) => r.id).map((r, i) => r);
  const fresh = rows.filter((r) => !r.id);
  if (existing.length) {
    unwrap(await sb.from("ft_fortunes").upsert(existing.map((r) => ({
      id: r.id, set_id: setId, text: r.text, weight: r.weight, active: r.active, position: r.position,
    }))));
  }
  if (fresh.length) {
    unwrap(await sb.from("ft_fortunes").insert(fresh.map((r) => ({
      set_id: setId, text: r.text, weight: r.weight, active: r.active, position: r.position,
    }))));
  }
  // Touch the set so units pick up the change on their next sync
  unwrap(await sb.from("ft_fortune_sets").update({ updated_at: new Date().toISOString() }).eq("id", setId));
}

// ---- designs ----------------------------------------------------------------
export async function designs(accountId) {
  return unwrap(await sb.from("ft_designs").select("id, name, layout, updated_at").eq("account_id", accountId).order("name"));
}
export async function design(id) {
  return unwrap(await sb.from("ft_designs").select("*").eq("id", id).single());
}
export async function createDesign(accountId, name, layout) {
  return unwrap(await sb.from("ft_designs").insert({ account_id: accountId, name, layout }).select().single());
}
export async function updateDesign(id, patch) {
  return unwrap(await sb.from("ft_designs").update(patch).eq("id", id).select().single());
}
export async function deleteDesign(id) {
  return unwrap(await sb.from("ft_designs").delete().eq("id", id));
}

// ---- events -----------------------------------------------------------------
export async function events(accountId) {
  return unwrap(await sb.from("ft_events").select("*").eq("account_id", accountId).order("starts_at", { ascending: false, nullsFirst: true }));
}
export async function saveEvent(row) {
  if (row.id) return unwrap(await sb.from("ft_events").update(row).eq("id", row.id).select().single());
  return unwrap(await sb.from("ft_events").insert(row).select().single());
}
export async function deleteEvent(id) {
  return unwrap(await sb.from("ft_events").delete().eq("id", id));
}

// ---- files ------------------------------------------------------------------
export async function uploadAsset(accountId, file, folder) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${accountId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  unwrap(await sb.storage.from("ft-assets").upload(path, file, { contentType: file.type || undefined, upsert: false }));
  return path;
}
export async function assetUrl(path) {
  const { data } = await sb.storage.from("ft-assets").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---- fortunes taken ---------------------------------------------------------
export async function captures(accountId, { from = 0, size = 48 } = {}) {
  const rows = unwrap(await sb.from("ft_captures")
    .select("id, unit_id, event_id, fortune_text, status, photo_path, receipt_path, captured_at, expires_at, views", { count: "exact" })
    .eq("account_id", accountId).order("captured_at", { ascending: false }).range(from, from + size - 1));
  const paths = rows.flatMap((r) => [r.photo_path, r.receipt_path]).filter(Boolean);
  const urls = {};
  if (paths.length) {
    const { data } = await sb.storage.from("ft-captures").createSignedUrls(paths, 3600);
    for (const s of data || []) if (s.signedUrl) urls[s.path] = s.signedUrl;
  }
  return rows.map((r) => ({ ...r, photo_url: urls[r.photo_path], receipt_url: urls[r.receipt_path] }));
}
export async function deleteCapture(c) {
  const paths = [c.photo_path, c.receipt_path].filter(Boolean);
  if (paths.length) await sb.storage.from("ft-captures").remove(paths);
  return unwrap(await sb.from("ft_captures").delete().eq("id", c.id));
}
export async function captureStats(accountId, sinceIso) {
  return unwrap(await sb.from("ft_captures").select("captured_at, unit_id, views").eq("account_id", accountId).gte("captured_at", sinceIso).limit(5000));
}

// ---- sign-ups ---------------------------------------------------------------
export async function leads(accountId) {
  return unwrap(await sb.from("ft_leads").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(5000));
}
export async function deleteLead(id) {
  return unwrap(await sb.from("ft_leads").delete().eq("id", id));
}
