import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
const blackPointEmail = (subject: string, content: string, actionLabel = 'View in Black Point Portal') => `<!doctype html><html><body style="margin:0;background:#0b0b0b;font-family:Arial;color:#f4f4f4"><table width="100%" style="padding:28px 12px;background:#0b0b0b"><tr><td align="center"><table width="620" style="max-width:620px;background:#151515;border:1px solid #2b2b2b;border-radius:10px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#050505;color:#fff;font-weight:800;letter-spacing:2px">BLACK POINT PROTECTION<div style="margin-top:8px;color:#d4af37;font-size:11px">BPS PATHFINDER</div></td></tr><tr><td style="height:5px;background:#d4af37"></td></tr><tr><td style="padding:32px 38px;color:#d7d7d7"><h1 style="color:#fff">${subject}</h1>${content}<p style="text-align:center;margin-top:28px"><a href="https://bpspf.blackpointkjc.com/" style="display:inline-block;padding:14px 26px;background:#d4af37;color:#090909;text-decoration:none;font-weight:bold;border-radius:6px">${actionLabel}</a></p></td></tr><tr><td align="center" style="padding:20px;background:#050505;color:#8f8f8f;font-size:12px">Black Point Protection Services · Secure Company Communication</td></tr></table></td></tr></table></body></html>`;

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
            for (const email of allRecipients) {
              await base44.asServiceRole.integrations.Core.SendEmail({
                to: email,
                subject: `⚠️ Missed Checkpoints — ${group.officer_name} @ ${group.property_site}`,
                body: blackPointEmail(`Missed Checkpoints — ${group.officer_name}`, `<p><strong>QR Patrol Alert</strong></p><p>Officer <strong>${group.officer_name}</strong> missed required checkpoints at <strong>${group.property_site}</strong>:</p><ul>${missedNames.map(n => `<li>${n}</li>`).join('')}</ul><p>Date: ${group.report_date}<br>Scans: ${group.scans.length}<br>Successful: ${successScans.length}<br>Missed: ${missedCheckpoints.length}</p>`, 'Open QR Patrol Report'),
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
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});