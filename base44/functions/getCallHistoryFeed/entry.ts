import { callTimestamp, isValidCallRecord } from '../_shared/callFeedPolicy.js';
import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const validCad = (value:any) => {const text=String(value||'').trim();return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&!/^property-alert-|^web-|^https?:|^[a-f0-9]{48,}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);};
const cadRef = (row:any) => [row?.agency_cad_number,row?.bps_reference,row?.cadNumber,row?.call_number,row?.call_id].find(validCad)||'';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readWithRetry<T>(label: string, loader: () => Promise<T>, fallback: T, maxAttempts = 1): Promise<{ data: T; error: string }> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return { data: await loader(), error: '' };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await wait(250 * (attempt + 1));
    }
  }
  const message = `${label} unavailable: ${lastError?.message || lastError || 'unknown error'}`;
  console.warn(message);
  return { data: fallback, error: message };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('full_access') || roles.has('dispatch') || roles.has('supervisor') || (user.is_supervisor === true || ['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(String(user.rank || '').toLowerCase().replace(/[.]/g, '').trim()));
    if (!allowed) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const input=await req.json().catch(()=>({}));
    const search=String(input.search||'').trim().slice(0,160);
    const escaped=Array.from(search).map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
    const searchQuery=search?{$or:['call_id','bps_reference','agency_cad_number','incident','location','original_call_id'].map(field=>({[field]:{$regex:escaped,$options:'i'}}))}:null;

    const pageSize = Math.max(25, Math.min(100, Number(input.page_size) || 75));
    const cursor = input.cursor || {};
    const snapshotMs = Math.min(Date.now(), Date.parse(cursor.snapshot_at || '') || Date.now());
    const snapshot = new Date(snapshotMs).toISOString();
    const since = new Date(Math.max(snapshotMs - 90 * 86400000, Math.min(snapshotMs, Date.parse(input.since || '') || 0))).toISOString();
    const until = new Date(Math.min(snapshotMs, Date.parse(input.until || '') || snapshotMs)).toISOString();
    const offsets = {
      active: Math.max(0, Math.floor(Number(cursor.active) || 0)),
      archived: Math.max(0, Math.floor(Number(cursor.archived) || 0)),
    };
    const clauses:any[] = [
      { created_date: { $lte: snapshot } },
      { $or: [
        { time_received: { $gte: since, $lte: until } },
        { $and: [
          { $or: [{ time_received: null }, { time_received: '' }, { time_received: { $exists: false } }] },
          { created_date: { $gte: since, $lte: until } },
        ] },
      ] },
    ];
    if (searchQuery) clauses.push(searchQuery);
    if (input.agency && input.agency !== 'ALL') clauses.push({agency:input.agency});
    if (input.status && input.status !== 'ALL') clauses.push({status:input.status});
    const query = { $and: clauses };
    const [activeRead, archivedRead] = await Promise.all([
      readWithRetry('Call records', () => base44.asServiceRole.entities.DispatchCall.filter(query,'-time_received',pageSize+1,offsets.active), []),
      readWithRetry('Archived calls', () => base44.asServiceRole.entities.CallHistory.filter(query,'-time_received',pageSize+1,offsets.archived), []),
    ]);
    // Never advance a paging cursor past an unavailable source.
    if (activeRead.error || archivedRead.error) throw new Error(activeRead.error || archivedRead.error);
    const candidates = [
      ...(activeRead.data || []).map((row:any) => ({row,source:'active'})),
      ...(archivedRead.data || []).map((row:any) => ({row,source:'archived'})),
    ].sort((a,b) => callTimestamp(b.row) - callTimestamp(a.row) || (a.source === b.source ? 0 : a.source === 'active' ? -1 : 1));
    const selected:any[] = [];
    const consumed = {active:0,archived:0};
    const seen = new Set<string>();
    for (const item of candidates) {
      if (selected.length >= pageSize) break;
      consumed[item.source as 'active'|'archived']++;
      const row = item.row;
      if (!isValidCallRecord(row)) continue;
      const identity = String(row.original_call_id || (item.source === 'active' ? row.id : '') || row.external_call_id || row.id);
      if (seen.has(identity)) continue;
      seen.add(identity);
      selected.push(item);
    }
    const active:any[] = selected.filter(item=>item.source==='active').map(item=>item.row);
    const archived:any[] = selected.filter(item=>item.source==='archived').map(item=>item.row);
    const ids = [...new Set(selected.flatMap(({row})=>[String(row.id||''),String(row.original_call_id||'')]).filter(Boolean))];
    const numbers = [...new Set(selected.map(({row})=>String(cadRef(row)||'')).filter(Boolean))];
    const callFilter = { call_id: { $in: ids } };
    // Only enrich this page. The former global reads fetched 8,000+ unrelated rows.
    const [alertRead,assignmentRead,linkedRead,propertyLinksRead] = await Promise.all([
      readWithRetry('Property alerts',()=>ids.length?base44.asServiceRole.entities.PropertyAlert.filter({callId:{$in:ids}},'-created_date',300):Promise.resolve([]),[]),
      readWithRetry('Call assignments',()=>ids.length?base44.asServiceRole.entities.CallAssignment.filter(callFilter,'-assigned_at',300):Promise.resolve([]),[]),
      readWithRetry('Linked reports',()=>ids.length?base44.asServiceRole.entities.ReportCallLink.filter({$or:[callFilter,{call_number:{$in:numbers}}]},'-linked_at',300):Promise.resolve([]),[]),
      readWithRetry('Manual property links',()=>ids.length?base44.asServiceRole.entities.PropertyCallLink.filter({$or:[callFilter,{archive_id:{$in:ids}}]},'-linked_at',300):Promise.resolve([]),[])
    ]);
    const alerts:any[] = alertRead.data || [];
    const unitIds = [...new Set([
      ...(assignmentRead.data||[]).map((row:any)=>String(row.unit_id||'')),
      ...selected.flatMap(({row})=>Array.isArray(row.assigned_units)?row.assigned_units.map(String):[]),
    ].filter(Boolean))];
    const unitRead = await readWithRetry('CAD units',()=>unitIds.length?base44.asServiceRole.entities.Unit.filter({id:{$in:unitIds}},'-last_update_at',300):Promise.resolve([]),[]);
    const userIds = [...new Set([...unitIds,...(unitRead.data||[]).map((row:any)=>String(row.user_id||''))].filter(Boolean))];
    const emails = (unitRead.data||[]).map((row:any)=>String(row.user_email||row.email||'')).filter(Boolean);
    const userRead = await readWithRetry('Assigned officers',()=>userIds.length?base44.asServiceRole.entities.User.filter({$or:[{id:{$in:userIds}},{email:{$in:emails}}]},'-updated_date',300):Promise.resolve([]),[]);
    const hasMore = (activeRead.data||[]).length > consumed.active || (archivedRead.data||[]).length > consumed.archived;
    const nextCursor = hasMore ? {snapshot_at:snapshot,active:offsets.active+consumed.active,archived:offsets.archived+consumed.archived} : null;
    const linksByCall=new Map<string,any[]>();
    for(const link of linkedRead.data||[]){
      if(String(link.status||'active').toLowerCase()==='detached')continue;
      for(const key of [String(link.call_id||''),String(link.call_number||'')]){
        if(!key)continue;
        if(!linksByCall.has(key))linksByCall.set(key,[]);
        if(!linksByCall.get(key)!.some((row:any)=>row.id===link.id))linksByCall.get(key)!.push(link);
      }
    }
    const linkedReports=(id:string,number:string)=>{
      const combined=[...(linksByCall.get(String(id||''))||[]),...(linksByCall.get(String(number||''))||[])];
      return [...new Map(combined.map((row:any)=>[String(row.id),{id:row.id,report_id:row.report_id,report_type:row.report_type,report_number:row.report_number||row.report_id,call_number:row.call_number,linked_at:row.linked_at}])).values()];
    };

    const usersById = new Map((userRead.data || []).map((person: any) => [String(person.id), person]));
    const officersByEmail=new Map((userRead.data||[]).map((person:any)=>[String(person.email||'').toLowerCase(),person]));
    const officersByNumber=new Map((userRead.data||[]).filter((p:any)=>p.unit_number).map((person:any)=>[String(person.unit_number||'').replace(/^0+/,''),person]));
    const unitsById = new Map((unitRead.data || []).map((unit: any) => [String(unit.id), unit]));
    const assignmentsByCall = new Map<string, any[]>();
    for (const assignment of assignmentRead.data || []) {
      const id = String(assignment.call_id || '');
      if (!id) continue;
      if (!assignmentsByCall.has(id)) assignmentsByCall.set(id, []);
      assignmentsByCall.get(id)!.push(assignment);
    }
    const assignmentDetails = (callId: string, existing: any[] = []) => {
      const records = assignmentsByCall.get(callId) || [];
      const ids = [...new Set([...existing.map(String), ...records.map((item: any) => String(item.unit_id || ''))].filter(Boolean))];
      return ids.map(id => {
        const unit = unitsById.get(id);
        const officer = usersById.get(String(unit?.user_id || id))
          ||officersByEmail.get(String(unit?.user_email||unit?.email||'').toLowerCase())
          ||officersByNumber.get(String(unit?.unit_number||'').replace(/^0+/,''))
          ||(userRead.data||[]).find((u:any)=>String(u.username||'').toLowerCase()===String(unit?.officer_name||'').toLowerCase());
        const number = officer?.unit_number || unit?.unit_number || '';
        const name = [officer?.rank||'Officer', officer?.last_name||String(officer?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ');
        const label = [number ? 'Unit ' + number : '', name||'Officer not identified'].filter(Boolean).join(' — ');
        const assignment = records.find((item: any) => String(item.unit_id) === id);
        return { unit_id: id, label, officer_name: name || '', unit_number: number, role: assignment?.role || '', assigned_at: assignment?.assigned_at || '', status: assignment?.status || '' };
      });
    };
    const propertyFingerprint = (time: any, incident: any, location: any) => [
      String(time || ''),
      String(incident || '').trim().toUpperCase(),
      String(location || '').trim().toUpperCase(),
    ].join('|');

    const alertByCallId = new Map<string, any>();
    const alertByFingerprint = new Map<string, any>();
    for (const alert of alerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCallId.get(key);
      const currentStamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && currentStamp > priorStamp)) alertByCallId.set(key, alert);
      const fp = propertyFingerprint(alert.callTime || alert.time_received, alert.callIncident, alert.callLocation);
      if (fp && !fp.startsWith('|')) {
        const priorFp = alertByFingerprint.get(fp);
        const priorFpStamp = new Date(priorFp?.created_date || 0).getTime();
        if (!priorFp || currentStamp > priorFpStamp) alertByFingerprint.set(fp, alert);
      }
    }

    const decorate = (row: any, source: 'active' | 'archived') => {
      const directOriginalId = source === 'archived' ? String(row.original_call_id || '') : String(row.id || '');
      const fingerprintAlert = source === 'archived'
        ? alertByFingerprint.get(propertyFingerprint(row.time_received || row.created_date, row.incident, row.location))
        : null;
      const alert = (directOriginalId ? alertByCallId.get(directOriginalId) : null) || fingerprintAlert;
      const originalId = directOriginalId || String(fingerprintAlert?.callId || '');
      return {
        ...row,
        original_call_id: source === 'archived' ? (originalId || row.original_call_id || '') : row.original_call_id,
        call_id: cadRef(row) || cadRef(alert),
        bps_reference: row.bps_reference || (/^BPS-/i.test(cadRef(alert)) ? cadRef(alert) : ''),
        _referenceEntity:source==='archived'?'CallHistory':'DispatchCall',_referenceId:String(row.id),
        _source: source,
        _assignedUnitDetails: assignmentDetails(originalId, Array.isArray(row.assigned_units) ? row.assigned_units : []),
        _linkedReports:linkedReports(originalId||String(row.id||''),String(row.call_id||row.agency_cad_number||row.bps_reference||'')),
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
        _propertyName: alert?.propertyName || '',
        _propertyId: alert?.propertyId || '',
        _propertyLifecycle: alert?.lifecycle_status || '',
        _propertyDistanceMeters: Number.isFinite(Number(alert?.distanceMeters)) ? Number(alert.distanceMeters) : null,
      };
    };

    const activeRows = (active || []).map((row: any) => decorate(row, 'active'));
    const archivedRowsRaw = (archived || []).map((row: any) => decorate(row, 'archived'));

    // Older versions could archive the same upstream call repeatedly when the
    // source continued reporting it. Collapse those historical duplicates by the
    // real call timestamp + incident + location so Call History shows one event.
    const historyFingerprint = (row: any) => [
      String(row?.time_received || row?.created_date || ''),
      String(row?.incident || '').trim().toUpperCase(),
      String(row?.location || '').trim().toUpperCase(),
      String(row?.agency || '').trim().toUpperCase(),
    ].join('|');
    const archivedSeen = new Set<string>();
    const archivedRows = archivedRowsRaw
      .sort((a: any, b: any) => new Date(b.archived_date || b.created_date || 0).getTime() - new Date(a.archived_date || a.created_date || 0).getTime())
      .filter((row: any) => {
        const key = historyFingerprint(row);
        if (!key || archivedSeen.has(key)) return false;
        archivedSeen.add(key);
        return true;
      });

    const manualLinks:any[]=propertyLinksRead.data||[];
    const allRows=[...activeRows,...archivedRows];
    const decorated=allRows.map(row=>{
      const ids=[String(row.id||''),String(row.original_call_id||'')];
      const links=manualLinks.filter(link=>ids.includes(String(link.call_id))||ids.includes(String(link.archive_id||'')));
      return links.length?{...row,_propertyLinks:links,_propertyCall:true,_propertyName:[row._propertyName,...links.map(l=>l.property_name)].filter(Boolean).join(' / '),_propertyId:row._propertyId||links[0].property_id}:row;
    });
    return Response.json({
      success: true,
      rows: decorated.sort((a,b)=>callTimestamp(b)-callTimestamp(a)),
      next_cursor: nextCursor,
      has_more: hasMore,
      days:90, since, snapshot_at:snapshot,
      counts: {
        active: activeRows.length,
        archived: archivedRows.length,
        propertyAlerts: alertByCallId.size,
        loaded: decorated.length,
      },
      warnings: [activeRead.error, archivedRead.error, alertRead.error, assignmentRead.error, userRead.error, unitRead.error,linkedRead.error,propertyLinksRead.error].filter(Boolean),
    });
  } catch (error:any) {
    console.error('getCallHistoryFeed failed:', error);
    return Response.json({ error: error?.message || 'Unable to load call history' }, { status: 500 });
  }
});
