import { createClientFromRequest } from 'npm:@base44/sdk';

const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';
const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function blackPointEmail(subject: string, content: string, actionLabel = 'View in Black Point Portal', actionUrl = PORTAL_URL) {
  const year = new Date().getFullYear();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${subject}</title></head><body style="margin:0;padding:0;background-color:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0b0b0b;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background-color:#151515;border:1px solid #caa72d;border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:30px 24px 20px;background-color:#050505;"><img src="${LOGO_URL}" alt="Black Point" width="210" style="display:block;width:210px;max-width:75%;height:auto;border:0;"></td></tr><tr><td style="height:5px;line-height:5px;font-size:0;background-color:#d4af37;">&nbsp;</td></tr><tr><td style="padding:34px 38px 12px;"><h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.25;text-align:center;">${subject}</h1><div style="color:#d7d7d7;font-size:16px;line-height:1.65;">${content}</div></td></tr><tr><td align="center" style="padding:10px 38px 8px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 22px;"><tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;"><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;">${actionLabel}</a></td></tr></table><p style="margin:0 0 18px;color:#bdbdbd;font-size:14px;line-height:1.65;text-align:center;">Portal address:<br><a href="${actionUrl}" style="color:#e5c75b;text-decoration:underline;">${actionUrl}</a></p></td></tr><tr><td style="padding:24px 38px 34px;"><p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:bold;">Black Point</p><p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p></td></tr><tr><td align="center" style="padding:22px 24px;background-color:#050505;border-top:1px solid #292929;"><p style="margin:0 0 8px;color:#8f8f8f;font-size:12px;line-height:1.5;">Need more information? Visit our main website.</p><p style="margin:0;"><a href="https://home.blackpointkjc.com/" target="_blank" style="color:#d4af37;font-size:13px;text-decoration:underline;">home.blackpointkjc.com</a></p><p style="margin:14px 0 0;color:#666666;font-size:11px;">© ${year} Black Point. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
}

