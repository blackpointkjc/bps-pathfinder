// base44/functions/portalShowcase/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";
var PORTAL_REAUTH_AFTER = "2026-11-01T22:38:04.000Z";
var IDLE_MS = 13 * 60 * 60 * 1e3;
var delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var digest = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((value) => value.toString(16).padStart(2, "0")).join("");
var bearer = (request) => String(
  request?.headers?.get?.("authorization") || request?.headers?.get?.("on-behalf-of") || ""
).replace(/^Bearer\s+/i, "");
var live = (row, userId) => Boolean(row) && !row.revoked && String(row.user_id || "") === String(userId) && Date.parse(row.started_at || "") >= Date.parse(PORTAL_REAUTH_AFTER) && Date.now() - Date.parse(row.last_activity_at || "") < IDLE_MS;
var readSessions = async (db, filter, sort, limit) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rows = await db.PortalAuthSession.filter(filter, sort, limit);
      return { rows: Array.isArray(rows) ? rows : [] };
    } catch (error) {
      if (attempt === 1) return { error };
      await delay(250);
    }
  }
  return { error: new Error("Session store unavailable") };
};
async function portalSessionState(request, sdk, user) {
  if (!user || user.is_service) return { state: "invalid", row: null };
  const token = bearer(request);
  if (!token) return { state: "invalid", row: null };
  let tokenHash;
  try {
    tokenHash = await digest(token);
  } catch {
    return { state: "unknown", row: null };
  }
  const db = sdk.asServiceRole.entities;
  const direct = await readSessions(db, { token_hash: tokenHash }, "-created_date", 1);
  if (direct.error) return { state: "unknown", row: null };
  const matched = direct.rows[0];
  if (matched) return { state: live(matched, user.id) ? "current" : "invalid", row: matched };
  const open = await readSessions(db, { user_id: user.id }, "-last_activity_at", 5);
  if (open.error) return { state: "unknown", row: null };
  const active = open.rows.find((row) => live(row, user.id));
  if (!active) return { state: "invalid", row: null };
  const adopted = { ...active, token_hash: tokenHash };
  try {
    await db.PortalAuthSession.update(active.id, { token_hash: tokenHash, last_activity_at: (/* @__PURE__ */ new Date()).toISOString() });
  } catch {
    return { state: "unknown", row: adopted };
  }
  return { state: "current", row: adopted };
}
var clean = (v, n = 180) => String(v ?? "").trim().slice(0, n);
var json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
var VIDEO = "https://media.base44.com/videos/public/694de31c7e0f5645fb95de52/8b3f7aa83_pathfinder-sign-in-background.mp4";
var POSTER = "https://media.base44.com/images/public/694de31c7e0f5645fb95de52/a30c3100c_pathfinder_login_video_preview.jpg";
var activePerson = (u) => !u.disabled && !u.termination_date && !["terminated", "suspended", "denied"].includes(String(u.employment_status || "").toLowerCase()) && !["terminated", "suspended", "denied", "disabled"].includes(String(u.account_status || "").toLowerCase());
var hasRole = (u, role) => activePerson(u) && [u.role, ...u.additional_roles || []].some((v) => String(v).toLowerCase() === role);
var personName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.full_name || u.email;
async function roster(sdk) {
  const rows = [];
  for (let skip = 0; ; skip += 500) {
    const page = await sdk.asServiceRole.entities.User.list("id", 500, skip);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
var nameKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function profileRecognition(items, people) {
  return items.map((item) => {
    if (!["officer", "supervisor"].includes(item.kind)) return item;
    const eligible = people.filter((person2) => hasRole(person2, item.kind));
    let person = eligible.find((person2) => person2.id === item.user_id);
    if (!person && !item.user_id) {
      const title = nameKey(item.title);
      const matches = eligible.filter((p) => {
        const first = nameKey(p.first_name), last = nameKey(p.last_name);
        return title === nameKey(personName(p)) || title === nameKey([p.rank, personName(p)].filter(Boolean).join(" ")) || first && last && title === first[0] + " " + last;
      });
      if (matches.length === 1) person = matches[0];
    }
    return person ? { ...item, user_id: person.id, title: personName(person), image_url: person.profile_photo_url || person.profile_photo_original_url || "" } : { ...item, active: false };
  });
}
var originalVideo = () => ({ kind: "video", title: "BlackPoint Field Operations", caption: "The fleet and the people behind the mission", video_url: VIDEO, image_url: POSTER, active: true, sort_order: 0, builtin: true });
function galleryCatalog(rows) {
  const visible = (rows || []).filter((row) => row.archived !== true);
  const original = visible.find((row) => row.builtin === true || row.video_url === VIDEO) || visible.find((row) => row.kind === "video" && row.builtin === void 0);
  return [...original ? [] : [originalVideo()], ...visible.map((row) => ({ ...row, builtin: original?.id === row.id }))];
}
async function entry_default(req) {
  let phase = "start";
  try {
    const sdk = createClientFromRequest(req), db = sdk.asServiceRole.entities.PortalShowcase;
    const body = await req.json().catch(() => ({}));
    if (body.action === "public") {
      phase = "read public showcase";
      const rows = galleryCatalog(await db.list("-created_date", 200));
      const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).formatToParts(/* @__PURE__ */ new Date());
      const now = `${dateParts.find((p) => p.type === "year")?.value}-${dateParts.find((p) => p.type === "month")?.value}`;
      const active = rows.filter((r) => r.active === true);
      const gallery = active.filter((r) => ["video", "photo"].includes(r.kind)).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      const honorees = active.filter((r) => ["officer", "supervisor"].includes(r.kind) && r.month === now).sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")));
      const currentHonorees = honorees.length ? profileRecognition(honorees, await roster(sdk)) : [];
      const safe = (r) => ({ id: r.id, kind: r.kind, title: r.title, caption: r.caption, image_url: r.image_url, video_url: r.video_url || "", month: r.month });
      return json({ photos: gallery.slice(0, 20).map(safe), recognition: ["officer", "supervisor"].map((kind) => currentHonorees.find((r) => r.kind === kind && r.active !== false)).filter(Boolean).map(safe) });
    }
    phase = "authenticate administrator";
    const me = await sdk.auth.me().catch(() => null);
    if (!me?.id || me.disabled || me.termination_date || me.role !== "admin") return json({ error: "Administrator access required" }, 403);
    phase = "check session";
    const state = await portalSessionState(req, sdk, me).catch(() => ({ state: "unavailable" }));
    if (state.state === "invalid") return json({ error: "Your session expired. Sign in again." }, 401);
    if (body.action === "people") {
      const people = await roster(sdk);
      return json({ people: people.filter((u) => hasRole(u, "officer") || hasRole(u, "supervisor")).map((u) => ({ id: u.id, name: personName(u), rank: u.rank || "", roles: ["officer", "supervisor"].filter((role) => hasRole(u, role)), profile_photo_url: u.profile_photo_url || u.profile_photo_original_url || "" })).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (body.action === "list") {
      phase = "list records";
      const items = profileRecognition(galleryCatalog(await db.list("-created_date", 200)), await roster(sdk));
      return json({ items });
    }
    if (body.action === "save") {
      const r = { ...body.item || {} };
      if (["officer", "supervisor"].includes(r.kind)) {
        const person = await sdk.asServiceRole.entities.User.get(clean(r.user_id, 120)).catch(() => null);
        if (!person || !hasRole(person, r.kind)) return json({ error: "Select an employee with the " + r.kind + " role" }, 400);
        r.title = personName(person);
        r.image_url = person.profile_photo_url || person.profile_photo_original_url || "";
      }
      if (!["photo", "video", "officer", "supervisor"].includes(r.kind)) return json({ error: "Choose a valid showcase type" }, 400);
      if (!clean(r.title, 110)) return json({ error: "Enter a title or name" }, 400);
      const image = clean(r.image_url, 7e5), video = clean(r.video_url, 2e3), month = clean(r.month, 7);
      if (image && !(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || /^https:\/\//.test(image))) return json({ error: "Invalid photo format" }, 400);
      if (image.length > 65e4) return json({ error: "Image too large. Choose a smaller photo." }, 413);
      if (r.kind === "photo" && !image) return json({ error: "A gallery photo is required" }, 400);
      if (r.kind === "video" && !/^https:\/\/[^\s]+\.(?:mp4|webm)(?:\?[^\s]*)?$/i.test(video)) return json({ error: "Enter a secure MP4 or WebM video URL" }, 400);
      if (["officer", "supervisor"].includes(r.kind) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: "Select a valid award month" }, 400);
      const value = { builtin: r.builtin === true, archived: false, user_id: ["officer", "supervisor"].includes(r.kind) ? clean(r.user_id, 120) : "", kind: r.kind, title: clean(r.title, 110), caption: clean(r.caption, 240), image_url: image, video_url: r.kind === "video" ? video : "", month: ["photo", "video"].includes(r.kind) ? "" : month, active: r.active !== false, sort_order: Math.min(9999, Math.max(0, Number(r.sort_order) || 0)), updated_by: me.email || me.id };
      phase = "save record";
      if (["officer", "supervisor"].includes(value.kind) && value.active) {
        const existing = await db.filter({ kind: value.kind, month: value.month }, "-created_date", 100);
        for (const p of existing) if (p.id !== r.id && p.active) await db.update(p.id, { active: false });
      }
      let id = clean(r.id, 120);
      if (r.builtin === true && !id) {
        const previous = galleryCatalog(await db.list("-created_date", 200)).find((item) => item.builtin && item.id);
        id = previous?.id || "";
      }
      const saved = id ? await db.update(id, value) : await db.create(value);
      return json({ success: true, id: saved?.id || id });
    }
    if (body.action === "delete") {
      const id = clean(body.id, 120);
      if (!id) return json({ error: "Cannot delete built-in video. Disable it in Edit." }, 400);
      phase = "delete record";
      await db.update(id, { active: false, archived: true });
      return json({ success: true });
    }
    return json({ error: "Unknown operation" }, 400);
  } catch (error) {
    console.error("portalShowcase", phase, String(error?.message || error));
    return json({ error: "Showcase service unavailable", code: "SHOWCASE_BACKEND_ERROR", phase }, 503);
  }
}
Deno.serve(entry_default);
