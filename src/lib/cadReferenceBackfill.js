import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
let running = false;
let complete = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// One resumable repair per app session. Changing CAD tabs must not abandon a
// database batch. The backend lease and persisted cursor coordinate sessions.
export async function startHistoricalCadBackfill() {
  if (running || complete) return;
  running = true;
  try {
    while (!complete) {
      try {
        const result = await base44.functions.invoke('ensure-cad-references', { action: 'backfill' });
        const data = result?.data || result || {};
        if (data.error) throw new Error(data.error);
        complete = Boolean(data.done);
        if (data.updated) clearBase44ReadCacheMatching('function:getCallHistoryFeed:');
        if (!complete) await wait(3000);
      } catch (error) {
        const status = Number(error?.response?.status || error?.status);
        const message = error?.response?.data?.error || error?.message || '';
        if ([409,429,502,503,504].includes(status) || /rate.limit|429/i.test(message)) {
          await wait(status === 409 ? 10000 : 60000);
          continue;
        }
        console.warn('Historical CAD reference repair will resume when history is opened', message);
        return;
      }
    }
  } finally { running = false; }
}
