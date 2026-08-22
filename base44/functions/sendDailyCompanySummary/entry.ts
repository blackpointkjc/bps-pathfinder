import { createClientFromRequest } from 'npm:@base44/sdk';
import { blackPointEmail } from './blackPointEmail.ts';
import { buildPerformanceMetrics, easternDateKey, loadPerformanceMetricData } from './metrics.ts';

const TIME_ZONE = 'America/New_York';
const ONE_TIME_SEND_DATE = '2026-08-22';
const PORTAL_URL = 'https://bpspf.blackpointkjc.com/AdminAnalytics';
const CLIENT_ID = '5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const TENANT_ID = '07f32330-fc73-4d73-a835-e9c47ba798c7';
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const GRAPH_SEND = 'https://graph.microsoft.com/v1.0/me/sendMail';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
const siteKey = (value: unknown) => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
const textValue = (value: unknown) => String(value ?? '').trim();
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function displayName(user: any) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.email || 'Team Member';
}

function rankedName(user: any) {
  const name = displayName(user);
  const rank = textValue(user?.rank);
  return rank && !name.toLowerCase().startsWith(rank.toLowerCase()) ? `${rank} ${name}` : name;
}

function rolesOf(user: any) {
  return new Set([user?.role, ...(user?.additional_roles || [])].map((role: unknown) => String(role || '').toLowerCase()).filter(Boolean));
}

function isInternalActiveUser(user: any) {
  const roles = rolesOf(user);
  const employment = String(user?.employment_status || '').toLowerCase();
  return Boolean(user?.id && user?.email)
    && employment !== 'terminated'
    && !user?.termination_date
    && user?.disabled !== true
    && user?.active !== false
    && user?.user_type !== 'client'
    && user?.user_type !== 'student'
    && !roles.has('client')
    && !roles.has('student');
}

function isOperationalUser(user: any) {
  const roles = rolesOf(user);
  return isInternalActiveUser(user)
    && Boolean(user?.rank)
    && (user?.role === 'admin' || roles.has('officer') || roles.has('supervisor') || roles.has('full_access'));
}

function easternNow(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return {
    year,
    month,
    day,
    hour: read('hour') % 24,
    minute: read('minute'),
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    monthStart: `${year}-${String(month).padStart(2, '0')}-01`,
    monthEnd: `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`,
  };
}

async function safeList(base44: any, entityName: string, sort?: string, limit = 5000) {
  try {
    const entity = base44.asServiceRole.entities?.[entityName];
    return entity?.list ? await entity.list(sort, limit) : [];
  } catch (error) {
    console.warn(`Daily summary could not load ${entityName}:`, error?.message || error);
    return [];
  }
}

function aliasesFor(user: any, teams: any[], outlook: any[]) {
  const values = [
    user?.email, user?.work_email, user?.pathfinder_email, user?.microsoft_email, user?.outlook_email,
    ...(Array.isArray(user?.email_aliases) ? user.email_aliases : []),
  ];
  for (const row of teams || []) {
    if (row?.active === false) continue;
    if (String(row?.user_id || '') === String(user?.id || '') || emailKey(row?.pathfinder_email) === emailKey(user?.email)) {
      values.push(row?.pathfinder_email, row?.microsoft_email);
    }
  }
  for (const row of outlook || []) {
    if (row?.connected === false) continue;
    if (String(row?.user_id || '') === String(user?.id || '') || emailKey(row?.pathfinder_email) === emailKey(user?.email)) {
      values.push(row?.pathfinder_email, row?.outlook_email);
    }
  }
  return new Set(values.map(emailKey).filter(Boolean));
}

function recordBelongs(record: any, user: any, aliases: Set<string>, fields = ['officer_email']) {
  return Boolean(
    (user?.id && [record?.user_id, record?.officer_id, record?.created_by_id].some(value => String(value || '') === String(user.id))) ||
    fields.some(field => aliases.has(emailKey(record?.[field])))
  );
}

