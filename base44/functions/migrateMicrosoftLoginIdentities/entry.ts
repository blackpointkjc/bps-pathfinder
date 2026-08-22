import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

const EMAIL_FIELDS: Record<string, string[]> = {
  AccessRequest: ['email'],
  AccountLock: ['user_email', 'locked_by_email', 'unlocked_by_email'],
  ActiveOfficer: ['officer_email'],
  AnnouncementReceipt: ['user_email'],
  AvailabilityRequest: ['officer_email'],
  CallOut: ['officer_email', 'supervisor_email'],
  CertificationAlert: ['officer_email'],
  CertificationTodo: ['officer_email'],
  ChatMention: ['recipient_email'],
  Client: ['primary_contact_email'],
  ClientFeedback: ['officer_email'],
  Commendation: ['officer_email'],
  CompanyImapMailbox: ['pathfinder_email'],
  Complaint: ['officer_email'],
  DailyActivityReport: ['officer_email'],
  DirectMessage: ['sender_email'],
  'direct-message': ['sender_email'],
  ExpenseReport: ['officer_email'],
  GeofenceAlert: ['officer_email'],
  InboxThreadPreference: ['user_email'],
  InspectionReport: ['officer_email'],
  Invoice: ['client_email'],
  Lead: ['contact_email'],
  Location: ['site_email', 'assigned_client_email'],
  LocationHistory: ['officer_email'],
  MicrosoftOAuthCredential: ['pathfinder_email'],
  MicrosoftTeamsIdentity: ['pathfinder_email'],
  Notification: ['recipient_email'],
  OfficerAvailability: ['officer_email'],
  OfficerChatMessage: ['sender_email'],
  OfficerPerformanceMetric: ['officer_email'],
  OfficerRoster: ['email'],
  OfficerStatusOverride: ['officer_email', 'forced_by_email', 'released_by_email'],
  OutlookMailboxLink: ['pathfinder_email'],
  OutlookSharedMailbox: ['pathfinder_email'],
  PayrollConfig: ['payroll_email'],
  PayrollEntry: ['officer_email'],
  PerformanceReview: ['officer_email', 'reviewer_email'],
  PropertyAlertReceipt: ['user_email'],
  QRPatrolReport: ['officer_email'],
  QRScanEvent: ['officer_email'],
  ReportTodo: ['officer_email'],
  Schedule: ['officer_email'],
  SecurityAlert: ['officer_email'],
  ShiftBid: ['officer_email'],
  ShiftHandover: ['departing_officer_email', 'incoming_officer_email'],
  SpecialCoverageRequest: ['client_email', 'preferred_officer_email'],
  SupervisorDailyCode: ['supervisor_email'],
  SupervisorSiteCheck: ['supervisor_email', 'entered_by_officer_email'],
  TenantBranding: ['support_email'],
  TenantMember: ['user_email'],
  TimeEntry: ['officer_email'],
  TrainingAssignment: ['officer_email'],
  TrainingAttendee: ['email'],
  TrainingCertificate: ['student_email'],
  TrainingClass: ['instructor_email'],
  TrainingCompletion: ['officer_email'],
  TrainingSchoolSettings: ['school_email'],
  TrainingSubmission: ['officer_email'],
  UseOfForceReport: ['officer_email'],
  VehicleAssignment: ['primary_officer_email', 'partner_officer_email', 'created_by_email'],
  VehicleAssignmentAudit: ['primary_officer_email', 'partner_officer_email'],
  VendorMember: ['user_email'],
  W2Form: ['officer_email'],
  WriteUpReport: ['officer_email'],
};

const ARRAY_EMAIL_FIELDS: Record<string, string[]> = {
  Announcement: ['pinged_users', 'read_by'],
  DirectMessage: ['recipients', 'read_by'],
  'direct-message': ['recipients', 'read_by'],
  PlannedShift: ['preferred_officers'],
  TrainingModule: ['assigned_to'],
};

function replaceEmailArray(value: unknown, oldEmail: string, newEmail: string) {
  if (!Array.isArray(value)) return { changed: false, value };
  let changed = false;
  const next = value.map(item => {
    if (lower(item) !== oldEmail) return item;
    changed = true;
    return newEmail;
  });
  return { changed, value: next };
}

