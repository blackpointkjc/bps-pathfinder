// Fetch referenced calls together rather than a request per roster/legacy row.
// Missing records remain absent; real query failures propagate instead of
// accidentally releasing units when the database is unavailable.
export async function readRosterCalls(entities: any, ids: unknown[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map<string, any>();
  const rows = await entities.DispatchCall.filter({ id: { $in: unique } }, '-updated_date', unique.length);
  return new Map<string, any>((rows || []).map((call: any) => [String(call.id), call]));
}