function resolvedDeliveryEmail(user: any, outlook: any[], teams: any[]) {
  const linkedOutlook = (outlook || []).find(row =>
    row?.connected !== false &&
    (String(row?.user_id || '') === String(user?.id || '') || emailKey(row?.pathfinder_email) === emailKey(user?.email)) &&
    emailKey(row?.outlook_email)
  );
  if (linkedOutlook?.outlook_email) return emailKey(linkedOutlook.outlook_email);
  const teamsIdentity = (teams || []).find(row =>
    row?.active !== false &&
    (String(row?.user_id || '') === String(user?.id || '') || emailKey(row?.pathfinder_email) === emailKey(user?.email)) &&
    emailKey(row?.microsoft_email)
  );
  return emailKey(
    teamsIdentity?.microsoft_email || user?.work_email || user?.microsoft_email ||
    user?.outlook_email || user?.email
  );
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return textValue(value) || 'date unavailable';
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function addMissing(target: Map<string, Set<string>>, user: any, item: string) {
  if (!item) return;
  const key = String(user.id);
  if (!target.has(key)) target.set(key, new Set());
  target.get(key)!.add(item);
}

function collectMissingItems(users: any[], metricData: any, extra: any) {
  const {
    reportTodos = [], trainingAssignments = [], trainingModules = [], trainingCompletions = [],
    certificationAlerts = [], dailyReports = [],
  } = extra;
  const missing = new Map<string, Set<string>>();

  for (const user of users) {
    const aliases = aliasesFor(user, metricData.teams || [], metricData.outlook || []);

    for (const todo of reportTodos) {
      if (todo?.completed === true || !recordBelongs(todo, user, aliases)) continue;
      const type = String(todo.report_type || 'report').replaceAll('_', ' ');
      const feedback = textValue(todo.admin_feedback);
      addMissing(missing, user, `Report correction: ${type}${feedback ? ` — ${feedback}` : ''}`);
    }

    for (const assignment of trainingAssignments) {
      if (String(assignment?.status || '').toLowerCase() === 'approved' || !recordBelongs(assignment, user, aliases)) continue;
      const due = assignment?.due_date ? ` (due ${formatDate(assignment.due_date)})` : '';
      const state = String(assignment?.status || 'assigned').replaceAll('_', ' ');
      addMissing(missing, user, `Training: ${assignment.training_name || 'Assigned training'} — ${state}${due}`);
    }

    const completedModuleIds = new Set(trainingCompletions
      .filter((row: any) => row?.completed === true && recordBelongs(row, user, aliases))
      .map((row: any) => String(row.training_module_id || ''))
      .filter(Boolean));
    for (const module of trainingModules) {
      if (module?.active === false) continue;
      const assigned = module?.required === true
        || (module?.assigned_to || []).some((email: unknown) => aliases.has(emailKey(email)))
        || (module?.assigned_divisions || []).includes(user?.division)
        || (module?.assigned_ranks || []).includes(user?.rank);
      if (assigned && !completedModuleIds.has(String(module.id))) {
        addMissing(missing, user, `Training module: ${module.title || module.training_name || 'Required module'}`);
      }
    }

    for (const alert of certificationAlerts) {
      if (alert?.acknowledged === true || !recordBelongs(alert, user, aliases)) continue;
      const days = Number(alert?.days_until_expiration);
      const status = Number.isFinite(days)
        ? (days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} expired` : `${days} day${days === 1 ? '' : 's'} remaining`)
        : 'attention required';
      addMissing(missing, user, `Certification: ${String(alert.certification_type || 'certification').toUpperCase()} — ${formatDate(alert.expiration_date)} (${status})`);
    }

    const completedEntries = (metricData.timeEntries || []).filter((entry: any) =>
      entry?.clock_in && entry?.clock_out && entry?.archived !== true && recordBelongs(entry, user, aliases)
    );
    const usedReports = new Set<string>();
    for (const entry of completedEntries) {
      const date = easternDateKey(entry.clock_in);
      if (!date) continue;
      const report = dailyReports.find((row: any) => {
        if (row?.status === 'draft' || usedReports.has(String(row.id || ''))) return false;
        if (!recordBelongs(row, user, aliases, ['officer_email', 'created_by', 'created_by_email'])) return false;
        if (row?.shift_id && String(row.shift_id) === String(entry.id)) return true;
        return !row?.shift_id && row?.report_date === date && siteKey(row?.location) === siteKey(entry?.location);
      });
      if (report) usedReports.add(String(report.id || ''));
      else addMissing(missing, user, `Daily Activity Report: ${formatDate(date)} at ${textValue(entry.location) || 'assigned post'}`);
    }
  }

  return missing;
}

function summaryContent(dateLabel: string, companyOverall: number | null, recipients: any[], rankings: any[], missing: Map<string, Set<string>>) {
  const missingRows = recipients
    .map(user => ({ user, items: [...(missing.get(String(user.id)) || [])] }))
    .filter(row => row.items.length > 0);
  const totalMissing = missingRows.reduce((sum, row) => sum + row.items.length, 0);

  const rankingRows = rankings.length
    ? rankings.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(rankedName(row.user))}</strong></td></tr>`).join('')
    : '<tr><td colspan="2">No scoreable company ranking is available yet.</td></tr>';

  const missingHtml = missingRows.length
    ? missingRows.map(({ user, items }) =>
      `<h3>${escapeHtml(rankedName(user))}</h3><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    ).join('')
    : '<p><strong>No missing company items were found.</strong></p>';

  const aggregate = companyOverall == null ? 'Not yet scoreable' : `${companyOverall}%`;
  const subject = `Black Point Daily Company Summary — ${dateLabel}`;
  const content = `
    <h2>Company Overall</h2>
    <table>
      <tr><th>Company Overall Performance</th><td><strong>${escapeHtml(aggregate)}</strong></td></tr>
      <tr><th>Active Company Members</th><td>${recipients.length}</td></tr>
      <tr><th>Missing Requirements</th><td>${totalMissing}</td></tr>
    </table>
    <p>This company summary reports one aggregate performance result. Individual performance percentages are intentionally not included.</p>
    <h2>Company Rankings</h2>
    <table><tr><th>Position</th><th>Team Member</th></tr>${rankingRows}</table>
    <h2>Missing Items by Team Member</h2>
    ${missingHtml}
  `;

  const plainRankings = rankings.length
    ? rankings.map((row, index) => `${index + 1}. ${rankedName(row.user)}`).join('\n')
    : 'No scoreable company ranking is available yet.';
  const plainMissing = missingRows.length
    ? missingRows.map(({ user, items }) => `${rankedName(user)}:\n${items.map(item => `• ${item}`).join('\n')}`).join('\n\n')
    : 'No missing company items were found.';
  const message = [
    `Company overall performance: ${aggregate}`,
    `Active company members: ${recipients.length}`,
    `Missing requirements: ${totalMissing}`,
    '',
    'Company rankings:',
    plainRankings,
    '',
    'Missing items by team member:',
    plainMissing,
    '',
    'Individual performance percentages are not included.',
  ].join('\n');

  return { subject, content, message, totalMissing, missingRows };
}

async function refreshMicrosoftToken(base44: any, credential: any) {
  const requestedScope = String(credential.scope || '').trim();
  const scope = requestedScope.includes('offline_access') ? requestedScope : `${requestedScope} offline_access`.trim();
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: String(credential.refresh_token || ''),
    scope,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Origin: 'https://bpspf.blackpointkjc.com',
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || 'Microsoft authorization could not be refreshed.';
    await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(credential.id, {
      last_error: String(message).slice(0, 1000),
      last_refreshed_at: new Date().toISOString(),
    }).catch(() => null);
    throw new Error(message);
  }

  await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(credential.id, {
    refresh_token: payload.refresh_token || credential.refresh_token,
    scope: payload.scope || scope,
    active: true,
    last_error: '',
    last_refreshed_at: new Date().toISOString(),
  });
  return payload.access_token;
}

async function sendGraphEmail(base44: any, credentials: any[], recipients: string[], subject: string, html: string) {
  const usable = (credentials || []).filter(row =>
    row?.active !== false && row?.refresh_token && String(row?.scope || '').toLowerCase().includes('mail.send')
  );
  if (!usable.length) throw new Error('No active Microsoft mailbox with Mail.Send is available.');

  let lastError: any = null;
  for (const credential of usable) {
    try {
      const accessToken = await refreshMicrosoftToken(base44, credential);
      const chunks: string[][] = [];
      for (let index = 0; index < recipients.length; index += 400) chunks.push(recipients.slice(index, index + 400));
      for (const chunk of chunks) {
        const [primary, ...blindCopies] = chunk;
        const message: any = {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: primary } }],
        };
        if (blindCopies.length) {
          message.bccRecipients = blindCopies.map(address => ({ emailAddress: { address } }));
        }
        const response = await fetch(GRAPH_SEND, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message, saveToSentItems: true }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error?.message || `Microsoft Graph send failed (${response.status}).`);
        }
      }
      return { sent: true, sender: emailKey(credential.microsoft_email || credential.pathfinder_email), batches: chunks.length };
    } catch (error) {
      lastError = error;
      console.warn('Daily summary mailbox failed:', credential?.microsoft_email || credential?.pathfinder_email, error?.message || error);
    }
  }
  throw lastError || new Error('Microsoft email delivery failed.');
}

async function createNotifications(base44: any, recipients: any[], relatedId: string, subject: string, message: string) {
  const existing = await base44.asServiceRole.entities.Notification.filter({ related_id: relatedId }, '-created_date', 5000).catch(() => []);
  const delivered = new Set((existing || []).map((row: any) => emailKey(row.recipient_email)));
  let created = 0;
  for (const user of recipients) {
    const recipient = emailKey(user.email);
    if (!recipient || delivered.has(recipient)) continue;
    await base44.asServiceRole.entities.Notification.create({
      recipient_email: recipient,
      type: 'training_reminder',
      title: subject,
      message,
      is_read: false,
      related_id: relatedId,
      priority: 'normal',
      source_name: 'Company Analytics',
    });
    delivered.add(recipient);
    created += 1;
  }
  return created;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json().catch(() => ({}));
    const action = String(input?.action || 'scheduled').toLowerCase();
    const manual = action === 'send_now' || action === 'preview';
    let caller: any = null;
    if (manual) {
      caller = await base44.auth.me().catch(() => null);
      if (!caller?.id) return json({ error: 'Authentication required.' }, 401);
      if (caller.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403);
    }

    const now = easternNow();
    const oneTimeScheduledSend = !manual && now.date === ONE_TIME_SEND_DATE;
    if (!manual && !oneTimeScheduledSend && now.hour !== 8) {
      return json({ success: true, skipped: true, reason: 'Outside the 8:00 AM Eastern delivery window', date: now.date });
    }

    const deliveryId = manual
      ? `daily-company-summary:manual:${now.date}:${crypto.randomUUID()}`
      : `daily-company-summary:${now.date}`;

    if (!manual) {
      const audits = await base44.asServiceRole.entities.AuditLog.filter({
        entity_type: 'DailyCompanySummary',
        entity_id: deliveryId,
      }, '-timestamp', 20).catch(() => []);
      const alreadyAttempted = (audits || []).some((row: any) => {
        try { return ['completed', 'partial'].includes(JSON.parse(row.after_value || '{}')?.status); } catch { return false; }
      });
      if (alreadyAttempted) return json({ success: true, skipped: true, reason: 'Today\'s summary was already attempted', date: now.date });
    }

    const [
      users, metricData, reportTodos, trainingAssignments, trainingModules,
      trainingCompletions, certificationAlerts, dailyReports, credentials,
    ] = await Promise.all([
      safeList(base44, 'User', 'last_name'),
      loadPerformanceMetricData(base44),
      safeList(base44, 'ReportTodo', '-created_date'),
      safeList(base44, 'TrainingAssignment', 'due_date'),
      safeList(base44, 'TrainingModule', 'title'),
      safeList(base44, 'TrainingCompletion', '-completed_date'),
      safeList(base44, 'CertificationAlert', 'expiration_date'),
      safeList(base44, 'DailyActivityReport', '-report_date'),
      safeList(base44, 'MicrosoftOAuthCredential', '-last_refreshed_at', 100),
    ]);

    const recipients = (users || []).filter(isInternalActiveUser);
    if (!recipients.length) return json({ error: 'No active internal company recipients were found.' }, 400);

    const missing = collectMissingItems(recipients, metricData, {
      reportTodos, trainingAssignments, trainingModules, trainingCompletions,
      certificationAlerts, dailyReports,
    });

    const rankingCandidates = recipients.filter(isOperationalUser);
    const metricResults = await Promise.all(rankingCandidates.map(async user => {
      try {
        const metrics = await buildPerformanceMetrics(base44, user, now.monthStart, now.monthEnd, metricData);
        return { user, score: Number.isFinite(Number(metrics.performance_score)) ? Number(metrics.performance_score) : null };
      } catch (error) {
        console.warn('Daily ranking skipped for', user?.email, error?.message || error);
        return { user, score: null };
      }
    }));
    const rankings = metricResults.sort((a, b) =>
      (b.score ?? -1) - (a.score ?? -1) || rankedName(a.user).localeCompare(rankedName(b.user))
    );
    const scored = rankings.filter(row => row.score != null);
    const companyOverall = scored.length
      ? Math.round(scored.reduce((sum, row) => sum + Number(row.score), 0) / scored.length)
      : null;

    const dateLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric',
    }).format(new Date());
    const summary = summaryContent(dateLabel, companyOverall, recipients, rankings, missing);

    if (action === 'preview') {
      return json({
        success: true,
        preview: true,
        subject: summary.subject,
        company_overall: companyOverall,
        rankings: rankings.map((row, index) => ({ position: index + 1, name: rankedName(row.user) })),
        missing_items: summary.missingRows.map(({ user, items }) => ({ name: rankedName(user), items })),
        recipient_count: recipients.length,
        email_recipient_count: new Set(recipients.map(user => resolvedDeliveryEmail(user, metricData.outlook, metricData.teams)).filter(Boolean)).size,
        integration_credits_used: 0,
      });
    }

    const notificationsCreated = await createNotifications(base44, recipients, deliveryId, summary.subject, summary.message);
    const emailRecipients = [...new Set(recipients
      .map(user => resolvedDeliveryEmail(user, metricData.outlook, metricData.teams))
      .filter(Boolean))];
    const html = blackPointEmail(summary.subject, summary.content, 'Open Company Analytics', PORTAL_URL);

    let emailResult: any = { sent: false };
    let emailError = '';
    try {
      emailResult = await sendGraphEmail(base44, credentials, emailRecipients, summary.subject, html);
    } catch (error) {
      emailError = error?.message || String(error);
      console.error('Daily company email failed:', emailError);
    }

    const status = emailResult.sent ? 'completed' : 'partial';
    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DailyCompanySummary',
      entity_id: deliveryId,
      action: 'status_change',
      actor_id: caller?.id || 'system',
      actor_name: caller ? displayName(caller) : 'Pathfinder Automation',
      before_value: '',
      after_value: JSON.stringify({
        status,
        recipient_count: recipients.length,
        email_recipient_count: emailRecipients.length,
        notifications_created: notificationsCreated,
        email_sent: Boolean(emailResult.sent),
        email_sender: emailResult.sender || '',
        email_error: emailError,
        integration_credits_used: 0,
      }),
      field_changed: 'delivery_status',
      timestamp: new Date().toISOString(),
      description: `Daily company summary ${status}: ${recipients.length} active recipients; ${summary.totalMissing} missing items listed.`,
    });

    return json({
      success: Boolean(emailResult.sent),
      partial: !emailResult.sent,
      date: now.date,
      delivery_id: deliveryId,
      company_overall: companyOverall,
      ranking_count: rankings.length,
      missing_item_count: summary.totalMissing,
      recipient_count: recipients.length,
      email_recipient_count: emailRecipients.length,
      notifications_created: notificationsCreated,
      email_sent: Boolean(emailResult.sent),
      email_sender: emailResult.sender || '',
      email_error: emailError,
      integration_credits_used: 0,
    }, emailResult.sent ? 200 : 207);
  } catch (error) {
    console.error('sendDailyCompanySummary failed', error);
    return json({ error: error?.message || 'Unable to prepare the daily company summary', integration_credits_used: 0 }, 500);
  }
});