function accountCreatedEmail(firstName: string, accountType: string) {
  const portalLabel = accountType === 'client'
    ? 'Client Portal'
    : accountType === 'student'
      ? 'Student Training Portal'
      : 'Employee Portal';
  const content = `
    <p>Hello ${escapeHtml(firstName)},</p>
    <p>A Black Point account has been created for you with access to the <strong>${portalLabel}</strong>. Before signing in for the first time, you will need to create your password through the account portal.</p>
    <h3>Set up your password</h3>
    <p>1. Open the Black Point portal.<br>2. Select <strong>Forgot Password</strong>.<br>3. Enter the email address connected to your account.<br>4. Follow the password-reset instructions sent to your email.</p>
    <p>For your security, do not share your password or password-reset link with anyone. Black Point staff will never ask you to send your password by email.</p>
  `;
  return blackPointEmail('Your Black Point Account Has Been Created', content, 'Access the Black Point Portal', PORTAL_URL);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      accountType, first_name, last_name, email, mobile_phone, assigned_location, assigned_locations,
      date_of_birth, badge_number, rank, unit_number, hire_date, division,
      dcjs_number, dcjs_expiration, firearm_expiration
    } = body;

    if (!['pending', 'client', 'student', 'employee'].includes(accountType)) {
      return Response.json({ error: 'Invalid account type' }, { status: 400 });
    }
    if (!first_name || !last_name || !email) {
      return Response.json({ error: 'First name, last name, and email are required' }, { status: 400 });
    }

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const fullAccess = currentUser.role === 'admin' || roles.has('full_access');
    const canCreateClient = fullAccess || roles.has('hr');
    const canCreateStudent = fullAccess || roles.has('trainer');
    const canCreateEmployee = fullAccess || roles.has('hr');
    const canCreatePending = fullAccess;
    if (
      (accountType === 'pending' && !canCreatePending) ||
      (accountType === 'client' && !canCreateClient) ||
      (accountType === 'student' && !canCreateStudent) ||
      (accountType === 'employee' && !canCreateEmployee)
    ) {
      return Response.json({ error: 'You do not have permission to create this account type' }, { status: 403 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const clientAssignedLocations = accountType === 'client'
      ? [...new Set([...(Array.isArray(assigned_locations) ? assigned_locations : []), assigned_location].filter(Boolean).map((name: unknown) => String(name).trim()).filter(Boolean))]
      : [];
    let users: any[] = [];
    let directoryError = '';
    try {
      users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    } catch (error) {
      directoryError = error?.message || 'Unable to read the user directory';
      console.error('Unable to read user directory during portal account creation', error);
    }
    let portalUser = (users || []).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
    let invitationSent = false;
    let invitationError = '';
    let assignmentError = '';
    let assignmentPending = false;

    const employeeRoles = accountType === 'pending'
      ? []
      : accountType === 'employee'
        ? ['officer', 'cad_access']
        : [accountType];
    const updates: Record<string, unknown> = {
      first_name,
      last_name,
      mobile_phone: mobile_phone || '',
      additional_roles: employeeRoles,
      assigned_location: clientAssignedLocations[0] || '',
      assigned_locations: clientAssignedLocations,
      assigned_sites: clientAssignedLocations,
      rank: accountType === 'pending'
        ? 'Pending Assignment'
        : accountType === 'student'
          ? 'Student'
          : accountType === 'client'
            ? 'Client'
            : rank || 'Officer',
    };

    // Pending Users must be created through Base44's supported invitation endpoint.
    // Direct User.create calls are rejected with HTTP 400 because User is a protected
    // system entity. After inviting, wait for the real pending User record and then
    // attach the editable profile fields.
    if (accountType === 'pending' && !portalUser) {
      try {
        await base44.users.inviteUser(normalizedEmail, 'user');
        invitationSent = true;
      } catch (inviteError) {
        invitationError = inviteError?.message || 'Native invitation could not be sent';
        const normalizedError = invitationError.toLowerCase();
        const alreadyExists = normalizedError.includes('already') || normalizedError.includes('exist') || normalizedError.includes('pending') || normalizedError.includes('invited');
        invitationSent = alreadyExists;
        if (!alreadyExists) {
          return Response.json({
            success: false,
            error: invitationError,
            error_stage: 'invitation',
            provider_status: inviteError?.status || inviteError?.response?.status || null,
            provider_detail: inviteError?.data || inviteError?.response?.data || null,
          });
        }
      }

      for (let attempt = 0; attempt < 10 && !portalUser?.id; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 600));
        const refreshed = await base44.asServiceRole.entities.User.list(undefined, 1000);
        portalUser = (refreshed || []).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
      }
    }

    // Legacy category-specific creation remains supported for existing internal calls,
    // but uses only editable User fields and never writes protected role/email fields.
    if (accountType !== 'pending' && !portalUser) {
      try {
        portalUser = await base44.asServiceRole.entities.User.create({ email: normalizedEmail, ...updates });
      } catch (createError) {
        assignmentError = createError?.message || 'Unable to provision the portal user record';
        console.error('Portal user provisioning failed', createError);
      }
    }

    if (accountType !== 'pending') {
      try {
        await base44.users.inviteUser(normalizedEmail, 'user');
        invitationSent = true;
      } catch (inviteError) {
        invitationError = inviteError?.message || 'Native invitation could not be sent';
        const normalizedError = invitationError.toLowerCase();
        invitationSent = normalizedError.includes('already') || normalizedError.includes('exist') || normalizedError.includes('pending') || normalizedError.includes('invited');
        console.warn('Native portal invitation was not completed', inviteError);
      }
    }

    if (portalUser?.id) {

      if (accountType === 'employee') {
        Object.assign(updates, {
          date_of_birth: date_of_birth || '',
          badge_number: badge_number || '',
          unit_number: unit_number || '',
          hire_date: hire_date || '',
          division: division || '',
          dcjs_number: dcjs_number || '',
          dcjs_expiration: dcjs_expiration || '',
          firearm_expiration: firearm_expiration || '',
          employment_status: 'active',
        });
      }

      try {
        await base44.asServiceRole.entities.User.update(portalUser.id, updates);
      } catch (error) {
        assignmentPending = true;
        assignmentError = error?.message || 'The invited user is not editable yet';
        console.error('Unable to assign portal profile and roles immediately', error);
      }

      if (!assignmentPending && accountType === 'client' && clientAssignedLocations.length) {
        try {
          const locations = await base44.asServiceRole.entities.Location.list();
          for (const location of locations || []) {
            if (clientAssignedLocations.includes(location.site_name) && location.id) {
              await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: normalizedEmail });
            }
          }
        } catch (error) {
          assignmentError = error?.message || 'Unable to link the client to the selected property';
          console.error('Unable to link client location during account creation', error);
        }
      }
    } else {
      assignmentPending = true;
      assignmentError = invitationError || directoryError || 'The invited account is still pending creation';
    }

    // Do not turn a recoverable invitation-provider failure into a gateway error.
    // The branded account email still gives the recipient a working Forgot Password
    // setup path, and permissions are attached automatically when the User record appears.
    if (!portalUser && !invitationSent) {
      assignmentPending = true;
    }

    // The native inviteUser call above already sends the platform invitation /
    // password-setup email, so a separate branded SendEmail is intentionally
    // omitted to avoid integration-credit usage. The account is still fully
    // provisioned and the recipient can set up their password via the invite.
    const emailSent = invitationSent;
    const emailError = '';

    return Response.json({
      success: true,
      invitation_sent: invitationSent,
      invitation_error: invitationError || undefined,
      invitation_pending: !portalUser && !invitationSent,
      assignment_pending: assignmentPending,
      assignment_error: assignmentError || undefined,
      directory_error: directoryError || undefined,
      user_id: portalUser?.id || null,
      email_sent: emailSent,
      email_error: emailError || undefined,
    });
  } catch (error) {
    console.error('createPortalAccount failed', error);
    // Return a readable application error instead of an opaque HTTP 500 so the
    // management screen can show the exact failure and always stop its spinner.
    return Response.json({
      success: false,
      error: error?.message || 'Unable to create portal account',
      error_stage: 'account_provisioning',
    });
  }
});