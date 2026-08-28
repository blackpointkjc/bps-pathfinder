import { createClientFromRequest } from 'npm:@base44/sdk';

type Finding = {
  key: string;
  area: string;
  severity: 'outage' | 'degraded' | 'maintenance';
  title: string;
  description: string;
  count?: number;
};

const add = (findings: Finding[], finding: Finding) => findings.push(finding);
const value = (record: any, ...keys: string[]) => keys.map(key => record?.[key]).find(item => item !== undefined && item !== null && String(item).trim() !== '');

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Administrator access required' }, { status: user ? 403 : 401 });
    }

    const findings: Finding[] = [];
    const checkedAreas: string[] = [];
    const datasets: Record<string, any[]> = {};
    const checks = [
      ['Users & Access', 'User'],
      ['CAD Calls', 'DispatchCall'],
      ['CAD Assignments', 'CallAssignment'],
      ['Active Units', 'Unit'],
      ['Live Location Tracking', 'ActiveOfficer'],
      ['Movement History', 'LocationHistory'],
      ['Properties', 'Location'],
      ['Property Alerts', 'PropertyAlert'],
      ['Automatic Dispatch', 'AutoDispatchEvaluation'],
      ['Scheduling', 'Schedule'],
      ['Timekeeping', 'TimeEntry'],
      ['Payroll', 'PayrollPeriod'],
      ['Payroll', 'PayrollEntry'],
      ['Alerts & Announcements', 'CadAnnouncementReceipt'],
      ['Daily Reports', 'DailyActivityReport'],
      ['Incident Reports', 'IncidentReport'],
      ['Maintenance Reports', 'MaintenanceReport'],
      ['Training', 'TrainingAssignment'],
      ['Company Analytics', 'Division'],
      ['Company Analytics', 'TrainingCompletion'],
      ['Company Analytics', 'TrainingModule'],
      ['Company Analytics', 'CallForService'],
      ['Company Analytics', 'Commendation'],
      ['Company Analytics', 'Complaint'],
      ['Announcements', 'Announcement'],
      ['Team Messaging', 'ChatMessage'],
      ['Fleet', 'Vehicle'],
      ['BOLO', 'BOLOAlert'],
      ['System Issues', 'SystemOutage'],
    ] as const;

    await Promise.all(checks.map(async ([area, entityName]) => {
      checkedAreas.push(area);
      try {
        const entity = (base44.asServiceRole.entities as any)[entityName];
        if (!entity?.list) throw new Error(`${entityName} service is unavailable`);
        datasets[entityName] = await entity.list('-created_date', 1000);
      } catch (error) {
        datasets[entityName] = [];
        add(findings, {
          key: `service:${entityName}`,
          area,
          severity: 'outage',
          title: `${area} data service failed`,
          description: error?.message || `The app could not read ${entityName} records.`,
        });
      }
    }));

    const users = datasets.User || [];
    const units = datasets.Unit || [];
    const calls = datasets.DispatchCall || [];
    const assignments = datasets.CallAssignment || [];
    const locations = datasets.Location || [];
    const alerts = datasets.PropertyAlert || [];
    const userIds = new Set(users.map(item => String(item.id)));
    const callIds = new Set(calls.map(item => String(item.id)));
    const locationIds = new Set(locations.map(item => String(item.id)));

    const activeOperationalUsers = users.filter(item => !item.termination_date && String(item.employment_status || '').toLowerCase() === 'active');
    if (!activeOperationalUsers.length) add(findings, {
      key: 'users:no-active',
      area: 'Users & Access',
      severity: 'outage',
      title: 'No active operational users found',
      description: 'The app has no users marked with active employment status.',
    });

    const platoonRanks = new Set(['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer']);
    const platoonPersonnel = activeOperationalUsers.filter(item => platoonRanks.has(String(item.rank || '').trim().toLowerCase()));
    if (!platoonPersonnel.length) add(findings, {
      key: 'platoon:no-personnel',
      area: 'Platoon & Chain',
      severity: 'outage',
      title: 'Platoon has no eligible personnel',
      description: 'No active operational users with recognized command or officer ranks are available to the Platoon page.',
    });

    const usersMissingIdentity = activeOperationalUsers.filter(item => !value(item, 'full_name', 'first_name', 'last_name') || !item.email);
    if (usersMissingIdentity.length) add(findings, {
      key: 'users:identity',
      area: 'Users & Access',
      severity: 'degraded',
      title: 'Active users have incomplete identity records',
      description: `${usersMissingIdentity.length} active user(s) are missing a name or email and may not appear correctly in assignments and reports.`,
      count: usersMissingIdentity.length,
    });

    const activeUnits = units.filter(item => String(item.status || '').toLowerCase() !== 'out of service');
    const orphanUnits = activeUnits.filter(item => item.user_id && !userIds.has(String(item.user_id)));
    if (orphanUnits.length) add(findings, {
      key: 'units:orphan',
      area: 'Active Units',
      severity: 'degraded',
      title: 'Active unit records are not linked to users',
      description: `${orphanUnits.length} active unit record(s) reference a user that no longer exists.`,
      count: orphanUnits.length,
    });
    const seenUnitUsers = new Set<string>();
    const duplicateUnitUsers = new Set<string>();
    activeUnits.forEach(item => {
      const id = String(item.user_id || '');
      if (!id) return;
      if (seenUnitUsers.has(id)) duplicateUnitUsers.add(id);
      seenUnitUsers.add(id);
    });
    if (duplicateUnitUsers.size) add(findings, {
      key: 'units:duplicate',
      area: 'Active Units',
      severity: 'maintenance',
      title: 'Users have duplicate active unit records',
      description: `${duplicateUnitUsers.size} user(s) have more than one active Unit row, which can create duplicate map and assignment entries.`,
      count: duplicateUnitUsers.size,
    });

    const activeCalls = calls.filter(item => !['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved'].includes(String(item.status || '').toLowerCase()));
    const incompleteCalls = activeCalls.filter(item => !item.incident || !item.location || !value(item, 'time_received', 'created_date'));
    if (incompleteCalls.length) add(findings, {
      key: 'cad:incomplete',
      area: 'CAD Calls',
      severity: 'degraded',
      title: 'Active CAD calls have missing required details',
      description: `${incompleteCalls.length} active call(s) are missing incident, location, or received time.`,
      count: incompleteCalls.length,
    });
    const badAssignedUsers = activeCalls.flatMap(call => (call.assigned_units || []).map((id: any) => ({ call, id })))
      .filter(item => !userIds.has(String(item.id)));
    if (badAssignedUsers.length) add(findings, {
      key: 'cad:bad-assignment',
      area: 'CAD Assignments',
      severity: 'degraded',
      title: 'Calls are assigned to invalid users',
      description: `${badAssignedUsers.length} assignment reference(s) point to users that are missing from the directory.`,
      count: badAssignedUsers.length,
    });
    // CallAssignment is also the historical assignment log. A missing live call
    // is expected after CAD archives/removes that call, so only validate open
    // assignment rows that still point to a currently live call.
    const invalidActiveAssignments = assignments.filter(item =>
      callIds.has(String(item.call_id))
      && String(item.status || '').toLowerCase() !== 'cleared'
      && !userIds.has(String(item.unit_id))
    );
    if (invalidActiveAssignments.length) add(findings, {
      key: 'cad:invalid-active-assignment',
      area: 'CAD Assignments',
      severity: 'degraded',
      title: 'Active CAD assignment records reference missing users',
      description: `${invalidActiveAssignments.length} open assignment record(s) on live calls point to users missing from the directory.`,
      count: invalidActiveAssignments.length,
    });

    const monitored = locations.filter(item => item.active !== false && item.property_monitoring_enabled === true);
    const invalidBoundaries = monitored.filter(item => {
      const polygon = Array.isArray(item.property_monitoring_polygon) ? item.property_monitoring_polygon : [];
      const isPolygon = String(item.property_monitoring_boundary_type || '').toLowerCase() === 'polygon';
      return isPolygon ? polygon.length < 3 : !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude));
    });
    if (invalidBoundaries.length) add(findings, {
      key: 'property:boundary',
      area: 'Properties',
      severity: 'outage',
      title: 'Monitored properties have invalid boundaries',
      description: `${invalidBoundaries.length} monitored property record(s) cannot detect calls because their polygon or coordinates are incomplete.`,
      count: invalidBoundaries.length,
    });
    // PropertyAlert intentionally keeps a self-contained snapshot after its live
    // DispatchCall is archived. Legacy alerts can also reference the former
    // MonitoredProperty entity. Neither condition makes the alert unusable.
    const recentAlertCutoff = Date.now() - (24 * 60 * 60 * 1000);
    const malformedRecentAlerts = alerts.filter(item => {
      const created = new Date(item.callTime || item.time_received || item.created_date || 0).getTime();
      if (!Number.isFinite(created) || created < recentAlertCutoff) return false;
      return !item.callId || !item.propertyId || !item.propertyName || !item.callIncident
        || !value(item, 'callTime', 'time_received', 'created_date');
    });
    if (malformedRecentAlerts.length) add(findings, {
      key: 'property:malformed-recent-alert',
      area: 'Property Alerts',
      severity: 'degraded',
      title: 'Recent property alerts are missing required snapshot data',
      description: `${malformedRecentAlerts.length} recent alert record(s) cannot display a complete property-call announcement.`,
      count: malformedRecentAlerts.length,
    });

    const announcementReceipts = datasets.CadAnnouncementReceipt || [];
    const recentReceiptCutoff = Date.now() - (24 * 60 * 60 * 1000);
    const receiptKeys = new Set<string>();
    const duplicateReceiptKeys = new Set<string>();
    announcementReceipts
      .filter(item => new Date(item.processed_at || item.created_date || 0).getTime() >= recentReceiptCutoff)
      .forEach(item => {
        const key = `${String(item.user_email || '').toLowerCase()}|${String(item.event_key || '')}`;
        if (!item.event_key || !item.user_email) return;
        if (receiptKeys.has(key)) duplicateReceiptKeys.add(key);
        receiptKeys.add(key);
      });
    if (duplicateReceiptKeys.size) add(findings, {
      key: 'audio:duplicate-receipts',
      area: 'Alerts & Announcements',
      severity: 'outage',
      title: 'Duplicate announcement receipts were recorded in the last 24 hours',
      description: `${duplicateReceiptKeys.size} user/event key(s) were processed more than once and require announcement-flow review.`,
      count: duplicateReceiptKeys.size,
    });

    const autoDispatchLocations = locations.filter(item => item.auto_dispatch_enabled === true);
    // Phase 2B permits live automatic dispatch only after an administrator has
    // explicitly approved it. Live mode itself is no longer an outage.
    const unapprovedLiveLocations = autoDispatchLocations.filter(item =>
      item.auto_dispatch_mode === 'live'
      && (!item.auto_dispatch_live_approved_at || !item.auto_dispatch_live_approved_by)
    );
    if (unapprovedLiveLocations.length) add(findings, {
      key: 'auto-dispatch:live-unapproved',
      area: 'Automatic Dispatch',
      severity: 'outage',
      title: 'Live automatic dispatch is missing approval metadata',
      description: `${unapprovedLiveLocations.length} live property record(s) do not identify when and by whom live assignment was approved.`,
      count: unapprovedLiveLocations.length,
    });
    const invalidAutoDispatchLocations = autoDispatchLocations.filter(item =>
      !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))
      || !Number.isFinite(Number(item.auto_dispatch_response_radius_miles))
      || Number(item.auto_dispatch_response_radius_miles) <= 0
    );
    if (invalidAutoDispatchLocations.length) add(findings, {
      key: 'auto-dispatch:invalid-property-config',
      area: 'Automatic Dispatch',
      severity: 'outage',
      title: 'Automatic-dispatch property configuration is incomplete',
      description: `${invalidAutoDispatchLocations.length} enabled property record(s) lack valid coordinates or response radius.`,
      count: invalidAutoDispatchLocations.length,
    });
    const evaluations = datasets.AutoDispatchEvaluation || [];
    const evaluationKeys = new Set<string>();
    const duplicateEvaluationKeys = new Set<string>();
    evaluations.forEach(item => {
      if (!item.event_key) return;
      if (evaluationKeys.has(item.event_key)) duplicateEvaluationKeys.add(item.event_key);
      evaluationKeys.add(item.event_key);
    });
    if (duplicateEvaluationKeys.size) add(findings, {
      key: 'auto-dispatch:duplicate-evaluation',
      area: 'Automatic Dispatch',
      severity: 'outage',
      title: 'Duplicate automatic-dispatch evaluations detected',
      description: `${duplicateEvaluationKeys.size} property alert event(s) have more than one decision row.`,
      count: duplicateEvaluationKeys.size,
    });
    const locationByIdForDispatch = new Map(locations.map(item => [String(item.id), item]));
    const latestEvaluationByAlert = new Map<string, any>();
    [...evaluations]
      .sort((a, b) => new Date(b.evaluated_at || b.updated_date || 0).getTime() - new Date(a.evaluated_at || a.updated_date || 0).getTime())
      .forEach(item => {
        const alertId = String(item.property_alert_id || '');
        if (alertId && !latestEvaluationByAlert.has(alertId)) latestEvaluationByAlert.set(alertId, item);
      });
    const activeCallIdSet = new Set(activeCalls.map(item => String(item.id)));
    const activeLivePropertyAlerts = alerts.filter(alert => {
      if (alert.acknowledged === true || !activeCallIdSet.has(String(alert.callId))) return false;
      const property = locationByIdForDispatch.get(String(alert.propertyId));
      return property?.auto_dispatch_enabled === true && property?.auto_dispatch_mode === 'live';
    });
    const missingLiveEvaluations = activeLivePropertyAlerts.filter(alert => !latestEvaluationByAlert.has(String(alert.id)));
    if (missingLiveEvaluations.length) add(findings, {
      key: 'auto-dispatch:missing-live-evaluation',
      area: 'Automatic Dispatch',
      severity: 'outage',
      title: 'Active property alerts have not been evaluated',
      description: `${missingLiveEvaluations.length} active live-mode property alert(s) have no automatic-dispatch decision.`,
      count: missingLiveEvaluations.length,
    });
    const activeStaffingShortfalls = activeLivePropertyAlerts.filter(alert => {
      const evaluation = latestEvaluationByAlert.get(String(alert.id));
      return evaluation && ['no_eligible_unit', 'partially_assigned'].includes(String(evaluation.decision));
    });
    if (activeStaffingShortfalls.length) add(findings, {
      key: 'auto-dispatch:active-staffing-shortfall',
      area: 'Automatic Dispatch',
      severity: 'outage',
      title: 'Active property alerts require qualified units',
      description: `${activeStaffingShortfalls.length} live property alert(s) have no eligible unit or still require backup. The alerts remain active for dispatcher action and automatic recheck.`,
      count: activeStaffingShortfalls.length,
    });

    const schedules = datasets.Schedule || [];
    const badSchedules = schedules.filter(item => !value(item, 'officer_email', 'user_email', 'user_id') || !value(item, 'location', 'site_name', 'location_id') || !value(item, 'start_time', 'shift_start', 'date'));
    if (badSchedules.length) add(findings, {
      key: 'schedule:incomplete',
      area: 'Scheduling',
      severity: 'degraded',
      title: 'Schedule records are incomplete',
      description: `${badSchedules.length} schedule row(s) are missing an officer, site, date, or start time.`,
      count: badSchedules.length,
    });

    const liveLocations = datasets.ActiveOfficer || [];
    const movementHistory = datasets.LocationHistory || [];
    const now = Date.now();
    const freshLiveLocations = liveLocations.filter(item => {
      // A heartbeat proves the app session is alive, not that the GPS fix is
      // current. Movement-history health must compare against gps_updated_at.
      const stamp = new Date(value(item, 'gps_updated_at') || 0).getTime();
      return Number.isFinite(stamp) && now - stamp <= 15 * 60 * 1000
        && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
        && Number(item.accuracy) <= 100;
    });
    const recentMovement = movementHistory.filter(item => {
      const stamp = new Date(value(item, 'timestamp', 'created_date') || 0).getTime();
      return Number.isFinite(stamp) && now - stamp <= 15 * 60 * 1000
        && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
    });
    if (liveLocations.length && !freshLiveLocations.length) add(findings, {
      key: 'location:no-fresh-live-units',
      area: 'Live Location Tracking',
      severity: 'outage',
      title: 'No fresh officer locations are reaching the live tracker',
      description: 'ActiveOfficer records exist, but none contain fresh coordinates from the last 15 minutes.',
    });
    if (freshLiveLocations.length && !recentMovement.length) add(findings, {
      key: 'location:history-not-recording',
      area: 'Movement History',
      severity: 'outage',
      title: 'Historical officer movement is not being recorded',
      description: 'Fresh live officer locations exist, but LocationHistory has no coordinate records from the last 15 minutes.',
    });

    const payrollPeriods = datasets.PayrollPeriod || [];
    const payrollEntries = datasets.PayrollEntry || [];
    const easternDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const latestEndedPeriod = payrollPeriods
      .filter(item => String(item.end_date || '') < easternDate)
      .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0];
    if (latestEndedPeriod) {
      const generated = payrollEntries.filter(item =>
        item.pay_period_start === latestEndedPeriod.start_date
        && item.pay_period_end === latestEndedPeriod.end_date
      );
      if (!generated.length) add(findings, {
        key: 'payroll:missing-latest-period',
        area: 'Payroll',
        severity: 'outage',
        title: 'Latest ended payroll period has no generated report',
        description: `${latestEndedPeriod.period_name || 'Latest period'} (${latestEndedPeriod.start_date} through ${latestEndedPeriod.end_date}) has no payroll entries.`,
      });
    }
    const payrollKeys = new Set<string>();
    const duplicatePayrollKeys = new Set<string>();
    payrollEntries.forEach(item => {
      const key = `${String(item.officer_email || '').toLowerCase()}|${item.pay_period_start}|${item.pay_period_end}`;
      if (payrollKeys.has(key)) duplicatePayrollKeys.add(key);
      payrollKeys.add(key);
    });
    if (duplicatePayrollKeys.size) add(findings, {
      key: 'payroll:duplicate-officer-period',
      area: 'Payroll',
      severity: 'outage',
      title: 'Duplicate payroll entries detected',
      description: `${duplicatePayrollKeys.size} officer-period key(s) occur more than once. Do not transfer payroll until reviewed.`,
      count: duplicatePayrollKeys.size,
    });

    const openEntries = (datasets.TimeEntry || []).filter(item => value(item, 'clock_in', 'clock_in_time') && !value(item, 'clock_out', 'clock_out_time'));
    const staleOpenEntries = openEntries.filter(item => {
      const stamp = new Date(value(item, 'clock_in', 'clock_in_time') || 0).getTime();
      return Number.isFinite(stamp) && Date.now() - stamp > 18 * 60 * 60 * 1000;
    });
    if (staleOpenEntries.length) add(findings, {
      key: 'time:stale',
      area: 'Timekeeping',
      severity: 'degraded',
      title: 'Time entries remain open longer than 18 hours',
      description: `${staleOpenEntries.length} time entry record(s) may have a missing clock-out.`,
      count: staleOpenEntries.length,
    });

    const reportChecks = [
      ['Daily Reports', datasets.DailyActivityReport || []],
      ['Incident Reports', datasets.IncidentReport || []],
      ['Maintenance Reports', datasets.MaintenanceReport || []],
    ] as const;
    reportChecks.forEach(([area, records]) => {
      const incomplete = records.filter(item => !value(item, 'officer_email', 'created_by', 'created_by_id', 'officer_name', 'primary_officer_name', 'primary_officer_id') || !value(item, 'location', 'site_name', 'property_name') || !value(item, 'report_date', 'incident_date', 'created_date'));
      if (incomplete.length) add(findings, {
        key: `reports:${area}`,
        area,
        severity: 'maintenance',
        title: `${area} contain incomplete records`,
        description: `${incomplete.length} record(s) are missing an officer, location, or date.`,
        count: incomplete.length,
      });
    });

    const expiredActiveBolos = (datasets.BOLOAlert || []).filter(item => {
      if (item.active === false || item.status === 'resolved' || !item.expires_at) return false;
      return new Date(item.expires_at).getTime() < Date.now();
    });
    if (expiredActiveBolos.length) add(findings, {
      key: 'bolo:expired',
      area: 'BOLO',
      severity: 'maintenance',
      title: 'Expired BOLO alerts are still active',
      description: `${expiredActiveBolos.length} expired BOLO record(s) should be closed or archived.`,
      count: expiredActiveBolos.length,
    });

    const openOutages = (datasets.SystemOutage || []).filter(item => !item.resolved_at);
    if (openOutages.length) add(findings, {
      key: 'system:reported',
      area: 'System Issues',
      severity: openOutages.some(item => item.severity === 'outage') ? 'outage' : 'degraded',
      title: 'Reported system issues remain unresolved',
      description: `${openOutages.length} manually reported system issue(s) are still active.`,
      count: openOutages.length,
    });

    const severityOrder = { outage: 0, degraded: 1, maintenance: 2 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.area.localeCompare(b.area));

    return Response.json({
      success: true,
      scope: 'entire_app',
      status: findings.some(item => item.severity === 'outage') ? 'outage' : findings.length ? 'issues_found' : 'healthy',
      findings,
      summary: {
        areas_checked: checkedAreas.length,
        issues_found: findings.length,
        outages: findings.filter(item => item.severity === 'outage').length,
        degraded: findings.filter(item => item.severity === 'degraded').length,
        maintenance: findings.filter(item => item.severity === 'maintenance').length,
      },
      checked_areas: checkedAreas,
      scanned_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('runSystemAudit failed', error);
    return Response.json({ error: error?.message || 'System audit failed' }, { status: 500 });
  }
});
