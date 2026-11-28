// base44/functions/ingestGractivecalls/entry.ts
import { waitUntil } from "base44:runtime";
import { createClientFromRequest } from "npm:@base44/sdk";
var __portalAppIdentity = (user) => user && String(user.id) === "6a72bbee2842d6338cbae513" && String(user.rank).toLowerCase() === "support staff" ? { ...user, role: "user", additional_roles: ["support"], is_supervisor: false, dispatch_role: "", ps_role: "none" } : user;
async function fetchCadSource(primaryUrl, fallbackUrl, accept) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(attempt ? fallbackUrl : primaryUrl, {
        cache: "no-store",
        headers: { Accept: accept, "User-Agent": "BPS-Pathfinder-CAD/4.4", "Cache-Control": "no-cache, no-store, max-age=0", Pragma: "no-cache" },
        signal: AbortSignal.timeout(attempt ? 5e3 : 1e4)
      });
      if (!response.ok) {
        const error = new Error("CAD source returned HTTP " + response.status);
        if (response.status < 500 && response.status !== 429) throw Object.assign(error, { permanent: true });
        throw error;
      }
      const text = await response.text();
      return { text, cacheAgeSeconds: Number(response.headers.get("Age") || 0), fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } catch (error) {
      lastError = error;
      if (error?.permanent) break;
    }
  }
  throw lastError;
}
var lower = (value) => String(value || "").trim().toLowerCase();
var isClosedCall = (call) => !call || call.manual_dismissed === true || ["cleared", "cancelled", "canceled", "closed", "resolved", "completed"].includes(lower(call.status));
async function hasOutstandingOfficerAssignment(entities, call, cachedAssignments = null) {
  if ((call?.assigned_units || []).some((id) => String(id).trim())) return true;
  if (cachedAssignments) return cachedAssignments.some((row) => String(row.call_id) === String(call.id) && !["cleared", "cancelled", "canceled"].includes(lower(row.status)));
  try {
    const rows = await entities.CallAssignment.filter({ call_id: String(call.id) }, "-assigned_at", 1e3);
    return rows.some((a) => !["cleared", "cancelled", "canceled"].includes(lower(a.status)));
  } catch (error) {
    console.warn("Keeping GRAC call while assignment verification is unavailable", call?.id, error?.message || error);
    return true;
  }
}
async function releaseClosedCall(entities, call) {
  const callId = String(call.id);
  const assignments = await entities.CallAssignment.filter({ call_id: callId }, "-assigned_at", 1e3);
  const refs = new Set([...call.assigned_units || [], ...assignments.map((a) => a.unit_id)].filter(Boolean).map(String));
  const users = /* @__PURE__ */ new Map();
  const [linkedSessions, linkedUnits] = await Promise.all([
    entities.ActiveOfficer.filter({ current_call_id: callId }, "-last_update", 1e3),
    entities.Unit.filter({ assigned_call_ids: { $in: [callId] } }, "-last_update_at", 1e3)
  ]);
  for (const session of linkedSessions) if (session.officer_email) refs.add(String(session.officer_email));
  for (const unit of linkedUnits) refs.add(String(unit.user_id || unit.id));
  for (const ref of refs) {
    let user = ref.includes("@") ? (await entities.User.filter({ email: ref }, "-updated_date", 1))[0] : await entities.User.get(ref).catch(() => null);
    if (!user) {
      const unit = await entities.Unit.get(ref).catch(() => null);
      if (unit?.user_id) user = await entities.User.get(unit.user_id);
      else {
        const active = await entities.ActiveOfficer.get(ref).catch(() => null);
        const email = active?.officer_email || (ref.includes("@") ? ref : "");
        if (email) user = (await entities.User.filter({ email }, "-updated_date", 1))[0];
      }
    }
    if (user) users.set(user.id, user);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const assignment of assignments) {
    if (lower(assignment.status) !== "cleared") await entities.CallAssignment.update(assignment.id, { status: "cleared", cleared_at: assignment.cleared_at || now });
  }
  for (const user of users.values()) {
    const units = await entities.Unit.filter({ user_id: user.id }, "-last_update_at", 100);
    const sessions = await entities.ActiveOfficer.filter({ officer_email: user.email }, "-last_update", 100);
    const stillLinked = String(user.current_call_id || "") === callId || sessions.some((s) => String(s.current_call_id || "") === callId) || units.some((u) => (u.assigned_call_ids || []).map(String).includes(callId));
    const hadActiveAssignment = assignments.some((a) => !["cleared", "cancelled", "canceled"].includes(lower(a.status)) && [user.id, user.email, ...units.map((u) => u.id), ...sessions.map((s) => s.id)].includes(a.unit_id));
    if (!stillLinked && !hadActiveAssignment) continue;
    const aliases = [...new Set([user.id, user.email, ...units.map((u) => u.id), ...sessions.map((s) => s.id)].filter(Boolean).map(String))];
    const pending = [];
    for (const alias of aliases) pending.push(...await entities.CallAssignment.filter({ unit_id: alias }, "-assigned_at", 1e3));
    const candidateIds = new Set([
      ...pending.filter((a) => !["cleared", "cancelled", "canceled"].includes(lower(a.status))).map((a) => String(a.call_id)),
      user.current_call_id,
      ...sessions.map((s) => s.current_call_id),
      ...units.flatMap((u) => u.assigned_call_ids || [])
    ].filter(Boolean).map(String));
    const legacy = await entities.DispatchCall.filter({ assigned_units: { $in: aliases } }, "-updated_date", 1e3);
    legacy.forEach((c) => candidateIds.add(String(c.id)));
    candidateIds.delete(callId);
    const remaining = [];
    for (const id of candidateIds) {
      const other = await entities.DispatchCall.get(id);
      if (!isClosedCall(other)) remaining.push(other);
    }
    const next = remaining[0];
    const current = await entities.User.get(user.id);
    const protectedStatus = ["out of service", "distress", "emergency", "dispatch"].includes(lower(current.status)) || current.distress_active === true || sessions.some((s) => s.distress_active === true || ["distress", "emergency"].includes(lower(s.status)));
    const distress = sessions.find((s) => ["distress", "emergency"].includes(lower(s.status)));
    const status = protectedStatus ? distress?.status || current.status : next ? ["dispatched", "enroute", "on scene", "busy"].includes(lower(current.status)) ? current.status : "Dispatched" : "Available";
    const patch = {
      status,
      current_call_id: next ? String(next.id) : "",
      current_call_info: next ? [next.incident || "Call for service", next.location].filter(Boolean).join(" \xB7 ").slice(0, 500) : "",
      last_updated: now,
      status_since: status === current.status ? current.status_since || now : now
    };
    await entities.User.update(user.id, patch);
    for (const unit of units) await entities.Unit.update(unit.id, { ...patch, assigned_call_ids: remaining.map((c) => String(c.id)) });
    for (const session of sessions) await entities.ActiveOfficer.update(session.id, { ...patch, ...!next && !protectedStatus ? { show_lights: false } : {} });
  }
  return { released_officer_ids: [...users.keys()] };
}
var bounds = { minLat: 36, maxLat: 39.6, minLon: -83.8, maxLon: -75 };
async function tomtomGeocode(address, options = {}) {
  const query = String(address || "").trim();
  if (query.length < 5 || /^(?:unknown|address unavailable|unassigned|n\/a)$/i.test(query)) return null;
  const expectedNumber = query.match(/^\s*(\d{1,6})\b/)?.[1] || "";
  const keys = [...new Set([Deno.env.get("TOMTOM_API_KEY"), Deno.env.get("TOMTOM_API_KEY_BACKUP")].filter(Boolean))];
  for (const key of keys) {
    const params = new URLSearchParams({ key: String(key), limit: "5", countrySet: "US", language: "en-US", typeahead: "false" });
    const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`;
    let response;
    try {
      response = await fetch(endpoint, { signal: AbortSignal.timeout(4200), headers: { Accept: "application/json" } });
    } catch {
      continue;
    }
    if (!response.ok) {
      if ([401, 403, 408, 429, 500, 502, 503, 504].includes(response.status)) continue;
      break;
    }
    const data = await response.json().catch(() => null);
    for (const item of data?.results || []) {
      const lat = Number(item.position?.lat), lon = Number(item.position?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon) continue;
      const roadAddress = String(item.address?.freeformAddress || "");
      const candidateNumber = String(item.address?.streetNumber || "");
      const candidateType = String(item.type || "").toLowerCase();
      if (expectedNumber && options.strictNumber !== false && candidateNumber !== expectedNumber) continue;
      if (expectedNumber && !candidateType.includes("address") && candidateNumber !== expectedNumber) continue;
      return {
        latitude: lat,
        longitude: lon,
        lat,
        lon,
        formatted_address: roadAddress || query,
        geo_method: "tomtom",
        geo_confidence: expectedNumber && candidateNumber === expectedNumber ? "high" : "medium",
        geo_approximate: !expectedNumber || candidateNumber !== expectedNumber,
        provider: "TomTom Search"
      };
    }
    return null;
  }
  return null;
}
var __portalReauthAfter = "2026-11-01T22:38:04.000Z";
async function __portalLoginIsCurrent(request, sdk, user) {
  try {
    if (!user || user.disabled || user.termination_date && Date.parse(user.termination_date) <= Date.now() || ["suspended", "denied", "terminated"].includes(String(user.account_status || "").toLowerCase()) || ["suspended", "terminated"].includes(String(user.employment_status || "").toLowerCase())) return false;
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
async function announceAssignedCallUpdate(base44, previous, saved, cachedAssignments = null) {
  const fields = ["incident", "location", "priority", "status", "description"];
  if (!fields.some((field) => saved[field] !== void 0 && String(saved[field] || "") !== String(previous[field] || ""))) return;
  const assignments = cachedAssignments ? cachedAssignments.filter((row) => String(row.call_id) === String(previous.id)) : await base44.asServiceRole.entities.CallAssignment.filter({ call_id: previous.id });
  if (!(previous.assigned_units || []).length && !(assignments || []).some((row) => !["cleared", "cancelled"].includes(String(row.status || "").toLowerCase()))) return;
  const changes = fields.filter((field) => saved[field] !== void 0 && String(saved[field] || "") !== String(previous[field] || "")).map((field) => `${field === "description" ? "Call notes" : field.charAt(0).toUpperCase() + field.slice(1)}: ${String(previous[field] || "not listed").slice(0, 100)} \u2192 ${String(saved[field] || "not listed").slice(0, 100)}`);
  const changeMessage = changes.join("; ").slice(0, 950);
  const eventKey = `call:${previous.id}:updated:${saved.updated_date || (/* @__PURE__ */ new Date()).toISOString()}`;
  const existing = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: eventKey }, "-created_date", 1);
  if (existing?.length) return;
  await base44.asServiceRole.entities.CallStatusLog.create({
    call_id: previous.id,
    old_status: previous.status || "",
    new_status: saved.status || previous.status || "New",
    incident_type: saved.incident || previous.incident || "",
    location: saved.location || previous.location || "",
    event_key: eventKey,
    event_type: "call_updated",
    notes: changeMessage,
    announcement_text: `CAD ${String(saved.agency_cad_number || previous.agency_cad_number || previous.bps_reference || previous.call_id || "")}. Assigned call changed: ${changeMessage}.`,
    announcement_priority: "normal",
    cad_number: String(saved.agency_cad_number || previous.agency_cad_number || previous.bps_reference || previous.call_id || ""),
    triggering_action: "ingestGractivecalls.call_updated",
    audio_enabled: true,
    sensitive: false
  });
}
var GRAC_API_URL = "https://gractivecalls.com/api/active";
var HENRICO_ACTIVE_URL = "https://activecalls.henrico.gov/";
var CHESTERFIELD_CALLS_URL = "https://api.chesterfield.gov/api/Police/V1.1/Calls/CallsForService";
var CHESTERFIELD_PUBLIC_API_KEY = Deno.env.has("CHESTERFIELD_PUBLIC_API_KEY") ? Deno.env.get("CHESTERFIELD_PUBLIC_API_KEY") : null;
var ALLOWED_AGENCIES = /* @__PURE__ */ new Set(["RPD", "RFD", "HPD", "HFD", "CCPD", "CCFD"]);
var AGENCY_SOURCE = { RPD: "richmond", RFD: "richmond", HPD: "henrico", HFD: "henrico", CCPD: "chesterfield", CCFD: "chesterfield" };
var PROPERTY_MONITORING_EDGE_TOLERANCE_METERS = 100;
// Called only when creating a new verified property alert. Agency receive
// time is informational; a still-active call must not become silent history
// simply because GRAC publishes late or a boundary match is recovered.
function isFreshLivePropertyCall(call) {
  return !!call?.id && call.manual_dismissed!==true && !call.time_cleared && !['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(call.status||'').trim().toLowerCase());
}
var normalizeStatus = (raw) => {
  const value = String(raw || "").trim().toUpperCase();
  if (value.includes("DISPATCH") || value.includes("ASSIGN")) return "Dispatched";
  if (value.includes("ENROUTE") || value.includes("EN ROUTE")) return "Enroute";
  if (value.includes("ARRIV") || value.startsWith("ARV") || value.includes("ON SCENE")) return "On Scene";
  return "New";
};
var normalizePriority = (incident) => {
  const text = String(incident || "").toUpperCase();
  if (/SHOOT|STABB|ROBBERY|ARMED|PERSON SHOT|OFFICER (DOWN|NEEDS)|EXPLOSION/.test(text)) return "critical";
  if (/(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/.test(text)) return "high";
  if (/ASSAULT|DOMESTIC.*VIOLENT|FIGHT|MISSING PERSON|PERSONAL INJURY|BURGLARY.*PROGRESS/.test(text)) return "high";
  if (/CRASH|ACCIDENT|FIRE|EMS|SUSPICIOUS|LARCENY|DOMESTIC/.test(text)) return "medium";
  return "low";
};
var validCoordinate = (value) => value !== null && value !== void 0 && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
var cleanMatchText = (value) => String(value || "").toUpperCase().replace(/\bBLOCK\b/g, "").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
function callMinute(value) {
  const text = String(value || "");
  const simple = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (simple) {
    let hour = Number(simple[1]) % 12;
    if (simple[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(simple[2]);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return -1;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value || 0) % 24 * 60 + Number(parts.find((part) => part.type === "minute")?.value || 0);
}
function chooseOfficial(call, rows) {
  const location = cleanMatchText(call.location);
  const incident = cleanMatchText(call.incident);
  const minute = callMinute(call.time_received);
  return rows.find((row) => {
    const rowMinute = callMinute(row.received);
    const rawDistance = Math.abs(minute - rowMinute);
    const distance = Math.min(rawDistance, 1440 - rawDistance);
    const sameLocation = cleanMatchText(row.location) === location;
    const sameIncident = cleanMatchText(row.incident) === incident;
    return sameLocation && distance <= 3 && (sameIncident || Boolean(location));
  }) || null;
}
async function fetchOfficialTable(url) {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "BPS-Pathfinder/4.1" }, signal: AbortSignal.timeout(15e3) });
    if (!response.ok) return [];
    const html = await response.text();
    const rows = [];
    for (const part of html.split("</tr>")) {
      const cells = [...part.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => String(match[1] || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim());
      if (cells.length >= 4 && /^\d+$/.test(cells[0])) rows.push({ official: cells[0], received: cells[1], location: cells[2], incident: cells[3] });
    }
    return rows;
  } catch (error) {
    console.warn("Official table lookup failed", error?.message || error);
    return [];
  }
}
async function fetchOfficialJson(url, headers) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15e3) });
    if (!response.ok) return [];
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.calls) ? payload.calls : [];
    return list.map((row) => ({ official: String(row?.id || "").trim(), received: row?.callReceivedFormatted || row?.callReceived || "", location: row?.location || "", incident: row?.type || "" })).filter((row) => row.official && row.location);
  } catch (error) {
    console.warn("Official JSON lookup failed", error?.message || error);
    return [];
  }
}
async function enrichOfficialIdentifiers(calls) {
  const [henricoRows, chesterfieldRows] = await Promise.all([
    fetchOfficialTable(HENRICO_ACTIVE_URL),
    CHESTERFIELD_PUBLIC_API_KEY ? fetchOfficialJson(CHESTERFIELD_CALLS_URL, {
      Accept: "application/json",
      "X-ApiKey": CHESTERFIELD_PUBLIC_API_KEY,
      "X-UserId": "bps-pathfinder",
      "X-SessionId": `bps-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`
    }) : Promise.resolve([])
  ]);
  return calls.map((call) => {
    const agency = String(call.agency || "").toUpperCase();
    const rows = agency === "HPD" ? henricoRows : agency === "CCPD" ? chesterfieldRows : [];
    const match = rows.length ? chooseOfficial(call, rows) : null;
    if (!match?.official) return call;
    return {
      ...call,
      agency_cad_number: String(match.official),
      cad_number_source: "official_government_feed",
      official_cad_verified: true
    };
  });
}
function extractOfficialCadNumber(row) {
  const candidates = [
    row?.cadNumber,
    row?.cad_number,
    row?.cad,
    row?.CAD,
    row?.callNumber,
    row?.call_number,
    row?.eventNumber,
    row?.event_number
  ];
  const value = candidates.find((candidate) => candidate !== null && candidate !== void 0 && String(candidate).trim());
  if (value === void 0) return "";
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized.length <= 40 ? normalized : "";
}
function externalKey(record) {
  if (record?.external_call_id) return String(record.external_call_id);
  const descriptionMatch = String(record?.description || "").match(/\[GRAC:([^\]]+)\]/);
  if (descriptionMatch?.[1]) return descriptionMatch[1];
  const legacy = String(record?.call_id || "");
  return legacy.startsWith("grac-") ? legacy.slice(5) : "";
}
function legacyKey(record) {
  const agency = String(record?.agency || "").trim().toUpperCase();
  const incident = String(record?.incident || "").trim().toUpperCase().replace(/\s+/g, " ");
  const stamp=Date.parse(record?.time_received||"");
  const received=Number.isFinite(stamp)?new Date(stamp).toISOString():"";
  const location=String(record?.location||"").trim().toUpperCase().replace(/\bNORTH\b/g,"N").replace(/\bSOUTH\b/g,"S").replace(/\bEAST\b/g,"E").replace(/\bWEST\b/g,"W").replace(/\bSTREET\b/g,"ST").replace(/\bAVENUE\b/g,"AVE").replace(/\bBOULEVARD\b/g,"BLVD").replace(/\bROAD\b/g,"RD").replace(/[^A-Z0-9]+/g," ").trim();
  if (!ALLOWED_AGENCIES.has(agency) || !incident || !received || !location) return "";
  return `${agency}|${received}|${incident}|${location}`;
}
function sameAgencyIdentity(a,b){
 if(!a||!b)return false;
 const first=externalKey(a),second=externalKey(b);
 if(first&&second&&first!==second&&String(a.source_channel||"").includes("grac_api")&&String(b.source_channel||"").includes("grac_api"))return false;
 return !!legacyKey(a)&&legacyKey(a)===legacyKey(b);
}
function matchAgencyRecord(row,byExternal,byLegacy){
 const exact=byExternal.get(externalKey(row));
 if(exact)return exact;
 const fallback=byLegacy.get(legacyKey(row));
 return sameAgencyIdentity(row,fallback)?fallback:null;
}
function recordKey(record) {
  return externalKey(record) || legacyKey(record);
}
function normalizeCall(row) {
  const agency = String(row?.agency || "").trim().toUpperCase();
  if (!row?._id || !row?.incident || !row?.location || !ALLOWED_AGENCIES.has(agency)) return null;
  const external_call_id = String(row._id);
  const received = new Date(row.timeReceived);
  if (!row.timeReceived || Number.isNaN(received.getTime()) || received.getTime() > Date.now() + 12e4) return null;
  const latitude = validCoordinate(row?.coords?.[0]);
  const longitude = validCoordinate(row?.coords?.[1]);
  const agency_cad_number = extractOfficialCadNumber(row);
  return {
    external_call_id,
    ...agency_cad_number ? {
      agency_cad_number,
      cad_number_source: "official_government_feed",
      official_cad_verified: true
    } : {
      cad_number_source: "bps_internal",
      official_cad_verified: false
    },
    incident: String(row.incident).trim(),
    location: String(row.location).trim(),
    agency,
    zone: String(row.district || "").trim(),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.incident),
    time_received: received.toISOString(),
    source: AGENCY_SOURCE[agency],
    description: `${String(row.incident).trim()} at ${String(row.location).trim()}`,
    ...latitude !== null && longitude !== null ? { latitude, longitude, geo_confidence: "high", geo_method: "grac", geo_approximate: false } : {}
  };
}
var GRAC_WEBSITE_URL = "https://gractivecalls.com/";
function decodeHtmlText(value) {
  return String(value || "").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();
}
function easternWebsiteTimeToIso(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  let hour = Number(match[4]) % 12;
  if (match[6].toUpperCase() === "PM") hour += 12;
  const minute = Number(match[5]);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = desiredWallClock;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(utc));
    const part = (type) => Number(parts.find((item) => item.type === type)?.value || 0);
    const renderedWallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), 0, 0);
    const delta = desiredWallClock - renderedWallClock;
    utc += delta;
    if (Math.abs(delta) < 1e3) break;
  }
  return new Date(utc).toISOString();
}
async function websiteCallId(row) {
  const seed = [row.agency, row.time_received, cleanMatchText(row.incident), cleanMatchText(row.location)].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return "web-" + Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function fetchLiveWebsiteCalls() {
  const url = `${GRAC_WEBSITE_URL}?bpspf_live=${Date.now()}-${crypto.randomUUID()}`;
  const result = await fetchCadSource(url, GRAC_WEBSITE_URL, "text/html");
  const html = result.text;
  console.info("CAD website source", JSON.stringify({ cache_age_seconds: result.cacheAgeSeconds, fetched_at: result.fetchedAt }));
  const calls = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => decodeHtmlText(match[1]));
    if (cells.length < 5) continue;
    const [receivedText, incident, location, agencyRaw, statusText] = cells;
    const agency = String(agencyRaw || "").trim().toUpperCase();
    if (!ALLOWED_AGENCIES.has(agency) || !incident || !location) continue;
    const time_received = easternWebsiteTimeToIso(receivedText);
    if (!time_received) continue;
    const base = {
      agency,
      incident: String(incident).trim(),
      location: String(location).trim(),
      time_received
    };
    calls.push({
      external_call_id: await websiteCallId(base),
      incident: base.incident,
      location: base.location,
      agency,
      zone: "",
      status: normalizeStatus(statusText),
      priority: normalizePriority(base.incident),
      time_received,
      source: AGENCY_SOURCE[agency],
      description: `${base.incident} at ${base.location} [GRAC-WEBSITE]`,
      cad_number_source: "bps_internal",
      official_cad_verified: false,
      source_channel: "grac_website_live"
    });
  }
  return Object.assign(calls, { cacheAgeSeconds: result.cacheAgeSeconds });
}
async function fetchLiveApiCalls() {
  const url=GRAC_API_URL+"?bpspf_live="+Date.now()+"-"+crypto.randomUUID();
  const result = await fetchCadSource(url, GRAC_API_URL, "application/json");
  const payload = JSON.parse(result.text);
  console.info("CAD API source", JSON.stringify({ cache_age_seconds: result.cacheAgeSeconds, fetched_at: result.fetchedAt }));
  if (!Array.isArray(payload)) throw new Error("Unexpected GRAC API response");
  return payload.map(normalizeCall).filter(Boolean);
}
async function fetchNonEmptySource(loader, label) {
  try {
    const rows = await loader();
    if (Array.isArray(rows) && rows.length) return rows;
    throw new Error(`${label} returned zero rows`);
  } catch (error) {
    throw error || new Error(`${label} unavailable`);
  }
}
function liveMergeKey(call) {
  return [String(call?.agency || "").toUpperCase(), String(call?.time_received || ""), cleanMatchText(call?.incident), cleanMatchText(call?.location)].join("|");
}
function mergeLiveWebsiteAndApi(websiteCalls, apiCalls, _websiteCacheAgeSeconds = 0) {
  const byKey = /* @__PURE__ */ new Map();
  for (const web of websiteCalls || []) byKey.set(liveMergeKey(web), web);
  for (const api of apiCalls || []) {
    const key = liveMergeKey(api);
    const web = byKey.get(key);
    if(web?.source_channel?.includes("grac_api_live")&&web.external_call_id&&api.external_call_id&&web.external_call_id!==api.external_call_id){
      byKey.set(key+"|"+api.external_call_id,{...api,source_channel:"grac_api_live"});
      continue;
    }
    if (!web) {
      byKey.set(key, { ...api, source_channel: "grac_api_live" });
      continue;
    }
    byKey.set(key, {
      ...web,
      ...api,
      // Keep the API's stable ID for subsequent updates, while retaining the
      // website description when it provides helpful public context.
      external_call_id: api.external_call_id || web.external_call_id,
      source_channel: "grac_api_live+website",
      description: api.description || web.description
    });
  }
  return [...byKey.values()];
}
async function fastGeocodeWebsiteCall(call) {
  if (call?.latitude != null && call?.longitude != null && Number.isFinite(Number(call.latitude)) && Number.isFinite(Number(call.longitude)) && (Number(call.latitude) !== 0 || Number(call.longitude) !== 0)) return call;
  const agency = String(call?.agency || "").toUpperCase();
  const area = ["HPD", "HFD"].includes(agency) ? "Henrico County, VA" : ["CCPD", "CCFD"].includes(agency) ? "Chesterfield County, VA" : "Richmond, VA";
  const address = `${String(call?.location || "").replace(/^RICH:\s*/i, "")}, ${area}`;
  const tomtom = await tomtomGeocode(address);
  if (tomtom) return {
    ...call,
    latitude: tomtom.latitude,
    longitude: tomtom.longitude,
    geo_confidence: tomtom.geo_confidence,
    geo_method: "tomtom",
    geo_approximate: tomtom.geo_approximate
  };
  const photon = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=3&lang=en`, {
    headers: { Accept: "application/json", "User-Agent": "BPS-Pathfinder-CAD/4.2" },
    signal: AbortSignal.timeout(4500)
  }).then(async (response) => {
    if (!response.ok) return null;
    const data = await response.json();
    const feature = (data?.features || []).find((item) => {
      const p = item?.properties || {};
      return !p.state || p.state === "Virginia" || p.state === "VA";
    }) || data?.features?.[0];
    return feature ? { latitude: Number(feature.geometry?.coordinates?.[1]), longitude: Number(feature.geometry?.coordinates?.[0]) } : null;
  }).catch(() => null);
  const census = fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4500)
  }).then(async (response) => {
    if (!response.ok) return null;
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    return match ? { latitude: Number(match.coordinates?.y), longitude: Number(match.coordinates?.x) } : null;
  }).catch(() => null);
  const settled = await Promise.all([census, photon]);
  const coords = settled.find((value) => value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
  return coords ? { ...call, ...coords, geo_confidence: "medium", geo_method: "street", geo_approximate: true } : call;
}
async function geocodeFreshWebsiteOnlyCalls(calls) {
  const now = Date.now();
  const candidates = (calls || []).filter((call) => call?.source_channel === "grac_website_live" && !(call.latitude !== null && call.latitude !== void 0 && call.latitude !== "" && call.longitude !== null && call.longitude !== void 0 && call.longitude !== "" && Number.isFinite(Number(call.latitude)) && Number.isFinite(Number(call.longitude)) && Math.abs(Number(call.latitude)) <= 90 && Math.abs(Number(call.longitude)) <= 180 && !(Number(call.latitude) === 0 && Number(call.longitude) === 0)) && now - new Date(call.time_received || 0).getTime() <= 45 * 6e4).slice(0, 8);
  const replacements = /* @__PURE__ */ new Map();
  const batch = await Promise.all(candidates.map(fastGeocodeWebsiteCall));
  batch.forEach((call) => replacements.set(liveMergeKey(call), call));
  return (calls || []).map((call) => replacements.get(liveMergeKey(call)) || call);
}
function persistableCall(call) {
  if (!call) return {};
  const required = normalizePriority(call.incident);
  const rank = { low: 0, medium: 1, high: 2, critical: 3 };
  const current = String(call.priority || "low").toLowerCase();
  return { ...call, priority: (rank[current] ?? 0) >= (rank[required] ?? 0) ? current : required };
}
function changed(existing, incoming) {
  const fields = ["external_call_id", "agency_cad_number", "bps_reference", "cad_number_source", "official_cad_verified", "call_id", "incident", "location", "agency", "zone", "status", "priority", "time_received", "source", "description", "latitude", "longitude", "geo_confidence", "geo_method", "geo_approximate"];
  return fields.some((field) => existing?.[field] !== incoming?.[field]);
}
function pointInPolygon(lat, lng, polygon = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const latI = Number(Array.isArray(a) ? a[0] : a?.lat);
    const lngI = Number(Array.isArray(a) ? a[1] : a?.lng);
    const latJ = Number(Array.isArray(b) ? b[0] : b?.lat);
    const lngJ = Number(Array.isArray(b) ? b[1] : b?.lng);
    if (![latI, lngI, latJ, lngJ].every(Number.isFinite)) continue;
    const intersects = lngI > lng !== lngJ > lng && lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI || Number.EPSILON) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function pointToSegmentMeters(lat, lng, a, b) {
  const aLat = Number(Array.isArray(a) ? a[0] : a?.lat);
  const aLng = Number(Array.isArray(a) ? a[1] : a?.lng);
  const bLat = Number(Array.isArray(b) ? b[0] : b?.lat);
  const bLng = Number(Array.isArray(b) ? b[1] : b?.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(lat * Math.PI / 180);
  const ax = (aLng - lng) * metersPerLng;
  const ay = (aLat - lat) * metersPerLat;
  const bx = (bLng - lng) * metersPerLng;
  const by = (bLat - lat) * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, (-ax * dx + -ay * dy) / lengthSq)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}
