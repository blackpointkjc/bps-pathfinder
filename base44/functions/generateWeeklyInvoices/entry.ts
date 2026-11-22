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

// base44/functions/generateWeeklyInvoices/graphDelivery.ts
async function sendManagementEmail(base44, to, subject, body, html = false) {
  return sendCompanyEmail({ to, subject, body, html, from: "management@blackpointkjc.com" });
}

// base44/functions/generateWeeklyInvoices/creditFreeEmail.ts
async function sendCreditFreeEmail(base44, payload) {
  const to = String(payload?.to || "").trim(), subject = String(payload?.subject || "").trim(), body = String(payload?.body || payload?.html || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !body) throw Error("Valid email recipient, subject and content are required.");
  return sendManagementEmail(base44, to, subject, body, /<[a-z][\s\S]*>/i.test(body));
}

// base44/functions/generateWeeklyInvoices/entry.ts
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
var MANAGEMENT_EMAIL = "management@blackpointkjc.com";
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var siteOf = (value) => String(value || "").split(/\s*(?::|\s-\s)\s*/)[0].trim();
var easternDate = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};
var dateOffset = (key, day) => {
  const d = /* @__PURE__ */ new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
};
var dollars = (n) => Math.round(n * 100) / 100;
var eligibleClient = (user) => (user?.additional_roles || []).some((role) => String(role).toLowerCase() === "client") || String(user?.user_type || "").toLowerCase() === "client" || String(user?.rank || "").toLowerCase() === "client";
var scheduleFor = (entry, schedules) => schedules.find((row) => row.archived !== true && String(row.officer_email || "").toLowerCase() === String(entry.officer_email || "").toLowerCase() && siteOf(row.location) === siteOf(entry.location) && String(row.shift_date || "").slice(0, 10) === easternDate(entry.clock_in));
var rateAtDate = (location, day) => {
  const rateHistory = (Array.isArray(location?.site_rate_history) ? location.site_rate_history : []).filter((item) => item.effective_date && Number(item.rate) > 0).sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)));
  const applicable = rateHistory.filter((item) => String(item.effective_date) <= day).at(-1);
  return {
    rate: Number(applicable?.rate || location?.site_bill_rate || 0),
    needsReview: rateHistory.length > 0 && !applicable,
    reason: rateHistory.length > 0 && !applicable ? `Historical billing rate is not recorded before ${rateHistory[0].effective_date}` : ""
  };
};
var hourlyRate = (entry, location, schedules) => {
  const shift = scheduleFor(entry, schedules);
  const type = String(shift?.shift_type || "normal").toLowerCase();
  const unarmed = /\bunarmed\b/i.test(`${shift?.site_details || ""} ${shift?.special_instructions || ""}`);
  const base = rateAtDate(location, easternDate(entry.clock_in));
  if (type === "holiday_coverage" || type === "rush_coverage" || unarmed) {
    const suffix = type === "holiday_coverage" ? "holiday" : type === "rush_coverage" ? "rush" : "standard";
    const field = type === "holiday_coverage" || type === "rush_coverage" ? `site_bill_rate_${suffix}_${unarmed ? "unarmed" : "armed"}` : "site_bill_rate_unarmed";
    const special = Number(location?.[field]) || base.rate;
    const changed = (Array.isArray(location?.site_rate_history) ? location.site_rate_history : []).some((item) => String(item.effective_date || "") > easternDate(entry.clock_in));
    return { rate: special, needsReview: base.needsReview || changed, reason: base.reason || (changed ? "Historical special/unarmed rate needs verification" : "") };
  }
  return base;
};
var hours = (entry) => {
  const start = Date.parse(entry.clock_in), end = Date.parse(entry.clock_out);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const breaks = (Array.isArray(entry.break_periods) ? entry.break_periods : []).reduce((sum, row) => {
    const a = Date.parse(row?.start), b = Date.parse(row?.end);
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? sum + Math.max(0, Math.min(b, end) - Math.max(a, start)) : sum;
  }, 0);
  return Math.max(0, (end - start - breaks) / 36e5);
};
var encode = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var isEmail = (email) => EMAIL.test(String(email || "").trim());
var resolveBillingRecipient = (location, users) => {
  const explicit = String(location?.billing_contact_email || "").trim().toLowerCase();
  if (isEmail(explicit)) return explicit;
  const site = siteOf(location?.site_name).toLowerCase();
  const assigned = String(location?.assigned_client_email || "").trim().toLowerCase();
  const clients = (users || []).filter(eligibleClient);
  const matched = clients.find((user) => String(user.email || "").trim().toLowerCase() === assigned) || clients.find((user) => [user.assigned_location, ...user.assigned_locations || [], ...user.assigned_sites || []].some((value) => siteOf(value).toLowerCase() === site));
  const email = String(matched?.email || "").trim().toLowerCase();
  return isEmail(email) ? email : "";
};
async function handleWeeklyBilling(req) {
  try {
    const base44 = createClientFromRequest(req);
    const jobInput = await req.clone().json().catch(() => ({}));
    const platformScheduledAdmin = jobInput.scheduled === true;
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (__portalCaller && !__portalCaller.is_service && !(__portalCaller.role === "admin" && platformScheduledAdmin) && !await __portalLoginIsCurrent(req, base44, __portalCaller)) return Response.json({ error: "Your Pathfinder session ended. Please sign in again.", code: "SESSION_REAUTH_REQUIRED" }, { status: 401 });
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
    const requestingUser = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (requestingUser && !(requestingUser.role === "admin" && platformScheduledAdmin) && String(requestingUser.id) !== "6ae7d733d4b1a647cd3e6f38") return Response.json({ error: "Accounting access required" }, { status: 403 });
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body?.action || "scheduled").toLowerCase();
    if (!["scheduled", "run_now", "backfill_drafts", "send_existing", "approve_historical_rate", "create_draft", "create_invoice", "send_ready_drafts"].includes(action)) return Response.json({ error: "Unsupported invoice operation" }, { status: 400 });
    const manual = action !== "scheduled" && !(platformScheduledAdmin && requestingUser?.role === "admin" && action === "send_ready_drafts");
    if (manual) {
      const caller = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
      const roles = new Set((caller?.additional_roles || []).map((role) => String(role).toLowerCase()));
      if (!caller || String(caller.id) !== "6ae7d733d4b1a647cd3e6f38") return Response.json({ error: "Accounting access required" }, { status: 403 });
    }
    const now = /* @__PURE__ */ new Date();
    const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (name) => eastern.find((item) => item.type === name)?.value || "";
    if (!manual && action === "scheduled" && (part("weekday") !== "Mon" || Number(part("hour")) !== 8)) return Response.json({ success: true, skipped: true, reason: "Automatic invoice generation runs Mondays at 8 AM Eastern" });
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    if (action === "approve_historical_rate") {
      const invoice = await base44.asServiceRole.entities.Invoice.get(String(body.invoice_id || "")).catch(() => null);
      if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
      if (String(invoice.status || "").toLowerCase() !== "draft") return Response.json({ error: "Only unsent draft invoices can be repriced" }, { status: 409 });
      const verifiedRate = Number(body.verified_rate);
      if (!Number.isFinite(verifiedRate) || verifiedRate <= 0 || verifiedRate > 1e4) return Response.json({ error: "A positive documented contract billing rate is required" }, { status: 400 });
      let details = [];
      try {
        details = JSON.parse(invoice.shifts || "[]");
      } catch {
      }
      if (!Array.isArray(details) || !details.length) return Response.json({ error: "Invoice has no itemized shifts to recalculate" }, { status: 409 });
      let total = 0;
      const revised = details.map((item) => {
        const originalRate = Number(item.rate || 0);
        const rawHours = originalRate > 0 ? Number(item.amount || 0) / originalRate : Number(item.hours || 0);
        const amount = dollars(rawHours * verifiedRate);
        total += amount;
        return { ...item, rate: verifiedRate.toFixed(2), amount: amount.toFixed(2) };
      });
      const actor = await base44.auth.me().then(__portalAppIdentity);
      const locations2 = await base44.asServiceRole.entities.Location.list("site_name", 2e3);
      const location = (locations2 || []).find((site) => siteOf(site.site_name).toLowerCase() === siteOf(invoice.site_name).toLowerCase());
      if (!location) return Response.json({ error: "Site missing: cannot apply approved rate to company billing records" }, { status: 409 });
      const priorHistory = Array.isArray(location.site_rate_history) ? location.site_rate_history : [];
      const effective = String(invoice.period_start);
      const conflicts = priorHistory.filter((row) => row.effective_date > effective && row.effective_date <= invoice.period_end);
      if (conflicts.length) return Response.json({ error: "The invoice crosses a contract rate change. Verify rates by shift rather than applying one flat rate to the entire period." }, { status: 409 });
      const history = priorHistory.filter((row) => row.effective_date !== effective);
      history.push({ effective_date: effective, rate: verifiedRate, changed_by: String(actor?.email || actor?.id || "accounting") });
      history.sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)));
      await base44.asServiceRole.entities.Location.update(location.id, { site_rate_history: history });
      const record = await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        shifts: JSON.stringify(revised),
        bill_rate: verifiedRate,
        total_amount: dollars(total),
        billing_review_required: false,
        billing_review_reason: "",
        delivery_status: "pending",
        billing_rate_verified_by: String(actor?.email || actor?.id || "accounting"),
        billing_rate_verified_at: (/* @__PURE__ */ new Date()).toISOString(),
        billing_rate_verified_value: verifiedRate,
        notes: `Accounting verified the historical bill rate at $${verifiedRate.toFixed(2)} per service hour; ${(/* @__PURE__ */ new Date()).toISOString()} by ${actor?.email || "accounting"}. Original invoice number preserved.`
      });
      return Response.json({ success: true, invoice_number: record.invoice_number, total_amount: record.total_amount, verified_rate: verifiedRate, invoice: record });
    }
    if (action === "send_existing") {
      const invoice = await base44.asServiceRole.entities.Invoice.get(String(body.invoice_id || "")).catch(() => null);
      if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
      if (invoice.status === "paid" || invoice.status === "sent" && invoice.delivery_status !== "failed") return Response.json({ error: "Invoice already sent or paid; duplicate email blocked." }, { status: 409 });
      if (invoice.billing_review_required === true) return Response.json({ error: `Historical rate must be reviewed before this invoice can be sent: ${invoice.billing_review_reason || "Unverified billing rate"}` }, { status: 409 });
      const locations2 = await base44.asServiceRole.entities.Location.list("site_name", 2e3);
      const location = (locations2 || []).find((row) => siteOf(row.site_name) === siteOf(invoice.site_name));
      const recipient = String(body.contact_email || resolveBillingRecipient(location, await base44.asServiceRole.entities.User.list(void 0, 2e3)) || "").trim().toLowerCase();
      if (!isEmail(recipient)) return Response.json({ error: "A verified billing contact email is required for this site. Save the client billing address before sending; management fallback is disabled." }, { status: 409 });
      const target = recipient;
      const subject = `Black Point Invoice ${invoice.invoice_number} \u2014 ${invoice.site_name} (${invoice.period_start}\u2013${invoice.period_end})`;
      let shifts = [];
      try {
        shifts = JSON.parse(invoice.shifts || "[]");
      } catch {
      }
      const rows = (Array.isArray(shifts) ? shifts : []).map((shift) => `<tr><td>${encode(shift.date)}</td><td>${encode(shift.hours)}</td><td>$${encode(shift.rate)}</td><td>$${encode(shift.amount)}</td></tr>`).join("");
      const bodyHtml = `<div style="font:14px Arial,sans-serif"><h2 style="background:#101d32;color:#e7c16e;padding:18px">BLACK POINT SECURITY \u2014 INVOICE ${encode(invoice.invoice_number)}</h2><p>Service: ${encode(invoice.site_name)}<br>Dates: ${encode(invoice.period_start)} \u2013 ${encode(invoice.period_end)}<br>Due: ${encode(invoice.due_date)}</p><table cellspacing="6"><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>${rows}</table><h2>Amount due: $${Number(invoice.total_amount || 0).toFixed(2)}</h2><p>Unpaid invoices may be assessed one one-time 10% late fee after the due date, subject to the applicable client agreement.</p><p>Black Point Protection \xB7 management@blackpointkjc.com</p></div>`;
      try {
        await sendCreditFreeEmail(base44, { to: target, subject, body: bodyHtml });
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { client_email: target, delivery_email: target, delivery_status: "accepted", delivery_error: "", sent_at: (/* @__PURE__ */ new Date()).toISOString(), status: "sent" });
        const portalClients = await base44.asServiceRole.entities.User.list("last_name", 1e3).catch(() => []);
        const matched = (portalClients || []).filter((u) => eligibleClient(u) && (String(u.email || "").toLowerCase() === target || String(location?.assigned_client_email || "").toLowerCase() === String(u.email || "").toLowerCase() || [u.assigned_location, ...u.assigned_locations || [], ...u.assigned_sites || []].some((value) => siteOf(value).toLowerCase() === siteOf(invoice.site_name).toLowerCase())));
        for (const client of matched.slice(0, 20)) await base44.asServiceRole.entities.Notification.create({ recipient_email: String(client.email).toLowerCase(), type: "invoice_due", title: `Invoice #${invoice.invoice_number} is due`, message: `${invoice.site_name} \xB7 $${Number(invoice.total_amount || 0).toFixed(2)} \xB7 Due ${invoice.due_date}. View in Client Center.`, related_id: String(invoice.id), is_read: false, priority: "normal", action_link: "/ClientPayrollReport" }).catch(() => null);
        return Response.json({ success: true, invoice_number: invoice.invoice_number, sent: 1, recipient: target });
      } catch (error) {
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { delivery_email: target, delivery_status: "failed", delivery_error: String(error?.message || "Mail provider failed") }).catch(() => null);
        return Response.json({ error: `Invoice email was not accepted: ${String(error?.message || "Mail provider failed")}` }, { status: 502 });
      }
    }
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
    const sinceLastSaturday = (weekday + 1) % 7 || 7;
    const lastSaturday = dateOffset(today, -sinceLastSaturday);
    const startDefault = dateOffset(lastSaturday, -6);
    if (["create_draft", "create_invoice"].includes(action) && !body.location_id) return Response.json({ error: "Choose a billing site before saving an invoice" }, { status: 400 });
    const periodStart = action === "backfill_drafts" ? startDefault : body.period_start || startDefault;
    const periodEnd = action === "backfill_drafts" ? lastSaturday : body.period_end || lastSaturday;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart || periodEnd >= today) return Response.json({ error: "Invoice periods must be completed dates in YYYY-MM-DD format" }, { status: 400 });
    const all = async (entity, query = {}) => {
      const rows = [];
      for (let skip = 0; ; skip += 500) {
        const page = await entity.filter(query, "id", 500, skip);
        rows.push(...page);
        if (page.length < 500) return rows;
      }
    };
    const [entries, locations, users, invoices, schedules] = action === "send_ready_drafts" ? [[], await all(base44.asServiceRole.entities.Location), await all(base44.asServiceRole.entities.User), await all(base44.asServiceRole.entities.Invoice), []] : await Promise.all([
      all(base44.asServiceRole.entities.TimeEntry, { clock_in: { $gte: dateOffset(action === "backfill_drafts" ? dateOffset(lastSaturday, -7 * 16) : periodStart, -1) + "T00:00:00Z" } }),
      all(base44.asServiceRole.entities.Location),
      all(base44.asServiceRole.entities.User),
      all(base44.asServiceRole.entities.Invoice),
      all(base44.asServiceRole.entities.Schedule, { shift_date: { $gte: dateOffset(action === "backfill_drafts" ? dateOffset(lastSaturday, -7 * 16) : periodStart, -1) } })
    ]);
    const issueVerifiedDrafts = async () => {
      let sent2 = 0, held2 = 0, failed = 0, updated2 = 0;
      let providerCooldown = false;
      const results2 = [];
      const siteMap = new Map((locations || []).map((row) => [siteOf(row.site_name).toLowerCase(), row]));
      const active = (invoices || []).filter((row) => !["void", "cancelled"].includes(String(row.status || "").toLowerCase()));
      for (const invoice of active.filter((row) => String(row.status || "").toLowerCase() === "draft").sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)))) {
        const fixedDue = /^\d{4}-\d{2}-\d{2}$/.test(String(invoice.period_end || "")) ? dateOffset(String(invoice.period_end), 15) : "";
        if (!fixedDue) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "invalid_period_end", error: "Invoice is missing a valid period end date" });
          continue;
        }
        if (invoice.due_date !== fixedDue) {
          await base44.asServiceRole.entities.Invoice.update(invoice.id, { due_date: fixedDue });
          updated2++;
        }
        if (providerCooldown) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "email_provider_cooldown", error: "Email provider limit reached earlier in this run; not attempted" });
          continue;
        }
        if (invoice.billing_review_required === true || String(invoice.delivery_status || "").toLowerCase() === "review_required") {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "rate_review_required", error: "Historical billing rate requires verification" });
          continue;
        }
        let items = [];
        try {
          items = JSON.parse(invoice.shifts || "[]");
        } catch {
        }
        if (!Array.isArray(items) || !items.length || items.some((row) => !(Number(row.rate) > 0)) || !(Number(invoice.total_amount) > 0) || String(invoice.period_end || "") >= today) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "invalid_lines_or_open_period", error: "Invalid invoice lines or service period not yet closed" });
          continue;
        }
        const duplicates = active.filter((other) => other.id !== invoice.id && siteOf(other.site_name).toLowerCase() === siteOf(invoice.site_name).toLowerCase() && other.period_start <= invoice.period_end && other.period_end >= invoice.period_start);
        const issued = duplicates.filter((row) => ["sent", "paid", "overdue", "partial", "pending"].includes(String(row.status || "").toLowerCase()));
        const lineDay = (line) => {
          const raw = String(line?.date || "");
          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
          const d = new Date(raw);
          return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "";
        };
        const lineKey = (line) => [lineDay(line), Number(line?.hours || 0).toFixed(2), String(line?.officer || "").trim().split(/\s+/).at(-1)?.toLowerCase() || ""].join("|");
        const billedKeys = /* @__PURE__ */ new Set();
        for (const old of issued) {
          try {
            const lines2 = JSON.parse(old.shifts || "[]");
            if (Array.isArray(lines2)) for (const row of lines2) billedKeys.add(lineKey(row));
          } catch {
          }
        }
        const remaining = items.filter((row) => !billedKeys.has(lineKey(row)));
        if (issued.length && remaining.length < items.length) {
          const before = { period_start: invoice.period_start, period_end: invoice.period_end, shifts: invoice.shifts, total_amount: invoice.total_amount, status: invoice.status };
          let history = [];
          try {
            history = JSON.parse(invoice.revision_history || "[]");
            if (!Array.isArray(history)) history = [];
          } catch {
          }
          if (!remaining.length) {
            await base44.asServiceRole.entities.Invoice.update(invoice.id, { status: "void", delivery_status: "duplicate_reconciled", notes: [invoice.notes, `Superseded: all recorded shifts already included in issued invoice(s) ${issued.map((row) => "#" + row.invoice_number).join(", ")}.`].filter(Boolean).join(" "), revision_history: JSON.stringify([...history, { when: (/* @__PURE__ */ new Date()).toISOString(), reason: "Voided duplicate unsent draft after exact shift matching", prior: before }].slice(-50)) });
            updated2++;
            results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "duplicate_reconciled", error: "Duplicate unsent draft voided; work already appears on an issued invoice." });
            continue;
          }
          const dates = remaining.map(lineDay);
          const newStart = dates.every(Boolean) ? dates.slice().sort()[0] : "";
          const newEnd = dates.every(Boolean) ? dates.slice().sort().at(-1) : "";
          const stillOverlaps = issued.some((old) => newStart <= old.period_end && newEnd >= old.period_start);
          if (newStart && newEnd && !stillOverlaps && remaining.every((row) => Number.isFinite(Number(row.amount)))) {
            const total2 = remaining.reduce((sum, row) => sum + Number(row.amount), 0);
            const countHours = remaining.reduce((sum, row) => sum + Number(row.hours || 0), 0);
            await base44.asServiceRole.entities.Invoice.update(invoice.id, { period_start: newStart, period_end: newEnd, due_date: dateOffset(newEnd, 15), shifts: JSON.stringify(remaining), total_hours: dollars(countHours), total_amount: dollars(total2), base_amount: dollars(total2), delivery_status: "pending", notes: [invoice.notes, "Reconciled against issued invoice shifts; duplicate work excluded."].filter(Boolean).join(" "), revision_history: JSON.stringify([...history, { when: (/* @__PURE__ */ new Date()).toISOString(), reason: "Trimmed duplicate work and narrowed draft to unbilled shifts", prior: before }].slice(-50)) });
            updated2++;
            results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "draft_reconciled", error: `Draft updated to unbilled shifts (${newStart}\u2013${newEnd}); review before sending.` });
            continue;
          }
        }
        if (duplicates.some((other) => String(other.status || "").toLowerCase() !== "draft" || String(other.invoice_number || "") < String(invoice.invoice_number || ""))) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "overlapping_invoice", error: `Overlaps invoice(s) ${duplicates.map((row) => "#" + row.invoice_number).join(", ")}; unbilled shifts or differing records require reconciliation.`, overlaps: duplicates.map((row) => row.invoice_number) });
          continue;
        }
        const loc = siteMap.get(siteOf(invoice.site_name).toLowerCase());
        if (!loc) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "unknown_site", error: "Billing site no longer exists; review before sending" });
          continue;
        }
        const recipient = resolveBillingRecipient(loc, users || []);
        if (!isEmail(recipient)) {
          held2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "missing_billing_contact", error: "Client billing email is not configured. Email not attempted." });
          continue;
        }
        const target = recipient;
        const lines = items.map((row) => `<tr><td>${encode(row.date)}</td><td>${encode(row.hours)}</td><td>$${encode(row.rate)}</td><td>$${encode(row.amount)}</td></tr>`).join("");
        const total = Number(invoice.total_amount || 0);
        try {
          await sendCreditFreeEmail(base44, {
            to: target,
            subject: `Black Point Invoice ${encode(invoice.invoice_number)} \u2014 ${encode(invoice.site_name)}`,
            body: `<div style="font:14px Arial,sans-serif"><h2>BLACK POINT \u2014 INVOICE ${encode(invoice.invoice_number)}</h2><p>Property: ${encode(invoice.site_name)}<br>Service: ${encode(invoice.period_start)} through ${encode(invoice.period_end)}<br><b>Due ${fixedDue}</b></p><table><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>${lines}</table><h2>$${total.toFixed(2)}</h2><p>One-time 10% late charge may apply after the due date under your service agreement.</p></div>`
          });
          await base44.asServiceRole.entities.Invoice.update(invoice.id, { status: "sent", delivery_email: target, client_email: target, delivery_status: "accepted", delivery_error: "", due_date: fixedDue, sent_at: (/* @__PURE__ */ new Date()).toISOString() });
          sent2++;
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "sent", recipient: target });
          const clientsForSite = (users || []).filter((u) => eligibleClient(u) && (String(u.email || "").toLowerCase() === target || String(loc?.assigned_client_email || "").toLowerCase() === String(u.email || "").toLowerCase() || [u.assigned_location, ...u.assigned_locations || [], ...u.assigned_sites || []].some((x) => siteOf(x).toLowerCase() === siteOf(invoice.site_name).toLowerCase())));
          for (const u of clientsForSite.slice(0, 20)) await base44.asServiceRole.entities.Notification.create({ recipient_email: String(u.email).toLowerCase(), type: "invoice_due", title: `Invoice ${invoice.invoice_number} issued`, message: `${invoice.site_name}: $${total.toFixed(2)}, due ${fixedDue}. View in Client Center.`, related_id: String(invoice.id), is_read: false, priority: "normal", action_link: "/ClientPayrollReport" }).catch(() => null);
        } catch (error) {
          const message = String(error?.message || "Mail service failed");
          failed++;
          await base44.asServiceRole.entities.Invoice.update(invoice.id, { delivery_status: "failed", delivery_error: message }).catch(() => null);
          results2.push({ invoice: invoice.invoice_number, site: invoice.site_name, status: "failed", error: message });
          if (/hourly limit|daily email limit|rate.limit|too many (requests|emails)|quota|cooldown/i.test(message)) {
            providerCooldown = true;
          }
        }
      }
      return { success: failed === 0, sent: sent2, held: held2, failed, due_dates_updated: updated2, email_provider_cooldown: providerCooldown, results: results2 };
    };
    if (action === "send_ready_drafts") return Response.json(await issueVerifiedDrafts());
    const clients = (users || []).filter(eligibleClient);
    const byEmail = new Map(clients.map((client) => [String(client.email || "").toLowerCase(), client]));
    const byOfficer = new Map((users || []).map((person) => [String(person.email || "").toLowerCase(), person]));
    const existingByKey = /* @__PURE__ */ new Map();
    for (const invoice of invoices || []) {
      if (["void", "cancelled"].includes(String(invoice.status || "").toLowerCase())) continue;
      const key = `${siteOf(invoice.site_name).toLowerCase()}|${invoice.period_start}|${invoice.period_end}`;
      const current = existingByKey.get(key);
      const priority = (row) => String(row.status || "").toLowerCase() === "paid" ? 3 : String(row.status || "").toLowerCase() === "sent" ? 2 : 1;
      if (!current || priority(invoice) > priority(current) || priority(invoice) === priority(current) && String(invoice.invoice_number || "") < String(current.invoice_number || "")) existingByKey.set(key, invoice);
    }
    const prefix = today.slice(2, 4);
    let sequence = Math.max(0, ...(invoices || []).map((invoice) => String(invoice.invoice_number || "")).filter((number) => number.startsWith(prefix)).map((number) => Number(number.slice(2)) || 0));
    let created = 0, updated = 0, sent = 0, deliveryFailed = 0, skipped = 0, held = 0, processingFailed = 0;
    const results = [];
    const selected = body.location_id ? (locations || []).filter((row) => row.id === body.location_id) : locations || [];
    for (const location of selected) {
      try {
        if (!location?.site_name || !(Number(location.site_bill_rate) > 0)) {
          skipped++;
          continue;
        }
        const name = siteOf(location.site_name);
        const keys = action === "backfill_drafts" ? Array.from({ length: 16 }, (_, i) => {
          const end = dateOffset(lastSaturday, -7 * i);
          return [dateOffset(end, -6), end];
        }) : [[periodStart, periodEnd]];
        for (const [start, end] of keys) {
          const key = `${name.toLowerCase()}|${start}|${end}`;
          const existingInvoice = existingByKey.get(key);
          if (existingInvoice && (["paid", "partial", "pending", "overdue", "void", "cancelled"].includes(String(existingInvoice.status || "").toLowerCase()) || action === "backfill_drafts" && existingInvoice.status === "sent")) {
            skipped++;
            continue;
          }
          const rows = (entries || []).filter((entry) => entry.clock_in && entry.clock_out && entry.archived !== true && siteOf(entry.location).toLowerCase() === name.toLowerCase() && easternDate(entry.clock_in) >= start && easternDate(entry.clock_in) <= end);
          const overlapping = (invoices || []).filter((old) => String(old.id) !== String(existingInvoice?.id || "") && siteOf(old.site_name).toLowerCase() === name.toLowerCase() && old.period_start <= end && old.period_end >= start && !["void", "cancelled"].includes(String(old.status || "").toLowerCase()));
          if (overlapping.length) {
            const issued = overlapping.filter((old) => old.status === "paid" || old.delivery_status === "accepted" || !!old.sent_at);
            const day = (v) => {
              const raw = String(v || "");
              if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
              const parsed = new Date(raw);
              return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed) : "";
            };
            const oldLines = issued.flatMap((old) => {
              try {
                return JSON.parse(old.shifts || "[]");
              } catch {
                return [];
              }
            });
            const covered = rows.length > 0 && rows.every((entry) => {
              const person = byOfficer.get(String(entry.officer_email || "").toLowerCase());
              const last = String(person?.last_name || "").toLowerCase();
              return oldLines.some((line) => day(line.date) === easternDate(entry.clock_in) && String(line.officer || "").trim().split(/\s+/).at(-1)?.toLowerCase() === last && Math.abs(Number(line.hours) - hours(entry)) < 0.025);
            });
            if (covered || !rows.length) {
              skipped++;
              results.push({ site: name, status: "already_billed", invoice_number: issued[0]?.invoice_number || overlapping[0].invoice_number, period_start: start, period_end: end });
              continue;
            }
            held++;
            results.push({ site: name, status: "overlap_requires_review", invoice_number: overlapping[0].invoice_number, reason: "Some work is not matched to an existing invoice. Review the unmatched shifts before issuing additional charges." });
            continue;
          }
          if (!rows.length) {
            skipped++;
            continue;
          }
          let totalHours = 0, total = 0;
          const reviewReasons = /* @__PURE__ */ new Set();
          const shifts = rows.map((entry) => {
            const h = hours(entry);
            const approved = Number(existingInvoice?.billing_rate_verified_value || 0);
            const rateResult = approved > 0 && existingInvoice?.billing_rate_verified_at ? { rate: approved, needsReview: false, reason: "" } : hourlyRate(entry, location, schedules || []);
            const rate = rateResult.rate;
            if (rateResult.needsReview) reviewReasons.add(rateResult.reason || "Review historical billing rate");
            totalHours += h;
            total += h * rate;
            const officer = byOfficer.get(String(entry.officer_email || "").toLowerCase());
            return { date: easternDate(entry.clock_in), officer: officer ? `${officer.rank || ""} ${officer.last_name || ""}`.trim() : "Officer", clockIn: entry.clock_in, clockOut: entry.clock_out, hours: h.toFixed(2), rate: rate.toFixed(2), amount: dollars(h * rate).toFixed(2) };
          });
          if (totalHours <= 0 || total <= 0) {
            skipped++;
            continue;
          }
          const assigned = String(location.assigned_client_email || "").toLowerCase();
          const client = byEmail.get(assigned);
          const matchedClient = client || clients.find((item) => (item.assigned_locations || []).map(siteOf).includes(name) || (item.assigned_sites || []).map(siteOf).includes(name) || siteOf(item.assigned_location) === name);
          const provided = String(body.contact_email || location.billing_contact_email || matchedClient?.email || "").trim().toLowerCase();
          const target = isEmail(provided) ? provided : "";
          const reason = !target ? "Client billing contact is missing. Invoice held for recipient verification." : "";
          if (!existingInvoice) sequence++;
          const number = existingInvoice?.invoice_number || `${prefix}${String(sequence).padStart(3, "0")}`;
          const needsReview = reviewReasons.size > 0;
          const reviewReason = [...reviewReasons].join("; ");
          const invoiceData = { invoice_number: number, client_email: target, delivery_email: target, site_name: name, time_zone: location.time_zone || "America/New_York", period_start: start, period_end: end, total_hours: dollars(totalHours), bill_rate: totalHours > 0 ? dollars(total / totalHours) : Number(location.site_bill_rate), total_amount: dollars(total), base_amount: dollars(total), late_fee_amount: 0, late_fee_rate: 0.1, shifts: JSON.stringify(shifts), due_date: dateOffset(end, 15), status: existingInvoice?.status === "sent" ? "sent" : "draft", delivery_status: needsReview ? "review_required" : existingInvoice?.delivery_status || "pending", billing_review_required: needsReview, billing_review_reason: reviewReason, notes: [reason, reviewReason, "Generated from recorded work hours and effective-date rates."].filter(Boolean).join(" ") };
          const oldShifts = String(existingInvoice?.shifts || "");
          const unchanged = Boolean(existingInvoice && dollars(Number(existingInvoice.total_amount || 0)) === dollars(total) && Number(existingInvoice.total_hours || 0).toFixed(2) === totalHours.toFixed(2) && oldShifts === invoiceData.shifts);
          if (unchanged && existingInvoice?.delivery_status === "accepted") {
            if (existingInvoice.due_date !== invoiceData.due_date) await base44.asServiceRole.entities.Invoice.update(existingInvoice.id, { due_date: invoiceData.due_date });
            skipped++;
            continue;
          }
          if (existingInvoice?.status === "sent" && !existingInvoice?.sent_at && !existingInvoice?.delivery_status) {
            held++;
            results.push({ site: name, status: "legacy_delivery_unconfirmed", invoice_number: number });
            continue;
          }
          const before = existingInvoice ? { total_amount: existingInvoice.total_amount, total_hours: existingInvoice.total_hours, shifts: existingInvoice.shifts, status: existingInvoice.status, updated_at: existingInvoice.updated_date } : null;
          const revision = Number(existingInvoice?.revision || 1) + (existingInvoice && !unchanged ? 1 : 0);
          let priorRevisions = [];
          try {
            const prior = typeof existingInvoice?.revision_history === "string" ? JSON.parse(existingInvoice.revision_history) : existingInvoice?.revision_history || [];
            priorRevisions = Array.isArray(prior) ? prior : [];
          } catch {
            priorRevisions = [];
          }
          const audit = existingInvoice && !unchanged ? JSON.stringify([...priorRevisions, { when: (/* @__PURE__ */ new Date()).toISOString(), reason: "Recalculated using current service records and effective historical rates", prior: before }].slice(-50)) : existingInvoice?.revision_history;
          const invoice = existingInvoice ? await base44.asServiceRole.entities.Invoice.update(existingInvoice.id, { ...invoiceData, revision, revision_history: audit || "" }) : await base44.asServiceRole.entities.Invoice.create({ ...invoiceData, revision: 1 });
          if (existingInvoice) updated++;
          else created++;
          existingByKey.set(key, invoice);
          if (action === "backfill_drafts" || action === "create_draft" || needsReview || !target) {
            if (!target) held++;
            results.push({ invoice_number: number, site: name, period_start: start, period_end: end, amount: dollars(total), status: !target ? "missing_billing_contact" : needsReview ? "review_required" : "draft", recipient: target, reason: reason || reviewReason });
            continue;
          }
          const detail = shifts.map((shift) => `<tr><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.date)}</td><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.hours)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.rate)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.amount)}</td></tr>`).join("");
          const emailBody = `<div style="font:14px Arial,sans-serif;max-width:640px;color:#18263a"><div style="background:#0d1b2c;color:#e3bf70;padding:20px;font-size:20px;font-weight:bold">BLACK POINT SECURITY \u2014 INVOICE ${encode(number)}</div><p><b>Service location:</b> ${encode(name)}<br/><b>Service period:</b> ${encode(start)} through ${encode(end)}<br/><b>Due:</b> ${encode(invoiceData.due_date)}</p><table width="100%" cellspacing="0"><thead><tr><th align="left">Date</th><th align="left">Hours</th><th align="left">Rate</th><th align="left">Amount</th></tr></thead><tbody>${detail}</tbody></table><h2>Total due: $${invoiceData.total_amount.toFixed(2)}</h2><p>${reason || "Thank you for your business."}</p><p>Unpaid invoices may be assessed one one-time 10% late fee after the due date, subject to the applicable client agreement.</p><p>Black Point Protection \xB7 management@blackpointkjc.com</p></div>`;
          try {
            await sendCreditFreeEmail(base44, { to: target, subject: `Black Point ${existingInvoice ? "Revised " : ""}Invoice ${number} \u2014 ${name} (${start}\u2013${end})`, body: emailBody });
            await base44.asServiceRole.entities.Invoice.update(invoice.id, { status: "sent", delivery_status: "accepted", delivery_email: target, sent_at: (/* @__PURE__ */ new Date()).toISOString() });
            sent++;
            results.push({ invoice_number: number, site: name, status: "sent", recipient: target });
            const clientTargets = (users || []).filter((row) => eligibleClient(row) && (String(row.email || "").toLowerCase() === target || String(location.assigned_client_email || "").toLowerCase() === String(row.email || "").toLowerCase() || [row.assigned_location, ...row.assigned_locations || [], ...row.assigned_sites || []].some((place) => siteOf(place).toLowerCase() === name.toLowerCase())));
            for (const clientUser of clientTargets.slice(0, 20)) {
              await base44.asServiceRole.entities.Notification.create({ recipient_email: String(clientUser.email).toLowerCase(), type: "invoice_due", title: `Black Point Invoice #${number}`, message: `${name} \xB7 ${start}\u2013${end} \xB7 $${dollars(total).toFixed(2)} due ${invoiceData.due_date}. Open Client Center > Billing & Invoices.`, related_id: String(invoice.id), priority: "normal", is_read: false, action_link: "/ClientPayrollReport" }).catch((error) => console.error("Client invoice alert failed", error?.message));
            }
          } catch (error) {
            const message = String(error?.message || "Delivery provider error");
            await base44.asServiceRole.entities.Invoice.update(invoice.id, { status: existingInvoice?.status === "sent" ? "sent" : "draft", delivery_status: "failed", delivery_error: message }).catch(() => null);
            deliveryFailed++;
            results.push({ invoice_number: number, site: name, status: "delivery_failed", recipient: target, error: message });
            console.error("Automated invoice email failed", number, message);
          }
        }
      } catch (siteError) {
        processingFailed++;
        const detail = String(siteError?.message || "Unable to process site invoice");
        console.error("Invoice generator failed for site", String(location?.site_name || ""), detail);
        results.push({ site: String(location?.site_name || "Unknown"), status: "processing_failed", error: detail });
      }
    }
    const runSummary = { period_start: periodStart, period_end: periodEnd, created, updated, sent, delivery_failed: deliveryFailed, processing_failed: processingFailed, skipped, held, results, recipient_fallback: MANAGEMENT_EMAIL };
    if (!manual) runSummary.historical_backlog = await issueVerifiedDrafts();
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: "Invoice",
        entity_id: "weekly-billing",
        action: "create",
        actor_id: manual ? "accounting" : "automation",
        actor_name: manual ? "Accounting" : "Monday Billing Scheduler",
        before_value: "",
        after_value: JSON.stringify(runSummary),
        description: `${manual ? "Manual" : "Scheduled Monday"} invoice run: ${created} new, ${updated} revised, ${sent} email provider accepted, ${deliveryFailed} email failed, ${processingFailed} sites failed, ${held} overlap held`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      console.warn("Billing run audit could not be recorded", String(error?.message || error));
    }
    return Response.json({ success: processingFailed === 0 && deliveryFailed === 0, ...runSummary });
  } catch (error) {
    const message = String(error?.message || "Unable to generate invoices");
    const throttled = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests|\b429\b/i.test(message);
    console.error("generateWeeklyInvoices failed", message);
    return Response.json({ error: throttled ? "Base44 request allowance temporarily exhausted. Historical invoice sending was stopped; retry after API traffic recovers." : message, rate_limited: throttled, retry_after_seconds: throttled ? 60 : void 0 }, { status: throttled ? 429 : 500 });
  }
}
var entry_default = handleWeeklyBilling;

// <stdin>
Deno.serve(entry_default);