async function migrateEntityReferences(base44: any, oldEmail: string, newEmail: string) {
  const updatesByEntity: Record<string, number> = {};
  const entityNames = new Set([...Object.keys(EMAIL_FIELDS), ...Object.keys(ARRAY_EMAIL_FIELDS), 'CallForService']);

  for (const entityName of entityNames) {
    try {
      const entity = base44.asServiceRole.entities[entityName];
      if (!entity) continue;
      const rows = await entity.list('-updated_date', 5000);
      let count = 0;

      for (const row of rows || []) {
        const update: Record<string, unknown> = {};
        for (const field of EMAIL_FIELDS[entityName] || []) {
          if (lower(row?.[field]) === oldEmail) update[field] = newEmail;
        }
        for (const field of ARRAY_EMAIL_FIELDS[entityName] || []) {
          const replaced = replaceEmailArray(row?.[field], oldEmail, newEmail);
          if (replaced.changed) update[field] = replaced.value;
        }
        if (entityName === 'CallForService' && Array.isArray(row?.attached_officers)) {
          let changed = false;
          const attached = row.attached_officers.map((officer: any) => {
            if (lower(officer?.officer_email) !== oldEmail) return officer;
            changed = true;
            return { ...officer, officer_email: newEmail };
          });
          if (changed) update.attached_officers = attached;
        }
        if (Object.keys(update).length && row?.id) {
          await entity.update(row.id, update);
          count++;
        }
      }
      if (count) updatesByEntity[entityName] = count;
    } catch (error) {
      console.warn(`Microsoft identity migration skipped ${entityName}:`, error?.message || error);
    }
  }
  return updatesByEntity;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== 'admin') {
      return Response.json({ error: 'System administrator access required.' }, { status: 403 });
    }

    const [users, links] = await Promise.all([
      base44.asServiceRole.entities.User.list('email', 5000),
      base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 5000),
    ]);
    const usersById = new Map((users || []).map((user: any) => [String(user.id), user]));
    const usersByEmail = new Map((users || []).map((user: any) => [lower(user.email), user]));
    const newestVerifiedByUser = new Map<string, any>();

    for (const link of links || []) {
      if (link?.connected !== true || !link?.user_id || !link?.microsoft_user_id || !lower(link?.outlook_email)) continue;
      const key = String(link.user_id);
      if (!newestVerifiedByUser.has(key)) newestVerifiedByUser.set(key, link);
    }

    const migrations: any[] = [];
    const skipped: any[] = [];

    for (const [userId, link] of newestVerifiedByUser.entries()) {
      const user: any = usersById.get(userId);
      if (!user) {
        skipped.push({ user_id: userId, reason: 'Linked Pathfinder user no longer exists.' });
        continue;
      }

      const oldEmail = lower(user.email);
      const newEmail = lower(link.outlook_email);
      if (!oldEmail || !newEmail || oldEmail === newEmail) continue;
      if (lower(link.pathfinder_email) !== oldEmail) {
        skipped.push({ user_id: userId, old_email: oldEmail, new_email: newEmail, reason: 'Link does not match the current Pathfinder email.' });
        continue;
      }

      const collision: any = usersByEmail.get(newEmail);
      if (collision && String(collision.id) !== userId) {
        skipped.push({ user_id: userId, old_email: oldEmail, new_email: newEmail, reason: 'Another Pathfinder account already uses the Microsoft email.' });
        continue;
      }

      const updatedRecords = await migrateEntityReferences(base44, oldEmail, newEmail);
      await base44.asServiceRole.entities.User.update(userId, { email: newEmail });

      // Keep every durable Microsoft directory row aligned and disable duplicates.
      const userLinks = (links || []).filter((row: any) => String(row.user_id) === userId);
      for (const row of userLinks) {
        await base44.asServiceRole.entities.OutlookMailboxLink.update(row.id, {
          pathfinder_email: newEmail,
          connected: row.id === link.id,
          disconnected_at: row.id === link.id ? null : new Date().toISOString(),
        });
      }

      const teamRows = await base44.asServiceRole.entities.MicrosoftTeamsIdentity.filter({ user_id: userId }, '-updated_at', 100).catch(() => []);
      for (let index = 0; index < (teamRows || []).length; index++) {
        const row = teamRows[index];
        await base44.asServiceRole.entities.MicrosoftTeamsIdentity.update(row.id, {
          pathfinder_email: newEmail,
          active: index === 0,
          updated_at: new Date().toISOString(),
        });
      }

      const oauthRows = await base44.asServiceRole.entities.MicrosoftOAuthCredential.filter({ user_id: userId }, '-updated_date', 100).catch(() => []);
      for (const row of oauthRows || []) {
        await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(row.id, { pathfinder_email: newEmail });
      }

      usersByEmail.delete(oldEmail);
      usersByEmail.set(newEmail, { ...user, email: newEmail });
      migrations.push({ user_id: userId, old_email: oldEmail, new_email: newEmail, updated_records: updatedRecords });
    }

    return Response.json({ success: true, migrations, skipped });
  } catch (error) {
    console.error('migrateMicrosoftLoginIdentities failed', error);
    return Response.json({ error: error?.message || 'Microsoft identity migration failed.' }, { status: 500 });
  }
});
