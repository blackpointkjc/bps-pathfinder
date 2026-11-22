// base44/functions/prepareReportTeam/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";

// base44/shared/portalLoginGuard.ts
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
  const active2 = open.rows.find((row) => live(row, user.id));
  if (!active2) return { state: "invalid", row: null };
  const adopted = { ...active2, token_hash: tokenHash };
  try {
    await db.PortalAuthSession.update(active2.id, { token_hash: tokenHash, last_activity_at: (/* @__PURE__ */ new Date()).toISOString() });
  } catch {
    return { state: "unknown", row: adopted };
  }
  return { state: "current", row: adopted };
}

// base44/shared/reportTeam.ts
var norm = (v) => String(v || "").trim().toLowerCase();
var site = (v) => norm(v).split(" - ")[0].split(":")[0].trim();
var teamReportEntities = /* @__PURE__ */ new Set(["ShiftHandover", "ShiftReport", "DailyActivityReport", "IncidentReport", "ConfidentialReport", "ParkingViolation", "MaintenanceReport", "OpenDoorReport", "ExpenseReport", "QRScanEvent", "QRPatrolReport", "TrespassingNotice", "CriminalComplaint", "Summons", "WitnessSubpoenaRequest"]);
function easternWall(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return NaN;
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (k) => parts.find((p) => p.type === k)?.value;
  return Date.parse(get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute") + ":00Z");
}
function interval(row) {
  const day = String(row.shift_date || row.assignment_date || "").slice(0, 10);
  const start = Date.parse(day + "T" + String(row.start_time || "00:00").slice(0, 5) + ":00Z");
  let end = Date.parse(day + "T" + String(row.end_time || "00:00").slice(0, 5) + ":00Z");
  if (end <= start) end += 864e5;
  return [start, end];
}
var realIso = (wall) => {
  let value = wall + 5 * 36e5;
  for (let i = 0; i < 3; i++) value += wall - easternWall(value);
  return new Date(value).toISOString();
};
var active = (row) => !row.archived && !row.is_open && !["called_out", "sent_home", "reassigned"].includes(norm(row.attendance_status)) && !["open", "unassigned", ""].includes(norm(row.officer_email));
function scheduledTeam({ user, data = {}, schedules = [], users = [], now = Date.now() }) {
  const reportDate = String(data.report_date || data.shift_date || data.incident_date || data.violation_date || data.scanned_date || "").slice(0, 10);
  const when = easternWall(data.scanned_at || now);
  const location = site(data.location || data.property_site || data.linked_call_location);
  let own = schedules.filter((row) => active(row) && norm(row.officer_email) === norm(user.email) && (!location || site(row.location) === location));
  const clock = data.incident_time || data.shift_start || data.start_time;
  const target = reportDate && clock ? Date.parse(reportDate + "T" + String(clock).slice(0, 5) + ":00Z") : when;
  own = own.filter((row) => {
    const [start2, end2] = interval(row);
    if (reportDate && row.shift_date !== reportDate && !(target >= start2 && target < end2)) return false;
    return Boolean(reportDate) || target >= start2 && target < end2;
  });
  own.sort((a, b) => {
    const distance = (r) => {
      const [start2, end2] = interval(r);
      return target >= start2 && target < end2 ? 0 : Math.min(Math.abs(target - start2), Math.abs(target - end2));
    };
    return distance(a) - distance(b) || String(a.id).localeCompare(String(b.id));
  });
  const shift = own[0];
  if (!shift) return { attached_officer_ids: [], attached_officer_emails: [], attached_officer_names: [], team_schedule_ids: [], team_credit_source: "schedule", location: location ? "" : void 0 };
  const [start, end] = interval(shift);
  const peers = schedules.filter((row) => active(row) && site(row.location) === site(shift.location) && norm(row.officer_email) !== norm(user.email) && interval(row)[0] < end && interval(row)[1] > start);
  const emails = new Set(peers.map((row) => norm(row.officer_email)));
  if (shift.partner_officer_email) emails.add(norm(shift.partner_officer_email));
  const people = users.filter((person) => emails.has(norm(person.email)) && !person.disabled && !person.termination_date && !["terminated", "suspended"].includes(norm(person.employment_status)) && [person.role, ...person.additional_roles || []].some((role) => ["officer", "supervisor"].includes(norm(role))));
  return { attached_officer_ids: people.map((p) => String(p.id)), attached_officer_emails: people.map((p) => norm(p.email)), attached_officer_names: people.map((p) => [p.rank, p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || p.email), team_schedule_ids: [shift.id, ...peers.filter((r) => people.some((p) => norm(p.email) === norm(r.officer_email))).map((r) => r.id)].map(String), team_credit_source: "schedule", team_location: shift.location, team_date: shift.shift_date, team_window_start: realIso(start), team_window_end: realIso(end) };
}
async function all(entity, query) {
  const rows = [];
  for (let skip = 0; ; skip += 500) {
    const page = await entity.filter(query, "id", 500, skip);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function resolveReportTeam(sdk, user, data = {}) {
  const date = String(data.report_date || data.shift_date || data.incident_date || data.violation_date || data.scanned_date || new Date(easternWall()).toISOString().slice(0, 10)).slice(0, 10);
  const day = Date.parse(date + "T12:00:00Z");
  if (!Number.isFinite(day)) throw Error("Invalid report date");
  const from = new Date(day - 864e5).toISOString().slice(0, 10), to = new Date(day + 864e5).toISOString().slice(0, 10);
  const schedules = await all(sdk.asServiceRole.entities.Schedule, { shift_date: { $gte: from, $lte: to } });
  const candidateEmails = [...new Set(schedules.flatMap((row) => [norm(row.officer_email), norm(row.partner_officer_email)]).filter(Boolean))];
  const users = candidateEmails.length ? await all(sdk.asServiceRole.entities.User, { email: { $in: candidateEmails } }) : [];
  return scheduledTeam({ user, data, schedules, users });
}

// base44/functions/prepareReportTeam/entry.ts
async function entry_default(req) {
  try {
    const sdk = createClientFromRequest(req), user = await sdk.auth.me().catch(() => null);
    if (!user?.id || user.disabled || user.termination_date) return Response.json({ error: "Officer access required" }, { status: 403 });
    if ((await portalSessionState(req, sdk, user)).state === "invalid") return Response.json({ error: "Sign in again" }, { status: 401 });
    const roles = [user.role, ...user.additional_roles || []].map((v) => String(v).toLowerCase());
    if (!roles.some((role) => ["admin", "officer", "supervisor", "dispatch", "cad_access", "full_access"].includes(role))) return Response.json({ error: "Officer access required" }, { status: 403 });
    if (user.user_type === "client" || String(user.rank).toLowerCase() === "client" || roles.includes("client")) return Response.json({ error: "Officer access required" }, { status: 403 });
    const body = await req.json(), entity = String(body.entity || "");
    if (!teamReportEntities.has(entity)) return Response.json({ error: "Unsupported report type" }, { status: 400 });
    const input = body.data || {};
    const db = sdk.asServiceRole.entities.TeamReportWork;
    if (body.action === "cancel") {
      const work = await db.get(String(body.work_id || ""));
      if (work.officer_id !== user.id) return Response.json({ error: "Not your report work" }, { status: 403 });
      if (work.work_token !== body.work_token) return Response.json({ success: true });
      if (work.status === "in_progress") await db.update(work.id, { status: "cancelled" });
      return Response.json({ success: true });
    }
    const team = await resolveReportTeam(sdk, user, input);
    if (body.action === "start") {
      if (!team.team_schedule_ids?.length) return Response.json({ team, work_id: null });
      const date = team.team_date, location = team.team_location;
      const key = [user.id, entity, team.team_schedule_ids[0], String(input.linked_call_id || "")].join(":");
      const existing = await db.filter({ work_key: key }, "-created_date", 1);
      const value = { work_token: String(body.work_token || "").slice(0, 100), work_key: key, report_entity: entity, report_date: date, incident_date: input.incident_date || date, incident_time: input.incident_time || "", location, linked_call_id: String(input.linked_call_id || ""), linked_call_number: String(input.linked_call_number || ""), officer_email: user.email, officer_id: user.id, ...team, status: "in_progress" };
      const work = existing[0] ? await db.update(existing[0].id, value) : await db.create(value);
      return Response.json({ team, work_id: work.id });
    }
    return Response.json({ team });
  } catch (error) {
    return Response.json({ error: error.message || "Unable to resolve scheduled report partners" }, { status: 500 });
  }
}

// <stdin>
Deno.serve(entry_default);
