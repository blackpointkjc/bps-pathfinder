import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { blackPointEmail } from '../_shared/blackPointEmail.ts';

const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

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
      accountType, first_name, last_name, email, mobile_phone, assigned_location,
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
      assigned_location: accountType === 'client' ? assigned_location || '' : '',
      assigned_locations: accountType === 'client' && assigned_location ? [assigned_location] : [],
      assigned_sites: accountType === 'client' && assigned_location ? [assigned_location] : [],
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

      if (!assignmentPending && accountType === 'client' && assigned_location) {
        try {
          const locations = await base44.asServiceRole.entities.Location.list();
          const location = (locations || []).find((l: any) => l.site_name === assigned_location);
          if (location?.id) {
            await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: normalizedEmail });
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