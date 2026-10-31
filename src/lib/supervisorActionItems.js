// One normalized shape for every supervisor action item, whatever system produced
// it: duty & attendance follow-ups, the operational work queue, or a source record
// that has not been picked up by the assignment engine yet.
export const ACTION_GROUPS = [
  { id: 'duty', label: 'Duty & attendance' },
  { id: 'reports', label: 'Report reviews' },
  { id: 'conduct', label: 'Conduct & inspections' },
  { id: 'reviews', label: 'Performance reviews' },
  { id: 'live', label: 'Live operations' },
];

const GROUP_BY_KIND = {
  duty_follow_up: 'duty',
  missing_report: 'duty',
  report_review: 'reports',
  complaint: 'conduct',
  writeup: 'conduct',
  inspection: 'conduct',
  review: 'reviews',
  review_follow_up: 'reviews',
  missed_clock_in: 'live',
  patrol_speeding: 'live',
};

const PRIORITY_BY_KIND = {
  missed_clock_in: 'critical',
  patrol_speeding: 'high',
  report_review: 'high',
  complaint: 'high',
  writeup: 'high',
  inspection: 'high',
  review: 'high',
  review_follow_up: 'normal',
  missing_report: 'high',
};

const TOOL_BY_KIND = {
  complaint: { label: 'Open complaints', page: 'SupervisorComplaints' },
  writeup: { label: 'Open write-ups', page: 'SupervisorWriteUps' },
  inspection: { label: 'Open inspections', page: 'SupervisorInspections' },
  review: { label: 'Open reviews', page: 'SupervisorPerformanceReview' },
  review_follow_up: { label: 'Open reviews', page: 'SupervisorPerformanceReview' },
  missed_clock_in: { label: 'Field oversight', page: 'SupervisorFieldOversight' },
};

const PRIORITY_WEIGHT = { critical: 4, high: 3, normal: 2, low: 1 };

const stamp = value => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const text = value => String(value ?? '').trim();

const personName = row => text(row?.officer_name) || text(row?.officer_inspected) || text(row?.officer_email) || 'Officer';

