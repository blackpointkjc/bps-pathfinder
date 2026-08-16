import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code, action_type, site_name, note } = body;

    if (!code || String(code).length !== 4) {
      return Response.json({ valid: false, error: 'Code must be exactly 4 digits' });
    }

    // Determine the "shift day" — resets at 4AM ET
    const now = new Date();
    const etOffset = -5 * 60;
    const etNow = new Date(now.getTime() + (etOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    if (etNow.getUTCHours() < 4) {
      etNow.setUTCDate(etNow.getUTCDate() - 1);
    }
    const today = etNow.toISOString().split('T')[0];

    // Find the code
    const codes = await base44.asServiceRole.entities.SupervisorDailyCode.filter({
      code: String(code),
      code_date: today,
      is_active: true
    });

    if (codes.length === 0) {
      return Response.json({ valid: false, error: 'Invalid supervisor code' });
    }

    const codeRecord = codes[0];

    // Check expiry
    if (new Date(codeRecord.expires_at) < new Date()) {
      return Response.json({ valid: false, error: 'Code has expired' });
    }

    // If action_type and site_name provided, do full validation + logging
    if (action_type && site_name) {
      // Check arrival/departure sequence
      const todayChecks = await base44.asServiceRole.entities.SupervisorSiteCheck.filter({
        supervisor_email: codeRecord.supervisor_email,
        site_name,
        check_date: today,
      });

      todayChecks.sort((a, b) => new Date(a.check_timestamp) - new Date(b.check_timestamp));
      const lastCheck = todayChecks[todayChecks.length - 1];

      if (action_type === 'arrival' && lastCheck?.action_type === 'arrival') {
        return Response.json({ valid: false, error: 'Supervisor already arrived at this site. Log departure first.' });
      }
      if (action_type === 'departure' && (!lastCheck || lastCheck.action_type === 'departure')) {
        return Response.json({ valid: false, error: 'No arrival on record. Log arrival first.' });
      }

      // Build supervisor display name
      const rank = codeRecord.supervisor_rank || '';
      const lastName = codeRecord.supervisor_last_name || '';
      const supervisorName = rank && lastName ? `${rank} ${lastName}` : codeRecord.supervisor_email;

      const now = new Date();
      const timestamp = now.toISOString();

      const entryText = action_type === 'arrival'
        ? `${supervisorName} arrived on site to conduct a site check.`
        : `${supervisorName} departed the site after conducting a site check.`;

      // Save site check record
      const siteCheck = await base44.asServiceRole.entities.SupervisorSiteCheck.create({
        supervisor_email: codeRecord.supervisor_email,
        supervisor_rank: codeRecord.supervisor_rank || '',
        supervisor_last_name: codeRecord.supervisor_last_name || '',
        site_name,
        action_type,
        check_timestamp: timestamp,
        check_date: today,
        dar_entry_text: entryText,
        entered_by_officer_email: user.email,
        entered_by_officer_name: user.full_name || user.email,
        code_used: code,
        note: note || '',
      });

      // Auto-create a draft InspectionReport for the supervisor to fill out
      await base44.asServiceRole.entities.InspectionReport.create({
        inspection_date: timestamp,
        officer_inspected: user.full_name || user.email,
        officer_email: user.email,
        location: site_name,
        observations: `Site check (${action_type}) logged. Site check record ID: ${siteCheck.id}`,
        follow_up_required: false,
        inspection_result: null,
      });

      return Response.json({
        valid: true,
        supervisor: {
          email: codeRecord.supervisor_email,
          rank: codeRecord.supervisor_rank,
          last_name: codeRecord.supervisor_last_name,
        },
        entry_text: entryText,
        timestamp,
        site_check_id: siteCheck.id,
      });
    }

    // Validation only (no action logging)
    return Response.json({
      valid: true,
      supervisor: {
        email: codeRecord.supervisor_email,
        rank: codeRecord.supervisor_rank,
        last_name: codeRecord.supervisor_last_name,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});