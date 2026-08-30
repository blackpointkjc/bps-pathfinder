import { createClientFromRequest } from 'npm:@base44/sdk';

const norm = (value: any) => String(value || '').trim().toLowerCase();
const siteKey = (value: any) => norm(String(value || '').split(':')[0].split(' - ')[0]);
const phoneE164 = (value: any) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(value || '').trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return '';
};

function etParts(dateValue: any) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function previousDate(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function coverageActive(row: any, callStamp: any) {
  if (!row || norm(row.status) === 'cancelled') return false;
  const call = etParts(callStamp);
  const start = String(row.start_time || '00:00').slice(0,5);
  const end = String(row.end_time || '00:00').slice(0,5);
  const rowDate = String(row.assignment_date || '').slice(0,10);
  const overnight = end <= start;
  if (!overnight) return rowDate === call.date && call.time >= start && call.time < end;
  return (rowDate === call.date && call.time >= start) || (rowDate === previousDate(call.date) && call.time < end);
}

function displayName(user: any) {
  return [user?.rank, user?.last_name || user?.first_name].filter(Boolean).join(' ').trim() || user?.full_name || user?.email || 'User';
}

async function sendTwilio(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const from = Deno.env.get('TWILIO_FROM_NUMBER') || '';
  if (!sid || !token || !from) return { configured: false, sent: false, error: 'Twilio SMS secrets are not configured.' };
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: form.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { configured: true, sent: false, error: payload?.message || `Twilio HTTP ${response.status}` };
  return { configured: true, sent: true, message_id: payload?.sid || '' };
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(norm));
    const allowed = user.role === 'admin' || roles.has('full_access') || user.role === 'dispatch' || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'CAD/admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const alertId = String(body.property_alert_id || body.alert_id || '');
    if (!alertId) return Response.json({ error: 'property_alert_id is required' }, { status: 400 });

    const alert = await base44.asServiceRole.entities.PropertyAlert.get(alertId).catch(() => null);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });
    const [call, property, users, timeEntries, dutyAssignments] = await Promise.all([
      alert.callId ? base44.asServiceRole.entities.DispatchCall.get(alert.callId).catch(() => null) : Promise.resolve(null),
      alert.propertyId ? base44.asServiceRole.entities.Location.get(alert.propertyId).catch(() => null) : Promise.resolve(null),
      base44.asServiceRole.entities.User.list('-last_updated', 2000).catch(() => []),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 3000).catch(() => []),
      base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date', 1000).catch(() => []),
    ]);
    if (!call || !property) return Response.json({ error: 'Linked call or property is unavailable' }, { status: 409 });

    const callStamp = call.time_received || alert.callTime || alert.time_received || alert.created_date || new Date().toISOString();
    const propertySite = siteKey(property.site_name || alert.propertyName);
    const recipientByPhone = new Map<string, any>();
    const addRecipient = (person: any, scope: string) => {
      if (!person || norm(person.employment_status) === 'terminated') return;
      const phone = phoneE164(person.mobile_phone);
      if (!phone) return;
      const current = recipientByPhone.get(phone) || { person, phone, scopes: new Set<string>() };
      current.scopes.add(scope);
      recipientByPhone.set(phone, current);
    };

    for (const person of users || []) {
      const personRoles = new Set((person.additional_roles || []).map(norm));
      if (person.role === 'admin' || personRoles.has('full_access')) addRecipient(person, 'admin');
    }

    const activeDutyEmails = new Set((dutyAssignments || []).filter((row: any) => {
      const location = String(row.location || 'ALL');
      return coverageActive(row, callStamp) && (location === 'ALL' || siteKey(location) === propertySite);
    }).map((row: any) => norm(row.supervisor_email)).filter(Boolean));
    for (const email of activeDutyEmails) {
      const person = (users || []).find((row: any) => norm(row.email) === email);
      addRecipient(person, 'duty_supervisor');
    }

    const activeOfficerEmails = new Set((timeEntries || []).filter((entry: any) => {
      if (!entry?.officer_email || entry.clock_out) return false;
      return siteKey(entry.location) === propertySite;
    }).map((entry: any) => norm(entry.officer_email)).filter(Boolean));
    for (const email of activeOfficerEmails) {
      const person = (users || []).find((row: any) => norm(row.email) === email);
      addRecipient(person, 'on_site_officer');
    }

    const cad = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const incident = String(call.incident || alert.callIncident || 'Call for service').replace(/\s+/g, ' ').trim();
    const address = String(call.location || alert.callLocation || property.address || '').replace(/\s+/g, ' ').trim();
    const priority = String(call.priority || 'medium').toUpperCase();
    const message = `BPS PROPERTY CALL: ${property.site_name || alert.propertyName}. ${incident}. ${address}. Priority ${priority}. CAD ${cad}. Open Pathfinder CAD for details.`;
    const results: any[] = [];

    for (const item of recipientByPhone.values()) {
      const eventKey = `property-sms:${alert.id}:${item.phone}`;
      const prior = await base44.asServiceRole.entities.PropertyAlertSmsReceipt.filter({ event_key: eventKey }, '-created_date', 1).catch(() => []);
      if (prior?.some((row: any) => row.status === 'sent')) {
        results.push({ phone: item.phone, status: 'already_sent', scopes: [...item.scopes] });
        continue;
      }
      const send = await sendTwilio(item.phone, message).catch(error => ({ configured: true, sent: false, error: error?.message || String(error) }));
      const scope = item.scopes.has('admin') ? 'admin' : item.scopes.has('duty_supervisor') ? 'duty_supervisor' : 'on_site_officer';
      const receipt = {
        event_key: eventKey,
        property_alert_id: alert.id,
        call_id: call.id,
        property_id: property.id,
        property_name: property.site_name || alert.propertyName || '',
        recipient_email: item.person?.email || '',
        recipient_name: displayName(item.person),
        recipient_phone: item.phone,
        recipient_scope: scope,
        status: send.sent ? 'sent' : send.configured ? 'failed' : 'skipped',
        provider: 'twilio',
        provider_message_id: send.message_id || '',
        message_text: message,
        error: send.error || '',
        sent_at: new Date().toISOString(),
      };
      await base44.asServiceRole.entities.PropertyAlertSmsReceipt.create(receipt).catch(() => null);
      results.push({ phone: item.phone, email: item.person?.email || '', name: displayName(item.person), scopes: [...item.scopes], status: receipt.status, error: receipt.error });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'PropertyAlert', entity_id: alert.id, action: 'sms_fanout',
      actor_id: user.id || '', actor_name: user.full_name || user.email || 'CAD Automation',
      field_changed: 'property_call_sms', timestamp: new Date().toISOString(),
      description: `Property-call SMS fan-out evaluated ${recipientByPhone.size} unique phone recipient(s) for ${property.site_name || alert.propertyName}.`,
      after_value: JSON.stringify(results).slice(0, 10000),
    }).catch(() => null);

    return Response.json({ success: true, configured: Boolean(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_FROM_NUMBER')), recipient_count: recipientByPhone.size, results });
  } catch (error) {
    console.error('sendPropertyCallSms failed', error);
    return Response.json({ error: error?.message || 'Unable to send property-call SMS alerts' }, { status: 500 });
  }
});
