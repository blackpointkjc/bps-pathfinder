import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function accountCreatedEmail(firstName: string, accountType: string) {
  const year = new Date().getFullYear();
  const portalLabel = accountType === 'client'
    ? 'Client Portal'
    : accountType === 'student'
      ? 'Student Training Portal'
      : 'Employee Portal';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Your Black Point Account Has Been Created</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#0b0b0b;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background-color:#151515;border:1px solid #2b2b2b;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35);">
        <tr>
          <td align="center" style="padding:26px 24px 20px;background-color:#050505;">
            <div style="display:inline-block;border:2px solid #d4af37;border-radius:8px;padding:12px 18px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:2px;line-height:1.1;">BLACK POINT</div>
            <div style="margin-top:8px;color:#d4af37;font-size:11px;font-weight:bold;letter-spacing:3px;">PROTECTION</div>
          </td>
        </tr>
        <tr><td style="height:5px;line-height:5px;font-size:0;background-color:#d4af37;">&nbsp;</td></tr>
        <tr>
          <td style="padding:34px 38px 12px;">
            <h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.25;text-align:center;">Your Account Has Been Created</h1>
            <p style="margin:0 0 18px;color:#d7d7d7;font-size:16px;line-height:1.65;">Hello ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 18px;color:#d7d7d7;font-size:16px;line-height:1.65;">A Black Point account has been created for you with access to the <strong style="color:#ffffff;">${portalLabel}</strong>. Before signing in for the first time, you will need to create your password through the account portal.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background-color:#202020;border-left:4px solid #d4af37;border-radius:6px;">
              <tr><td style="padding:20px 22px;">
                <p style="margin:0 0 10px;color:#ffffff;font-size:17px;font-weight:bold;">Set up your password</p>
                <p style="margin:0;color:#d7d7d7;font-size:15px;line-height:1.65;">1. Open the Black Point portal.<br>2. Select <strong style="color:#ffffff;">Forgot Password</strong>.<br>3. Enter the email address connected to your account.<br>4. Follow the password-reset instructions sent to your email.</p>
              </td></tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;">
              <tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;"><a href="${PORTAL_URL}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;">Access the Black Point Portal</a></td></tr>
            </table>
            <p style="margin:0 0 18px;color:#bdbdbd;font-size:14px;line-height:1.65;text-align:center;">Portal address:<br><a href="${PORTAL_URL}" style="color:#e5c75b;text-decoration:underline;">${PORTAL_URL}</a></p>
            <p style="margin:22px 0 0;color:#d7d7d7;font-size:16px;line-height:1.65;">For your security, do not share your password or password-reset link with anyone. Black Point staff will never ask you to send your password by email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 38px 34px;">
            <p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:bold;">Black Point Protection</p>
            <p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 24px;background-color:#050505;border-top:1px solid #292929;">
            <p style="margin:0 0 8px;color:#8f8f8f;font-size:12px;line-height:1.5;">Need more information? Visit our main website.</p>
            <p style="margin:0;"><a href="https://home.blackpointkjc.com/" target="_blank" style="color:#d4af37;font-size:13px;text-decoration:underline;">home.blackpointkjc.com</a></p>
            <p style="margin:14px 0 0;color:#666666;font-size:11px;">© ${year} Black Point. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      accountType, first_name, last_name, email, mobile_phone, assigned_location,
      date_of_birth, badge_number, rank, unit_number, hire_date, division,
      dcjs_number, dcjs_expiration, firearm_expiration
    } = body;

    if (!['client', 'student', 'employee'].includes(accountType)) {
      return Response.json({ error: 'Invalid account type' }, { status: 400 });
    }
    if (!first_name || !last_name || !email) {
      return Response.json({ error: 'First name, last name, and email are required' }, { status: 400 });
    }

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const fullAccess = currentUser.role === 'admin' || roles.has('full_access');
    const canCreateClient = fullAccess || roles.has('hr');
    const canCreateStudent = fullAccess || roles.has('trainer');
    const canCreateEmployee = fullAccess || roles.has('hr') || roles.has('trainer');
    if (
      (accountType === 'client' && !canCreateClient) ||
      (accountType === 'student' && !canCreateStudent) ||
      (accountType === 'employee' && !canCreateEmployee)
    ) {
      return Response.json({ error: 'You do not have permission to create this account type' }, { status: 403 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await base44.asServiceRole.entities.User.list();
    let portalUser = (users || []).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
    let invitationSent = false;
    let invitationError = '';

    if (!portalUser) {
      try {
        let invitation;
        try {
          invitation = await base44.asServiceRole.users.inviteUser(normalizedEmail, 'user');
        } catch (serviceRoleError) {
          console.warn('Service-role invitation path failed; trying authenticated invitation path', serviceRoleError);
          invitation = await base44.users.inviteUser(normalizedEmail, 'user');
        }
        invitationSent = true;
        portalUser = invitation?.user || invitation;

        // Base44 may create the pending User record asynchronously. Retry long enough
        // for both the client and student management pages to display the new account.
        if (!portalUser?.id) {
          for (let attempt = 0; attempt < 8 && !portalUser?.id; attempt += 1) {
            if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 750));
            const refreshed = await base44.asServiceRole.entities.User.list();
            portalUser = (refreshed || []).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
          }
        }
      } catch (inviteError) {
        invitationError = inviteError?.message || 'Unable to send the Base44 invitation';
        const normalizedError = invitationError.toLowerCase();
        const alreadyPending = normalizedError.includes('already') || normalizedError.includes('exist') || normalizedError.includes('pending') || normalizedError.includes('invited');
        if (alreadyPending) {
          invitationSent = true;
          const refreshed = await base44.asServiceRole.entities.User.list();
          portalUser = (refreshed || []).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
        }
        console.error('Portal invitation failed', inviteError);
      }
    }

    let assignmentPending = false;
    if (portalUser?.id) {
      const employeeRoles = accountType === 'employee' ? ['officer', 'cad_access'] : [accountType];
      const updates: Record<string, unknown> = {
        first_name,
        last_name,
        mobile_phone: mobile_phone || '',
        additional_roles: employeeRoles,
        assigned_location: accountType === 'client' ? assigned_location || '' : '',
        assigned_locations: accountType === 'client' && assigned_location ? [assigned_location] : [],
        assigned_sites: accountType === 'client' && assigned_location ? [assigned_location] : [],
        rank: accountType === 'student' ? 'Student' : accountType === 'client' ? 'Client' : rank || 'Officer',
      };

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

      await base44.asServiceRole.entities.User.update(portalUser.id, updates);

      if (accountType === 'client' && assigned_location) {
        const locations = await base44.asServiceRole.entities.Location.list();
        const location = (locations || []).find((l: any) => l.site_name === assigned_location);
        if (location?.id) {
          await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: normalizedEmail });
        }
      }
    } else {
      assignmentPending = true;
    }

    // Do not turn a recoverable invitation-provider failure into a gateway error.
    // The branded account email still gives the recipient a working Forgot Password
    // setup path, and permissions are attached automatically when the User record appears.
    if (!portalUser && !invitationSent) {
      assignmentPending = true;
    }

    let emailSent = false;
    let emailError = '';
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: 'Black Point Protection',
        to: normalizedEmail,
        subject: 'Your Black Point Account Has Been Created',
        body: accountCreatedEmail(first_name, accountType),
      });
      emailSent = true;
    } catch (error) {
      emailError = error?.message || 'Email delivery failed';
      console.error('Account created email failed', error);
    }

    return Response.json({
      success: true,
      invitation_sent: invitationSent,
      invitation_error: invitationError || undefined,
      assignment_pending: assignmentPending,
      user_id: portalUser?.id || null,
      email_sent: emailSent,
      email_error: emailError || undefined,
    });
  } catch (error) {
    console.error('createPortalAccount failed', error);
    return Response.json({ error: error.message || 'Unable to create portal account' }, { status: 500 });
  }
});