const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
import {portalSessionState} from '../../shared/portalLoginGuard.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){return (await portalSessionState(request,sdk,user)).state!=='invalid';}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const SOURCES = [
  ['DispatchCall', 'CAD / Dispatch Calls', 'CallHistory'],
  ['CallHistory', 'Archived Call History', 'CallHistory'],
  ['CallForService', 'Calls for Service', 'CallHistory'],
  ['BOLOAlert', 'BOLO / Alerts', 'BOLOAlerts'],
  ['IncidentReport', 'Incident Reports', 'IncidentReports'],
  ['DailyActivityReport', 'Daily Activity Reports', 'DailyActivityReports'],
  ['MaintenanceReport', 'Maintenance Reports', 'MaintenanceReports'],
  ['OpenDoorReport', 'Open Door Reports', 'OpenDoorReports'],
  ['ConfidentialReport', 'Confidential Reports', 'AdminConfidentialReports'],
  ['TrespassingNotice', 'Trespassing Notices', 'VATrespassNotices'],
  ['MDTrespassNotice', 'MD Trespass Notices', 'MDTrespassNotices'],
  ['CriminalComplaint', 'Criminal Complaints', 'CriminalComplaints'],
  ['MDCriminalComplaint', 'MD Criminal Complaints', 'MDCriminalComplaints'],
  ['Complaint', 'Complaints', 'SupervisorComplaints'],
  ['UseOfForceReport', 'Use of Force Reports', 'SupervisorUseOfForce'],
  ['WriteUpReport', 'Write-Up Reports', 'SupervisorWriteUps'],
  ['InspectionReport', 'Inspection Reports', 'SupervisorInspections'],
  ['ParkingViolation', 'Parking Violations', 'ParkingViolations'],
  ['MovingViolation', 'Moving Violations', 'MovingViolations'],
  ['Summons', 'Summons', 'Summons'],
  ['QRPatrolReport', 'QR Patrol Reports', 'AdminQRReports'],
  ['ShiftReport', 'Shift Reports', 'ShiftReports'],
  ['Vehicle', 'Fleet / Vehicle Records', 'AdminPortal'],
  ['ShiftHandover', 'Shift Handovers', 'ShiftHandover'],
  ['WitnessSubpoenaRequest', 'Witness Subpoena Requests', 'WitnessSubpoenaRequest'],
  ['PropertyAlert', 'Property Calls / Alerts', 'CallHistory'],
  ['QRScanEvent', 'QR Patrol Scans', 'QRPatrolScan'],
  ['PostOrder', 'Site Post Orders', 'PostOrders'],
  ['SecurityAlert', 'Security Alerts', 'BOLOAlerts'],
  ['UnitMaintenance', 'Fleet Maintenance', 'AdminAssets'],

] as const;
const CALLER_SOURCES = [["Announcement", "Announcement", "RecordsAssistant"], ["CallAlert", "Call Alert", "RecordsAssistant"], ["CallAssignment", "Call Assignment", "RecordsAssistant"], ["CallNote", "Call Note", "RecordsAssistant"], ["CallOut", "Call Out", "RecordsAssistant"], ["Client", "Client", "RecordsAssistant"], ["CompanyPlatoon", "Company Platoon", "RecordsAssistant"], ["Contract", "Contract", "RecordsAssistant"], ["DispatcherShiftReport", "Dispatcher Shift Report", "RecordsAssistant"], ["Division", "Division", "RecordsAssistant"], ["DutySupervisorAssignment", "Duty Supervisor Assignment", "RecordsAssistant"], ["Equipment", "Equipment", "RecordsAssistant"], ["ExpenseReport", "Expense Report", "RecordsAssistant"], ["GeneralPostOrder", "General Post Order", "RecordsAssistant"], ["GeofenceAlert", "Geofence Alert", "RecordsAssistant"], ["Invoice", "Invoice", "RecordsAssistant"], ["JobDutyRule", "Job Duty Rule", "RecordsAssistant"], ["Lead", "Lead", "RecordsAssistant"], ["Location", "Location", "RecordsAssistant"], ["MonitoredProperty", "Monitored Property", "RecordsAssistant"], ["OfficerAvailability", "Officer Availability", "RecordsAssistant"], ["OfficerRoster", "Officer Roster", "RecordsAssistant"], ["PlannedShift", "Planned Shift", "RecordsAssistant"], ["PropertyParkingRule", "Property Parking Rule", "RecordsAssistant"], ["PublicDispatchRequest", "Public Dispatch Request", "RecordsAssistant"], ["QRCheckpoint", "Q R Checkpoint", "RecordsAssistant"], ["ReportCallLink", "Report Call Link", "RecordsAssistant"], ["ReportTodo", "Report Todo", "RecordsAssistant"], ["Schedule", "Schedule", "RecordsAssistant"], ["ServiceSite", "Service Site", "RecordsAssistant"], ["ShiftBid", "Shift Bid", "RecordsAssistant"], ["SpecialCoverageRequest", "Special Coverage Request", "RecordsAssistant"], ["SupervisorShiftHandover", "Supervisor Shift Handover", "RecordsAssistant"], ["SupervisorSiteCheck", "Supervisor Site Check", "RecordsAssistant"], ["Task", "Task", "RecordsAssistant"], ["TimeEntry", "Time Entry", "RecordsAssistant"], ["TimeOffRequest", "Time Off Request", "RecordsAssistant"], ["TrainingAssignment", "Training Assignment", "RecordsAssistant"], ["TrainingAttendee", "Training Attendee", "RecordsAssistant"], ["TrainingCertificate", "Training Certificate", "RecordsAssistant"], ["TrainingClass", "Training Class", "RecordsAssistant"], ["TrainingCompletion", "Training Completion", "RecordsAssistant"], ["TrainingDocument", "Training Document", "RecordsAssistant"], ["TrainingModule", "Training Module", "RecordsAssistant"], ["TrainingRequirement", "Training Requirement", "RecordsAssistant"], ["TrainingSubmission", "Training Submission", "RecordsAssistant"], ["Unit", "Unit", "RecordsAssistant"], ["UnitSchedule", "Unit Schedule", "RecordsAssistant"], ["VehicleAssignment", "Vehicle Assignment", "RecordsAssistant"], ["Vendor", "Vendor", "RecordsAssistant"]];
const ALL_SOURCES = [...SOURCES,...CALLER_SOURCES];
const operationalNames = new Set(SOURCES.map(([name])=>name));

