import { createClientFromRequest } from 'npm:@base44/sdk';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function loadEntriesWithRetry(base44: any, query: Record<string, any>) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rows = await base44.asServiceRole.entities.TimeEntry.filter(query, '-clock_in', 500);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(450 * (attempt + 1));
    }
  }
  throw lastError || new Error('Unable to load time entries');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const roles = new Set((me.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
    let officer = me;
    if (body.preview_user_id) {
      if (me.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Preview access denied' }, { status: 403 });
      officer = await base44.asServiceRole.entities.User.get(String(body.preview_user_id)).catch(() => null);
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
    }
    const officerEmail = String(officer.work_email || officer.pathfinder_email || officer.email || '').trim().toLowerCase();
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date || '')) ? String(body.start_date) : '';
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.end_date || '')) ? String(body.end_date) : '';
    const query: Record<string, any> = { officer_email: officerEmail };
    if (startDate || endDate) {
      query.clock_in = {
        ...(startDate ? { $gte: `${startDate}T00:00:00.000Z` } : {}),
        ...(endDate ? { $lte: `${endDate}T23:59:59.999Z` } : {}),
      };
    }
    const entries = await loadEntriesWithRetry(base44, query);
    return Response.json({ success: true, entries: (entries || []).filter((entry: any) => entry.archived !== true) });
  } catch (error) {
    console.error('getMyTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to load time entries', entries: [] }, { status: 500 });
  }
});