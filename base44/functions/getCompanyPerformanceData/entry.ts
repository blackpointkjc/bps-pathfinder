import { createClientFromRequest } from 'npm:@base44/sdk';
import { loadPerformanceData } from '../getMyPerformanceData/performanceData.ts';
import { companyPerformanceEntities } from './companyPerformanceEntities.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({error:'Unauthorized'}, {status:401});
    const roles = new Set((me.additional_roles || []).map((r: any) => String(r).toLowerCase()));
    if (me.role !== 'admin' && !roles.has('full_access')) return Response.json({error:'Company analytics access required'}, {status:403});
    const body = await req.json().catch(() => ({}));
    const validDate = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    if (!validDate(body.start_date) || !validDate(body.end_date) || body.start_date > body.end_date) return Response.json({error:'Valid start and end dates are required'}, {status:400});
    const entities = companyPerformanceEntities(base44.asServiceRole.entities, body.start_date, body.end_date);
    const users = await entities.User.list('-updated_date', 1000);
    const requested = new Set((body.officer_ids || []).map(String));
    const officers = users.filter((u: any) => requested.has(String(u.id)) && !u.termination_date);
    const snapshots: Record<string, any> = {}, errors: Record<string,string> = {};
    const client = { asServiceRole: { entities } };
    for (const officer of officers) {
      try {
        const response = await loadPerformanceData(client, officer, body);
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'Performance load failed');
        if (payload.is_partial) throw new Error('Sources unavailable: ' + Object.keys(payload.service_errors || {}).join(', '));
        snapshots[officer.id] = payload;
      } catch (error: any) { errors[officer.id] = error?.message || 'Unable to refresh performance'; }
    }
    for (const id of requested) if (!officers.some((u: any) => String(u.id) === id)) errors[String(id)] = 'Officer record is unavailable';
    return Response.json({success:true, snapshots, errors, generated_at:new Date().toISOString()});
  } catch (error: any) {
    console.error('getCompanyPerformanceData failed',error);
    return Response.json({error:error?.message || 'Unable to load company performance'}, {status:500});
  }
});
