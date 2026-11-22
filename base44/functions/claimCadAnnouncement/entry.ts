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

// base44/functions/claimCadAnnouncement/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";
var __portalAppIdentity = (user) => user && String(user.id) === "6a72bbee2842d6338cbae513" && String(user.rank).toLowerCase() === "support staff" ? { ...user, role: "user", additional_roles: ["support"], is_supervisor: false, dispatch_role: "", ps_role: "none" } : user;
async function __portalLoginIsCurrent(request, sdk, user) {
  return (await portalSessionState(request, sdk, user)).state === "current";
}
var clean = (value) => String(value || "").trim();
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (__portalCaller && !__portalCaller.is_service && !await __portalLoginIsCurrent(req, base44, __portalCaller)) return Response.json({ error: "Your Pathfinder session ended. Please sign in again.", code: "SESSION_REAUTH_REQUIRED" }, { status: 401 });
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
    const user = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (!user?.email) return Response.json({ error: "Authentication required" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const eventKey = clean(body.event_key);
    const userEmail = clean(user.email).toLowerCase();
    if (!eventKey) return Response.json({ error: "event_key is required" }, { status: 400 });
    if (body.action === "finalize") {
      const receiptId = clean(body.receipt_id);
      if (!receiptId) return Response.json({ error: "receipt_id is required" }, { status: 400 });
      const existing2 = await base44.asServiceRole.entities.CadAnnouncementReceipt.get(receiptId).catch(() => null);
      if (!existing2 || clean(existing2.user_email).toLowerCase() !== userEmail || clean(existing2.event_key) !== eventKey) {
        return Response.json({ error: "Announcement receipt not found" }, { status: 404 });
      }
      const allowedStates = /* @__PURE__ */ new Set(["played", "quiet", "blocked", "failed", "disabled"]);
      const state = allowedStates.has(clean(body.state)) ? clean(body.state) : "failed";
      const updated = await base44.asServiceRole.entities.CadAnnouncementReceipt.update(receiptId, {
        state,
        error: clean(body.error).slice(0, 500),
        processed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return Response.json({ success: true, receipt: updated });
    }
    const routineTypes = /* @__PURE__ */ new Set([
      "unit_dispatched",
      "additional_unit",
      "unit_reassigned",
      "unit_acknowledged",
      "unit_enroute",
      "unit_on_scene",
      "unit_cleared",
      "unit_available",
      "welfare_requested",
      "priority_upgraded",
      "call_cancelled",
      "call_cleared",
      "call_updated"
    ]);
    let announcementText = "";
    let propertyAnnouncementText = "";
    let assignmentAnnouncementText = "";
    if (routineTypes.has(clean(body.event_type))) {
      const event = await base44.asServiceRole.entities.CallStatusLog.get(clean(body.event_id)).catch(() => null);
      if (!event || clean(event.event_key) !== eventKey || !routineTypes.has(clean(event.event_type))) {
        return Response.json({ success: true, claimed: false, not_recipient: true });
      }
      const call = await base44.asServiceRole.entities.DispatchCall.get(event.call_id).catch(() => null);
      const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: event.call_id });
      const autoAssignment = event.triggering_action === "geofenceDispatchAssignment.live" && ["unit_dispatched", "additional_unit"].includes(event.event_type);
      const privateUnitEvent = /* @__PURE__ */ new Set(["unit_reassigned", "unit_cleared", "unit_acknowledged", "unit_enroute", "unit_on_scene", "unit_available", "welfare_requested", "unit_dispatched", "additional_unit"]);
      const ids = /* @__PURE__ */ new Set();
      if (privateUnitEvent.has(String(event.event_type))) {
        if (event.unit_id) ids.add(String(event.unit_id));
      } else {
        for (const id of call?.assigned_units || []) if (id) ids.add(String(id));
        for (const assignment of assignments || []) if (!["cleared", "cancelled", "canceled"].includes(clean(assignment.status).toLowerCase())) ids.add(String(assignment.unit_id));
      }
      let assigned = ids.has(String(user.id)) || ids.has(userEmail);
      for (const id of assigned ? [] : ids) {
        const unit = await base44.asServiceRole.entities.Unit.get(String(id)).catch(() => null);
        if (String(unit?.user_id || "") === String(user.id) || clean(unit?.user_email).toLowerCase() === userEmail) {
          assigned = true;
          break;
        }
        const session = await base44.asServiceRole.entities.ActiveOfficer.get(String(id)).catch(() => null);
        if (clean(session?.officer_email).toLowerCase() === userEmail) {
          assigned = true;
          break;
        }
      }
      if (!assigned) return Response.json({ success: true, claimed: false, not_recipient: true });
      announcementText = event.event_type === "unit_reassigned" ? clean(event.announcement_text) || "Dispatch advises: you are clear of the previous assignment. Acknowledge your reassignment instructions." : event.event_type === "call_cancelled" ? "Your assigned call has been cancelled. Return 10-8." : event.event_type === "call_cleared" ? "Your assigned call has been cleared." : event.triggering_action === "reassignCadOfficer" ? clean(event.announcement_text) : ["unit_dispatched", "additional_unit"].includes(event.event_type) ? "You have been assigned a call. Check your mobile data terminal." : clean(event.announcement_text) || `${clean(event.unit_name) || "Assigned unit"}: ${clean(event.notes) || `CAD ${clean(event.cad_number)} status ${clean(event.new_status)}`}`;
      if (autoAssignment) {
        propertyAnnouncementText = clean(event.announcement_text) || [
          "Property alert.",
          clean(event.incident_type || call?.incident) + ".",
          "Location " + clean(event.location || call?.location) + ".",
          event.cad_number ? "CAD number " + clean(event.cad_number) + "." : ""
        ].filter(Boolean).join(" ");
        const namedUnit = clean(event.unit_name) || clean(user.unit_number && "Unit " + user.unit_number) || clean(user.rank + " " + user.last_name);
        assignmentAnnouncementText = (namedUnit ? namedUnit + ", " : "") + "you have been assigned this call. Check your mobile data terminal.";
        announcementText = propertyAnnouncementText + " " + assignmentAnnouncementText;
      }
    }
    const existing = await base44.asServiceRole.entities.CadAnnouncementReceipt.filter(
      { event_key: eventKey, user_email: userEmail },
      "created_date",
      5
    );
    if (existing?.length) {
      const prior = existing[0];
      let originalEvent = clean(body.event_id) ? await base44.asServiceRole.entities.CallStatusLog.get(clean(body.event_id)).catch(() => null) : null;
      if (!originalEvent && clean(body.event_type) === "property_alert" && clean(body.event_id)) {
        const alert = await base44.asServiceRole.entities.PropertyAlert.get(clean(body.event_id)).catch(() => null);
        if (alert && eventKey === `property-alert:${alert.id}:created`)
          originalEvent = { ...alert, event_key: eventKey };
      }
      const eventAge = Date.now() - Date.parse(originalEvent?.created_date || "");
      if (prior.state === "blocked" && originalEvent?.event_key === eventKey && Number.isFinite(eventAge) && eventAge >= 0 && eventAge <= 9e4 && !clean(prior.error).includes("retry_attempted")) {
        const changed = await base44.asServiceRole.entities.CadAnnouncementReceipt.updateMany(
          { id: prior.id, state: "blocked" },
          { $set: { state: "quiet", error: "retry_attempted", processed_at: (/* @__PURE__ */ new Date()).toISOString() } }
        );
        if (changed.updated === 1) return Response.json({
          success: true,
          claimed: true,
          retry: true,
          announcement_text: announcementText || clean(originalEvent.announcement_text),
          property_announcement_text: propertyAnnouncementText,
          assignment_announcement_text: assignmentAnnouncementText,
          receipt: { ...prior, state: "quiet" }
        });
      }
      return Response.json({ success: true, claimed: false, receipt: prior });
    }
    const receipt = await base44.asServiceRole.entities.CadAnnouncementReceipt.create({
      event_key: eventKey,
      event_id: clean(body.event_id),
      user_email: userEmail,
      device_id: clean(body.device_id).slice(0, 250),
      state: "quiet",
      processed_at: (/* @__PURE__ */ new Date()).toISOString(),
      cad_number: clean(body.cad_number),
      event_type: clean(body.event_type)
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const allFor = await base44.asServiceRole.entities.CadAnnouncementReceipt.filter(
      { event_key: eventKey, user_email: userEmail },
      "created_date",
      10
    );
    if (allFor?.length > 1) {
      const [earliest, ...extras] = allFor;
      const ownsClaim = String(earliest.id) === String(receipt.id);
      return Response.json({ success: true, claimed: ownsClaim, announcement_text: announcementText, property_announcement_text: propertyAnnouncementText, assignment_announcement_text: assignmentAnnouncementText, receipt: earliest, deduplicated: extras.length });
    }
    return Response.json({ success: true, claimed: true, announcement_text: announcementText, property_announcement_text: propertyAnnouncementText, assignment_announcement_text: assignmentAnnouncementText, receipt });
  } catch (error) {
    console.error("claimCadAnnouncement failed", error);
    return Response.json({ error: error?.message || "Unable to claim announcement" }, { status: 500 });
  }
});
