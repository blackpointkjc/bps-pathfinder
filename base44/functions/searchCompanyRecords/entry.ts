// base44/functions/searchCompanyRecords/entry.ts
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
var __portalAppIdentity = (user) => user && String(user.id) === "6a72bbee2842d6338cbae513" && String(user.rank).toLowerCase() === "support staff" ? { ...user, role: "user", additional_roles: ["support"], is_supervisor: false, dispatch_role: "", ps_role: "none" } : user;
async function __portalLoginIsCurrent(request, sdk, user) {
  return (await portalSessionState(request, sdk, user)).state !== "invalid";
}
var __limitFullAccess = (user) => user && String(user.id) !== "6ae7d733d4b1a647cd3e6f38" ? { ...user, additional_roles: (user.additional_roles || []).filter((role) => String(role).toLowerCase() !== "full_access") } : user;
var SOURCES = [
  ["DispatchCall", "CAD / Dispatch Calls", "CallHistory"],
  ["CallHistory", "Archived Call History", "CallHistory"],
  ["CallForService", "Calls for Service", "CallHistory"],
  ["BOLOAlert", "BOLO / Alerts", "BOLOAlerts"],
  ["IncidentReport", "Incident Reports", "IncidentReports"],
  ["DailyActivityReport", "Daily Activity Reports", "DailyActivityReports"],
  ["MaintenanceReport", "Maintenance Reports", "MaintenanceReports"],
  ["OpenDoorReport", "Open Door Reports", "OpenDoorReports"],
  ["ConfidentialReport", "Confidential Reports", "AdminConfidentialReports"],
  ["TrespassingNotice", "Trespassing Notices", "VATrespassNotices"],
  ["MDTrespassNotice", "MD Trespass Notices", "MDTrespassNotices"],
  ["CriminalComplaint", "Criminal Complaints", "CriminalComplaints"],
  ["MDCriminalComplaint", "MD Criminal Complaints", "MDCriminalComplaints"],
  ["Complaint", "Complaints", "SupervisorComplaints"],
  ["UseOfForceReport", "Use of Force Reports", "SupervisorUseOfForce"],
  ["WriteUpReport", "Write-Up Reports", "SupervisorWriteUps"],
  ["InspectionReport", "Inspection Reports", "SupervisorInspections"],
  ["ParkingViolation", "Parking Violations", "ParkingViolations"],
  ["MovingViolation", "Moving Violations", "MovingViolations"],
  ["Summons", "Summons", "Summons"],
  ["QRPatrolReport", "QR Patrol Reports", "AdminQRReports"],
  ["ShiftReport", "Shift Reports", "ShiftReports"],
  ["Vehicle", "Fleet / Vehicle Records", "AdminPortal"],
  ["ShiftHandover", "Shift Handovers", "ShiftHandover"],
  ["WitnessSubpoenaRequest", "Witness Subpoena Requests", "WitnessSubpoenaRequest"],
  ["PropertyAlert", "Property Calls / Alerts", "CallHistory"],
  ["QRScanEvent", "QR Patrol Scans", "QRPatrolScan"],
  ["PostOrder", "Site Post Orders", "PostOrders"],
  ["SecurityAlert", "Security Alerts", "BOLOAlerts"],
  ["UnitMaintenance", "Fleet Maintenance", "AdminAssets"]
];
var CALLER_SOURCES = [["Announcement", "Announcement", "RecordsAssistant"], ["CallAlert", "Call Alert", "RecordsAssistant"], ["CallAssignment", "Call Assignment", "RecordsAssistant"], ["CallNote", "Call Note", "RecordsAssistant"], ["CallOut", "Call Out", "RecordsAssistant"], ["Client", "Client", "RecordsAssistant"], ["CompanyPlatoon", "Company Platoon", "RecordsAssistant"], ["Contract", "Contract", "RecordsAssistant"], ["DispatcherShiftReport", "Dispatcher Shift Report", "RecordsAssistant"], ["Division", "Division", "RecordsAssistant"], ["DutySupervisorAssignment", "Duty Supervisor Assignment", "RecordsAssistant"], ["Equipment", "Equipment", "RecordsAssistant"], ["ExpenseReport", "Expense Report", "RecordsAssistant"], ["GeneralPostOrder", "General Post Order", "RecordsAssistant"], ["GeofenceAlert", "Geofence Alert", "RecordsAssistant"], ["Invoice", "Invoice", "RecordsAssistant"], ["JobDutyRule", "Job Duty Rule", "RecordsAssistant"], ["Lead", "Lead", "RecordsAssistant"], ["Location", "Location", "RecordsAssistant"], ["MonitoredProperty", "Monitored Property", "RecordsAssistant"], ["OfficerAvailability", "Officer Availability", "RecordsAssistant"], ["OfficerRoster", "Officer Roster", "RecordsAssistant"], ["PlannedShift", "Planned Shift", "RecordsAssistant"], ["PropertyParkingRule", "Property Parking Rule", "RecordsAssistant"], ["PublicDispatchRequest", "Public Dispatch Request", "RecordsAssistant"], ["QRCheckpoint", "Q R Checkpoint", "RecordsAssistant"], ["ReportCallLink", "Report Call Link", "RecordsAssistant"], ["ReportTodo", "Report Todo", "RecordsAssistant"], ["Schedule", "Schedule", "RecordsAssistant"], ["ServiceSite", "Service Site", "RecordsAssistant"], ["ShiftBid", "Shift Bid", "RecordsAssistant"], ["SpecialCoverageRequest", "Special Coverage Request", "RecordsAssistant"], ["SupervisorShiftHandover", "Supervisor Shift Handover", "RecordsAssistant"], ["SupervisorSiteCheck", "Supervisor Site Check", "RecordsAssistant"], ["Task", "Task", "RecordsAssistant"], ["TimeEntry", "Time Entry", "RecordsAssistant"], ["TimeOffRequest", "Time Off Request", "RecordsAssistant"], ["TrainingAssignment", "Training Assignment", "RecordsAssistant"], ["TrainingAttendee", "Training Attendee", "RecordsAssistant"], ["TrainingCertificate", "Training Certificate", "RecordsAssistant"], ["TrainingClass", "Training Class", "RecordsAssistant"], ["TrainingCompletion", "Training Completion", "RecordsAssistant"], ["TrainingDocument", "Training Document", "RecordsAssistant"], ["TrainingModule", "Training Module", "RecordsAssistant"], ["TrainingRequirement", "Training Requirement", "RecordsAssistant"], ["TrainingSubmission", "Training Submission", "RecordsAssistant"], ["Unit", "Unit", "RecordsAssistant"], ["UnitSchedule", "Unit Schedule", "RecordsAssistant"], ["VehicleAssignment", "Vehicle Assignment", "RecordsAssistant"], ["Vendor", "Vendor", "RecordsAssistant"]];
var ALL_SOURCES = [...SOURCES, ...CALLER_SOURCES];
var operationalNames = new Set(SOURCES.map(([name]) => name));
var text = (value) => String(value ?? "").trim();
var lower = (value) => text(value).toLowerCase();
var normalizeSearchText = (value) => lower(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
var compact = (values) => values.map(text).filter(Boolean).join(" ");
var labelFor = (record) => record.title || record.checkpoint_name_snapshot || record.report_number || record.bolo_number || record.notice_number || record.citation_number || record.complaint_number || record.summons_number || record.call_id || record.call_number || record.linked_call_number || record.subject_name || record.person_name || record.vehicle_id || record.license_plate || record.vehicle_plate || record.location || record.id;
function personText(record) {
  const parties = Array.isArray(record?.parties) ? record.parties : [];
  const suspects = Array.isArray(record?.suspects) ? record.suspects : [];
  const victims = Array.isArray(record?.victims) ? record.victims : [];
  const witnesses = Array.isArray(record?.witnesses) ? record.witnesses : [];
  return compact([
    record.subject_name,
    record.subject_dob,
    record.subject_id,
    record.subject_address,
    record.person_name,
    record.name,
    record.full_name,
    record.first_name,
    record.middle_name,
    record.last_name,
    record.suspect_name,
    record.employee_name,
    record.officer_name,
    record.driver_name,
    record.owner_name,
    record.contact_name,
    record.defendant_name,
    record.accused_name,
    record.violator_name,
    record.violator_dob,
    record.violator_dl_number,
    record.vehicle_owner,
    record.caller_name,
    record.caller_phone,
    record.accused_first_name,
    record.accused_middle_name,
    record.accused_last_name,
    record.accused_dob,
    record.accused_id_number,
    record.accused_address,
    record.defendant_name_first,
    record.defendant_name_middle,
    record.defendant_name_last,
    record.defendant_dob,
    record.defendant_license_no,
    record.defendant_address,
    ...parties.flatMap((p) => [p?.name, p?.dob, p?.description]),
    ...suspects.flatMap((p) => [p?.name, p?.dob, p?.dl_number]),
    ...victims.flatMap((p) => [p?.name, p?.dob]),
    ...witnesses.flatMap((p) => [p?.name, p?.dob])
  ]).toLowerCase();
}
function vehicleText(record) {
  const vehicles = Array.isArray(record?.vehicles) ? record.vehicles : [];
  const suspectVehicles = Array.isArray(record?.suspect_vehicles) ? record.suspect_vehicles : [];
  return compact([
    record.vehicle_id,
    record.vehicle_year,
    record.vehicle_make,
    record.vehicle_model,
    record.vehicle_color,
    record.vehicle_plate,
    record.vehicle_plate_state,
    record.license_plate,
    record.license_state,
    record.vehicle_vin,
    record.vin,
    record.vehicle_info,
    record.registration_number,
    record.defendant_dl_year,
    record.defendant_dl_make,
    ...vehicles.flatMap((v) => [v?.year, v?.make, v?.model, v?.color, v?.plate, v?.state, v?.vin, v?.description]),
    ...suspectVehicles.flatMap((v) => [v?.year, v?.make, v?.model, v?.color, v?.plate, v?.state, v?.vin])
  ]).toLowerCase();
}
function personName(record) {
  const party = Array.isArray(record?.parties) ? record.parties.find((p) => p?.name) : null;
  return record.subject_name || record.person_name || record.name || record.full_name || (record.first_name || record.last_name ? compact([record.first_name, record.middle_name, record.last_name]) : "") || record.suspect_name || record.employee_name || record.officer_name || record.driver_name || record.owner_name || record.contact_name || record.defendant_name || record.accused_name || record.violator_name || (record.accused_first_name || record.accused_last_name ? compact([record.accused_first_name, record.accused_middle_name, record.accused_last_name]) : "") || (record.defendant_name_first || record.defendant_name_last ? compact([record.defendant_name_first, record.defendant_name_middle, record.defendant_name_last]) : "") || party?.name || "";
}
function vehicleDisplay(record) {
  const vehicle = Array.isArray(record?.vehicles) ? record.vehicles[0] : null;
  const plate = record.license_plate || record.vehicle_plate || vehicle?.plate || "";
  const state = record.license_state || record.vehicle_plate_state || vehicle?.state || "";
  const description = compact([
    record.vehicle_year || vehicle?.year,
    record.vehicle_color || vehicle?.color,
    record.vehicle_make || vehicle?.make,
    record.vehicle_model || vehicle?.model
  ]);
  return { plate, state, description, vin: record.vehicle_vin || record.vin || vehicle?.vin || "" };
}
function matchesTerms(haystack, terms) {
  return terms.every((term) => haystack.includes(term));
}
var wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var CALL_SEARCH_FIELDS = { "DispatchCall": ["call_id", "agency_cad_number", "bps_reference", "cad_number_source", "external_call_id", "incident", "location", "cross_street", "landmark", "geo_confidence", "geo_method", "description", "ai_summary", "priority", "agency", "zone", "status", "caller_name", "caller_phone", "hazards", "time_received", "time_dispatched", "time_enroute", "time_on_scene", "time_cleared", "time_closed", "source", "source_channel", "source_first_seen_at", "public_request_id", "id", "created_by", "created_date", "updated_date"], "CallHistory": ["original_call_id", "call_id", "bps_reference", "agency_cad_number", "external_call_id", "time_received", "incident", "location", "agency", "status", "ai_summary", "archived_date", "id", "created_by", "created_date", "updated_date"] };
function callCandidateQuery(entityName, terms) {
  const fields = CALL_SEARCH_FIELDS[entityName];
  if (!fields) return null;
  const longest = [...terms].sort((a, b) => b.length - a.length)[0];
  if (!longest) return null;
  const accents = { a: "[a\xE0\xE1\xE2\xE3\xE4\xE5\u0101\u0103\u0105]", c: "[c\xE7\u0107\u010D]", e: "[e\xE8\xE9\xEA\xEB\u0113\u0117\u0119]", i: "[i\xEC\xED\xEE\xEF\u012B\u012F]", n: "[n\xF1\u0144]", o: "[o\xF2\xF3\xF4\xF5\xF6\xF8\u014D]", s: "[s\u015B\u0161]", u: "[u\xF9\xFA\xFB\xFC\u016B\u016F]", y: "[y\xFD\xFF]", z: "[z\u017A\u017C\u017E]" };
  const pattern = Array.from(longest).map((ch) => accents[ch] || ch).join("");
  return { $or: fields.map((field) => ({ [field]: { $regex: pattern, $options: "i" } })) };
}
function transientReadError(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return [408, 429, 500, 502, 503, 504].includes(status) || /rate limit|timeout|timed out|network|fetch failed/i.test(String(error?.message || error));
}
async function listWithRetry(entity, entityName, offset = 0, candidateQuery = null) {
  for (let attempt = 0; ; attempt++) {
    try {
      return candidateQuery ? await entity.filter(candidateQuery, "id", 250, offset) : await entity.list("id", 250, offset);
    } catch (error) {
      if (attempt >= 1 || !transientReadError(error)) throw error;
      const retry = Number(error?.response?.headers?.["retry-after"]) || Number(String(error?.message || "").match(/Retry after (\d+)s/i)?.[1]) || 1;
      await wait(Math.min(8e3, Math.max(1e3, retry * 1e3)));
    }
  }
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(() => null);
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
    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r) => String(r).toLowerCase()));
    const allowed = user.role === "officer" || user.role === "supervisor" || user.role === "admin" || user.role === "dispatch" || roles.has("full_access") || roles.has("cad_access") || roles.has("officer") || roles.has("supervisor") || roles.has("dispatch");
    if (!allowed) return Response.json({ error: "Records access required" }, { status: 403 });
    const privileged = user.role === "admin" || roles.has("full_access");
    const operationalRecordsAccess = privileged || user.role === "officer" || roles.has("officer") || user.role === "dispatch" || Boolean(user.dispatch_role) || roles.has("cad_access") || roles.has("dispatch") || roles.has("supervisor");
    const entityClient = operationalRecordsAccess ? base44.asServiceRole.entities : base44.entities;
    const body = await req.json();
    if (body?.action === "get" && body?.entity && body?.id) {
      if (!privileged && (/* @__PURE__ */ new Set(["ConfidentialReport", "Complaint", "WriteUpReport", "InspectionReport", "UseOfForceReport"])).has(String(body.entity)))
        return Response.json({ error: "Record outside authorized access scope" }, { status: 403 });
      const source = ALL_SOURCES.find(([entityName]) => entityName === body.entity);
      if (!source) return Response.json({ error: "Unsupported record type" }, { status: 400 });
      const entity = (operationalNames.has(body.entity) ? entityClient : base44.entities)[body.entity];
      const record = await entity.get(body.id);
      return Response.json({ record, source: source[1], page: source[2] });
    }
    const query = normalizeSearchText(body?.query);
    const searchType = ["all", "person", "vehicle"].includes(String(body?.search_type || "all")) ? String(body?.search_type || "all") : "all";
    if (query.length < 2) return Response.json({ results: [], searched_sources: 0, total_matches: 0, search_type: searchType, warrant_matches: 0 });
    const terms = query.split(/\s+/).filter(Boolean);
    const restrictedEntities = /* @__PURE__ */ new Set(["ConfidentialReport", "Complaint", "WriteUpReport", "InspectionReport", "UseOfForceReport"]);
    const requestedEntities = Array.isArray(body?.entities) ? new Set(body.entities.map((value) => String(value || "").trim()).filter(Boolean)) : null;
    const permittedSources = privileged ? ALL_SOURCES : ALL_SOURCES.filter(([entityName]) => !restrictedEntities.has(entityName));
    const searchableSources = requestedEntities?.size ? permittedSources.filter(([entityName]) => requestedEntities.has(entityName)) : permittedSources;
    const settled = [];
    const pending = Array.isArray(body?.cursor?.pending) ? body.cursor.pending.filter((p) => Number.isInteger(p.source) && p.source >= 0 && p.source < searchableSources.length && Number.isInteger(p.offset) && p.offset >= 0).map((p) => ({ source: p.source, offset: p.offset, attempts: Math.max(0, Math.min(2, Number(p.attempts) || 0)) })) : searchableSources.map((_, source) => ({ source, offset: 0 }));
    let pages = 0;
    const failedLabels = [];
    const batchStartedAt = Date.now();
    while (pending.length && pages < 5 && Date.now() - batchStartedAt < 18e3) {
      const { source: sourceIndex, offset, attempts = 0 } = pending.shift();
      const [entityName, sourceLabel, page] = searchableSources[sourceIndex];
      const currentOffset = offset;
      let rowCount = 0;
      const batchResults = await Promise.allSettled([(async () => {
        const entity = (operationalNames.has(entityName) ? entityClient : base44.entities)[entityName];
        const rows = await listWithRetry(entity, entityName, currentOffset, callCandidateQuery(entityName, terms));
        rowCount = rows?.length || 0;
        return (rows || []).filter((record) => {
          const allText = normalizeSearchText(JSON.stringify(record));
          const scoped = searchType === "person" ? normalizeSearchText(personText(record)) : searchType === "vehicle" ? normalizeSearchText(vehicleText(record)) : allText;
          return scoped && matchesTerms(scoped, terms);
        }).map((record) => {
          const vehicle = vehicleDisplay(record);
          const isWarrant = entityName === "CriminalComplaint" && (record.warrant_issued === true || record.status === "warrant_issued" || Boolean(record.warrant_number));
          const names = normalizeSearchText([
            personName(record),
            ...Array.isArray(record.parties) ? record.parties.map((p) => p?.name) : [],
            ...Array.isArray(record.suspects) ? record.suspects.map((p) => p?.name) : [],
            ...Array.isArray(record.victims) ? record.victims.map((p) => p?.name) : [],
            ...Array.isArray(record.witnesses) ? record.witnesses.map((p) => p?.name) : []
          ].filter(Boolean).join(" "));
          const reference = normalizeSearchText([
            record.report_number,
            record.call_number,
            record.call_id,
            record.linked_call_number,
            record.citation_number,
            record.complaint_number,
            record.notice_number,
            record.summons_number,
            record.bolo_number,
            record.warrant_number,
            record.id
          ].filter(Boolean).join(" "));
          const locations = normalizeSearchText([
            record.location,
            record.site_name,
            record.property_name,
            record.address,
            record.last_known_location,
            record.offense_place,
            record.location_of_offense
          ].filter(Boolean).join(" "));
          const matchContext = matchesTerms(reference, terms) ? "reference" : matchesTerms(names, terms) ? "person" : matchesTerms(normalizeSearchText(vehicleText(record)), terms) ? "vehicle" : matchesTerms(locations, terms) ? "location" : "report text";
          return {
            id: record.id,
            entity: entityName,
            source: sourceLabel,
            match_context: matchContext,
            page,
            label: labelFor(record),
            date: record.incident_date || record.notice_date || record.report_date || record.shift_date || record.violation_date || record.offense_date || record.created_date,
            location: record.location || record.site_name || record.property_name || record.address || record.last_known_location || record.offense_place || record.location_of_offense || "",
            person: personName(record),
            vehicle_plate: vehicle.plate,
            vehicle_state: vehicle.state,
            vehicle_description: vehicle.description,
            vehicle_vin: vehicle.vin,
            record_kind: personText(record) && vehicleText(record) ? "person_vehicle" : personText(record) ? "person" : vehicleText(record) ? "vehicle" : "record",
            warrant_issued: isWarrant,
            warrant_number: record.warrant_number || "",
            status: record.status || record.approval_status || "",
            summary: record.description || record.narrative || record.reason || record.notes || record.summary || record.details || record.statement_of_facts || record.ai_summary || record.violation_description || record.facts_basis || "",
            linked_call_number: record.linked_call_number || record.call_number || record.call_id || ""
          };
        });
      })()]);
      settled.push(...batchResults);
      pages++;
      if (batchResults[0].status === "rejected") {
        const reason = batchResults[0].reason;
        if (transientReadError(reason) && attempts < 2) pending.push({ source: sourceIndex, offset, attempts: attempts + 1 });
        else failedLabels.push(sourceLabel);
      }
      if (batchResults[0].status === "fulfilled" && rowCount === 250) pending.push({ source: sourceIndex, offset: offset + 250 });
    }
    const successfulSources = settled.filter((result) => result.status === "fulfilled").length;
    const failedSources = settled.length - successfulSources;
    const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const linkedNumbers = [...new Set(results.map((item) => item.linked_call_number).filter(Boolean).map(String))];
    if (linkedNumbers.length) {
      const calls = await entityClient.DispatchCall.list("-time_received", 1e3).catch(() => []);
      const byNumber = /* @__PURE__ */ new Map();
      for (const call of calls || []) {
        for (const key of [call.call_id, call.agency_cad_number, call.bps_reference]) if (key) byNumber.set(String(key), call);
      }
      for (const item of results) {
        const call = byNumber.get(String(item.linked_call_number || ""));
        if (!call) continue;
        item.linked_call_type = call.incident || "";
        item.linked_call_location = call.location || "";
        item.linked_call_status = call.status || "";
      }
    }
    const relevance = { "reference": 0, "person": 1, "vehicle": 2, "location": 3, "report text": 4 };
    results.sort((a, b) => (relevance[a.match_context] ?? 5) - (relevance[b.match_context] ?? 5) || String(b.date || "").localeCompare(String(a.date || "")));
    const warrantMatches = results.filter((item) => item.warrant_issued).length;
    return Response.json({
      results,
      next_cursor: pending.length ? { pending, source: searchableSources.length - new Set(pending.map((p) => p.source)).size } : null,
      total_sources: searchableSources.length,
      failed_source_labels: failedLabels,
      truncated: false,
      searched_sources: successfulSources,
      failed_sources: failedSources,
      partial: failedLabels.length > 0,
      total_matches: results.length,
      search_type: searchType,
      warrant_matches: warrantMatches,
      warrant_status_text: warrantMatches ? `${warrantMatches} warrant record${warrantMatches === 1 ? "" : "s"} located in Pathfinder.` : "No warrant records located in Pathfinder."
    });
  } catch (error) {
    console.error("searchCompanyRecords failed", error);
    return Response.json({ error: error?.message || "Unable to search company records" }, { status: 500 });
  }
});