function normalizedStreet(value) {
  const cleaned = String(value || "").toUpperCase().replace(/\bNORTH\b/g, "N").replace(/\bSOUTH\b/g, "S").replace(/\bEAST\b/g, "E").replace(/\bWEST\b/g, "W").replace(/\bSTREET\b/g, "ST").replace(/\bAVENUE\b/g, "AVE").replace(/\bROAD\b/g, "RD").replace(/\bBOULEVARD\b/g, "BLVD").replace(/\bLANE\b/g, "LN").replace(/\bDRIVE\b/g, "DR").replace(/\b(\d+)(ST|ND|RD|TH)\b/g, "$1").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const number = Number(cleaned.match(/^\d+/)?.[0]);
  const street = cleaned.replace(/^\d+\s*/, "").replace(/\b(?:RICHMOND|VA|VIRGINIA)\b.*$/, "").trim();
  return { number, street };
}
function sameStreetBlock(callLocation, propertyAddress) {
  const call = normalizedStreet(callLocation);
  const property = normalizedStreet(propertyAddress);
  if (!Number.isFinite(call.number) || !Number.isFinite(property.number) || !call.street || !property.street) return false;
  const callStreet = call.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, "").trim();
  const propertyStreet = property.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, "").trim();
  return callStreet === propertyStreet && Math.floor(call.number / 100) === Math.floor(property.number / 100);
}
function propertyMatch(call, location) {
  const emergencyFour = /\bOFFICER\b|(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/i.test(String(call?.incident || ""));
  if (location?.active === false || !emergencyFour && location?.property_monitoring_enabled !== true) return null;
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  const hasCoordinates = call?.latitude!=null&&call?.longitude!=null&&String(call.latitude).trim()!==""&&String(call.longitude).trim()!==""&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);
  if (!hasCoordinates) {
    return sameStreetBlock(call?.location, location?.address) ? { relation: "nearby", distanceMeters: 0, addressFallback: true } : null;
  }
  const polygon = Array.isArray(location.property_monitoring_polygon) ? location.property_monitoring_polygon : [];
  const boundaryType = String(location.property_monitoring_boundary_type || (polygon.length >= 3 ? "polygon" : "circle")).toLowerCase();
  if (boundaryType === "polygon" && polygon.length >= 3) {
    if (pointInPolygon(lat, lng, polygon)) return { relation: "inside", distanceMeters: 0 };
    let edgeDistance = Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      edgeDistance = Math.min(
        edgeDistance,
        pointToSegmentMeters(lat, lng, polygon[i], polygon[(i + 1) % polygon.length])
      );
    }
    return edgeDistance <= PROPERTY_MONITORING_EDGE_TOLERANCE_METERS ? { relation: "nearby", distanceMeters: edgeDistance } : null;
  }
  const centerLat = Number(location.latitude);
  const centerLng = Number(location.longitude);
  const radiusMeters = Number(location.property_monitoring_radius_meters || 0);
  if (![centerLat, centerLng, radiusMeters].every(Number.isFinite) || radiusMeters <= 0) return null;
  const centerDistance = distanceMeters(lat, lng, centerLat, centerLng);
  return centerDistance <= radiusMeters ? { relation: "inside", distanceMeters: 0 } : null;
}
function propertyAlertFingerprint(call, propertyId) {
  return [
    String(propertyId || ""),
    String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || ""),
    String(call?.incident || "").trim().toUpperCase(),
    String(call?.location || "").trim().toUpperCase()
  ].join("|");
}
async function createImmediatePropertyAlerts(base44, call, monitored, existingCallPropertyKeys, existingKeys, sideEffects) {
  if (!isFreshLivePropertyCall(call)) return 0;
  let created = 0;
  for (const location of monitored || []) {
    const match = propertyMatch(call, location);
    if (!match) continue;
    const key = propertyAlertFingerprint(call, location.id);
    const callPropertyKey = `${String(location.id || "")}|${String(call.id || "")}`;
    if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
    const propertyAlert = await base44.asServiceRole.entities.PropertyAlert.create({
      callId: call.id,
      propertyId: location.id,
      propertyName: location.site_name || "Monitored Property",
      callIncident: call.incident || "Unknown incident",
      callLocation: call.location || "",
      callPriority: call.priority || "medium",
      callStatus: call.status || "New",
      cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ""),
      callTime: call.time_received || call.created_date || (/* @__PURE__ */ new Date()).toISOString(),
      time_received: call.time_received || call.created_date || (/* @__PURE__ */ new Date()).toISOString(),
      source_key: key,
      distanceMeters: Number(match.distanceMeters || 0),
      acknowledged: false,
      description: match.relation === "inside" ? `Call is inside the ${location.site_name || "monitored"} property boundary.` : `Call is within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || "monitored"} property boundary.`
    });
    if (!isFreshLivePropertyCall(call)) {
      sideEffects.push(
        base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", {
          call_id: call.id,
          property_alert_id: propertyAlert.id
        }).catch((error) => console.error("Automatic property-dispatch evaluation failed", {
          call_id: call.id,
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error)
        }))
      );
      existingKeys.add(key);
      existingCallPropertyKeys.add(callPropertyKey);
      created += 1;
      continue;
    }
    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const propertyEventKey = `property-alert:${propertyAlert.id}:created`;
    sideEffects.push(
      base44.asServiceRole.entities.CallStatusLog.create({
        call_id: String(call.id),
        incident_type: call.incident || "Call for service",
        location: call.location || location.address || "",
        old_status: "",
        new_status: call.status || "New",
        notes: `Monitored-property active call detected for ${location.site_name || location.address || "property"}.`,
        latitude: call.latitude,
        longitude: call.longitude,
        event_key: propertyEventKey,
        event_type: "property_alert",
        announcement_text: `Active call for service at ${location.site_name || location.address || "monitored property"}. ${call.incident || "Call for service"} at ${call.location || location.address || "address unavailable"}. CAD number ${cadNumber}.`,
        announcement_priority: ["critical", "high"].includes(String(call.priority || "").toLowerCase()) ? String(call.priority).toLowerCase() : "high",
        cad_number: String(cadNumber),
        triggering_action: "ingestGractivecalls.property_alert_created",
        audio_enabled: true,
        sensitive: false
      }).catch((error) => console.error("Unable to publish property alert announcement event", error?.message || error)),
      base44.asServiceRole.functions.invoke("notifyPropertyAlertSms", {
        property_alert_id: propertyAlert.id
      }).catch((error) => console.error("Property-call SMS notification failed", {
        property_alert_id: propertyAlert.id,
        error: error?.message || String(error)
      })),
      base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", {
        call_id: call.id,
        property_alert_id: propertyAlert.id
      }).catch((error) => console.error("Automatic property-dispatch evaluation failed", {
        call_id: call.id,
        property_alert_id: propertyAlert.id,
        error: error?.message || String(error)
      }))
    );
    existingKeys.add(key);
    existingCallPropertyKeys.add(callPropertyKey);
    created += 1;
  }
  return created;
}
async function reconcilePropertyAlerts(base44) {
  const [calls, locations, existingAlerts, existingEvaluations] = await Promise.all([
    base44.asServiceRole.entities.DispatchCall.list("-created_date", 300),
    base44.asServiceRole.entities.Location.list("site_name", 1000),
    // Read ALL alerts, not only unacknowledged alerts. An acknowledged alert is
    // still the authoritative record for that call/property pair and must not be
    // recreated every ingestion cycle.
    base44.asServiceRole.entities.PropertyAlert.list("-created_date", 1e3).catch(() => []),
    base44.asServiceRole.entities.AutoDispatchEvaluation.list("-evaluated_at", 1e3).catch(() => [])
  ]);
  const activeCalls = (calls || []).filter((call) => !["Cleared", "Cancelled"].includes(call.status));
  const recentHistoryCutoff = Date.now() - 24 * 60 * 60 * 1e3;
  const recentClearedCalls = (calls || []).filter((call) => {
    if (!["Cleared", "Cancelled"].includes(String(call.status || ""))) return false;
    const stamp = new Date(call.time_received || call.created_date || 0).getTime();
    return Number.isFinite(stamp) && stamp >= recentHistoryCutoff;
  });
  const monitored = (locations || []).filter((location) => location.active !== false);
  const alertFingerprint = (call, propertyId) => [
    String(propertyId || ""),
    String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || ""),
    String(call?.incident || "").trim().toUpperCase(),
    String(call?.location || "").trim().toUpperCase()
  ].join("|");
  const existingCallPropertyKeys = new Set((existingAlerts || []).map(
    (alert) => `${String(alert?.propertyId || "")}|${String(alert?.callId || "")}`
  ));
  const existingKeys = new Set((existingAlerts || []).map((alert) => {
    if (alert?.source_key) return String(alert.source_key);
    return [
      String(alert?.propertyId || ""),
      String(alert?.callTime || alert?.time_received || alert?.created_date || ""),
      String(alert?.callIncident || "").trim().toUpperCase(),
      String(alert?.callLocation || "").trim().toUpperCase()
    ].join("|");
  }));
  let propertyAlertsCreated = 0;
  for (const call of recentClearedCalls) {
    for (const location of monitored) {
      const match = propertyMatch(call, location);
      if (!match) continue;
      const key = alertFingerprint(call, location.id);
      const callPropertyKey = `${String(location.id || "")}|${String(call.id || "")}`;
      if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
      await base44.asServiceRole.entities.PropertyAlert.create({
        callId: call.id,
        propertyId: location.id,
        propertyName: location.site_name || "Monitored Property",
        callIncident: call.incident || "Unknown incident",
        callLocation: call.location || "",
        callPriority: call.priority || "medium",
        callStatus: call.status || "Cleared",
        cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ""),
        callTime: call.time_received || call.created_date,
        time_received: call.time_received || call.created_date,
        source_key: key,
        distanceMeters: Number(match.distanceMeters || 0),
        acknowledged: true,
        lifecycle_status: "resolved",
        description: match.relation === "inside" ? `Historical property call was inside the ${location.site_name || "monitored"} property boundary.` : `Historical property call was within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || "monitored"} property boundary.`
      });
      existingKeys.add(key);
      existingCallPropertyKeys.add(callPropertyKey);
      propertyAlertsCreated += 1;
    }
  }
  for (const call of activeCalls) {
    for (const location of monitored) {
      const match = propertyMatch(call, location);
      if (!match) continue;
      const key = alertFingerprint(call, location.id);
      const callPropertyKey = `${String(location.id || "")}|${String(call.id || "")}`;
      if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
      const propertyAlert = await base44.asServiceRole.entities.PropertyAlert.create({
        callId: call.id,
        propertyId: location.id,
        propertyName: location.site_name || "Monitored Property",
        callIncident: call.incident || "Unknown incident",
        callLocation: call.location || "",
        callPriority: call.priority || "medium",
        callStatus: call.status || "New",
        cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ""),
        callTime: call.time_received || call.created_date,
        time_received: call.time_received || call.created_date,
        source_key: key,
        distanceMeters: Number(match.distanceMeters || 0),
        acknowledged: false,
        description: match.relation === "inside" ? `Call is inside the ${location.site_name || "monitored"} property boundary.` : `Call is within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || "monitored"} property boundary.`
      });
      const freshLivePropertyCall = isFreshLivePropertyCall(call);
      if (!freshLivePropertyCall) {
        await base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", {
          call_id: call.id,
          property_alert_id: propertyAlert.id
        }).catch((error) => console.error("Automatic property-dispatch evaluation failed", {
          call_id: call.id,
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error)
        }));
        existingKeys.add(key);
        existingCallPropertyKeys.add(callPropertyKey);
        propertyAlertsCreated += 1;
        continue;
      }
      const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
      const propertyEventKey = `property-alert:${propertyAlert.id}:created`;
      const priorPropertyEvents = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: propertyEventKey }, "-created_date", 1).catch(() => []);
      if (!priorPropertyEvents?.length) {
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: String(call.id),
          incident_type: call.incident || "Call for service",
          location: call.location || location.address || "",
          old_status: "",
          new_status: call.status || "New",
          notes: `Monitored-property active call detected for ${location.site_name || location.address || "property"}.`,
          latitude: call.latitude,
          longitude: call.longitude,
          event_key: propertyEventKey,
          event_type: "property_alert",
          announcement_text: `Active call for service at ${location.site_name || location.address || "monitored property"}. ${call.incident || "Call for service"} at ${call.location || location.address || "address unavailable"}. CAD number ${cadNumber}.`,
          announcement_priority: ["critical", "high"].includes(String(call.priority || "").toLowerCase()) ? String(call.priority).toLowerCase() : "high",
          cad_number: String(cadNumber),
          triggering_action: "ingestGractivecalls.property_alert_created",
          audio_enabled: true,
          sensitive: false
        }).catch((error) => console.error("Unable to publish property alert announcement event", error?.message || error));
      }
      await base44.asServiceRole.functions.invoke("notifyPropertyAlertSms", {
        property_alert_id: propertyAlert.id
      }).catch((error) => {
        console.error("Property-call SMS notification failed", {
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error)
        });
      });
      await base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", {
        call_id: call.id,
        property_alert_id: propertyAlert.id
      }).catch((error) => {
        console.error("Automatic property-dispatch evaluation failed", {
          call_id: call.id,
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error)
        });
      });
      existingKeys.add(key);
      existingCallPropertyKeys.add(callPropertyKey);
      propertyAlertsCreated += 1;
    }
  }
  const activeCallIds = new Set(activeCalls.map((call) => String(call.id)));
  const propertyById = new Map(monitored.map((location) => [String(location.id), location]));
  const latestEvaluationByAlert = /* @__PURE__ */ new Map();
  for (const evaluation of existingEvaluations || []) {
    const alertId = String(evaluation.property_alert_id || "");
    if (!alertId || latestEvaluationByAlert.has(alertId)) continue;
    latestEvaluationByAlert.set(alertId, evaluation);
  }
  const nowMs = Date.now();
  for (const alert of existingAlerts || []) {
    const lifecycle = String(alert.lifecycle_status || "active").toLowerCase();
    if (!activeCallIds.has(String(alert.callId)) || ["resolved", "false_alarm", "test"].includes(lifecycle)) continue;
    const alertAt = new Date(alert.created_date || 0).getTime();
    if (Number.isFinite(alertAt) && nowMs - alertAt >= 0 && nowMs - alertAt <= 15 * 60 * 1e3) {
      await base44.asServiceRole.functions.invoke("notifyPropertyAlertSms", {
        property_alert_id: alert.id
      }).catch((error) => console.error("Recent property-call SMS retry failed", {
        property_alert_id: alert.id,
        error: error?.message || String(error)
      }));
    }
    const property = propertyById.get(String(alert.propertyId));
    const incident = activeCalls.find((call) => String(call.id) === String(alert.callId))?.incident || alert.callIncident || "";
    const fourUnitCall = /\bOFFICER\b|(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/i.test(incident);
    if (!property || !fourUnitCall && (property.auto_dispatch_enabled !== true || property.auto_dispatch_mode !== "live")) continue;
    const latest = latestEvaluationByAlert.get(String(alert.id));
    if (latest?.mode === "live" && latest?.decision === "assigned" && (!fourUnitCall || (latest.recommended_unit_ids || []).length >= 4)) continue;
    const lastAt = new Date(latest?.evaluated_at || latest?.updated_date || 0).getTime();
    const intervalMs = Math.max(30, Number(property.auto_dispatch_recheck_seconds || 60)) * 1e3;
    if (Number.isFinite(lastAt) && nowMs - lastAt < intervalMs) continue;
    await base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", {
      call_id: alert.callId,
      property_alert_id: alert.id
    }).catch((error) => console.error("Live automatic-dispatch recheck failed", {
      call_id: alert.callId,
      property_alert_id: alert.id,
      error: error?.message || String(error)
    }));
  }
  return propertyAlertsCreated;
}
async function ensurePhase2ASafetyEvidence(base44) {
  const existing = await base44.asServiceRole.entities.AutoDispatchEvaluation.list("-evaluated_at", 1).catch(() => []);
  if (existing?.length) return { status: "already_verified", evaluation_id: existing[0].id };
  const alerts = await base44.asServiceRole.entities.PropertyAlert.list("-created_date", 100).catch(() => []);
  for (const alert of alerts || []) {
    if (!alert?.id || !alert?.callId) continue;
    const archived = await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: alert.callId }, "-archived_date", 1).catch(() => []);
    if (!archived?.length) continue;
    const response = await base44.asServiceRole.functions.invoke("testAutoDispatchShadow", {
      call_id: alert.callId,
      property_alert_id: alert.id,
      simulation: true
    });
    const result = response?.data || response || {};
    if (result.error) throw new Error(result.error);
    return { status: result.passed ? "passed" : "failed", checks: result.checks || {}, tested_at: result.tested_at };
  }
  return { status: "waiting_for_property_alert" };
}
async function reserveCadNumbers(base44, count) {
  if (count <= 0) return [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await base44.asServiceRole.functions.invoke("ensure-cad-references", { action: "allocate", count });
      const data = response?.data || response || {};
      if (!Array.isArray(data.references) || data.references.length !== count) throw Error(data.error || "CAD references were not reserved");
      return data.references;
    } catch (error) {
      if (Number(error?.response?.status || error?.status) !== 409 || attempt === 2) throw error;
      await wait(750);
    }
  }
  throw Error("CAD reference allocation is busy");
}
function chooseCanonical(records) {
  return [...records].sort((a, b) => {
    const aManual = a.manual_dismissed === true ? 0 : 1;
    const bManual = b.manual_dismissed === true ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    const aOfficial = a.official_cad_verified && a.agency_cad_number ? 0 : 1;
    const bOfficial = b.official_cad_verified && b.agency_cad_number ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    const aRef = String(a.bps_reference || a.call_id || "");
    const bRef = String(b.bps_reference || b.call_id || "");
    if (aRef !== bRef) return aRef.localeCompare(bRef);
    return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
  })[0];
}
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var GLOBAL_SOURCE_POLL_MIN_GAP_MS = 5e3;
async function acquireIngestionLease(base44, serverRun = false) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: "dispatch_call" });
  let counter = counters?.[0];
  if (!counter) {
    const calls = await base44.asServiceRole.entities.DispatchCall.list("-created_date", 1e3);
    const highest = (calls || []).reduce((max, call) => {
      const match = String(call.call_id || "").match(/^B(\d+)$/i);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    counter = await base44.asServiceRole.entities.CadCounter.create({
      counter_key: "dispatch_call",
      last_number: highest,
      ingestion_lock_token: "",
      ingestion_locked_until: (/* @__PURE__ */ new Date(0)).toISOString()
    });
  }
  const lastServer = Date.parse(counter.last_server_poll_at || "");
  if (!serverRun && Number.isFinite(lastServer) && now - lastServer < 75e3 && String(counter.last_source_poll_status||'').startsWith('success')) return { skip: true, reason: "server_source_sync_active", retry_after_ms: 75e3 - (now - lastServer),source_health:{poll_at:counter.last_source_poll_at,poll_status:counter.last_source_poll_status,last_success_at:counter.last_source_success_at||counter.last_source_poll_at,website_rows:counter.last_website_row_count,api_rows:counter.last_api_row_count,latest_received:counter.last_website_latest_received} };
  const lastPollAt = new Date(counter.last_source_poll_at || 0).getTime();
  const lastPollSucceeded = String(counter.last_source_poll_status || "").startsWith("success");
  if (lastPollSucceeded && Number.isFinite(lastPollAt) && now - lastPollAt >= 0 && now - lastPollAt < GLOBAL_SOURCE_POLL_MIN_GAP_MS) {
    return {
      skip: true,
      reason: "recent_source_poll",
      retry_after_ms: GLOBAL_SOURCE_POLL_MIN_GAP_MS - (now - lastPollAt)
    };
  }
  const lockedUntil = new Date(counter.ingestion_locked_until || 0).getTime();
  if (lockedUntil > now) return null;
  await base44.asServiceRole.entities.CadCounter.update(counter.id, {
    ingestion_lock_token: token,
    ingestion_locked_until: new Date(now + 45e3).toISOString()
  });
  await wait(500);
  const verified = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: "dispatch_call" }))?.[0];
  return verified?.ingestion_lock_token === token ? { id: verified.id, token } : null;
}
async function recordSourcePoll(base44, lease, data) {
  if (!lease?.id) return;
  await base44.asServiceRole.entities.CadCounter.update(lease.id, data).catch((error) => {
    console.warn("Unable to record CAD source heartbeat", error?.message || error);
  });
}
async function releaseIngestionLease(base44, lease) {
  if (!lease) return;
  const current = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: "dispatch_call" }))?.[0];
  if (current?.id === lease.id && current?.ingestion_lock_token === lease.token) {
    await base44.asServiceRole.entities.CadCounter.update(lease.id, {
      ingestion_lock_token: "",
      ingestion_locked_until: (/* @__PURE__ */ new Date(0)).toISOString()
    }).catch(() => null);
  }
}
async function repairRecentPropertyAnnouncementEvents(base44,alerts,calls,monitored,closedIds){
 const callById=new Map((calls||[]).filter(c=>isFreshLivePropertyCall(c)&&!closedIds.has(String(c.id))).map(c=>[String(c.id),c]));
 const siteById=new Map((monitored||[]).map(p=>[String(p.id),p]));
 const candidates=(alerts||[]).filter(a=>{const c=callById.get(String(a.callId)),p=siteById.get(String(a.propertyId));const at=new Date(a.created_date||0).getTime();return c&&p&&propertyMatch(c,p)&&a.is_test!==true&&!['resolved','false_alarm','test','inactive','closed'].includes(String(a.lifecycle_status||'').toLowerCase())&&Number.isFinite(at)&&Date.now()-at>=0&&Date.now()-at<=60*60*1000;});
 if(!candidates.length)return 0;
 const keys=candidates.map(a=>`property-alert:${a.id}:created`);
 const logs=await base44.asServiceRole.entities.CallStatusLog.filter({event_key:{$in:keys}},'-created_date',Math.min(1000,keys.length+1));
 const published=new Set((logs||[]).map(row=>row.event_key));
 let repaired=0;
 for(const a of candidates.filter(a=>!published.has(`property-alert:${a.id}:created`)).slice(0,5)){
  const c=callById.get(String(a.callId)),p=siteById.get(String(a.propertyId));
  const cad=String(c.agency_cad_number||c.bps_reference||c.call_id||c.id);
  await base44.asServiceRole.entities.CallStatusLog.create({call_id:c.id,incident_type:c.incident||'',location:c.location||'',old_status:'',new_status:c.status||'New',notes:'Recovered verified active property-alert announcement',event_key:`property-alert:${a.id}:created`,event_type:'property_alert',announcement_text:`Active call for service at ${p.site_name||p.address||'monitored property'}. ${c.incident||'Call for service'} at ${c.location||p.address||'address unavailable'}. CAD number ${cad}.`,announcement_priority:'high',cad_number:cad,triggering_action:'ingestGractivecalls.property_alert_recovery',audio_enabled:true,sensitive:false});
  repaired++;
 }
 return repaired;
}
function canCloseMissingAgencyCall(row,confirmedAgencies){
 return ['richmond','henrico','chesterfield'].includes(String(row?.source||'').toLowerCase())&&confirmedAgencies.has(String(row?.agency||'').toUpperCase())&&!row.public_request_id&&!row.manual_dismissed;
}
async function ingestFastPublishedCalls(base44, incoming, confirmedAgencies=new Set()) {
  const started = Date.now();
  const incomingKeys=[...new Set(incoming.map(externalKey).filter(Boolean))];
  const exactSaved=[];
  for(let i=0;i<incomingKeys.length;i+=100)exactSaved.push(...await base44.asServiceRole.entities.DispatchCall.filter({external_call_id:{$in:incomingKeys.slice(i,i+100)}},'-updated_date',500));
  const [recentSaved, history, locations, alerts, cachedAssignments, cachedSessions, cachedUnits] = await Promise.all([
    base44.asServiceRole.entities.DispatchCall.list("-created_date", 500),
    base44.asServiceRole.entities.CallHistory.list("-archived_date", 500).catch(() => []),
    base44.asServiceRole.entities.Location.list("site_name", 1000),
    base44.asServiceRole.entities.PropertyAlert.list("-created_date", 300).catch(() => []),
    base44.asServiceRole.entities.CallAssignment.filter({ status: { $nin: ["cleared", "cancelled", "canceled"] } }, "-assigned_at", 1e3),
    base44.asServiceRole.entities.ActiveOfficer.filter({ current_call_id: { $exists: true } }, "-last_update", 500),
    base44.asServiceRole.entities.Unit.filter({ assigned_call_ids: { $exists: true } }, "-last_update_at", 500)
  ]);
  const saved=[...new Map([...exactSaved,...recentSaved].map(row=>[String(row.id),row])).values()];
  const byExternal = /* @__PURE__ */ new Map();
  const byLegacy = /* @__PURE__ */ new Map();
  for (const row of saved || []) {
    if(!['richmond','henrico','chesterfield'].includes(lower(row.source)))continue;
    if (externalKey(row) && !byExternal.has(externalKey(row))) byExternal.set(externalKey(row), row);
    if (legacyKey(row) && !byLegacy.has(legacyKey(row))) byLegacy.set(legacyKey(row), row);
  }
  const archivedExternal = new Set((history || []).map((row) => externalKey(row)).filter(Boolean));
  const archivedLegacy = new Set((history || []).map((row) => legacyKey(row)).filter(Boolean));
  const monitored = (locations || []).filter((row) => row.active !== false);
  const callPropertyKeys = new Set((alerts || []).map((row) => String(row.propertyId || "") + "|" + String(row.callId || "")));
  const alertKeys = new Set((alerts || []).map((row) => String(row.source_key || [
    row.propertyId || "",
    row.callTime || row.time_received || row.created_date || "",
    String(row.callIncident || "").toUpperCase(),
    String(row.callLocation || "").toUpperCase()
  ].join("|"))));
  const now = Date.now();
  const recent = [...incoming].sort((a, b) => new Date(b.time_received).getTime() - new Date(a.time_received).getTime());
  const seen = /* @__PURE__ */ new Set();
  const newCalls = recent.filter((row) => {
    const external = externalKey(row), legacy = legacyKey(row), key = external || legacy;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !matchAgencyRecord(row,byExternal,byLegacy) && !archivedExternal.has(external) && (!external||!String(row.source_channel||'').includes('grac_api')?!archivedLegacy.has(legacy):true);
  }).slice(0, 40);
  const numbers = await reserveCadNumbers(base44, newCalls.length);
  const sideEffects = [];
  const createdCalls = [];
  let created = 0, updated = 0, propertyAlertsCreated = 0, alertFailures = 0;
  for (let offset = 0; offset < newCalls.length; offset += 4) {
    await Promise.all(newCalls.slice(offset, offset + 4).map(async (row, index) => {
      const reference = numbers[offset + index], official = String(row.agency_cad_number || "").trim();
      const firstSeenAt = row.source_first_seen_at || (/* @__PURE__ */ new Date()).toISOString();
      const call = await base44.asServiceRole.entities.DispatchCall.create({
        ...persistableCall(row),
        source_first_seen_at: firstSeenAt,
        bps_reference: reference,
        call_id: official || reference,
        cad_number_source: official ? "official_government_feed" : "bps_internal",
        official_cad_verified: Boolean(official)
      });
      created++;
      createdCalls.push(call);
      try {
        propertyAlertsCreated += await createImmediatePropertyAlerts(
          base44,
          call,
          monitored,
          callPropertyKeys,
          alertKeys,
          sideEffects
        );
      } catch (error) {
        alertFailures++;
        console.error("Fast CAD property-alert creation failed; next sync will retry", error?.message || error);
      }
    }));
  }
  await Promise.all(createdCalls.filter((call) => call.latitude == null || call.longitude == null || !Number.isFinite(Number(call.latitude)) || !Number.isFinite(Number(call.longitude)) || Number(call.latitude) === 0 && Number(call.longitude) === 0).slice(0, 8).map(async (call) => {
    try {
      const located = await fastGeocodeWebsiteCall(call);
      if (!Number.isFinite(Number(located.latitude)) || !Number.isFinite(Number(located.longitude))) return;
      const patch = { latitude: located.latitude, longitude: located.longitude, geo_confidence: located.geo_confidence, geo_method: located.geo_method, geo_approximate: located.geo_approximate !== false };
      const updatedCall = await base44.asServiceRole.entities.DispatchCall.update(call.id, patch);
      propertyAlertsCreated += await createImmediatePropertyAlerts(base44, { ...call, ...patch, ...updatedCall }, monitored, callPropertyKeys, alertKeys, sideEffects);
    } catch (error) {
      alertFailures++;
      console.warn("New call is published; coordinate enrichment will retry", error?.message || error);
    }
  }));
  const sameLiveField = (field, a, b) => field === "time_received" ? Date.parse(a) === Date.parse(b) : ["latitude", "longitude"].includes(field) ? Number(a) === Number(b) : String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const updateQueue = recent.filter((row) => {
    const existing = matchAgencyRecord(row,byExternal,byLegacy);
    return existing && existing.manual_dismissed !== true && !existing.time_cleared && ["incident", "location", "agency", "zone", "status", "priority", "time_received", "latitude", "longitude"].some((field) => row[field] !== void 0 && !(field === "priority" && existing.priority_override) && !sameLiveField(field, row[field], existing[field]));
  }).slice(0, 60);
  for (let offset = 0; offset < updateQueue.length; offset += 4) {
    await Promise.all(updateQueue.slice(offset, offset + 4).map(async (row) => {
      const previous = matchAgencyRecord(row,byExternal,byLegacy);
      const upstreamTerminal = ["cleared", "cancelled", "canceled", "closed", "resolved", "completed"].includes(lower(row.status));
      const preserveOfficerQueue = upstreamTerminal && await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, previous, cachedAssignments);
      const patch = {
        ...persistableCall(row),
        ...preserveOfficerQueue ? { status: previous.status } : {},
        ...previous.priority_override ? { priority: previous.priority } : {},
        source_first_seen_at: previous.source_first_seen_at || previous.created_date || row.source_first_seen_at || (/* @__PURE__ */ new Date()).toISOString(),
        source_channel: row.source_channel || previous.source_channel || "grac_api",
        agency_cad_number: previous.official_cad_verified ? previous.agency_cad_number : row.agency_cad_number || "",
        bps_reference: previous.bps_reference,
        call_id: previous.call_id,
        cad_number_source: previous.cad_number_source || "bps_internal",
        official_cad_verified: previous.official_cad_verified === true
      };
      const saved2 = await base44.asServiceRole.entities.DispatchCall.update(previous.id, patch);
      await announceAssignedCallUpdate(base44, previous, { ...previous, ...patch, ...saved2 }, cachedAssignments).catch((error) => console.error("Assigned call update announcement failed", error?.message));
      updated++;
      if (!["Cleared", "Cancelled"].includes(String(patch.status || ""))) {
        try {
          propertyAlertsCreated += await createImmediatePropertyAlerts(
            base44,
            { ...previous, ...patch },
            monitored,
            callPropertyKeys,
            alertKeys,
            sideEffects
          );
        } catch (error) {
          alertFailures++;
          console.error("Fast CAD updated-call alert failed; next sync will retry", error?.message || error);
        }
      }
    }));
  }
  for (const row of recent) {
    const previous = matchAgencyRecord(row,byExternal,byLegacy);
    if (!previous || previous.manual_dismissed === true || ["Cleared", "Cancelled"].includes(String(previous.status || ""))) continue;
    try {
      propertyAlertsCreated += await createImmediatePropertyAlerts(
        base44,
        { ...previous, ...row, id: previous.id },
        monitored,
        callPropertyKeys,
        alertKeys,
        sideEffects
      );
    } catch (error) {
      alertFailures++;
      console.error("Fast CAD missing-property-alert retry failed", error?.message || error);
    }
  }
  const liveKeys = new Set(incoming.flatMap((row) => [externalKey(row), legacyKey(row)]).filter(Boolean));
  const disappeared = (saved || []).filter((row) => {
    const receivedAt = new Date(row.time_received || row.created_date || 0).getTime();
    return receivedAt >= now - 3 * 60 * 6e4 && receivedAt <= now && !["Cleared", "Cancelled"].includes(String(row.status || "")) && row.manual_dismissed !== true && canCloseMissingAgencyCall(row,confirmedAgencies) && !liveKeys.has(externalKey(row)) && !liveKeys.has(legacyKey(row));
  }).slice(0, 20);
  const closedIdsFromSource = /* @__PURE__ */ new Set();
  for (let offset = 0; offset < disappeared.length; offset += 4) {
    await Promise.all(disappeared.slice(offset, offset + 4).map(async (row) => {
      if (await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, row, cachedAssignments)) return;
      try {
        await base44.asServiceRole.entities.DispatchCall.update(row.id, {
          status: "Cleared",
          time_closed: row.time_closed || (/* @__PURE__ */ new Date()).toISOString()
        });
        const hasMirror = cachedSessions.some((item) => String(item.current_call_id) === String(row.id)) || cachedUnits.some((item) => (item.assigned_call_ids || []).map(String).includes(String(row.id)));
        if (hasMirror) await releaseClosedCall(base44.asServiceRole.entities, { ...row, status: "Cleared" });
        closedIdsFromSource.add(String(row.id));
      } catch (error) {
        console.warn("Fast CAD close failed", error?.message || error);
      }
    }));
  }
  waitUntil(Promise.allSettled(sideEffects));
  const closedIds = closedIdsFromSource;
  try{await repairRecentPropertyAnnouncementEvents(base44,alerts,saved,monitored,closedIds);}catch(error){alertFailures++;console.error('Property announcement recovery deferred to next poll',error?.message||error);}

  const activeIds = new Set(saved.filter((call) => !closedIds.has(String(call.id)) && !["Cleared", "Cancelled"].includes(String(call.status))).map((call) => String(call.id)));
  const properties = new Map(monitored.map((property) => [String(property.id), property]));
  const candidates = alerts.filter((alert) => {
    if (!activeIds.has(String(alert.callId)) || alert.is_test === true || ["resolved", "false_alarm", "test"].includes(String(alert.lifecycle_status || "").toLowerCase())) return false;
    const property = properties.get(String(alert.propertyId));
    if (!property) return false;
    const call = saved.find((row) => String(row.id) === String(alert.callId));
    const priorityFour = /\bOFFICER\b|(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/i.test(String(call?.incident || alert.callIncident || ""));
    return priorityFour || property.auto_dispatch_enabled === true && property.auto_dispatch_mode === "live";
  });
  if (candidates.length) {
    try {
      const evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id: { $in: candidates.map((alert) => String(alert.id)) } }, "-evaluated_at", 1e3);
      const latest = /* @__PURE__ */ new Map();
      for (const evaluation of evaluations) if (!latest.has(String(evaluation.property_alert_id))) latest.set(String(evaluation.property_alert_id), evaluation);
      const due = candidates.filter((alert) => {
        const evaluation = latest.get(String(alert.id));
        const call = saved.find((row) => String(row.id) === String(alert.callId));
        const priorityFour = /\bOFFICER\b|(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/i.test(String(call?.incident || alert.callIncident || ""));
        if (evaluation?.mode === "live" && evaluation?.decision === "assigned" && (!priorityFour || (evaluation.recommended_unit_ids || []).length >= 4)) return false;
        const last = new Date(evaluation?.evaluated_at || 0).getTime();
        const interval = Math.max(60, Number(properties.get(String(alert.propertyId))?.auto_dispatch_recheck_seconds) || 60) * 1e3;
        return !Number.isFinite(last) || now - last >= interval;
      }).sort((a, b) => new Date(latest.get(String(a.id))?.evaluated_at || 0).getTime() - new Date(latest.get(String(b.id))?.evaluated_at || 0).getTime());
      for (const alert of due.slice(0, 2)) {
        const response = await base44.asServiceRole.functions.invoke("geofenceDispatchAssignment", { call_id: alert.callId, property_alert_id: alert.id });
        if (response?.data?.error) throw new Error(response.data.error);
      }
    } catch (error) {
      alertFailures++;
      console.error("Automatic dispatch recovery deferred to next poll", error?.message || error);
    }
  }
  return {
    success: true,
    lightweight: true,
    active: incoming.length,
    created,
    updated,
    removed: closedIdsFromSource.size,
    property_alerts_created: propertyAlertsCreated,
    alert_failures: alertFailures,
    synced_at: (/* @__PURE__ */ new Date()).toISOString(),
    duration_ms: Date.now() - started
  };
}
async function handleGracIngestion(req) {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const jobInput = await req.clone().json().catch(() => ({}));
    const platformScheduledAdmin = jobInput.scheduled === true;
    const __portalCaller = await base44.auth.me().then((user2) => platformScheduledAdmin && user2?.role === "admin" ? user2 : __portalAppIdentity(user2)).then(__limitFullAccess).catch(() => null);
    if (__portalCaller && !__portalCaller.is_service && !(__portalCaller.role === "admin" && platformScheduledAdmin) && !await __portalLoginIsCurrent(req, base44, __portalCaller)) return Response.json({ error: "Your Pathfinder session ended. Please sign in again.", code: "SESSION_REAUTH_REQUIRED" }, { status: 401 });
    let __portalService = false;
    if (!__portalCaller && req.headers.get("Authorization")) {
      try {
        await base44.entities.SystemScanRun.list("-created_date", 1);
        __portalService = true;
      } catch {
      }
    }
    if (!__portalCaller && !__portalService || __portalCaller && ((__portalCaller.additional_roles || []).includes("visitor") || __portalCaller.disabled || __portalCaller.termination_date && Date.parse(__portalCaller.termination_date) <= Date.now() || String(__portalCaller.employment_status || "").toLowerCase() === "terminated" || !__portalCaller.is_service && __portalCaller.role !== "admin" && !(__portalCaller.additional_roles || []).length && !["investigator", "reviewer"].includes(__portalCaller.ps_role))) return Response.json({ error: "Approved portal access required" }, { status: 403 });
    base44.auth.me = async () => __portalCaller;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const scheduledRun = body?.scheduled === true;
    const user = __portalService ? { id: "scheduled-cad-ingestion", role: "dispatch", additional_roles: ["cad_access"], is_service: true } : await base44.auth.me().then((user2) => platformScheduledAdmin && user2?.role === "admin" ? user2 : __portalAppIdentity(user2)).then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role) => String(role).trim().toLowerCase()));
    const primaryRole = String(user.role || "").trim().toLowerCase();
    const restrictedRoles = /* @__PURE__ */ new Set(["client", "student", "pending"]);
    const isInternalUser = !restrictedRoles.has(primaryRole) && String(user.employment_status || "active").trim().toLowerCase() !== "terminated";
    const hasCadAccess = primaryRole === "admin" || primaryRole === "dispatch" || user.dispatch_role === true || roles.has("dispatch") || roles.has("cad_access") || roles.has("full_access");
    if (!isInternalUser && !hasCadAccess) return Response.json({ error: "Forbidden" }, { status: 403 });
    const lease = await acquireIngestionLease(base44, scheduledRun);
    if (!lease) {
      return Response.json({ success: true, skipped: true, reason: "GRAC synchronization already in progress" });
    }
    if (lease.skip) {
      return Response.json({
        success: true,
        skipped: true,
        reason: lease.reason,
        retry_after_ms: lease.retry_after_ms,source_health:lease.source_health||null
      });
    }
    try {
      const [websiteResult, apiResult] = await Promise.allSettled([
        fetchNonEmptySource(fetchLiveWebsiteCalls, "GRAC website"),
        fetchNonEmptySource(fetchLiveApiCalls, "GRAC API")
      ]);
      const websiteIncoming = websiteResult.status === "fulfilled" ? websiteResult.value : [];
      const apiIncoming = apiResult.status === "fulfilled" ? apiResult.value : [];
      const sourceObservedAt = (/* @__PURE__ */ new Date()).toISOString();
      console.info("CAD source poll", JSON.stringify({
        observed_at: sourceObservedAt,
        website_rows: websiteIncoming.length,
        api_rows: apiIncoming.length,
        website_error: websiteResult.status === "rejected" ? String(websiteResult.reason?.message || websiteResult.reason) : "",
        api_error: apiResult.status === "rejected" ? String(apiResult.reason?.message || apiResult.reason) : "",
        website_latest: websiteIncoming.reduce((v, row) => String(row.time_received || "") > v ? String(row.time_received) : v, ""),
        api_latest: apiIncoming.reduce((v, row) => String(row.time_received || "") > v ? String(row.time_received) : v, "")
      }));
      const latestWebsiteReceived = websiteIncoming.reduce((latest, call) => {
        const value = String(call?.time_received || "");
        return !latest || new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
      }, "");
      if (!websiteIncoming.length && !apiIncoming.length) {
        console.error("No GRAC live source available", {
          website: websiteResult.status === "rejected" ? websiteResult.reason?.message || String(websiteResult.reason) : "empty",
          api: apiResult.status === "rejected" ? apiResult.reason?.message || String(apiResult.reason) : "empty"
        });
        const websiteFailure = websiteResult.status === "rejected" ? websiteResult.reason?.message || String(websiteResult.reason) : "empty";
        const apiFailure = apiResult.status === "rejected" ? apiResult.reason?.message || String(apiResult.reason) : "empty";
        await recordSourcePoll(base44, lease, {
          last_source_poll_at: sourceObservedAt,
          last_source_poll_status: `failed:web=${websiteFailure};api=${apiFailure}`.slice(0, 240),
          last_website_row_count: 0,
          last_api_row_count: 0,
          last_source_poll_duration_ms: Date.now() - startedAt
        });
        return Response.json({ success: false, error: "No usable active calls; existing data preserved" }, { status: 502 });
      }
      let incoming = mergeLiveWebsiteAndApi(websiteIncoming, apiIncoming, websiteIncoming.cacheAgeSeconds || 0).map((call) => ({
        ...persistableCall(call),
        source_first_seen_at: call.source_first_seen_at || sourceObservedAt
      }));
      const snapshotPatch = {
        active_source_snapshot_at: sourceObservedAt,
        active_source_snapshot: incoming.map((call) => ({
          external_call_id: externalKey(call),
          agency: call.agency,
          incident: call.incident,
          location:call.location,
          status:call.status,
          time_received: call.time_received
        }))
      };
      const webAgencies=new Set(websiteIncoming.map(c=>String(c.agency||'').toUpperCase()));
      const confirmedAgencies=new Set(apiIncoming.map(c=>String(c.agency||'').toUpperCase()).filter(a=>webAgencies.has(a)));
      if (scheduledRun || body?.live_sync === true || body?.fast_sync === true) {
        const result = await ingestFastPublishedCalls(base44, incoming,confirmedAgencies);
        await recordSourcePoll(base44, lease, {
          ...snapshotPatch,
          last_source_poll_at: sourceObservedAt,
          last_source_poll_status: "success",
          last_source_success_at:sourceObservedAt,
          ...scheduledRun ? { last_server_poll_at: (/* @__PURE__ */ new Date()).toISOString(), last_server_poll_duration_ms: Date.now() - startedAt } : {},
          last_website_row_count: websiteIncoming.length,
          last_api_row_count: apiIncoming.length,
          ...latestWebsiteReceived ? { last_website_latest_received: latestWebsiteReceived } : {},
          last_source_poll_duration_ms: Date.now() - startedAt
        });
        return Response.json({ ...result, source_poll_at: sourceObservedAt, website_rows: websiteIncoming.length, api_rows: apiIncoming.length,latest_received:latestWebsiteReceived });
      }
      incoming = await geocodeFreshWebsiteOnlyCalls(incoming);
      incoming = await enrichOfficialIdentifiers(incoming);
      let existingCalls = await base44.asServiceRole.entities.DispatchCall.list("-created_date", 1e3);
      const incomingByLegacy = new Map(incoming.map((call) => [legacyKey(call), call]));
      const groups = /* @__PURE__ */ new Map();
      for (const record of existingCalls || []) {
        const key = ["richmond","henrico","chesterfield"].includes(String(record.source||"").toLowerCase()) ? (externalKey(record)||legacyKey(record)) : "";
        if (!key) continue;
        groups.set(key, [...groups.get(key) || [], record]);
      }
      let duplicatesRemoved = 0;
      for (const [key, records] of groups) {
        const canonical = chooseCanonical(records);
        const matchingIncoming = incomingByLegacy.get(legacyKey(canonical));
        const upstreamId = sameAgencyIdentity(canonical,matchingIncoming) ? (matchingIncoming?.external_call_id || externalKey(canonical)) : externalKey(canonical);
        if (upstreamId && canonical.external_call_id !== upstreamId) {
          await base44.asServiceRole.entities.DispatchCall.update(canonical.id, { external_call_id: upstreamId });
        }
        for (const duplicate of records) {
          if (duplicate.id === canonical.id) continue;
          if (await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, duplicate)) continue;
          await base44.asServiceRole.entities.DispatchCall.delete(duplicate.id).catch(() => null);
          duplicatesRemoved += 1;
        }
      }
      existingCalls = await base44.asServiceRole.entities.DispatchCall.list("-created_date", 1e3);
      const byExternal = /* @__PURE__ */ new Map();
      const byLegacy = /* @__PURE__ */ new Map();
      for (const record of existingCalls || []) {
        const external = externalKey(record);
        const legacy = legacyKey(record);
        if (external && !byExternal.has(external)) byExternal.set(external, record);
        if (legacy && !byLegacy.has(legacy)) byLegacy.set(legacy, record);
      }
      const archivedHistory = await base44.asServiceRole.entities.CallHistory.list("-archived_date", 2e3).catch(() => []);
      const archivedByExternal = new Set((archivedHistory || []).map((row) => externalKey(row)).filter(Boolean));
      const archivedByLegacy = new Set((archivedHistory || []).map((row) => legacyKey(row)).filter(Boolean));
      const [immediateLocations, immediateExistingAlerts] = await Promise.all([
        base44.asServiceRole.entities.Location.list("site_name", 1000),
        base44.asServiceRole.entities.PropertyAlert.list("-created_date", 1e3).catch(() => [])
      ]);
      const immediateMonitored = (immediateLocations || []).filter((location) => location.active !== false);
      const immediateCallPropertyKeys = new Set((immediateExistingAlerts || []).map(
        (alert) => `${String(alert?.propertyId || "")}|${String(alert?.callId || "")}`
      ));
      const immediateAlertKeys = new Set((immediateExistingAlerts || []).map((alert) => {
        if (alert?.source_key) return String(alert.source_key);
        return [
          String(alert?.propertyId || ""),
          String(alert?.callTime || alert?.time_received || alert?.created_date || ""),
          String(alert?.callIncident || "").trim().toUpperCase(),
          String(alert?.callLocation || "").trim().toUpperCase()
        ].join("|");
      }));
      const immediatePropertySideEffects = [];
      let immediatePropertyAlertsCreated = 0;
      const uniqueExisting = [...new Map(existingCalls.map((record) => [record.id, record])).values()];
      const needingCad = uniqueExisting.filter(
        (record) => recordKey(record) && !/^BPS-\d{6}-\d{1,8}$/i.test(String(record.bps_reference || ""))
      );
      const newCalls = incoming.filter(
        (call) => !matchAgencyRecord(call,byExternal,byLegacy) && !archivedByExternal.has(externalKey(call)) && !archivedByLegacy.has(legacyKey(call))
      );
      const cadNumbers = await reserveCadNumbers(base44, needingCad.length + newCalls.length);
      let cadIndex = 0;
      for (const record of needingCad) {
        const bpsReference = cadNumbers[cadIndex++];
        const officialCad = String(record.agency_cad_number || "").trim();
        const cleanDescription = String(record.description || "").replace(/\s*\[GRAC:[^\]]+\]\s*/gi, " ").replace(/\s*\[CAD:[^\]]+\]\s*/gi, " ").replace(/\s+/g, " ").trim();
        await base44.asServiceRole.entities.DispatchCall.update(record.id, {
          bps_reference: bpsReference,
          call_id: officialCad || bpsReference,
          cad_number_source: officialCad ? "official_government_feed" : "bps_internal",
          official_cad_verified: Boolean(officialCad),
          external_call_id: externalKey(record),
          description: cleanDescription
        });
      }
      let created = 0, updated = 0, removed = 0;
      for (const callData of incoming) {
        const incomingExternal = externalKey(callData);
        const incomingLegacy = legacyKey(callData);
        const existing = matchAgencyRecord(callData,byExternal,byLegacy);
        const alreadyArchived = archivedByExternal.has(incomingExternal) || archivedByLegacy.has(incomingLegacy);
        if (!existing && alreadyArchived) {
          continue;
        }
        if (!existing) {
          const bpsReference = cadNumbers[cadIndex++];
          const officialCad = String(callData.agency_cad_number || "").trim();
          const createdRecord = await base44.asServiceRole.entities.DispatchCall.create({
            ...persistableCall(callData),
            source_first_seen_at: callData.source_first_seen_at || (/* @__PURE__ */ new Date()).toISOString(),
            bps_reference: bpsReference,
            call_id: officialCad || bpsReference,
            cad_number_source: officialCad ? "official_government_feed" : "bps_internal",
            official_cad_verified: Boolean(officialCad),
            description: callData.description
          });
          created += 1;
          immediatePropertyAlertsCreated += await createImmediatePropertyAlerts(
            base44,
            createdRecord,
            immediateMonitored,
            immediateCallPropertyKeys,
            immediateAlertKeys,
            immediatePropertySideEffects
          );
        } else {
          const matchedOfficialCad = String(callData.agency_cad_number || "").trim();
          const existingAgency = String(existing.agency || callData.agency || "").toUpperCase();
          const existingCallId = String(existing.call_id || "").trim();
          const chesterfieldPublicId = existingAgency === "CCPD" && /^B\d+$/i.test(existingCallId) ? existingCallId : "";
          const savedOfficialCad = existing.official_cad_verified ? String(existing.agency_cad_number || "").trim() : chesterfieldPublicId;
          const officialCad = matchedOfficialCad || savedOfficialCad;
          const bpsReference = String(existing.bps_reference || "").trim();
          const manuallyCleared = existing.manual_dismissed === true;
          const upstreamTerminal = ["cleared", "cancelled", "canceled", "closed", "resolved", "completed"].includes(lower(callData.status));
          const assignedInPathfinder = upstreamTerminal && await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, existing);
          const incomingWithCad = {
            ...persistableCall(callData),
            ...existing.priority_override ? { priority: existing.priority } : {},
            source_first_seen_at: existing.source_first_seen_at || existing.created_date || callData.source_first_seen_at || (/* @__PURE__ */ new Date()).toISOString(),
            source_channel: callData.source_channel || existing.source_channel || "grac_api",
            // A Pathfinder manual clear is authoritative for this exact upstream call
            // ID. GRAC may continue publishing it, but ingestion must keep it dismissed.
            status: manuallyCleared ? "Cleared" : assignedInPathfinder ? existing.status : callData.status,
            manual_dismissed: manuallyCleared,
            ...manuallyCleared ? { manual_dismissed_at: existing.manual_dismissed_at || existing.time_cleared || (/* @__PURE__ */ new Date()).toISOString() } : {},
            agency_cad_number: officialCad,
            bps_reference: bpsReference,
            call_id: officialCad || bpsReference || existing.call_id,
            cad_number_source: officialCad ? "official_government_feed" : "bps_internal",
            official_cad_verified: Boolean(officialCad),
            description: callData.description,
            ...manuallyCleared ? { time_cleared: existing.time_cleared || existing.manual_dismissed_at || (/* @__PURE__ */ new Date()).toISOString() } : {}
          };
          if (changed(existing, incomingWithCad)) {
            const saved = await base44.asServiceRole.entities.DispatchCall.update(existing.id, incomingWithCad);
            await announceAssignedCallUpdate(base44, existing, { ...existing, ...incomingWithCad, ...saved }).catch((error) => console.error("Assigned call update announcement failed", error?.message));
            const updatedRecord = { ...existing, ...incomingWithCad, id: existing.id };
            updated += 1;
            immediatePropertyAlertsCreated += await createImmediatePropertyAlerts(
              base44,
              updatedRecord,
              immediateMonitored,
              immediateCallPropertyKeys,
              immediateAlertKeys,
              immediatePropertySideEffects
            );
          }
        }
      }
      const currentExternalKeys = new Set(incoming.map((call) => call.external_call_id));
      const currentLegacyKeys = new Set(incoming.map((call) => legacyKey(call)));
      for (const record of existingCalls || []) {
        if (!canCloseMissingAgencyCall(record,confirmedAgencies)||!isFreshLivePropertyCall(record)) continue;
        const external = externalKey(record);
        const legacy = legacyKey(record);
        if (recordKey(record) && !currentExternalKeys.has(external) && !currentLegacyKeys.has(legacy)) {
          if (await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, record)) continue;
          await base44.asServiceRole.entities.DispatchCall.update(record.id, {
            status: "Cleared",
            time_closed: record.time_closed || (/* @__PURE__ */ new Date()).toISOString()
          });
          await releaseClosedCall(base44.asServiceRole.entities, { ...record, status: "Cleared" });
          removed += 1;
        }
      }
      await Promise.allSettled(immediatePropertySideEffects);
      const finalCalls = await base44.asServiceRole.entities.DispatchCall.list("-created_date", 1e3);
      const finalGroups = /* @__PURE__ */ new Map();
      for (const record of finalCalls || []) {
        const key = ["richmond","henrico","chesterfield"].includes(String(record.source||"").toLowerCase()) ? (externalKey(record)||legacyKey(record)) : "";
        if (key) finalGroups.set(key, [...finalGroups.get(key) || [], record]);
      }
      for (const records of finalGroups.values()) {
        const canonical = chooseCanonical(records);
        for (const duplicate of records) {
          if (duplicate.id !== canonical.id) {
            if (await hasOutstandingOfficerAssignment(base44.asServiceRole.entities, duplicate)) continue;
            await base44.asServiceRole.entities.DispatchCall.delete(duplicate.id).catch(() => null);
            duplicatesRemoved += 1;
          }
        }
      }
      const reconciledPropertyAlertsCreated = await reconcilePropertyAlerts(base44).catch((error) => {
        console.error("Property alert reconciliation failed:", error);
        return 0;
      });
      const propertyAlertsCreated = immediatePropertyAlertsCreated + reconciledPropertyAlertsCreated;
      const phase2aSafety = await ensurePhase2ASafetyEvidence(base44).catch((error) => {
        console.error("Phase 2A shadow safety verification failed:", error);
        return { status: "failed", error: error?.message || String(error) };
      });
      await recordSourcePoll(base44, lease, {
        ...snapshotPatch,
        last_source_poll_at: sourceObservedAt,
        last_source_poll_status: "success:full_reconcile",
        last_source_success_at:sourceObservedAt,
        last_website_row_count: websiteIncoming.length,
        last_api_row_count: apiIncoming.length,
        ...latestWebsiteReceived ? { last_website_latest_received: latestWebsiteReceived } : {},
        last_source_poll_duration_ms: Date.now() - startedAt
      });
      return Response.json({ success: true, active: incoming.length, created, updated, removed, duplicates_removed: duplicatesRemoved, property_alerts_created: propertyAlertsCreated, phase_2a_safety: phase2aSafety, source_poll_at: sourceObservedAt, website_rows: websiteIncoming.length, api_rows: apiIncoming.length, synced_at: (/* @__PURE__ */ new Date()).toISOString(), duration_ms: Date.now() - startedAt });
    } catch(error){
      await recordSourcePoll(base44,lease,{last_source_poll_at:new Date().toISOString(),last_source_poll_status:("failed:ingestion:"+String(error?.message||error)).slice(0,240),last_source_poll_duration_ms:Date.now()-startedAt});
      throw error;
    } finally {
      await releaseIngestionLease(base44, lease).catch(error=>console.warn("GRAC lease release deferred",error?.message||error));
    }
  } catch (error) {
    console.error("GRAC ingestion failed:", error);
    return Response.json({ success: false, error: error?.message || "GRAC ingestion failed" }, { status: 500 });
  }
}
var entry_default = handleGracIngestion;

// <stdin>
Deno.serve(entry_default);
