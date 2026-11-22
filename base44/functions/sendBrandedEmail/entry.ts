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

// base44/functions/sendBrandedEmail/graphDelivery.ts
async function sendManagementEmail(base44, to, subject, body, html = false) {
  return sendCompanyEmail({ to, subject, body, html, from: "management@blackpointkjc.com" });
}

// base44/functions/sendBrandedEmail/creditFreeEmail.ts
async function sendCreditFreeEmail(base44, payload) {
  const to = String(payload?.to || "").trim(), subject = String(payload?.subject || "").trim(), body = String(payload?.body || payload?.html || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !body) throw Error("Valid email recipient, subject and content are required.");
  return sendManagementEmail(base44, to, subject, body, /<[a-z][\s\S]*>/i.test(body));
}

// base44/functions/sendBrandedEmail/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";
var __portalAppIdentity = (user) => user && String(user.id) === "6a72bbee2842d6338cbae513" && String(user.rank).toLowerCase() === "support staff" ? { ...user, role: "user", additional_roles: ["support"], is_supervisor: false, dispatch_role: "", ps_role: "none" } : user;
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.role !== "admin" && !(actor.additional_roles || []).some((r) => ["hr", "trainer"].includes(r))) return Response.json({ error: "Account administrator access required." }, { status: 403 });
    const payload = await req.json();
    const recipient = String(payload?.to || "").trim();
    if (!recipient) return Response.json({ error: "Recipient is required" }, { status: 400 });
    const subject = String(payload?.subject || "BlackPoint Pathfinder notification").slice(0, 250);
    const body = String(payload?.body || payload?.message || "");
    if (!body) return Response.json({ error: "Email content is required." }, { status: 400 });
    const sent = await sendCreditFreeEmail(base44, { to: recipient, subject, body, from_name: "BlackPoint Pathfinder" });
    if (sent?.error || sent?.success === false) throw new Error("No-reply provider rejected delivery.");
    return Response.json({ success: true, to: recipient, delivered: "accepted_by_provider" });
  } catch (error) {
    console.error("sendBrandedEmail failed", error);
    return Response.json({ error: error?.message || "Unable to send email" }, { status: 500 });
  }
});
