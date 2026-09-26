const fs=require('fs'),p='base44/functions/getMyPerformanceData/entry.ts';let s=fs.readFileSync(p,'utf8');const old="    const linkedPropertyIncidents = incidentsAll.filter((report:any) => relevantCallIds.has(String(report.linked_call_id || '')) || relevantCallIds.has(String(report.linked_call_number || '')) || relevantCallIds.has(String(report.call_number || '')));";
if(!s.includes(old))throw Error('missing');
s=s.replace(old,`    // A report submitted later (or with a missing incident_date) still satisfies
    // its linked call. Resolve by durable IDs/numbers, not only the month filter.
    const linkedReports = relevantCallIds.size ? await safeFilter('IncidentReport', { $or: [
      { linked_call_id: { $in: [...relevantCallIds] } },
      { linked_call_number: { $in: [...relevantCallIds] } },
      { call_number: { $in: [...relevantCallIds] } },
    ] }, '-created_date', 1000) : [];
    const linkedPropertyIncidents = [...incidentsAll, ...linkedReports].filter((report:any) => relevantCallIds.has(String(report.linked_call_id || '')) || relevantCallIds.has(String(report.linked_call_number || '')) || relevantCallIds.has(String(report.call_number || '')));`);fs.writeFileSync(p,s);
