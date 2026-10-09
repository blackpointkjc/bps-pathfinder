import { createClientFromRequest } from 'npm:@base44/sdk';

const allowed = ['mobile_phone','address','city','state','zip','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','drivers_license_number','drivers_license_state','drivers_license_expiration','dcjs_number','dcjs_expiration'];
const required = ['mobile_phone','address','city','state','zip','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','drivers_license_number','drivers_license_state','drivers_license_expiration','dcjs_number'];
Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({error:'Sign in required'}, {status:401});
    const roles = (me.additional_roles || []).map(value => String(value).toLowerCase());
    if (me.role === 'admin' || roles.some(r => ['officer','cad_access','client','student','support_staff','support','hr','trainer','full_access','dispatch'].includes(r))) {
      return Response.json({error:'Only pending users can submit this onboarding form'}, {status:403});
    }
    const values = await req.json();
    const updates = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(values,field)) updates[field] = String(values[field] ?? '').trim().slice(0,255);
    }
    const current = await base44.asServiceRole.entities.User.get(me.id);
    const combined = {...current,...updates};
    const missing = required.filter(field => !String(combined[field] || '').trim());
    if (missing.length) return Response.json({error:'Complete all required fields before submitting.',missing}, {status:400});
    await base44.asServiceRole.entities.User.update(me.id, updates);
    return Response.json({success:true, awaiting_admin_approval:true});
  } catch (error) {
    console.error('completePendingProfile failed', error);
    return Response.json({error:error?.message || 'Could not save onboarding information'}, {status:500});
  }
});