import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const SOURCES = [
  ['IncidentReport', 'Incident Reports', 'IncidentReports'],
  ['DailyActivityReport', 'Daily Activity Reports', 'DailyActivityReports'],
  ['MaintenanceReport', 'Maintenance Reports', 'MaintenanceReports'],
  ['OpenDoorReport', 'Open Door Reports', 'OpenDoorReports'],
  ['ConfidentialReport', 'Confidential Reports', 'AdminConfidentialReports'],
  ['TrespassingNotice', 'Trespassing Notices', 'VATrespassNotices'],
  ['VATrespassNotice', 'VA Trespass Notices', 'VATrespassNotices'],
  ['MDTrespassNotice', 'MD Trespass Notices', 'MDTrespassNotices'],
  ['CriminalComplaint', 'Criminal Complaints', 'CriminalComplaints'],
  ['MDCriminalComplaint', 'MD Criminal Complaints', 'MDCriminalComplaints'],
  ['Complaint', 'Complaints', 'SupervisorComplaints'],
  ['UseOfForceReport', 'Use of Force Reports', 'SupervisorUseOfForce'],
  ['WriteUpReport', 'Write-Up Reports', 'SupervisorWriteUps'],
  ['InspectionReport', 'Inspection Reports', 'SupervisorInspections'],
  ['ParkingViolation', 'Parking Violations', 'IncidentReports'],
  ['MovingViolation', 'Moving Violations', 'IncidentReports'],
  ['Summons', 'Summons', 'Summons'],
  ['QRPatrolReport', 'QR Patrol Reports', 'AdminQRReports'],
  ['ShiftReport', 'Shift Reports', 'ShiftReports'],
];

const labelFor = (record: any) =>
  record.report_number || record.notice_number || record.complaint_number || record.summons_number ||
  record.call_number || record.linked_call_number || record.subject_name || record.location || record.id;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor');
    if (!allowed) return Response.json({ error: 'Records access required' }, { status: 403 });

    const body = await req.json();
    const query = String(body?.query || '').trim().toLowerCase();
    if (query.length < 2) return Response.json({ results: [], searched_sources: 0 });
    const terms = query.split(/\s+/).filter(Boolean);

    const settled = await Promise.allSettled(SOURCES.map(async ([entityName, sourceLabel, page]) => {
      const entity = (base44.asServiceRole.entities as any)[entityName];
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
        location: record.location || record.site_name || record.property_name || '',
        person: record.subject_name || record.person_name || record.suspect_name || record.employee_name || record.officer_name || '',
        status: record.status || record.approval_status || '',
        summary: record.description || record.narrative || record.reason || record.notes || record.summary || '',
        linked_call_number: record.linked_call_number || record.call_number || '',
      }));
    }));

    const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    results.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return Response.json({ results: results.slice(0, 250), searched_sources: SOURCES.length, total_matches: results.length });
  } catch (error) {
    console.error('searchCompanyRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to search company records' }, { status: 500 });
  }
});