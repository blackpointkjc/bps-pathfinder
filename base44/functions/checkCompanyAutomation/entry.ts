// base44/functions/checkCompanyAutomation/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk";
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
async function companyGraphHealth() {
  const cfg = companyGraphConfig();
  if (!cfg.client || !cfg.secret) return { configured: false, mail_send_granted: false, error: "Company Graph application credentials are missing." };
  try {
    const result = await getCompanyGraphAuthorization();
    return { configured: true, mail_send_granted: result.roles.includes("Mail.Send"), roles: result.roles, sender: cfg.sender };
  } catch (error) {
    return { configured: true, mail_send_granted: false, error: error.message };
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
Deno.serve(async (req) => {
  const sdk = createClientFromRequest(req), user = await sdk.auth.me().catch(() => null);
  console.info("COMPANY_JOB_CHECK_STARTED", JSON.stringify({ authenticated: !!user, role: user?.role || "" }));
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" || user.disabled) return Response.json({ error: "Administrator access required" }, { status: 403 });
  cached = null;
  const graph = await companyGraphHealth();
  const counters = await sdk.asServiceRole.entities.CadCounter.filter({ counter_key: "dispatch_call" }, "-updated_date", 1).catch(() => []);
  const result = { server_auth: "verified_platform_admin", graph, grac: counters[0] ? { last_poll_at: counters[0].last_source_poll_at, last_poll_status: counters[0].last_source_poll_status, duration_ms: counters[0].last_source_poll_duration_ms } : null };
  await sdk.asServiceRole.entities.SystemScanRun.create({ hour_key: "company-job-check:" + (/* @__PURE__ */ new Date()).toISOString(), status: graph.mail_send_granted ? "healthy" : "issues_found", areas_checked: 2, scanned_at: (/* @__PURE__ */ new Date()).toISOString(), audit_json: JSON.stringify(result), triggered_by: "Company server authentication verification" });
  console.info("COMPANY_JOB_HEALTH", JSON.stringify(result));
  return Response.json(result);
});
