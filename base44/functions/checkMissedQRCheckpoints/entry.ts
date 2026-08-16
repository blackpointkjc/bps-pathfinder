import { createClientFromRequest } from 'npm:@base44/sdk';
/**
 * checkMissedQRCheckpoints
 * Runs every hour — finds active shifts where required checkpoints have not been
 * scanned since the first scan of the shift, then alerts support staff / supervisors.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user && (user.role === 'admin' || roles.has('support_staff') || roles.has('full_access'));
    if (!authorized) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Use service role only after the caller has been authenticated and authorized.
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Find all currently open shifts (clock_in exists, no clock_out)
    const activeEntries = await base44.asServiceRole.entities.TimeEntry.filter({ archived: false });
    const openShifts = activeEntries.filter(e => e.clock_in && !e.clock_out);

    if (openShifts.length === 0) {
      return Response.json({ message: 'No active shifts', checked: 0 });
    }

    let alertsSent = 0;

    for (const shift of openShifts) {
      const officerEmail = shift.officer_email;
      const location = shift.location || '';
      const siteName = location.includes(': ')
        ? location.split(': ')[0].trim()
        : location.split(' - ')[0].trim();

      if (!siteName) continue;

      // Get all scans for this shift
      const scanEvents = await base44.asServiceRole.entities.QRScanEvent.filter({
        shift_id: shift.id,
        officer_email: officerEmail,
      });

      if (scanEvents.length === 0) continue; // No scans yet — skip (don't alert before first scan)

      // Sort scans by time to find first scan
      scanEvents.sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
      const firstScanTime = new Date(scanEvents[0].scanned_at);

      // Only alert if it's been at least 1 hour since the first scan
      if (now - firstScanTime < 60 * 60 * 1000) continue;

      // Get required checkpoints for the site
      const checkpoints = await base44.asServiceRole.entities.QRCheckpoint.filter({
        property_site: siteName,
        is_required: true,
        is_active: true,
      });

      if (checkpoints.length === 0) continue;

      // Find which required checkpoints have never been successfully scanned this shift
      const successfullyScannedIds = new Set(
        scanEvents.filter(s => s.scan_status === 'success').map(s => s.checkpoint_id)
      );
      const missedCheckpoints = checkpoints.filter(cp => !successfullyScannedIds.has(cp.id));

      if (missedCheckpoints.length === 0) continue;

      // Get officer info
      const officers = await base44.asServiceRole.entities.User.filter({ email: officerEmail });
      const officer = officers[0];
      const officerName = officer
        ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officerEmail
        : officerEmail;

      // Get site supervisors & rules recipients
      const locations = await base44.asServiceRole.entities.Location.filter({ site_name: siteName });
      const locationObj = locations[0];
      const supervisorEmails = locationObj?.assigned_supervisors || [];

      const rules = await base44.asServiceRole.entities.PropertyCheckpointRules.filter({ property_site: siteName });
      const rule = rules[0];
      const ruleRecipients = rule?.alert_recipients || [];
      const alertEnabled = rule?.alert_on_missed !== false;

      if (!alertEnabled) continue;

      // Also get all support_staff users from User entity
      const allUsers = await base44.asServiceRole.entities.User.list();
      const supportStaff = allUsers.filter(u =>
        u.additional_roles?.includes('support_staff') || u.additional_roles?.includes('hr')
      ).map(u => u.email);

      const allRecipients = [...new Set([...supervisorEmails, ...ruleRecipients, ...supportStaff])].filter(Boolean);

      if (allRecipients.length === 0) continue;

      const missedList = missedCheckpoints.map(cp => `• ${cp.checkpoint_name} (${cp.location_label || cp.zone_or_building || 'No label'})`).join('\n');
      const shiftStart = shift.clock_in ? new Date(shift.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Unknown';
      const hoursSinceFirst = Math.round((now - firstScanTime) / (60 * 60 * 1000));

      const title = `Missed QR Checkpoints — ${officerName} @ ${siteName}`;
      const message = [
        `Officer ${officerName} has an active shift at ${siteName} and required checkpoints remain unscanned.`,
        missedList,
        `Shift started: ${shiftStart}`,
        `First scan: ${firstScanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
        `Hours since first scan: ${hoursSinceFirst}h`,
        `Total scans: ${scanEvents.length}`,
      ].join('\n');

      for (const email of allRecipients) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: email,
          type: 'missed_qr_checkpoints',
          title,
          message,
          is_read: false,
          related_id: shift.id,
          priority: 'high',
        });
        alertsSent++;
      }
    }

    return Response.json({ success: true, alertsSent, shiftsChecked: openShifts.length, delivery: 'in_app_only', integration_credits_used: 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});