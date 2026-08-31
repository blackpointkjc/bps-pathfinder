import { createClientFromRequest } from 'npm:@base44/sdk';

type RecipientType = 'admin' | 'duty_supervisor' | 'on_property_officer';

const RECIPIENT_PRIORITY: Record<RecipientType, number> = {
  admin: 1,
  on_property_officer: 2,
  duty_supervisor: 3,
};

function lower(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSite(value: unknown) {
  return lower(value)
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function siteCandidates(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parts = [raw];
  if (raw.includes(':')) {
    parts.push(raw.split(':')[0]);
    parts.push(raw.split(':').slice(1).join(':'));
  }
  if (raw.includes(' - ')) {
    parts.push(raw.split(' - ')[0]);
    parts.push(raw.split(' - ').slice(1).join(' - '));
  }
  return [...new Set(parts.map(normalizeSite).filter(Boolean))];
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function phoneLast4(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-4);
}

function easternNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = (Number(get('hour')) * 60) + Number(get('minute'));
  return { dateKey, minutes };
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function toMinutes(value: unknown) {
  const [hour = 0, minute = 0] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return (hour * 60) + minute;
}

function dutyAssignmentIsActive(assignment: any, dateKey: string, nowMinutes: number) {
  if (!assignment?.assignment_date || !assignment?.start_time || !assignment?.end_time) return false;
  if (['cancelled', 'completed'].includes(lower(assignment.status))) return false;
  const start = toMinutes(assignment.start_time);
  const end = toMinutes(assignment.end_time);
  if (end > start) {
    return assignment.assignment_date === dateKey && nowMinutes >= start && nowMinutes < end;
  }
  const yesterday = shiftDateKey(dateKey, -1);
  return (assignment.assignment_date === dateKey && nowMinutes >= start)
    || (assignment.assignment_date === yesterday && nowMinutes < end);
}

function sameProperty(value: unknown, propertyNames: string[]) {
  const candidates = siteCandidates(value);
  if (!candidates.length) return false;
  return candidates.some((candidate) => propertyNames.some((property) => candidate === property));
}

async function sendTwilioSms(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || null;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || null;
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER') || null;
  const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || null;

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    throw new Error('SMS provider not configured: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.');
  }

  const params = new URLSearchParams({ To: to, Body: message });
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
  else params.set('From', String(fromNumber));

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = String(payload?.message || `Twilio HTTP ${response.status}`).slice(0, 500);
    throw new Error(providerMessage);
  }
  return { sid: String(payload?.sid || '') };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const propertyAlertId = String(body.property_alert_id || body.propertyAlertId || '').trim();
    if (!propertyAlertId) return Response.json({ error: 'property_alert_id is required' }, { status: 400 });

    const alert = await base44.asServiceRole.entities.PropertyAlert.get(propertyAlertId).catch(() => null);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });
    if (alert.is_test === true || ['resolved', 'false_alarm', 'test'].includes(lower(alert.lifecycle_status))) {
      return Response.json({ success: true, skipped: 'inactive_or_test_alert', sent: 0 });
    }

    const [call, property, users, timeEntries, dutyAssignments] = await Promise.all([
      alert.callId ? base44.asServiceRole.entities.DispatchCall.get(alert.callId).catch(() => null) : Promise.resolve(null),
      alert.propertyId ? base44.asServiceRole.entities.Location.get(alert.propertyId).catch(() => null) : Promise.resolve(null),
      base44.asServiceRole.entities.User.list(undefined, 5000),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 2000).catch(() => []),
      base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date', 1000).catch(() => []),
    ]);

    const propertyNames = [...new Set([
      ...siteCandidates(alert.propertyName),
      ...siteCandidates(property?.site_name),
      ...siteCandidates(property?.address),
    ])].filter(Boolean);

    const userByEmail = new Map((users || []).filter((user: any) => user?.email).map((user: any) => [lower(user.email), user]));
    const recipients = new Map<string, { user: any; type: RecipientType }>();
    const addRecipient = (user: any, type: RecipientType) => {
      if (!user?.email || user.termination_date || lower(user.employment_status) === 'terminated') return;
      const email = lower(user.email);
      const current = recipients.get(email);
      if (!current || RECIPIENT_PRIORITY[type] > RECIPIENT_PRIORITY[current.type]) recipients.set(email, { user, type });
    };

    for (const user of users || []) {
      const additionalRoles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
      if (lower(user.role) === 'admin' || additionalRoles.has('admin')) addRecipient(user, 'admin');
    }

    const now = easternNowParts();
    for (const assignment of dutyAssignments || []) {
      if (!dutyAssignmentIsActive(assignment, now.dateKey, now.minutes)) continue;
      const coverage = String(assignment.location || 'ALL').trim();
      if (upper(coverage) !== 'ALL' && !sameProperty(coverage, propertyNames)) continue;
      const supervisor = userByEmail.get(lower(assignment.supervisor_email));
      if (supervisor) addRecipient(supervisor, 'duty_supervisor');
    }

    const activeEntryByEmail = new Map<string, any>();
    for (const entry of timeEntries || []) {
      if (!entry?.officer_email || entry.clock_out || entry.archived === true) continue;
      const email = lower(entry.officer_email);
      if (!activeEntryByEmail.has(email)) activeEntryByEmail.set(email, entry);
    }
    for (const [email, entry] of activeEntryByEmail.entries()) {
      if (!sameProperty(entry.location, propertyNames)) continue;
      const officer = userByEmail.get(email);
      if (officer) addRecipient(officer, 'on_property_officer');
    }

    const cadNumber = call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || alert.callId || 'pending';
    const propertyName = alert.propertyName || property?.site_name || 'monitored property';
    const incident = call?.incident || alert.callIncident || 'Call for service';
    const callLocation = call?.location || alert.callLocation || property?.address || 'location unavailable';
    const message = `BLACK POINT PROPERTY CALL: ${propertyName} | ${incident} | ${callLocation} | CAD ${cadNumber}. Open Pathfinder CAD for details.`;

    const results = { sent: 0, skipped_sent: 0, missing_phone: 0, failed: 0, recipients: recipients.size };
    for (const [email, recipient] of recipients.entries()) {
      const existing = await base44.asServiceRole.entities.PropertyAlertSmsDelivery.filter({
        property_alert_id: propertyAlertId,
        recipient_email: email,
      }, '-created_date', 10).catch(() => []);
      const sentReceipt = (existing || []).find((row: any) => row.status === 'sent');
      if (sentReceipt) {
        results.skipped_sent += 1;
        continue;
      }

      const latestReceipt = (existing || [])[0] || null;
      const latestAttempt = latestReceipt?.attempted_at ? new Date(latestReceipt.attempted_at).getTime() : 0;
      if (latestReceipt?.status === 'failed' && Number.isFinite(latestAttempt) && Date.now() - latestAttempt < 5 * 60 * 1000) {
        results.failed += 1;
        continue;
      }

      const mobile = normalizePhone(recipient.user.mobile_phone);
      const attemptedAt = new Date().toISOString();
      if (!mobile) {
        const data = {
          property_alert_id: propertyAlertId,
          call_id: String(alert.callId || ''),
          recipient_email: email,
          recipient_type: recipient.type,
          phone_last4: phoneLast4(recipient.user.mobile_phone),
          status: 'failed',
          provider: 'twilio',
          attempted_at: attemptedAt,
          error: 'No valid mobile phone is configured for this recipient.',
        };
        if (latestReceipt?.id) await base44.asServiceRole.entities.PropertyAlertSmsDelivery.update(latestReceipt.id, data).catch(() => null);
        else await base44.asServiceRole.entities.PropertyAlertSmsDelivery.create(data).catch(() => null);
        results.missing_phone += 1;
        continue;
      }

      try {
        const provider = await sendTwilioSms(mobile, message);
        const data = {
          property_alert_id: propertyAlertId,
          call_id: String(alert.callId || ''),
          recipient_email: email,
          recipient_type: recipient.type,
          phone_last4: phoneLast4(mobile),
          status: 'sent',
          provider: 'twilio',
          provider_message_id: provider.sid,
          attempted_at: attemptedAt,
          sent_at: new Date().toISOString(),
          error: '',
        };
        if (latestReceipt?.id) await base44.asServiceRole.entities.PropertyAlertSmsDelivery.update(latestReceipt.id, data);
        else await base44.asServiceRole.entities.PropertyAlertSmsDelivery.create(data);
        results.sent += 1;
      } catch (error) {
        const errorMessage = String(error?.message || error || 'SMS send failed').slice(0, 1000);
        const data = {
          property_alert_id: propertyAlertId,
          call_id: String(alert.callId || ''),
          recipient_email: email,
          recipient_type: recipient.type,
          phone_last4: phoneLast4(mobile),
          status: 'failed',
          provider: 'twilio',
          attempted_at: attemptedAt,
          error: errorMessage,
        };
        if (latestReceipt?.id) await base44.asServiceRole.entities.PropertyAlertSmsDelivery.update(latestReceipt.id, data).catch(() => null);
        else await base44.asServiceRole.entities.PropertyAlertSmsDelivery.create(data).catch(() => null);
        results.failed += 1;
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('notifyPropertyAlertSms failed', error?.message || error);
    return Response.json({ error: error?.message || 'Unable to send property-call SMS notifications' }, { status: 500 });
  }
});

function upper(value: unknown) {
  return String(value || '').trim().toUpperCase();
}
