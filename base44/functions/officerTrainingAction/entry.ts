import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || '');
    const assignmentId = String(body.assignment_id || '');
    if (!assignmentId) return Response.json({ error: 'Assignment is required' }, { status: 400 });

    const assignments = await base44.asServiceRole.entities.TrainingAssignment.list('-assigned_date', 5000);
    const assignment = (assignments || []).find((entry: any) => String(entry.id) === assignmentId);
    if (!assignment) return Response.json({ error: 'Training assignment not found' }, { status: 404 });
    if (String(assignment.officer_email || '').toLowerCase() !== String(user.email).toLowerCase()) {
      return Response.json({ error: 'You can only update your own training assignments' }, { status: 403 });
    }

    if (action === 'complete_module') {
      await base44.asServiceRole.entities.TrainingAssignment.update(assignment.id, { status: 'approved' });
      return Response.json({ success: true });
    }

    if (action === 'submit') {
      const form = body.form || {};
      const submissions = await base44.asServiceRole.entities.TrainingSubmission.list('-submission_date', 5000);
      const version = (submissions || []).filter((entry: any) => entry.assignment_id === assignment.id && String(entry.officer_email || '').toLowerCase() === String(user.email).toLowerCase()).length + 1;
      const submission = await base44.asServiceRole.entities.TrainingSubmission.create({
        assignment_id: assignment.id,
        training_name: assignment.training_name,
        officer_email: user.email,
        officer_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        submission_date: new Date().toISOString(),
        photo_url_1: form.photo_url_1 || '',
        photo_url_2: form.photo_url_2 || '',
        document_url: form.document_url || '',
        document_name: form.document_name || '',
        certificate_number: form.certificate_number || '',
        issue_date: form.issue_date || null,
        expiration_date: form.expiration_date || null,
        officer_notes: form.officer_notes || '',
        status: 'pending_review',
        version,
      });
      await base44.asServiceRole.entities.TrainingAssignment.update(assignment.id, { status: 'pending_review' });
      return Response.json({ success: true, submission });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('officerTrainingAction failed', error);
    return Response.json({ error: error?.message || 'Unable to update training' }, { status: 500 });
  }
});
