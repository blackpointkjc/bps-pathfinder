import { createClientFromRequest } from 'npm:@base44/sdk';
const lower = (v: unknown) => String(v || '').trim().toLowerCase();
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const rows = await base44.asServiceRole.entities.CallOut.filter({ officer_email: lower(me.email) }, '-created_date', 100);
    const latest = (rows || []).filter((row: any) => row.call_out_type === 'sent_home' && row.voided !== true)
      .map((row: any) => new Date(row.created_date || 0).getTime()).filter((stamp: number) => Number.isFinite(stamp)).sort((a:number,b:number) => b-a)[0];
    const remaining = latest ? Math.max(0, 12 * 3600000 - (Date.now() - latest)) : 0;
    return Response.json({ success:true, allowed:remaining === 0, remaining_minutes:Math.ceil(remaining/60000), eligible_at:remaining ? new Date(latest + 12*3600000).toISOString() : null });
  } catch (error: any) {
    return Response.json({error:error?.message || 'Unable to check clock-in eligibility'}, {status:500});
  }
});
