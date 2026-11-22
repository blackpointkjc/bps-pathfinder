// base44/shared/companyGraph.ts
var GRAPH = "https://graph.microsoft.com/v1.0";
var env = (name) => Deno.env.get(name) || "";
var cached = null;
function companyGraphConfig() {
  return {
    tenant: env("GRAPH_TENANT_ID") || env("MICROSOFT_TENANT_ID") || env("IA_GRAPH_TENANT_ID") || "07f32330-fc73-4d73-a835-e9c47ba798c7",
    client: env("GRAPH_CLIENT_ID") || env("MICROSOFT_CLIENT_ID") || env("IA_GRAPH_CLIENT_ID"),
    secret: env("GRAPH_CLIENT_SECRET") || env("MICROSOFT_CLIENT_SECRET") || env("IA_GRAPH_CLIENT_SECRET"),
    sender: env("GRAPH_SENDER_EMAIL") || "management@blackpointkjc.com"
  };
}
function rolesFromToken(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).roles || [];
  } catch {
    return [];
  }
}
async function getCompanyGraphAuthorization() {
  if (cached && cached.expires > Date.now() + 12e4) return cached;
  const cfg = companyGraphConfig();
  if (!cfg.client || !cfg.secret) throw Error("Company Graph application credentials are missing. Configure GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET (or the existing IA_GRAPH credentials).");
  const response = await fetch("https://login.microsoftonline.com/" + encodeURIComponent(cfg.tenant) + "/oauth2/v2.0/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.client, client_secret: cfg.secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }), signal: AbortSignal.timeout(12e3) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Error("Company Microsoft Graph application authorization failed: " + String(data.error || response.status) + ". Check the company app credential and tenant.");
  cached = { token: String(data.access_token), roles: rolesFromToken(data.access_token), expires: Date.now() + Number(data.expires_in || 3600) * 1e3 };
  return cached;
}
async function getCompanyGraphToken() {
  const auth = await getCompanyGraphAuthorization();
  if (!auth.roles.includes("Mail.Send")) throw Error("The company Graph application needs the Mail.Send APPLICATION permission with administrator consent. Personal Outlook connections are not used.");
  return auth.token;
}
async function sendCompanyEmail({ to, subject, body, html = false, from, replyTo }) {
  const cfg = companyGraphConfig(), sender = from || cfg.sender;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ""))) throw Error("A valid email recipient is required.");
  const token = await getCompanyGraphToken();
  const response = await fetch(GRAPH + "/users/" + encodeURIComponent(sender) + "/sendMail", { method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, signal: AbortSignal.timeout(15e3), body: JSON.stringify({ message: { subject: String(subject || "Pathfinder notification").slice(0, 250), body: { contentType: html ? "HTML" : "Text", content: String(body || "") }, from: { emailAddress: { address: sender, name: "BlackPoint Pathfinder" } }, replyTo: [{ emailAddress: { address: replyTo || sender } }], toRecipients: [{ emailAddress: { address: String(to).trim() } }] }, saveToSentItems: true }) });
  if (response.status !== 202) {
    const data = await response.json().catch(() => ({}));
    throw Error("Company Graph email was not accepted (" + response.status + "): " + String(data?.error?.code || "sendMail failed") + ".");
  }
  return { accepted: true, provider: "microsoft_graph", request_id: response.headers.get("request-id") || "" };
}

