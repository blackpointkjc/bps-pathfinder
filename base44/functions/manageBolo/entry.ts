import { createClientFromRequest } from 'npm:@base44/sdk';

const EDITABLE_FIELDS = [
  'alert_type','priority','title','description','subject_name','subject_dob','subject_race','subject_sex',
  'subject_height','subject_weight','subject_description','vehicle_make','vehicle_model','vehicle_year',
  'vehicle_color','vehicle_plate','last_known_location','jurisdiction','expires_at','notes','contact_info','case_number',
  'linked_call_id','linked_call_number','linked_incident_report_id','linked_incident_report_number','photo_urls','attachments','parties','vehicles'
];

function cleanPayload(input: any) {
  const output: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (input?.[field] !== undefined) output[field] = input[field];
  return output;
}

function boloAnnouncement(record: any) {
  const party = Array.isArray(record?.parties) ? record.parties.find((item: any) => item?.name) : null;
  const vehicle = Array.isArray(record?.vehicles) ? record.vehicles.find((item: any) => item?.plate || item?.make || item?.model) : null;
  const subject = party?.name || record?.subject_name || '';
  const vehicleText = [vehicle?.year || record?.vehicle_year, vehicle?.color || record?.vehicle_color, vehicle?.make || record?.vehicle_make, vehicle?.model || record?.vehicle_model].filter(Boolean).join(' ');
  const plate = vehicle?.plate || record?.vehicle_plate || '';
  const safety = record?.alert_type === 'officer_safety' ? 'Officer safety alert.' : '';
  return ['New BOLO.', String(record?.alert_type || 'watch notice').replaceAll('_', ' '), subject && `Subject ${subject}`, vehicleText && `Vehicle ${vehicleText}`, plate && `Plate ${plate}`, record?.last_known_location && `Last known location ${record.last_known_location}`, safety].filter(Boolean).join('. ') + '.';
}

async function publishAnnouncement(base44: any, record: any, now: string) {
  await base44.asServiceRole.entities.CallStatusLog.create({
    call_id: record.linked_call_id || `bolo:${record.id}`,
    incident_type: 'BOLO',
    location: record.last_known_location || '',
    old_status: 'draft',
    new_status: 'active',
    notes: `BOLO ${record.bolo_number || record.id} published`,
    event_key: `bolo:${record.id}:published`,
    event_type: 'bolo_published',
    announcement_text: boloAnnouncement(record),
    announcement_priority: record.priority === 'critical' ? 'critical' : 'high',
    cad_number: record.linked_call_number || record.bolo_number || '',
    triggering_action: 'manageBolo.publish',
    audio_enabled: true,
    sensitive: false,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const isOfficer = roles.has('officer');
    const hasCadAccess = roles.has('cad_access') || user.dispatch_role === true;
    const isManager = user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true || roles.has('full_access') || roles.has('supervisor') || roles.has('dispatch');
    if (!isOfficer && !isManager && !hasCadAccess) return Response.json({ error: 'Officer or CAD/command access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'create');
    const now = new Date().toISOString();
    const actorName = [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;

    if (action === 'create' || (action === 'save_draft' && !body?.id)) {
      const data = cleanPayload(body.data || {});
      const isDraft = action === 'save_draft';
      if (!data.alert_type) return Response.json({ error: 'Alert type is required' }, { status: 400 });
      if (!isDraft && !String(data.title || '').trim()) return Response.json({ error: 'Title is required before release' }, { status: 400 });
      const record = await base44.asServiceRole.entities.BOLOAlert.create({
        ...data,
        title: String(data.title || '').trim() || 'Untitled BOLO Draft',
        priority: data.priority || 'medium',
        status: isDraft ? 'draft' : 'active',
        bolo_number: isDraft ? '' : `BOLO-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Date.now().toString().slice(-5)}`,
        issued_by: actorName,
        issued_by_id: user.id,
      });
      if (!isDraft) await publishAnnouncement(base44, record, now);
      return Response.json({ success: true, record, status: isDraft ? 'draft' : 'active' });
    }

    const id = String(body?.id || '');
    if (!id) return Response.json({ error: 'BOLO id is required' }, { status: 400 });
    const record = await base44.asServiceRole.entities.BOLOAlert.get(id);
    if (!record) return Response.json({ error: 'BOLO not found' }, { status: 404 });
    const ownsRecord = record.issued_by_id === user.id || record.created_by_id === user.id;

    if (action === 'edit' || action === 'save_draft') {
      if (!isManager && !ownsRecord) return Response.json({ error: 'You can only edit BOLOs you issued' }, { status: 403 });
      if (!['active', 'draft'].includes(String(record.status || '')) && !isManager) return Response.json({ error: 'Only command staff can edit a closed BOLO' }, { status: 403 });
      const updates = cleanPayload(body.data || {});
      if (action === 'save_draft') updates.status = 'draft';
      await base44.asServiceRole.entities.BOLOAlert.update(id, updates);
      return Response.json({ success: true, status: action === 'save_draft' ? 'draft' : record.status });
    }

    if (action === 'release') {
      if (!isManager && !ownsRecord) return Response.json({ error: 'You can only release BOLOs you issued' }, { status: 403 });
      if (record.status !== 'draft') return Response.json({ error: 'Only saved drafts can be released' }, { status: 409 });
      const updates = cleanPayload(body.data || {});
      const releaseTitle = String(updates.title || record.title || '').trim();
      if (!releaseTitle || releaseTitle === 'Untitled BOLO Draft') return Response.json({ error: 'Enter a BOLO title before release' }, { status: 400 });
      const releaseData = {
        ...updates,
        title: releaseTitle,
        status: 'active',
        bolo_number: record.bolo_number || `BOLO-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Date.now().toString().slice(-5)}`,
        issued_by: actorName,
        issued_by_id: user.id,
      };
      await base44.asServiceRole.entities.BOLOAlert.update(id, releaseData);
      const releasedRecord = { ...record, ...releaseData, id };
      await publishAnnouncement(base44, releasedRecord, now);
      return Response.json({ success: true, status: 'active', record: releasedRecord });
    }

    if (action === 'resolve') {
      if (!isManager && !ownsRecord) return Response.json({ error: 'You can only resolve BOLOs you issued' }, { status: 403 });
      const resolution = String(body?.resolution || '').trim();
      if (!resolution) return Response.json({ error: 'Resolution/disposition is required' }, { status: 400 });
      await base44.asServiceRole.entities.BOLOAlert.update(id, {
        status: 'resolved',
        resolved_at: now,
        resolved_by: actorName,
        resolved_by_id: user.id,
        resolution_notes: resolution,
      });
      return Response.json({ success: true, status: 'resolved' });
    }

    if (action === 'set_status') {
      if (!isManager) return Response.json({ error: 'Command access required' }, { status: 403 });
      const status = String(body?.status || '');
      if (!['active','cancelled','expired','located','resolved'].includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });
      const updates: Record<string, unknown> = { status };
      if (status !== 'active') {
        updates.resolved_at = now;
        updates.resolved_by = actorName;
        updates.resolved_by_id = user.id;
        updates.resolution_notes = String(body?.resolution || status).trim();
      }
      await base44.asServiceRole.entities.BOLOAlert.update(id, updates);
      return Response.json({ success: true, status });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageBolo failed', error);
    return Response.json({ error: error?.message || 'Unable to manage BOLO' }, { status: 500 });
  }
});