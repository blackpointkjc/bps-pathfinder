const __portalAppIdentity=(user:any)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}

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
    } catch (error: any) {
      console.warn(`Microsoft identity migration skipped ${entityName}:`, error?.message || error);
    }
  }
  return updatesByEntity;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const caller = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') {
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

    // Base44 provider identities cannot be safely merged by rewriting User.email.
    // OutlookMailboxLink remains the communication alias while the Pathfinder
    // user ID and primary email remain authoritative for all app records.
    return Response.json({
      success: true,
      migrations: [],
      skipped: [],
      disabled: true,
      message: 'Email-reference migration is disabled. Microsoft remains a linked communication identity.',
    });
  } catch (error: any) {
    console.error('migrateMicrosoftLoginIdentities failed', error);
    return Response.json({ error: error?.message || 'Microsoft identity migration failed.' }, { status: 500 });
  }
});
