import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
/**
 * generateQRPatrolReport
 * Runs as a scheduled automation (or can be called manually).
 * Scans all QRScanEvents from the past 48 hours, groups by shift_id+officer,
 * and upserts a QRPatrolReport for each unique shift session.
 * Also supports being called with a specific { shift_id, officer_email } payload
 * for on-demand report generation (e.g. on clock-out).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // For scheduled runs, use service role directly
    // For manual calls, verify the caller is authenticated
    let body = {};
    try {
      body = await req.json();
    } catch (_) {}

    const { shift_id: specificShiftId, officer_email: specificOfficer } = body;

    // Determine date range to process
    const now = new Date();
    const yesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const fromDate = yesterday.toISOString().slice(0, 10);

    // Fetch scan events — either for a specific shift or for the past 48 hours
    let scanEvents;
    if (specificShiftId && specificOfficer) {
      scanEvents = await base44.asServiceRole.entities.QRScanEvent.filter({
        shift_id: specificShiftId,
        officer_email: specificOfficer,
      });
    } else {
      // Get all scan events from the past 2 days
      const all = await base44.asServiceRole.entities.QRScanEvent.filter(
        {},
        '-scanned_at',
        1000
      );
      scanEvents = all.filter(s => s.scanned_date >= fromDate);
    }

    if (!scanEvents || scanEvents.length === 0) {
      return Response.json({ success: true, message: 'No scan events to process', reports_created: 0 });
    }

    // Group scans by shift_id (or officer+date if no shift_id)
    const groups = {};
    for (const scan of scanEvents) {
      const key = scan.shift_id
        ? `shift_${scan.shift_id}`
        : `officer_${scan.officer_email}_${scan.scanned_date}`;

      if (!groups[key]) {
        groups[key] = {
          shift_id: scan.shift_id || '',
          officer_email: scan.officer_email,
          officer_name: scan.officer_name || scan.officer_email,
          property_site: scan.property_site || 'Unknown',
          report_date: scan.scanned_date,
          scans: [],
        };
      }
      groups[key].scans.push(scan);
    }

    // Fetch all required checkpoints once
    const allCheckpoints = await base44.asServiceRole.entities.QRCheckpoint.filter({
      is_active: true,
      is_required: true,
    });

    // Fetch existing reports for deduplication (upsert)
    const existingReports = await base44.asServiceRole.entities.QRPatrolReport.filter(
      {},
      '-generated_at',
      200
    );
    const existingByKey = {};
    for (const r of existingReports) {
      const k = r.shift_id ? `shift_${r.shift_id}` : `officer_${r.officer_email}_${r.report_date}`;
      existingByKey[k] = r;
    }

    let reportsCreated = 0;
    let reportsUpdated = 0;
    const results = [];

    for (const [key, group] of Object.entries(groups)) {
      const siteCheckpoints = allCheckpoints.filter(cp => cp.property_site === group.property_site);
      const successScans = group.scans.filter(s => s.scan_status === 'success');
      const duplicateScans = group.scans.filter(s => s.scan_status === 'duplicate');

      const scannedIds = new Set(successScans.map(s => s.checkpoint_id));
      const missedCheckpoints = siteCheckpoints.filter(cp => !scannedIds.has(cp.id));
      const missedNames = missedCheckpoints.map(cp => cp.checkpoint_name);

      // Determine shift start/end from scan timestamps
      const scanTimes = group.scans.map(s => new Date(s.scanned_at).getTime()).filter(t => !isNaN(t));
      const shiftStartFromScans = scanTimes.length > 0 ? new Date(Math.min(...scanTimes)).toISOString() : '';
      const shiftEndFromScans = scanTimes.length > 0 ? new Date(Math.max(...scanTimes)).toISOString() : '';

      // Try to get actual shift times from TimeEntry
      let shiftStart = shiftStartFromScans;
      let shiftEnd = shiftEndFromScans;
      if (group.shift_id) {
        try {
          const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: group.shift_id });
          const entry = entries[0];
          if (entry) {
            shiftStart = entry.clock_in || shiftStart;
            shiftEnd = entry.clock_out || shiftEnd;
          }
        } catch (_) {}
      }

      const reportData = {
        shift_id: group.shift_id,
        officer_email: group.officer_email,
        officer_name: group.officer_name,
        property_site: group.property_site,
        report_date: group.report_date,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        total_required_checkpoints: siteCheckpoints.length,
        total_scanned: group.scans.length,
        total_successful_scans: successScans.length,
        total_duplicates: duplicateScans.length,
        total_missed_required: missedCheckpoints.length,
        scan_event_ids: JSON.stringify(group.scans.map(s => s.id)),
        missed_checkpoint_names: JSON.stringify(missedNames),
        report_status: 'complete',
        generated_at: new Date().toISOString(),
      };

      const existing = existingByKey[key];
      if (existing) {
        await base44.asServiceRole.entities.QRPatrolReport.update(existing.id, reportData);
        reportsUpdated++;
      } else {
        await base44.asServiceRole.entities.QRPatrolReport.create(reportData);
        reportsCreated++;
      }

      results.push({ key, officer: group.officer_name, site: group.property_site, missed: missedNames.length });

      // Send alerts for missed checkpoints (only on creation, not updates)
      if (!existing && missedCheckpoints.length > 0) {
        try {
          const locations = await base44.asServiceRole.entities.Location.filter({ site_name: group.property_site });
          const location = locations[0];
          const supervisorEmails = location?.assigned_supervisors || [];
          const rules = await base44.asServiceRole.entities.PropertyCheckpointRules.filter({ property_site: group.property_site });
          const ruleRecipients = rules[0]?.alert_recipients || [];
          const alertEnabled = rules[0]?.alert_on_missed !== false;

          if (alertEnabled) {
            const allRecipients = [...new Set([...supervisorEmails, ...ruleRecipients])];
            const title = `QR Patrol Report — Missed Checkpoints @ ${group.property_site}`;
            const message = [
              `Officer ${group.officer_name} missed required checkpoints at ${group.property_site}.`,
              `Missed: ${missedNames.join(', ')}`,
              `Date: ${group.report_date}`,
              `Scans: ${group.scans.length}`,
              `Successful: ${successScans.length}`,
              `Missed count: ${missedCheckpoints.length}`,
            ].join('\n');
            for (const email of allRecipients) {
              await base44.asServiceRole.entities.Notification.create({
                recipient_email: email,
                type: 'qr_patrol_report',
                title,
                message,
                is_read: false,
                related_id: existing?.id || group.shift_id || key,
                priority: 'high',
              });
            }
          }
        } catch (_) {}
      }
    }

    return Response.json({
      success: true,
      reports_created: reportsCreated,
      reports_updated: reportsUpdated,
      total_processed: Object.keys(groups).length,
      results,
      delivery: 'in_app_only',
      integration_credits_used: 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});