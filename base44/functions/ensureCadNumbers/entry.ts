import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

function easternPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function validBpsReference(value: unknown) {
  return /^BPS-\d{6}-\d{8}$/i.test(String(value || '').trim());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) {
      return Response.json({ error: 'CAD access required' }, { status: 403 });
    }

    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const groups = new Map<string, any[]>();
    for (const call of calls || []) {
      if (validBpsReference(call.bps_reference)) continue;
      const date = new Date(call.time_received || call.created_date || Date.now());
      const period = easternPeriod(Number.isNaN(date.getTime()) ? new Date() : date);
      groups.set(period, [...(groups.get(period) || []), call]);
    }

    let updated = 0;
    for (const [period, records] of groups) {
      const counterKey = `bps_dispatch_call:${period}`;
      let counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
      const highest = (calls || []).reduce((max: number, call: any) => {
        const match = String(call.bps_reference || call.call_id || '').match(/^BPS-(\d{6})-(\d{1,8})$/i);
        return Math.max(max, match && match[1] === period ? Number(match[2]) : 0);
      }, Number(counter?.last_number || 0));
      if (!counter) counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: counterKey, last_number: highest });

      let next = Math.max(highest, Number(counter.last_number || 0));
      records.sort((a, b) => new Date(a.time_received || a.created_date || 0).getTime() - new Date(b.time_received || b.created_date || 0).getTime());
      for (const call of records) {
        next += 1;
        if (next > 99_999_999) throw new Error(`The ${period} BPS sequence has reached its eight-digit limit.`);
        const bpsReference = `BPS-${period}-${String(next).padStart(8, '0')}`;
        const officialCad = String(call.agency_cad_number || '').trim();
        const legacyCallId = String(call.call_id || '').trim();
        const legacyLooksInternal = /^B\d+$/i.test(legacyCallId) || /^[A-L]\d{1,8}$/i.test(legacyCallId) || legacyCallId.startsWith('grac-');
        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
          bps_reference: bpsReference,
          call_id: officialCad || (!legacyLooksInternal && legacyCallId ? legacyCallId : bpsReference),
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
        });
        updated += 1;
      }
      await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: next });
    }

    return Response.json({ success: true, updated });
  } catch (error) {
    console.error('ensureCadNumbers failed', error);
    return Response.json({ error: error?.message || 'Unable to repair call references' }, { status: 500 });
  }
});