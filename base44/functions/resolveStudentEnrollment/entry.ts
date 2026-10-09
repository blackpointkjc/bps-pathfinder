import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me();
    if (!me?.id || !me?.email) return Response.json({ error: 'Sign-in required' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((role:unknown) => String(role).toLowerCase()));
    if (me.role === 'admin' || roles.size || me.rank === 'Student') return Response.json({ success: true, student_pending: false });
    const email = String(me.email).trim().toLowerCase();
    const rows = await api.asServiceRole.entities.StudentEnrollment.filter({ email }, '-created_date', 3);
    const enrollment = (rows || []).find((item:any) => ['invited','profile_submitted'].includes(item.status));
    if (!enrollment) return Response.json({ success: true, student_pending: false });
    // Preserve the original identity and permissions; attach only student-pending metadata.
    const profile = {
      rank: 'Student Registration Pending',
      first_name: me.first_name || enrollment.first_name,
      last_name: me.last_name || enrollment.last_name,
      date_of_birth: me.date_of_birth || enrollment.date_of_birth,
    };
    await api.asServiceRole.entities.User.update(me.id, profile);
    if (enrollment.user_id !== me.id) {
      await api.asServiceRole.entities.StudentEnrollment.update(enrollment.id, { user_id: me.id });
    }
    return Response.json({ success: true, student_pending: true, ...profile });
  } catch(error) {
    console.error('Unable to resolve student enrollment', error?.message || error);
    return Response.json({ error: 'Student enrollment verification temporarily unavailable' }, { status: 503 });
  }
});