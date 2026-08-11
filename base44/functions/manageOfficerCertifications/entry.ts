import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const FIREARM_PREFIXES = ['07','08','09','10'];

function computeDcjsExpiration(certs: any[]) {
  const core = certs.find((c: any) => String(c?.course_id || '').startsWith('01') && c?.expiration_date);
  if (core?.expiration_date) return core.expiration_date;
  const dated = certs
    .filter((c: any) => c?.category === 'dcjs' && c?.expiration_date)
    .sort((a: any, b: any) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
  return dated[0]?.expiration_date || '';
}

function computeFirearmExpiration(certs: any[]) {
  const dated = certs
    .filter((c: any) => FIREARM_PREFIXES.some(prefix => String(c?.course_id || '').startsWith(prefix)) && c?.expiration_date)
    .sort((a: any, b: any) => new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime());
  return dated[0]?.expiration_date || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const authorized = me.role === 'admin' || roles.has('trainer') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'Trainer access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const target = body.user_id
      ? (users || []).find((u: any) => u.id === body.user_id)
      : (users || []).find((u: any) => String(u.email || '').toLowerCase() === String(body.officer_email || '').toLowerCase());
    if (!target) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const targetRoles = new Set((target.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const targetType = String(target.user_type || target.account_type || target.portal_type || '').toLowerCase();
    if (targetRoles.has('client') || targetRoles.has('student') || ['client','student','pending'].includes(targetType)) {
      return Response.json({ error: 'Certification management is limited to company personnel' }, { status: 403 });
    }

    let certs: any[];
    if (body.action === 'upsert') {
      if (!body.cert || typeof body.cert !== 'object') return Response.json({ error: 'cert is required for upsert' }, { status: 400 });
      const current = Array.isArray(target.officer_certifications) ? [...target.officer_certifications] : [];
      const normalize = (value: any) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = current.findIndex((entry: any) => {
        const courseMatch = body.cert.course_id && normalize(entry.course_id) === normalize(body.cert.course_id);
        const nameMatch = normalize(entry.training_name || entry.name) === normalize(body.cert.training_name || body.cert.name);
        return courseMatch || nameMatch;
      });
      const next = { ...(idx >= 0 ? current[idx] : {}), ...body.cert };
      if (idx >= 0) current[idx] = next; else current.push(next);
      certs = current;
    } else {
      if (!Array.isArray(body.officer_certifications)) return Response.json({ error: 'officer_certifications are required' }, { status: 400 });
      certs = body.officer_certifications;
    }
    const updates = {
      officer_certifications: certs,
      dcjs_expiration: computeDcjsExpiration(certs),
      firearm_expiration: computeFirearmExpiration(certs),
    };
    await base44.asServiceRole.entities.User.update(target.id, updates);

    return Response.json({
      success: true,
      user: {
        id: target.id,
        email: target.email || '',
        first_name: target.first_name || '',
        last_name: target.last_name || '',
        rank: target.rank || '',
        unit_number: target.unit_number || '',
        division: target.division || '',
        profile_photo_url: target.profile_photo_url || '',
        additional_roles: target.additional_roles || [],
        officer_certifications: certs,
        dcjs_number: target.dcjs_number || '',
        dcjs_expiration: updates.dcjs_expiration,
        firearm_expiration: updates.firearm_expiration,
      }
    });
  } catch (error) {
    console.error('manageOfficerCertifications failed', error);
    return Response.json({ error: error?.message || 'Unable to update certifications' }, { status: 500 });
  }
});
