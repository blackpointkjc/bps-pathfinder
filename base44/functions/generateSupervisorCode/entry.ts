import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isSupervisor = user.additional_roles?.includes('supervisor');
    const isAdmin = user.role === 'admin';

    if (!isSupervisor && !isAdmin) {
      return Response.json({ error: 'Only supervisors or admins can generate codes' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetEmail = body.email || user.email;
    const targetRank = body.rank || user.rank || '';
    const targetLastName = body.last_name || user.last_name || '';

    // Only admin can generate for others
    if (targetEmail !== user.email && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Determine the "shift day" — resets at 4AM ET
    const now = new Date();
    // Convert to ET (UTC-4 or UTC-5). Use UTC offset approach.
    const etOffset = -5 * 60; // EST base; DST handled approximately
    const etNow = new Date(now.getTime() + (etOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    // Check ET time: if before 4AM, use previous day's date
    const etHour = etNow.getUTCHours();
    if (etHour < 4) {
      etNow.setUTCDate(etNow.getUTCDate() - 1);
    }
    const today = etNow.toISOString().split('T')[0];

    // Check if code already exists for today
    const existing = await base44.asServiceRole.entities.SupervisorDailyCode.filter({
      supervisor_email: targetEmail,
      code_date: today,
      is_active: true
    });

    if (existing.length > 0) {
      return Response.json({ code: existing[0] });
    }

    // Get all today's codes to ensure uniqueness
    const todayCodes = await base44.asServiceRole.entities.SupervisorDailyCode.filter({
      code_date: today
    });
    const usedCodes = new Set(todayCodes.map(c => c.code));

    // Generate unique 4-digit code
    let code;
    let attempts = 0;
    do {
      code = String(Math.floor(1000 + Math.random() * 9000));
      attempts++;
      if (attempts > 200) {
        return Response.json({ error: 'Could not generate unique code, try again' }, { status: 500 });
      }
    } while (usedCodes.has(code));

    // Expires at next 4AM ET (the start of the next shift day)
    const expiry = new Date();
    // Find next 4AM ET
    const etOffsetMs = -5 * 60 * 60 * 1000;
    const etExpiry = new Date(expiry.getTime() + etOffsetMs + (expiry.getTimezoneOffset() * 60 * 1000));
    // Set to 4AM of today in ET
    etExpiry.setUTCHours(4, 0, 0, 0);
    // If we're already past 4AM ET today, expiry is 4AM tomorrow
    const etNowForExpiry = new Date(expiry.getTime() + etOffsetMs + (expiry.getTimezoneOffset() * 60 * 1000));
    if (etNowForExpiry.getUTCHours() >= 4) {
      etExpiry.setUTCDate(etExpiry.getUTCDate() + 1);
    }
    // Convert back to UTC
    const endOfDay = new Date(etExpiry.getTime() - etOffsetMs - (expiry.getTimezoneOffset() * 60 * 1000));

    const newCode = await base44.asServiceRole.entities.SupervisorDailyCode.create({
      supervisor_email: targetEmail,
      supervisor_rank: targetRank,
      supervisor_last_name: targetLastName,
      code,
      code_date: today,
      expires_at: endOfDay.toISOString(),
      is_active: true,
    });

    return Response.json({ code: newCode });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});