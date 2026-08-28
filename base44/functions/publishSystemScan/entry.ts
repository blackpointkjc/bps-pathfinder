import { createClientFromRequest } from 'npm:@base44/sdk';

const text = (value: unknown) => String(value || '').trim();
const int = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Administrator access required' }, { status: user ? 403 : 401 });
    }

    const body = await req.json().catch(() => ({}));
    const audit = body.audit || {};
    const findings = Array.isArray(audit.findings) ? audit.findings : [];
    const summary = audit.summary || {};
    const scannedAt = text(audit.scanned_at) || new Date().toISOString();
    const parsedScan = new Date(scannedAt);
    const hourKey = Number.isNaN(parsedScan.getTime())
      ? new Date().toISOString().slice(0, 13)
      : parsedScan.toISOString().slice(0, 13);
    const auditJson = JSON.stringify({
      ...audit,
      findings: findings.slice(0, 250),
      scanned_at: scannedAt,
    }).slice(0, 250000);
    const rowData = {
      hour_key: hourKey,
      status: findings.length ? 'issues_found' : 'healthy',
      issues_found: findings.length,
      outages: int(summary.outages ?? findings.filter((item: any) => item.severity === 'outage').length),
      degraded: int(summary.degraded ?? findings.filter((item: any) => item.severity === 'degraded').length),
      maintenance: int(summary.maintenance ?? findings.filter((item: any) => item.severity === 'maintenance').length),
      areas_checked: int(summary.areas_checked),
      scanned_at: scannedAt,
      duration_ms: Number(audit.duration_ms || 0),
      audit_json: auditJson,
      triggered_by: user.email || user.id,
    };

    const existingRuns = await base44.asServiceRole.entities.SystemScanRun.filter({ hour_key: hourKey }, '-scanned_at', 5);
    const scanRun = existingRuns?.length
      ? await base44.asServiceRole.entities.SystemScanRun.update(existingRuns[0].id, rowData)
      : await base44.asServiceRole.entities.SystemScanRun.create(rowData);

    // Keep a durable issue lifecycle instead of showing findings only in the
    // latest scan JSON. When a later scan no longer finds an issue, close the
    // active row but preserve it under Resolved for audit and troubleshooting.
    const priorScanIssues = await base44.asServiceRole.entities.SystemOutage.filter(
      { source: 'full_app_scan' },
      '-last_seen_at',
      1000,
    ).catch(() => []);
    const activeByKey = new Map<string, any>();
    for (const issue of priorScanIssues || []) {
      if (!issue.issue_key || issue.resolved_at || activeByKey.has(String(issue.issue_key))) continue;
      activeByKey.set(String(issue.issue_key), issue);
    }
    const currentIssueKeys = new Set<string>();
    let issueRowsCreated = 0;
    let issueRowsResolved = 0;
    for (const finding of findings) {
      const issueKey = 'scan:' + (text(finding.key) || text(finding.area)) + ':' + text(finding.title);
      currentIssueKeys.add(issueKey);
      const existing = activeByKey.get(issueKey);
      const issueData = {
        issue_key: issueKey,
        source: 'full_app_scan',
        component: text(finding.area) || 'System Scan',
        severity: ['outage', 'degraded', 'maintenance'].includes(text(finding.severity)) ? text(finding.severity) : 'degraded',
        title: text(finding.title) || 'System scan issue',
        description: text(finding.description),
        reported_by: 'Pathfinder System Monitor',
        last_seen_at: scannedAt,
        occurrence_count: Math.max(1, Number(existing?.occurrence_count || 0) + 1),
      };
      if (existing) {
        await base44.asServiceRole.entities.SystemOutage.update(existing.id, issueData);
      } else {
        await base44.asServiceRole.entities.SystemOutage.create(issueData);
        issueRowsCreated += 1;
      }
    }
    for (const [issueKey, issue] of activeByKey.entries()) {
      if (currentIssueKeys.has(issueKey)) continue;
      await base44.asServiceRole.entities.SystemOutage.update(issue.id, {
        resolved_at: scannedAt,
        resolved_by: 'Pathfinder System Monitor',
        last_seen_at: issue.last_seen_at || issue.updated_date || issue.created_date || scannedAt,
      });
      issueRowsResolved += 1;
    }

    let notificationsCreated = 0;
    if (findings.length) {
      const admins = (await base44.asServiceRole.entities.User.list('-updated_date', 2000))
        .filter((entry: any) => String(entry.role || '').trim().toLowerCase() === 'admin' && entry.email);
      const relatedId = `system_scan:${hourKey}`;
      const severity = rowData.outages > 0 ? 'critical' : 'high';
      const title = rowData.outages > 0 ? 'Hourly system scan found an outage' : 'Hourly system scan found issues';
      const leadingAreas = [...new Set(findings.map((item: any) => text(item.area)).filter(Boolean))].slice(0, 4);
      const message = `${findings.length} issue(s) detected: ${rowData.outages} outage, ${rowData.degraded} degraded, ${rowData.maintenance} maintenance.${leadingAreas.length ? ` Areas: ${leadingAreas.join(', ')}.` : ''} Open Admin Center → System Issues for details.`;

      for (const admin of admins) {
        const email = text(admin.email).toLowerCase();
        const prior = await base44.asServiceRole.entities.Notification.filter({
          recipient_email: email,
          related_id: relatedId,
          type: 'system_issue',
        }, '-created_date', 1);
        if (prior?.length) continue;
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: email,
          type: 'system_issue',
          title,
          message,
          is_read: false,
          related_id: relatedId,
          priority: severity,
          requires_acknowledgment: false,
          source_name: 'Pathfinder System Monitor',
        });
        notificationsCreated += 1;
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'SystemScanRun',
      entity_id: scanRun.id,
      action: existingRuns?.length ? 'update' : 'create',
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Administrator',
      field_changed: 'hourly_full_app_scan',
      timestamp: new Date().toISOString(),
      after_value: JSON.stringify({ hour_key: hourKey, issues_found: findings.length, notifications_created: notificationsCreated }),
      description: 'Hourly full-application scan result stored and administrator banner alerts deduplicated by hour.',
    }).catch(() => null);

    return Response.json({
      success: true,
      scan_run: scanRun,
      notifications_created: notificationsCreated,
      issue_rows_created: issueRowsCreated,
      issue_rows_resolved: issueRowsResolved,
    });
  } catch (error) {
    console.error('publishSystemScan failed', error);
    return Response.json({ error: error?.message || 'Unable to publish system scan' }, { status: 500 });
  }
});
