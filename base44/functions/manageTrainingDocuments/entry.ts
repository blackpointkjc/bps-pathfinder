import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = lower(user.role) === 'admin' || roles.has('trainer') || roles.has('training') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Trainer or administrator access required.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'create');

    if (action === 'delete') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Document id is required.' }, { status: 400 });
      await base44.asServiceRole.entities.TrainingDocument.delete(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'TrainingDocument',
        entity_id: id,
        action: 'delete',
        actor_id: String(user.id || user.email || ''),
        actor_name: user.full_name || user.email || 'Trainer',
        timestamp: new Date().toISOString(),
        description: 'Training document deleted from Trainer Center.',
      }).catch(() => null);
      return Response.json({ success: true, deleted: id });
    }

    if (action !== 'create') return Response.json({ error: 'Unsupported action.' }, { status: 400 });
    const data = body.data || {};
    const title = String(data.title || '').trim();
    const fileUrl = String(data.file_url || '').trim();
    const fileName = String(data.file_name || '').trim();
    if (!title || !fileUrl || !fileName) return Response.json({ error: 'Title and uploaded file are required.' }, { status: 400 });
    const category = ['site_procedures','safety','emergency','training','policies','other'].includes(lower(data.category)) ? lower(data.category) : 'other';
    const row = await base44.asServiceRole.entities.TrainingDocument.create({
      title,
      description: String(data.description || '').slice(0, 4000),
      file_url: fileUrl,
      file_name: fileName,
      category,
      locations: Array.isArray(data.locations) ? data.locations.filter(Boolean).slice(0, 250) : [],
      uploaded_date: new Date().toISOString(),
      uploaded_by: user.email || '',
    });
    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'TrainingDocument',
      entity_id: row.id,
      action: 'create',
      actor_id: String(user.id || user.email || ''),
      actor_name: user.full_name || user.email || 'Trainer',
      timestamp: new Date().toISOString(),
      description: `Training document uploaded: ${title}`,
    }).catch(() => null);
    return Response.json({ success: true, document: row });
  } catch (error) {
    console.error('manageTrainingDocuments failed', error);
    return Response.json({ error: error?.message || 'Unable to manage training documents.' }, { status: 500 });
  }
});
