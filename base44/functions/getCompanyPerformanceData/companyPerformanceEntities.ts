// One complete source read per entity for the entire company refresh.
// Apply the original officer/date queries locally; never treat a failed read as [].
export function matchesQuery(row: any, query: any): boolean {
  return Object.entries(query || {}).every(([key, value]: any) => {
    if (key === '$and') return value.every((q: any) => matchesQuery(row, q));
    if (key === '$or') return value.some((q: any) => matchesQuery(row, q));
    const actual = row?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).every(([op, target]: any) => {
      if (op === '$in') return Array.isArray(actual) ? actual.some(v => target.includes(v)) : target.includes(actual);
      if (op === '$gte') return actual != null && actual >= target;
      if (op === '$gt') return actual != null && actual > target;
      if (op === '$lte') return actual != null && actual <= target;
      if (op === '$lt') return actual != null && actual < target;
      if (op === '$ne') return actual !== target;
      throw new Error('Unsupported performance query operator: ' + op);
    });
    return actual === value;
  });
}

export function companyPerformanceEntities(entities: any, start: string, end: string) {
  const pending = new Map<string, Promise<any[]>>();
  const endDate = new Date(end + 'T00:00:00.000Z'); endDate.setUTCDate(endDate.getUTCDate() + 1);
  const dateFields: Record<string,string> = { Schedule:'shift_date', CallOut:'call_out_date', DailyActivityReport:'report_date', ShiftReport:'shift_date', Commendation:'commendation_date', Complaint:'complaint_date', ClientFeedback:'feedback_date', PerformanceReview:'review_date' };
  const stampFields: Record<string,string> = { TimeEntry:'clock_in', ShiftBid:'created_date', QRScanEvent:'scanned_at', DispatchCall:'time_received', CallHistory:'archived_date', PropertyAlert:'created_date' };
  let tail: Promise<any> = Promise.resolve();
  const read = (fn: () => Promise<any[]>) => {
    const task = tail.then(async () => {
      for (let attempt=0; ; attempt++) {
        try { return await fn(); }
        catch(error: any) {
          if (attempt >= 2 || !(error?.status === 429 || error?.response?.status === 429 || /429|rate.limit|too many requests/i.test(error?.message || ''))) throw error;
          await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }
    });
    tail = task.catch(() => undefined);
    return task;
  };
  const allRows = (name: string) => {
    if (!pending.has(name)) pending.set(name, (async () => {
      const date = dateFields[name], stamp = stampFields[name];
      const query = date ? { [date]: { $gte:start, $lte:end } } : stamp ? { [stamp]: { $gte:start+'T00:00:00.000Z', $lt:endDate.toISOString() } } : null;
      const rows: any[] = [];
      for (let skip=0;skip<20000;skip+=500) {
        const page = await read(() => query ? entities[name].filter(query, '-id', 500, skip) : entities[name].list('-id', 500, skip));
        if (!Array.isArray(page)) throw new Error(name + ' did not return records');
        rows.push(...page);
        if (page.length < 500) return rows;
      }
      throw new Error(name + ' exceeded the complete-source read limit; figures were not recalculated');
    })());
    return pending.get(name)!;
  };
  const select = async (name: string, query: any, sort?: string, limit?: number) => {
    const rows = (await allRows(name)).filter(row => matchesQuery(row, query));
    if (sort) { const desc=sort.startsWith('-'), key=desc?sort.slice(1):sort; rows.sort((a,b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (desc?-1:1)); }
    // Unlike individual reads, do not truncate a complete company source.
    return rows;
  };
  return new Proxy(entities, { get(target, name: string) {
    if (typeof name !== 'string') return Reflect.get(target,name);
    return { ...target[name], list: (sort?: string, limit?: number) => select(name, {}, sort, limit), filter: (query: any, sort?: string, limit?: number) => select(name, query, sort, limit) };
  }});
}
