import { createClientFromRequest } from 'npm:@base44/sdk';

const stamp = (value: unknown) => {
  const raw = String(value || '').trim();
  return new Date(raw && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw + 'Z' : raw).getTime();
};
const dayKey = (value: unknown) => {
  const time = stamp(value);
  if (!Number.isFinite(time)) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
};
async function readAll(entity: any, query: any, sort: string) {
  const rows: any[] = [];
  for (let skip = 0; skip < 20000; skip += 1000) {
    const page = await entity.filter(query, sort, 1000, skip);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('This date exceeds the report limit. The report was not generated to avoid omitting records.');
}
Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    // Matches the management location-history page; never expose a service-role report to a broader audience.
    if (user.role !== 'admin') return Response.json({ error: 'Administrator access required' }, { status: 403 });
    const input = await req.json();
    const email = String(input.officer_email || '').trim();
    const date = String(input.date || '');
    const start = new Date(date + 'T00:00:00Z');
    if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0,10) !== date) {
      return Response.json({ error: 'Choose a valid officer and date' }, { status: 400 });
    }
    // A 48-hour UTC envelope contains the entire selected Eastern day, including DST changes.
    const end = new Date(start.getTime() + 48 * 3600000).toISOString();
    const entities = base44.asServiceRole.entities;
    const results = await Promise.allSettled([
      readAll(entities.LocationHistory, { officer_email: email, timestamp: { $gte: start.toISOString(), $lt: end } }, 'timestamp'),
      readAll(entities.GeofenceAlert, { officer_email: email, created_date: { $gte: start.toISOString(), $lt: end } }, 'created_date'),
      readAll(entities.TimeEntry, { officer_email: email, clock_in: { $lt: end }, $or: [{ clock_out: { $gte: start.toISOString() } }, { clock_out: null }, { clock_out: { $exists: false } }] }, 'clock_in'),
    ]);
    if (results[0].status === 'rejected') throw results[0].reason;
    const historyRows = results[0].value;
    const alertRows = results[1].status === 'fulfilled' ? results[1].value : [];
    const timeEntries = results[2].status === 'fulfilled' ? results[2].value : [];
    const warnings = results.slice(1).flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'Geofence alerts could not load. Retry to include them.' : 'Time entries could not load. Retry to include shift times.'] : []);
    const history = historyRows.filter(row => dayKey(row.timestamp) === date).sort((a,b) => stamp(a.timestamp)-stamp(b.timestamp));
    const geofenceAlerts = alertRows.filter(row => dayKey(row.created_date) === date);
    const entries = timeEntries.filter(row => dayKey(row.clock_in) <= date && (!row.clock_out || dayKey(row.clock_out) >= date))
      .map(({ id, clock_in, clock_out, location }: any) => ({ id, clock_in, clock_out, location }));
    return Response.json({ history, geofenceAlerts, entries, warnings, date, timeZone: 'America/New_York', generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Location audit report failed', error);
    return Response.json({ error: 'Unable to load the complete GPS audit report. Please retry.' }, { status: 500 });
  }
});
