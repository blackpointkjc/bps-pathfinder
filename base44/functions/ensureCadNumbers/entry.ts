import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const MONTH_LETTERS = 'ABCDEFGHIJKL';

function easternMonthParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return { year, month, monthIndex: Number(month) - 1 };
}

function validCadNumber(value: unknown) {
  return /^[A-L]\d{1,8}$/i.test(String(value || '').trim());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) {
      return Response.json({ error: 'CAD access required' }, { status: 403 });
    }

    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const legacy = (calls || []).filter((call: any) => !validCadNumber(call.call_id));
    if (!legacy.length) return Response.json({ success: true, updated: 0 });

    const groups = new Map<string, any[]>();
    for (const call of legacy) {
      const callDate = new Date(call.time_received || call.created_date || Date.now());
      const safeDate = Number.isNaN(callDate.getTime()) ? new Date() : callDate;
      const { year, month, monthIndex } = easternMonthParts(safeDate);
      const key = `${year}-${month}`;
      groups.set(key, [...(groups.get(key) || []), { call, year, month, monthIndex }]);
    }

    let updated = 0;
    for (const [period, records] of groups) {
      const { year, month, monthIndex } = records[0];
      const letter = MONTH_LETTERS[monthIndex];
      const counterKey = `dispatch_call:${period}`;
      let counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
      const highest = (calls || []).reduce((max: number, call: any) => {
        const callDate = new Date(call.time_received || call.created_date || 0);
        if (Number.isNaN(callDate.getTime())) return max;
        const callPeriod = easternMonthParts(callDate);
        if (callPeriod.year !== year || callPeriod.month !== month) return max;
        const match = String(call.call_id || '').match(/^([A-L])(\d{1,8})$/i);
        return Math.max(max, match && match[1].toUpperCase() === letter ? Number(match[2]) : 0);
      }, Number(counter?.last_number || 0));

      if (!counter) counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: counterKey, last_number: highest });
      let next = Math.max(highest, Number(counter.last_number || 0));

      records.sort((a, b) => new Date(a.call.time_received || a.call.created_date || 0).getTime() - new Date(b.call.time_received || b.call.created_date || 0).getTime());
      for (const { call } of records) {
        next += 1;
        if (next > 99_999_999) throw new Error(`The ${period} CAD sequence has reached its eight-digit limit.`);
        const oldId = String(call.call_id || '');
        const externalId = oldId.startsWith('grac-') ? oldId.slice(5) : '';
        const existingDescription = String(call.description || '');
        const description = externalId && !existingDescription.includes('[GRAC:')
          ? `${existingDescription} [GRAC:${externalId}]`.trim()
          : existingDescription;
        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
          call_id: `${letter}${String(next).padStart(8, '0')}`,
          ...(description ? { description } : {}),
        });
        updated += 1;
      }
      await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: next });
    }

    return Response.json({ success: true, updated });
  } catch (error) {
    console.error('ensureCadNumbers failed', error);
    return Response.json({ error: error?.message || 'Unable to repair CAD numbers' }, { status: 500 });
  }
});