const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();
const normalizeSearchText = (value: unknown) => lower(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const compact = (values: unknown[]) => values.map(text).filter(Boolean).join(' ');

const labelFor = (record: any) =>
  record.title || record.checkpoint_name_snapshot || record.report_number || record.bolo_number || record.notice_number || record.citation_number ||
  record.complaint_number || record.summons_number || record.call_id || record.call_number ||
  record.linked_call_number || record.subject_name || record.person_name || record.vehicle_id ||
  record.license_plate || record.vehicle_plate || record.location || record.id;

function personText(record: any) {
  const parties = Array.isArray(record?.parties) ? record.parties : [];
  const suspects = Array.isArray(record?.suspects) ? record.suspects : [];
  const victims = Array.isArray(record?.victims) ? record.victims : [];
  const witnesses = Array.isArray(record?.witnesses) ? record.witnesses : [];
  return compact([
    record.subject_name, record.subject_dob, record.subject_id, record.subject_address,
    record.person_name, record.name, record.full_name, record.first_name, record.middle_name, record.last_name,
    record.suspect_name, record.employee_name, record.officer_name, record.driver_name, record.owner_name, record.contact_name,
    record.defendant_name, record.accused_name,
    record.violator_name, record.violator_dob, record.violator_dl_number,
    record.vehicle_owner, record.caller_name, record.caller_phone,
    record.accused_first_name, record.accused_middle_name, record.accused_last_name,
    record.accused_dob, record.accused_id_number, record.accused_address,
    record.defendant_name_first, record.defendant_name_middle, record.defendant_name_last,
    record.defendant_dob, record.defendant_license_no, record.defendant_address,
    ...parties.flatMap((p: any) => [p?.name, p?.dob, p?.description]),
    ...suspects.flatMap((p: any) => [p?.name, p?.dob, p?.dl_number]),
    ...victims.flatMap((p: any) => [p?.name, p?.dob]),
    ...witnesses.flatMap((p: any) => [p?.name, p?.dob]),
  ]).toLowerCase();
}

function vehicleText(record: any) {
  const vehicles = Array.isArray(record?.vehicles) ? record.vehicles : [];
  const suspectVehicles = Array.isArray(record?.suspect_vehicles) ? record.suspect_vehicles : [];
  return compact([
    record.vehicle_id, record.vehicle_year, record.vehicle_make, record.vehicle_model,
    record.vehicle_color, record.vehicle_plate, record.vehicle_plate_state,
    record.license_plate, record.license_state, record.vehicle_vin, record.vin,
    record.vehicle_info, record.registration_number,
    record.defendant_dl_year, record.defendant_dl_make,
    ...vehicles.flatMap((v: any) => [v?.year, v?.make, v?.model, v?.color, v?.plate, v?.state, v?.vin, v?.description]),
    ...suspectVehicles.flatMap((v: any) => [v?.year, v?.make, v?.model, v?.color, v?.plate, v?.state, v?.vin]),
  ]).toLowerCase();
}

function personName(record: any) {
  const party = Array.isArray(record?.parties) ? record.parties.find((p: any) => p?.name) : null;
  return record.subject_name || record.person_name || record.name || record.full_name ||
    (record.first_name || record.last_name ? compact([record.first_name, record.middle_name, record.last_name]) : '') ||
    record.suspect_name || record.employee_name || record.officer_name || record.driver_name || record.owner_name || record.contact_name ||
    record.defendant_name || record.accused_name || record.violator_name ||
    (record.accused_first_name || record.accused_last_name ? compact([record.accused_first_name, record.accused_middle_name, record.accused_last_name]) : '') ||
    (record.defendant_name_first || record.defendant_name_last ? compact([record.defendant_name_first, record.defendant_name_middle, record.defendant_name_last]) : '') ||
    party?.name || '';
}

function vehicleDisplay(record: any) {
  const vehicle = Array.isArray(record?.vehicles) ? record.vehicles[0] : null;
  const plate = record.license_plate || record.vehicle_plate || vehicle?.plate || '';
  const state = record.license_state || record.vehicle_plate_state || vehicle?.state || '';
  const description = compact([
    record.vehicle_year || vehicle?.year,
    record.vehicle_color || vehicle?.color,
    record.vehicle_make || vehicle?.make,
    record.vehicle_model || vehicle?.model,
  ]);
  return { plate, state, description, vin: record.vehicle_vin || record.vin || vehicle?.vin || '' };
}

function matchesTerms(haystack: string, terms: string[]) {
  return terms.every(term => haystack.includes(term));
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function listWithRetry(entity:any,entityName:string,offset=0) {
 for(let attempt=0;;attempt++){
  try{return await entity.list('id',250,offset);}
  catch(error){if(attempt>=1)throw error;await wait(400);}
 }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'officer' || user.role === 'supervisor' || user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor') || roles.has('dispatch');
    if (!allowed) return Response.json({ error: 'Records access required' }, { status: 403 });

    const privileged = user.role === 'admin' || roles.has('full_access');
    const operationalRecordsAccess = privileged || user.role === 'officer' || roles.has('officer') || user.role === 'dispatch' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('dispatch') || roles.has('supervisor');
    // Records AI is an authorized operational search tool. CAD/dispatch users need a
    // server-side read path or RLS can make legitimate searches look empty. Sensitive
    // personnel/disciplinary sources remain admin/full-access only below.
    const entityClient = operationalRecordsAccess ? base44.asServiceRole.entities : base44.entities;
    const body = await req.json();

    if (body?.action === 'get' && body?.entity && body?.id) {
      if(!privileged && new Set(['ConfidentialReport','Complaint','WriteUpReport','InspectionReport','UseOfForceReport']).has(String(body.entity)))
        return Response.json({error:'Record outside authorized access scope'},{status:403});
      const source = ALL_SOURCES.find(([entityName]) => entityName === body.entity);
      if (!source) return Response.json({ error: 'Unsupported record type' }, { status: 400 });
      const entity = (operationalNames.has(body.entity)?entityClient:base44.entities)[body.entity];
      const record = await entity.get(body.id);
      return Response.json({ record, source: source[1], page: source[2] });
    }

    const query = normalizeSearchText(body?.query);
    const searchType = ['all', 'person', 'vehicle'].includes(String(body?.search_type || 'all')) ? String(body?.search_type || 'all') : 'all';
    if (query.length < 2) return Response.json({ results: [], searched_sources: 0, total_matches: 0, search_type: searchType, warrant_matches: 0 });
    const terms = query.split(/\s+/).filter(Boolean);

    const restrictedEntities = new Set(['ConfidentialReport', 'Complaint', 'WriteUpReport', 'InspectionReport', 'UseOfForceReport']);
    const requestedEntities = Array.isArray(body?.entities)
      ? new Set(body.entities.map((value: unknown) => String(value || '').trim()).filter(Boolean))
      : null;
    const permittedSources = privileged ? ALL_SOURCES : ALL_SOURCES.filter(([entityName]) => !restrictedEntities.has(entityName));
    const searchableSources = requestedEntities?.size
      ? permittedSources.filter(([entityName]) => requestedEntities.has(entityName))
      : permittedSources;

    // Loading every source at once caused API throttling and then silently returned
    // an empty search. Process a few sources at a time and retry transient failures.
    const settled: PromiseSettledResult<any[]>[] = [];
    // Round-robin pages: a large CAD archive must not block every report source.
    const pending = Array.isArray(body?.cursor?.pending)
      ? body.cursor.pending.filter((p:any)=>Number.isInteger(p.source)&&p.source>=0&&p.source<searchableSources.length&&Number.isInteger(p.offset)&&p.offset>=0).map((p:any)=>({source:p.source,offset:p.offset}))
      : searchableSources.map((_,source)=>({source,offset:0}));
    let pages=0;
    const failedLabels:string[]=[];
    while(pending.length&&pages<5){
      const {source:sourceIndex,offset}=pending.shift();
      const [entityName,sourceLabel,page]=searchableSources[sourceIndex];
      const currentOffset=offset;let rowCount=0;
      const batchResults=await Promise.allSettled([(async()=>{
        const entity=(operationalNames.has(entityName)?entityClient:base44.entities)[entityName];
        const rows=await listWithRetry(entity,entityName,currentOffset);rowCount=rows?.length||0;
        return (rows || []).filter((record: any) => {
          const allText = normalizeSearchText(JSON.stringify(record));
          // People searches must match people, not a street name or incidental
          // narrative mention. For example 'brown' must not return a traffic
          // stop at Brown's Island as though Brown were a named person.
          // All-record search still indexes full narratives for broader research.
          const scoped = searchType === 'person'
            ? normalizeSearchText(personText(record))
            : searchType === 'vehicle'
              ? normalizeSearchText(vehicleText(record))
              : allText;
          return scoped && matchesTerms(scoped, terms);
        }).map((record: any) => {
          const vehicle = vehicleDisplay(record);
          const isWarrant = entityName === 'CriminalComplaint' && (record.warrant_issued === true || record.status === 'warrant_issued' || Boolean(record.warrant_number));
          const names=normalizeSearchText([personName(record),
            ...(Array.isArray(record.parties)?record.parties.map((p:any)=>p?.name):[]),
            ...(Array.isArray(record.suspects)?record.suspects.map((p:any)=>p?.name):[]),
            ...(Array.isArray(record.victims)?record.victims.map((p:any)=>p?.name):[]),
            ...(Array.isArray(record.witnesses)?record.witnesses.map((p:any)=>p?.name):[])].filter(Boolean).join(' '));
          const reference=normalizeSearchText([record.report_number,record.call_number,record.call_id,
            record.linked_call_number,record.citation_number,record.complaint_number,record.notice_number,
            record.summons_number,record.bolo_number,record.warrant_number,record.id].filter(Boolean).join(' '));
          const locations=normalizeSearchText([record.location,record.site_name,record.property_name,
            record.address,record.last_known_location,record.offense_place,record.location_of_offense].filter(Boolean).join(' '));
          const matchContext=matchesTerms(reference,terms)?'reference':matchesTerms(names,terms)?'person':
            matchesTerms(normalizeSearchText(vehicleText(record)),terms)?'vehicle':matchesTerms(locations,terms)?'location':'report text';
          return {
            id: record.id,
            entity: entityName,
            source: sourceLabel,
            match_context:matchContext,
            page,
            label: labelFor(record),
            date: record.incident_date || record.notice_date || record.report_date || record.shift_date || record.violation_date || record.offense_date || record.created_date,
            location: record.location || record.site_name || record.property_name || record.address || record.last_known_location || record.offense_place || record.location_of_offense || '',
            person: personName(record),
            vehicle_plate: vehicle.plate,
            vehicle_state: vehicle.state,
            vehicle_description: vehicle.description,
            vehicle_vin: vehicle.vin,
            record_kind: personText(record) && vehicleText(record) ? 'person_vehicle' : personText(record) ? 'person' : vehicleText(record) ? 'vehicle' : 'record',
            warrant_issued: isWarrant,
            warrant_number: record.warrant_number || '',
            status: record.status || record.approval_status || '',
            summary: record.description || record.narrative || record.reason || record.notes || record.summary || record.details || record.statement_of_facts || record.ai_summary || record.violation_description || record.facts_basis || '',
            linked_call_number: record.linked_call_number || record.call_number || record.call_id || '',
          };
        });
      })()]);
      settled.push(...batchResults);pages++;
      if(batchResults[0].status==='rejected')failedLabels.push(sourceLabel);
      if(batchResults[0].status==='fulfilled'&&rowCount===250)pending.push({source:sourceIndex,offset:offset+250});
    }

    const successfulSources = settled.filter(result => result.status === 'fulfilled').length;
    const failedSources = settled.length - successfulSources;

    const results: any[] = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const linkedNumbers = [...new Set(results.map(item => item.linked_call_number).filter(Boolean).map(String))];
    if (linkedNumbers.length) {
      const calls = await (entityClient as any).DispatchCall.list('-time_received', 1000).catch(() => []);
      const byNumber = new Map<string, any>();
      for (const call of calls || []) {
        for (const key of [call.call_id, call.agency_cad_number, call.bps_reference]) if (key) byNumber.set(String(key), call);
      }
      for (const item of results) {
        const call = byNumber.get(String(item.linked_call_number || ''));
        if (!call) continue;
        item.linked_call_type = call.incident || '';
        item.linked_call_location = call.location || '';
        item.linked_call_status = call.status || '';
      }
    }

    const relevance:any={'reference':0,'person':1,'vehicle':2,'location':3,'report text':4};
    results.sort((a,b)=>(relevance[a.match_context]??5)-(relevance[b.match_context]??5)||String(b.date||'').localeCompare(String(a.date||'')));
    const warrantMatches = results.filter(item => item.warrant_issued).length;
    return Response.json({
      results,
      next_cursor:pending.length?{pending,source:searchableSources.length-new Set(pending.map((p:any)=>p.source)).size}:null,
      total_sources:searchableSources.length,
      failed_source_labels:failedLabels,
      truncated:false,
      searched_sources: successfulSources,
      failed_sources: failedSources,
      partial: failedSources > 0,
      total_matches: results.length,
      search_type: searchType,
      warrant_matches: warrantMatches,
      warrant_status_text: warrantMatches ? `${warrantMatches} warrant record${warrantMatches === 1 ? '' : 's'} located in Pathfinder.` : 'No warrant records located in Pathfinder.',
    });
  } catch (error) {
    console.error('searchCompanyRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to search company records' }, { status: 500 });
  }
});