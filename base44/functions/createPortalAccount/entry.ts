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

// base44/functions/createPortalAccount/graphDelivery.ts
async function sendManagementEmail(base44, to, subject, body, html = false) {
  return sendCompanyEmail({ to, subject, body, html, from: "management@blackpointkjc.com" });
}

// base44/functions/createPortalAccount/delivery.ts
async function companyDelivery(base44, to, subject, body, actor = null, html = false) {
  return sendManagementEmail(base44, to, subject, body, html);
}

// base44/functions/createPortalAccount/entry.ts
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
var URL = "https://bpspf.blackpointkjc.com/Login?mode=register";
var esc = (v) => String(v || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req), me = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!me?.id || me.disabled || me.termination_date) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!await __portalLoginIsCurrent(req, base44, me)) return Response.json({ error: "Your Pathfinder session ended. Please sign in again.", code: "SESSION_REAUTH_REQUIRED" }, { status: 401 });
    const b = await req.json(), roles = new Set(me.additional_roles || []), admin = me.role === "admin" || roles.has("full_access");
    const type = { pending: "employee", student_pending: "student", employee: "employee", student: "student", client: "client", visitor: "visitor" }[b.accountType];
    if (!type || !admin && !(type === "student" && roles.has("trainer")) && !(type === "employee" && roles.has("hr"))) return Response.json({ error: "Account creation is not permitted" }, { status: 403 });
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !String(b.first_name || "").trim() || !String(b.last_name || "").trim()) return Response.json({ error: "First name, last name and a valid email are required" }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const people = await db.User.filter({ email }, "-created_date", 1);
    let person = people[0];
    if (person && (person.role === "admin" || person.additional_roles?.length)) return Response.json({ success: true, existing_account: true, provisioned: true, status: "existing_account", user_id: admin ? person.id : null, message: "This email already has a Pathfinder account. Manage the existing profile; no duplicate account was created." });
    const profile = {};
    for (const key of ["first_name", "last_name", "mobile_phone", "date_of_birth", "assigned_location", "rank", "division", "hire_date", "dcjs_number"]) if (b[key]) profile[key] = String(b[key]).trim().slice(0, 250);
    const rows = await db.PortalInvitation.filter({ email }, "-created_date", 1);
    const payload = { email, account_type: type, profile, invited_by: me.email, status: "invited", email_sent: false };
    const record = rows[0] ? await db.PortalInvitation.update(rows[0].id, payload) : await db.PortalInvitation.create(payload);
    if (person) await db.User.update(person.id, { first_name: profile.first_name, last_name: profile.last_name, rank: type === "student" ? "Student Registration Pending" : type === "visitor" ? "Visitor Pending" : "Pending Assignment" });
    let providerSent = false, providerError = "";
    {
      try {
        let sent;
        try {
          sent = await base44.users.inviteUser(email, "user");
        } catch (error) {
          if (typeof base44.auth.inviteUser !== "function") throw error;
          sent = await base44.auth.inviteUser(email, "user");
        }
        if (sent?.error || sent?.success === false) throw new Error("Native invitation rejected.");
        providerSent = true;
        if (!person) person = (await db.User.filter({ email }, "-created_date", 1))[0];
        if (person && person.role !== "admin") await db.User.update(person.id, { ...profile, additional_roles: [], ps_role: "none", requested_account_type: type, portal_approved: false, account_status: "pending", rank: type === "student" ? "Student Registration Pending" : type === "visitor" ? "Visitor Pending" : "Pending Assignment" });
      } catch (error) {
        providerError = "Account invitation provider: " + String(error?.data?.detail || error?.response?.data?.detail || error?.message || "delivery rejected").slice(0, 240);
      }
    }
    let branded = false;
    if (!providerSent) try {
      const subject = "Black Point \u2014 Create your Pathfinder account";
      const message = '<div style="background:#080808;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#eee8d8"><table role="presentation" style="max-width:600px;margin:auto;border:1px solid #b99a43;border-radius:16px;background:#141410" cellpadding="28"><tr><td><div style="font-size:28px;font-weight:bold;color:#fff">BLACK<span style="color:#e7c75c">POINT</span></div><p style="color:#bda75e;font-size:11px;letter-spacing:3px">PATHFINDER ACCOUNT ACCESS</p><h1 style="color:#fff;font-size:27px">Your invitation is ready.</h1><p>Hello ' + esc(profile.first_name) + ",</p><p>You have been invited to create your BlackPoint " + esc(type) + ' account.</p><p>Use the same email address that received this invitation. Create your own password, verify your email, and complete your profile. Your workspace remains pending until authorized staff approve access.</p><p style="margin:28px 0"><a style="background:#e8c85c;color:#111;padding:14px 24px;border-radius:25px;text-decoration:none;font-weight:bold;display:inline-block" href="' + URL + "&amp;email=" + encodeURIComponent(email) + "&amp;type=" + encodeURIComponent(type) + '">Create your Pathfinder account</a></p><p style="font-size:12px;color:#aaa28c">Never share your password. BlackPoint staff will not ask you to send it by email.</p><hr style="border:0;border-top:1px solid #5d512f"><p style="font-size:12px;color:#aaa28c">KJC Security Solution LLC \xB7 BlackPoint<br>Present. Prepared. Professional.</p></td></tr></table></div>';
      await companyDelivery(base44, email, subject, message, me, true);
      branded = true;
    } catch (error) {
      providerError += " No-reply sender: " + String(error?.data?.detail || error?.response?.data?.detail || error?.message || "delivery rejected").slice(0, 240);
    }
    const accepted = branded || providerSent;
    const email_error = accepted ? "" : "Invitation saved, but email was not sent. " + (providerError || "The no-reply provider rejected delivery.");
    await db.PortalInvitation.update(record.id, { email_sent: accepted, email_error, last_delivery_attempt_at: (/* @__PURE__ */ new Date()).toISOString(), delivery_provider: providerSent ? "native_account_invitation" : "no_reply" });
    return Response.json({ success: accepted, invitation_saved: true, provisioned: !!person, status: "invited_waiting_for_registration", invitation_sent: branded || providerSent, branded_email_sent: branded, email_sent: branded || providerSent, email_error, invitation_error: void 0, user_id: person?.id || null, assignment_pending: true });
  } catch {
    return Response.json({ success: false, error: "Unable to create the invitation. Please retry." }, { status: 500 });
  }
}

// <stdin>
Deno.serve(entry_default);
