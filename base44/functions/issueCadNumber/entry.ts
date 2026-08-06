import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const MONTH_LETTERS = 'ABCDEFGHIJKL';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function easternMonthParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return { year, month, monthIndex: Number(month) - 1 };
}

function parseSequence(value: unknown, expectedLetter: string) {
  const match = String(value || '').trim().match(/^([A-L])(\d{1,8})$/i);
  return match && match[1].toUpperCase() === expectedLetter ? Number(match[2]) : 0;
}

async function acquireCounterLease(base44: any, counterKey: string, letter: string, year: string, month: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
    if (!counter) {
      const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
      const highest = (calls || []).reduce((max: number, call: any) => {
        const callDate = new Date(call.time_received || call.created_date || 0);
        if (Number.isNaN(callDate.getTime())) return max;
        const callParts = easternMonthParts(callDate);
        if (callParts.year !== year || callParts.month !== month) return max;
        return Math.max(max, parseSequence(call.call_id, letter));
      }, 0);
      counter = await base44.asServiceRole.entities.CadCounter.create({
        counter_key: counterKey,
        last_number: highest,
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      });
    }

    const now = Date.now();
    const lockedUntil = new Date(counter.ingestion_locked_until || 0).getTime();
    if (lockedUntil > now) {
      await wait(120 + attempt * 80);
      continue;
    }

    const token = crypto.randomUUID();
    await base44.asServiceRole.entities.CadCounter.update(counter.id, {
      ingestion_lock_token: token,
      ingestion_locked_until: new Date(now + 10_000).toISOString(),
    });
    await wait(120);
    const verified = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
    if (verified?.id === counter.id && verified?.ingestion_lock_token === token) return { counter: verified, token };
    await wait(100 + attempt * 100);
  }
  throw new Error('CAD number generator is busy. Please try again.');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || user.role === 'dispatch' || roles.has('cad_access') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const { year, month, monthIndex } = easternMonthParts(new Date());
    const letter = MONTH_LETTERS[monthIndex];
    const counterKey = `dispatch_call:${year}-${month}`;
    const lease = await acquireCounterLease(base44, counterKey, letter, year, month);

    try {
      const next = Number(lease.counter.last_number || 0) + 1;
      if (next > 99_999_999) throw new Error(`The ${year}-${month} CAD sequence has reached its eight-digit limit.`);
      await base44.asServiceRole.entities.CadCounter.update(lease.counter.id, {
        last_number: next,
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      });
      return Response.json({
        success: true,
        cad_number: `${letter}${String(next).padStart(8, '0')}`,
        sequence: next,
        month_letter: letter,
        period: `${year}-${month}`,
      });
    } catch (error) {
      await base44.asServiceRole.entities.CadCounter.update(lease.counter.id, {
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      }).catch(() => null);
      throw error;
    }
  } catch (error) {
    console.error('issueCadNumber failed', error);
    return Response.json({ error: error?.message || 'Unable to issue CAD number' }, { status: 500 });
  }
});