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
  ['Vehicle', 'Fleet / Vehicle Records', 'AdminPortal'],
] as const;

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
  record.report_number || record.bolo_number || record.notice_number || record.citation_number ||
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor') || roles.has('dispatch');
    if (!allowed) return Response.json({ error: 'Records access required' }, { status: 403 });

    const privileged = user.role === 'admin' || roles.has('full_access');
    const operationalRecordsAccess = privileged || user.role === 'dispatch' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('dispatch') || roles.has('supervisor');
    // Records AI is an authorized operational search tool. CAD/dispatch users need a
    // server-side read path or RLS can make legitimate searches look empty. Sensitive
    // personnel/disciplinary sources remain admin/full-access only below.
    const entityClient = operationalRecordsAccess ? base44.asServiceRole.entities : base44.entities;
    const body = await req.json();

    if (body?.action === 'get' && body?.entity && body?.id) {
      const source = SOURCES.find(([entityName]) => entityName === body.entity);
      if (!source) return Response.json({ error: 'Unsupported record type' }, { status: 400 });
      const entity = (entityClient as any)[body.entity];
      const record = await entity.get(body.id);
      return Response.json({ record, source: source[1], page: source[2] });
    }

    const query = normalizeSearchText(body?.query);
    const searchType = ['all', 'person', 'vehicle'].includes(String(body?.search_type || 'all')) ? String(body?.search_type || 'all') : 'all';
    if (query.length < 2) return Response.json({ results: [], searched_sources: 0, total_matches: 0, search_type: searchType, warrant_matches: 0 });
    const terms = query.split(/\s+/).filter(Boolean);

    const restrictedEntities = new Set(['ConfidentialReport', 'Complaint', 'WriteUpReport', 'InspectionReport', 'UseOfForceReport']);
    const searchableSources = privileged ? SOURCES : SOURCES.filter(([entityName]) => !restrictedEntities.has(entityName));

    const settled = await Promise.allSettled(searchableSources.map(async ([entityName, sourceLabel, page]) => {
      const entity = (entityClient as any)[entityName];
      if (!entity?.list) return [];
      const rows = await entity.list('-created_date', 1000);
      return (rows || []).filter((record: any) => {
        const allText = normalizeSearchText(JSON.stringify(record));
        // Structured fields are preferred for display, but searches must not miss a
        // real person/vehicle merely because an older report stored the value in a
        // narrative, legacy field, or differently named nested object.
        const scoped = searchType === 'person'
          ? normalizeSearchText(`${personText(record)} ${allText}`)
          : searchType === 'vehicle'
            ? normalizeSearchText(`${vehicleText(record)} ${allText}`)
            : allText;
        return scoped && matchesTerms(scoped, terms);
      }).slice(0, 100).map((record: any) => {
        const vehicle = vehicleDisplay(record);
        const isWarrant = entityName === 'CriminalComplaint' && (record.warrant_issued === true || record.status === 'warrant_issued' || Boolean(record.warrant_number));
        return {
          id: record.id,
          entity: entityName,
          source: sourceLabel,
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
    }));

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

    results.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const warrantMatches = results.filter(item => item.warrant_issued).length;
    return Response.json({
      results: results.slice(0, 250),
      searched_sources: settled.filter(result => result.status === 'fulfilled').length,
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