// base44/functions/notifyPropertyAlertSms/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";
var __portalAppIdentity = (user) => user && String(user.id) === "6a72bbee2842d6338cbae513" && String(user.rank).toLowerCase() === "support staff" ? { ...user, role: "user", additional_roles: ["support"], is_supervisor: false, dispatch_role: "", ps_role: "none" } : user;
var __portalReauthAfter = "2026-11-01T22:38:04.000Z";
async function __portalLoginIsCurrent(request, sdk, user) {
  try {
    if (!user || user.disabled || user.termination_date || ["suspended", "denied", "terminated"].includes(String(user.account_status || "").toLowerCase()) || ["suspended", "terminated"].includes(String(user.employment_status || "").toLowerCase())) return false;
    const token = String(request.headers.get("authorization") || request.headers.get("on-behalf-of") || "").replace(/^Bearer\s+/i, "");
    if (!token) return false;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((v) => v.toString(16).padStart(2, "0")).join("");
    const rows = await sdk.asServiceRole.entities.PortalAuthSession.filter({ token_hash: hash }, "-created_date", 1), session = rows[0];
    return !!session && session.user_id === user.id && !session.revoked && Date.parse(session.started_at) >= Date.parse(__portalReauthAfter) && Date.now() - Date.parse(session.last_activity_at) < 13 * 60 * 60 * 1e3;
  } catch {
    return false;
  }
}
var __limitFullAccess = (user) => user && String(user.id) !== "6ae7d733d4b1a647cd3e6f38" ? { ...user, additional_roles: (user.additional_roles || []).filter((role) => String(role).toLowerCase() !== "full_access") } : user;
var RECIPIENT_PRIORITY = {
  admin: 1,
  on_property_officer: 2,
  duty_supervisor: 3
};
function lower(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeSite(value) {
  return lower(value).replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}
function siteCandidates(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const parts = [raw];
  if (raw.includes(":")) {
    parts.push(raw.split(":")[0]);
    parts.push(raw.split(":").slice(1).join(":"));
  }
  if (raw.includes(" - ")) {
    parts.push(raw.split(" - ")[0]);
    parts.push(raw.split(" - ").slice(1).join(" - "));
  }
  return [...new Set(parts.map(normalizeSite).filter(Boolean))];
}
function easternNowParts(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { dateKey, minutes };
}
function shiftDateKey(dateKey, deltaDays) {
  const date = /* @__PURE__ */ new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
function toMinutes(value) {
  const [hour = 0, minute = 0] = String(value || "00:00").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}
function dutyAssignmentIsActive(assignment, dateKey, nowMinutes) {
  if (!assignment?.assignment_date || !assignment?.start_time || !assignment?.end_time) return false;
  if (["cancelled", "completed"].includes(lower(assignment.status))) return false;
  const start = toMinutes(assignment.start_time);
  const end = toMinutes(assignment.end_time);
  if (end > start) {
    return assignment.assignment_date === dateKey && nowMinutes >= start && nowMinutes < end;
  }
  const yesterday = shiftDateKey(dateKey, -1);
  return assignment.assignment_date === dateKey && nowMinutes >= start || assignment.assignment_date === yesterday && nowMinutes < end;
}
function sameProperty(value, propertyNames) {
  const candidates = siteCandidates(value);
  if (!candidates.length) return false;
  return candidates.some((candidate) => propertyNames.some((property) => candidate === property));
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(() => null);
    if (__portalCaller && !__portalCaller.is_service && __portalCaller.role !== "admin" && !await __portalLoginIsCurrent(req, base44, __portalCaller)) return Response.json({ error: "Your Pathfinder session ended. Please sign in again.", code: "SESSION_REAUTH_REQUIRED" }, { status: 401 });
    let __portalService = false;
    if (!__portalCaller && req.headers.get("Authorization")) {
      try {
        await base44.entities.SystemScanRun.list("-created_date", 1);
        __portalService = true;
      } catch {
      }
    }
    if (!__portalCaller && !__portalService || __portalCaller && ((__portalCaller.additional_roles || []).includes("visitor") || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status || "").toLowerCase() === "terminated" || !__portalCaller.is_service && __portalCaller.role !== "admin" && !(__portalCaller.additional_roles || []).length && !["investigator", "reviewer"].includes(__portalCaller.ps_role))) return Response.json({ error: "Approved portal access required" }, { status: 403 });
    base44.auth.me = async () => __portalCaller;
    let user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(() => null);
    let trustedServiceInvocation = false;
    if (!user && req.headers.get("Authorization")) {
      try {
        await base44.entities.PropertyAlertSmsDelivery.list("-created_date", 1);
        trustedServiceInvocation = true;
      } catch {
      }
    }
    if (!user && !trustedServiceInvocation) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user) {
      const roles = new Set((user.additional_roles || []).map((role) => lower(role)));
      const allowed = user.role === "admin" || user.role === "dispatch" || user.dispatch_role === true || roles.has("cad_access") || roles.has("dispatch") || roles.has("supervisor") || roles.has("full_access");
      if (!allowed) return Response.json({ error: "Property alert notification access required" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const propertyAlertId = String(body.property_alert_id || body.propertyAlertId || "").trim();
    if (!propertyAlertId) return Response.json({ error: "property_alert_id is required" }, { status: 400 });
    const alert = await base44.asServiceRole.entities.PropertyAlert.get(propertyAlertId).catch(() => null);
    if (!alert) return Response.json({ error: "Property alert not found" }, { status: 404 });
    if (alert.is_test === true || ["resolved", "false_alarm", "test"].includes(lower(alert.lifecycle_status))) {
      return Response.json({ success: true, skipped: "inactive_or_test_alert", sent: 0 });
    }
    const [call, property, users, timeEntries, dutyAssignments] = await Promise.all([
      alert.callId ? base44.asServiceRole.entities.DispatchCall.get(alert.callId).catch(() => null) : Promise.resolve(null),
      alert.propertyId ? base44.asServiceRole.entities.Location.get(alert.propertyId).catch(() => null) : Promise.resolve(null),
      base44.asServiceRole.entities.User.list(void 0, 5e3),
      base44.asServiceRole.entities.TimeEntry.list("-clock_in", 2e3).catch(() => []),
      base44.asServiceRole.entities.DutySupervisorAssignment.list("-assignment_date", 1e3).catch(() => [])
    ]);
    const propertyNames = [.../* @__PURE__ */ new Set([
      ...siteCandidates(alert.propertyName),
      ...siteCandidates(property?.site_name),
      ...siteCandidates(property?.address)
    ])].filter(Boolean);
    const userByEmail = new Map((users || []).filter((user2) => user2?.email).map((user2) => [lower(user2.email), user2]));
    const recipients = /* @__PURE__ */ new Map();
    const addRecipient = (user2, type) => {
      if (!user2?.email || user2.termination_date || lower(user2.employment_status) === "terminated") return;
      const email = lower(user2.email);
      const current = recipients.get(email);
      if (!current || RECIPIENT_PRIORITY[type] > RECIPIENT_PRIORITY[current.type]) recipients.set(email, { user: user2, type });
    };
    for (const user2 of users || []) {
      const additionalRoles = new Set((user2.additional_roles || []).map((role) => lower(role)));
      if (lower(user2.role) === "admin" || additionalRoles.has("admin")) addRecipient(user2, "admin");
    }
    const now = easternNowParts();
    for (const assignment of dutyAssignments || []) {
      if (!dutyAssignmentIsActive(assignment, now.dateKey, now.minutes)) continue;
      const coverage = String(assignment.location || "ALL").trim();
      if (upper(coverage) !== "ALL" && !sameProperty(coverage, propertyNames)) continue;
      const supervisor = userByEmail.get(lower(assignment.supervisor_email));
      if (supervisor) addRecipient(supervisor, "duty_supervisor");
    }
    const activeEntryByEmail = /* @__PURE__ */ new Map();
    for (const entry of timeEntries || []) {
      if (!entry?.officer_email || entry.clock_out || entry.archived === true) continue;
      const email = lower(entry.officer_email);
      if (!activeEntryByEmail.has(email)) activeEntryByEmail.set(email, entry);
    }
    for (const [email, entry] of activeEntryByEmail.entries()) {
      if (!sameProperty(entry.location, propertyNames)) continue;
      const officer = userByEmail.get(email);
      if (officer) addRecipient(officer, "on_property_officer");
    }
    const cadNumber = call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || alert.callId || "pending";
    const propertyName = alert.propertyName || property?.site_name || "monitored property";
    const incident = call?.incident || alert.callIncident || "Call for service";
    const callLocation = call?.location || alert.callLocation || property?.address || "location unavailable";
    const message = `BLACK POINT PROPERTY CALL: ${propertyName} | ${incident} | ${callLocation} | CAD ${cadNumber}. Open Pathfinder CAD for details.`;
    const results = { channel: "email", provider: "microsoft_graph", sent: 0, skipped_sent: 0, failed: 0, recipients: recipients.size };
    for (const [email, recipient] of recipients.entries()) {
      const existing = await base44.asServiceRole.entities.PropertyAlertSmsDelivery.filter({
        property_alert_id: propertyAlertId,
        recipient_email: email
      }, "-created_date", 10).catch(() => []);
      const sentReceipt = (existing || []).find((row) => row.status === "sent" && row.provider === "microsoft_graph");
      if (sentReceipt) {
        results.skipped_sent += 1;
        continue;
      }
      const latestReceipt = (existing || [])[0] || null;
      const latestAttempt = latestReceipt?.attempted_at ? new Date(latestReceipt.attempted_at).getTime() : 0;
      if (latestReceipt?.status === "failed" && latestReceipt?.provider === "microsoft_graph" && Number.isFinite(latestAttempt) && Date.now() - latestAttempt < 5 * 60 * 1e3) {
        results.failed += 1;
        continue;
      }
      const attemptedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const provider = await sendCompanyEmail({ to: email, subject: "Pathfinder property alert \u2014 " + propertyName, body: message });
        const data = {
          property_alert_id: propertyAlertId,
          call_id: String(alert.callId || ""),
          recipient_email: email,
          recipient_type: recipient.type,
          phone_last4: "",
          status: "sent",
          provider: "microsoft_graph",
          provider_message_id: provider.request_id,
          attempted_at: attemptedAt,
          sent_at: (/* @__PURE__ */ new Date()).toISOString(),
          error: ""
        };
        if (latestReceipt?.id) await base44.asServiceRole.entities.PropertyAlertSmsDelivery.update(latestReceipt.id, data);
        else await base44.asServiceRole.entities.PropertyAlertSmsDelivery.create(data);
        results.sent += 1;
      } catch (error) {
        const errorMessage = String(error?.message || error || "Graph email send failed").slice(0, 1e3);
        const data = {
          property_alert_id: propertyAlertId,
          call_id: String(alert.callId || ""),
          recipient_email: email,
          recipient_type: recipient.type,
          phone_last4: "",
          status: "failed",
          provider: "microsoft_graph",
          attempted_at: attemptedAt,
          error: errorMessage
        };
        if (latestReceipt?.id) await base44.asServiceRole.entities.PropertyAlertSmsDelivery.update(latestReceipt.id, data).catch(() => null);
        else await base44.asServiceRole.entities.PropertyAlertSmsDelivery.create(data).catch(() => null);
        results.failed += 1;
      }
    }
    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error("notifyPropertyAlertSms failed", error?.message || error);
    return Response.json({ error: error?.message || "Unable to send property-call email notifications" }, { status: 500 });
  }
});
function upper(value) {
  return String(value || "").trim().toUpperCase();
}
