import { createClientFromRequest } from 'npm:@base44/sdk';

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
];

const labelFor = (record: any) =>
  record.report_number || record.bolo_number || record.notice_number || record.citation_number ||
  record.complaint_number || record.summons_number || record.call_id || record.call_number ||
  record.linked_call_number || record.subject_name || record.person_name || record.location || record.id;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor');
    if (!allowed) return Response.json({ error: 'Records access required' }, { status: 403 });

    // Only admins/full-access users may bypass entity RLS. Everyone else must use
    // the caller-scoped entity client so ConfidentialReport, WriteUpReport,
    // Complaint, InspectionReport, and other protected records enforce their own RLS.
    const canBypassRls = user.role === 'admin' || roles.has('full_access');
    const entityClient = canBypassRls ? base44.asServiceRole.entities : base44.entities;

    const body = await req.json();
    if (body?.action === 'get' && body?.entity && body?.id) {
      const source = SOURCES.find(([entityName]) => entityName === body.entity);
      if (!source) return Response.json({ error: 'Unsupported record type' }, { status: 400 });
      const entity = (entityClient as any)[body.entity];
      const record = await entity.get(body.id);
      return Response.json({ record, source: source[1], page: source[2] });
    }
    const query = String(body?.query || '').trim().toLowerCase();
    if (query.length < 2) return Response.json({ results: [], searched_sources: 0 });
    const terms = query.split(/\s+/).filter(Boolean);

    const settled = await Promise.allSettled(SOURCES.map(async ([entityName, sourceLabel, page]) => {
      const entity = (entityClient as any)[entityName];
      if (!entity?.list) return [];
      const rows = await entity.list('-created_date', 1000);
      return (rows || []).filter((record: any) => {
        const searchable = JSON.stringify(record).toLowerCase();
        return terms.every(term => searchable.includes(term));
      }).slice(0, 100).map((record: any) => ({
        id: record.id,
        entity: entityName,
        source: sourceLabel,
        page,
        label: labelFor(record),
        date: record.incident_date || record.notice_date || record.report_date || record.shift_date || record.created_date,
        location: record.location || record.site_name || record.property_name || record.address || record.last_known_location || record.offense_place || '',
        person: record.subject_name || record.person_name || record.suspect_name || record.employee_name || record.officer_name || record.violator_name || (record.accused_first_name && record.accused_last_name ? `${record.accused_first_name} ${record.accused_last_name}` : record.accused_last_name) || record.defendant_printed_name || (record.defendant_name_first && record.defendant_name_last ? `${record.defendant_name_first} ${record.defendant_name_last}` : record.defendant_name_last) || '',
        status: record.status || record.approval_status || '',
        summary: record.description || record.narrative || record.reason || record.notes || record.summary || record.details || record.statement_of_facts || record.ai_summary || '',
        linked_call_number: record.linked_call_number || record.call_number || record.call_id || '',
      }));
    }));

    const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);

    // Enrich report hits that reference a CAD call with the actual incident type.
    // This lets Records AI announce the call type instead of only saying a call number.
    const linkedNumbers = [...new Set(results.map((item: any) => item.linked_call_number).filter(Boolean).map(String))];
    if (linkedNumbers.length) {
      const calls = await entityClient.DispatchCall.list('-time_received', 1000).catch(() => []);
      const byNumber = new Map<string, any>();
      for (const call of calls || []) {
        for (const key of [call.call_id, call.agency_cad_number, call.bps_reference]) {
          if (key) byNumber.set(String(key), call);
        }
      }
      for (const item of results) {
        const call = byNumber.get(String(item.linked_call_number || ''));
        if (!call) continue;
        item.linked_call_type = call.incident || '';
        item.linked_call_location = call.location || '';
        item.linked_call_status = call.status || '';
      }
    }

    results.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return Response.json({ results: results.slice(0, 250), searched_sources: SOURCES.length, total_matches: results.length });
  } catch (error) {
    console.error('searchCompanyRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to search company records' }, { status: 500 });
  }
});