import { loadPerformanceData } from './performanceData.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: any) => String(v || '').trim().toLowerCase();
const sameEmail = (row: any, field: string, aliases: Set<string>) => aliases.has(lower(row?.[field]));
const sameOfficer = (row: any, emailFields: string[], aliases: Set<string>, officerId: string, idFields: string[] = ['officer_id']) =>
  emailFields.some(field => sameEmail(row, field, aliases)) ||
  idFields.some(field => officerId && String(row?.[field] || '') === officerId);

const rowCache = new Map<string, { at:number; rows:any[] }>();
async function cachedRows(cacheKey:string, ttlMs:number, loader:() => Promise<any[]>) {
  const cached = rowCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ttlMs) return cached.rows;
  const rows = await loader();
  const normalized = Array.isArray(rows) ? rows : [];
  rowCache.set(cacheKey, { at:Date.now(), rows:normalized });
  return normalized;
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
    return await loadPerformanceData(base44, officer, body);
  } catch (error) {
    console.error('getMyPerformanceData failed', error);
    return Response.json({ error: error?.message || 'Unable to load performance data' }, { status: 500 });
  }
});