export function buildSupervisorActionItems(payload = {}) {
  const items = [];
  const queuedKeys = new Set();

  // Operational work queue rows already carry the authoritative assignment.
  for (const state of payload.queueTasks || []) {
    const taskKey = text(state.task_key);
    if (!taskKey) continue;
    queuedKeys.add(taskKey);
    const kind = text(state.source_kind);
    items.push({
      id: `queue-${state.id || taskKey}`,
      source: 'queue',
      group: GROUP_BY_KIND[kind] || 'reports',
      title: text(state.title) || 'Supervisor action',
      person: text(state.person),
      detail: text(state.source_location),
      assignedTo: text(state.assigned_to_name),
      assignedToEmail: text(state.assigned_to_email),
      priority: PRIORITY_BY_KIND[kind] || 'normal',
      createdAt: state.assigned_at || state.created_date || state.last_seen_at,
      tool: TOOL_BY_KIND[kind] || null,
      complete: {
        action: 'finish',
        task_key: taskKey,
        title: text(state.title),
        person: text(state.person),
        kind,
        source_id: text(state.source_id),
      },
    });
  }

  for (const row of payload.followUps || []) {
    items.push({
      id: `followup-${row.id}`,
      source: 'followup',
      group: 'duty',
      title: text(row.title) || `Reach out to ${personName(row)}`,
      person: personName(row),
      detail: text(row.summary),
      findings: Array.isArray(row.items) ? row.items.filter(item => text(item?.label)) : [],
      period: row.period_start && row.period_end ? `${row.period_start} to ${row.period_end}` : '',
      assignedTo: text(row.assigned_to_name),
      assignedToEmail: text(row.assigned_to_email),
      priority: text(row.severity) || 'normal',
      createdAt: row.assigned_at || row.created_date,
      tool: null,
      complete: { action: 'complete_followup', follow_up_id: row.id },
    });
  }

  const pushEntity = (rows, config) => {
    for (const row of rows || []) {
      const taskKey = `${config.prefix}-${row.id}`;
      if (!row?.id || queuedKeys.has(taskKey)) continue;
      queuedKeys.add(taskKey);
      items.push({
        id: `entity-${taskKey}`,
        source: 'entity',
        group: config.group,
        title: config.title,
        person: config.person(row),
        detail: config.detail(row),
        assignedTo: '',
        assignedToEmail: '',
        priority: config.priority || 'high',
        createdAt: row.created_date,
        tool: config.tool || null,
        complete: {
          action: 'finish',
          task_key: taskKey,
          title: config.title,
          person: config.person(row),
          kind: config.prefix.replace(/-/g, '_'),
          source_id: text(row.id),
        },
      });
    }
  };

  pushEntity(payload.missedClockIns, {
    prefix: 'missed-clock',
    group: 'live',
    priority: 'critical',
    title: 'Officer failed to check in',
    person: row => text(row.officer_name) || text(row.officer_email) || 'Officer',
    detail: row => [text(row.start_time), text(row.location)].filter(Boolean).join(' · '),
    tool: TOOL_BY_KIND.missed_clock_in,
  });
  pushEntity(payload.missingReports, {
    prefix: 'missing-report',
    group: 'duty',
    title: 'Required daily report missing',
    person: row => text(row.officer_name) || text(row.officer_email) || 'Officer',
    detail: row => text(row.location),
  });
  pushEntity(payload.complaints, {
    prefix: 'complaint',
    group: 'conduct',
    title: 'Complaint investigation',
    person: personName,
    detail: row => [text(row.complaint_type).replace(/_/g, ' '), text(row.investigation_status).replace(/_/g, ' ')].filter(Boolean).join(' · '),
    tool: TOOL_BY_KIND.complaint,
  });
  pushEntity(payload.writeups, {
    prefix: 'writeup',
    group: 'conduct',
    title: 'Write-up review',
    person: personName,
    detail: row => [text(row.violation_type).replace(/_/g, ' '), text(row.severity).replace(/_/g, ' ')].filter(Boolean).join(' · '),
    tool: TOOL_BY_KIND.writeup,
  });
  pushEntity(payload.inspections, {
    prefix: 'inspection',
    group: 'conduct',
    title: 'Inspection follow-up',
    person: personName,
    detail: row => [text(row.inspection_date), text(row.location)].filter(Boolean).join(' · '),
    tool: TOOL_BY_KIND.inspection,
  });
  pushEntity(payload.reviews, {
    prefix: 'review',
    group: 'reviews',
    title: 'Performance review ratings due',
    person: personName,
    detail: row => [text(row.review_period_start), text(row.review_period_end)].filter(Boolean).join(' to '),
    tool: TOOL_BY_KIND.review,
  });
  pushEntity(payload.reviewFollowUps, {
    prefix: 'review-followup',
    group: 'reviews',
    priority: 'normal',
    title: 'Review awaiting officer signature',
    person: personName,
    detail: row => [text(row.review_period_start), text(row.review_period_end)].filter(Boolean).join(' to '),
    tool: TOOL_BY_KIND.review_follow_up,
  });

  return items.sort((left, right) =>
    (PRIORITY_WEIGHT[right.priority] || 0) - (PRIORITY_WEIGHT[left.priority] || 0)
    || stamp(left.createdAt) - stamp(right.createdAt)
  );
}

export function summarizeActionItems(items = []) {
  const byGroup = ACTION_GROUPS.reduce((map, group) => {
    map[group.id] = items.filter(item => item.group === group.id).length;
    return map;
  }, {});
  const now = Date.now();
  const ages = items.map(item => Math.max(0, Math.floor((now - stamp(item.createdAt)) / 86400000)));
  return {
    total: items.length,
    byGroup,
    urgent: items.filter(item => item.priority === 'critical' || item.priority === 'high').length,
    oldestDays: ages.length ? Math.max(...ages) : 0,
  };
}

export function actionItemAgeDays(item) {
  return Math.max(0, Math.floor((Date.now() - stamp(item?.createdAt)) / 86400000));
}