import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: any) => String(v || '').trim().toLowerCase();
const sameEmail = (row: any, field: string, email: string) => lower(row?.[field]) === email;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const email = lower(me.email);

    const safeList = async (entity: string, sort?: string, limit = 2000) => {
      try {
        return await (base44.asServiceRole.entities as any)[entity].list(sort, limit) || [];
      } catch (error) {
        console.warn(`getMyPerformanceData ${entity} unavailable`, error?.message || error);
        return [];
      }
    };

    const [timeEntriesAll, schedulesAll, bidsAll, completionsAll, assignmentsAll, notificationsAll, callOutsAll, scansAll, checkpointsAll, modulesAll, incidentsAll, commendationsAll, complaintsAll, feedbackAll, reviewsAll, dailyReportsAll, dispatchCallsAll, dutyRulesAll, locationsAll] = await Promise.all([
      safeList('TimeEntry', '-clock_in'),
      safeList('Schedule', '-shift_date'),
      safeList('ShiftBid', '-created_date'),
      safeList('TrainingCompletion', '-completion_date'),
      safeList('TrainingAssignment', '-assigned_date'),
      safeList('Notification', '-created_date'),
      safeList('CallOut', '-call_out_date'),
      safeList('QRScanEvent', '-scanned_at'),
      safeList('QRCheckpoint', 'property_site'),
      safeList('TrainingModule', '-created_date'),
      safeList('IncidentReport', '-incident_date'),
      safeList('Commendation', '-commendation_date'),
      safeList('Complaint', '-complaint_date'),
      safeList('ClientFeedback', '-feedback_date'),
      safeList('PerformanceReview', '-review_date'),
      safeList('DailyActivityReport', '-report_date'),
      safeList('DispatchCall', '-time_received'),
      safeList('JobDutyRule', 'property_site'),
      safeList('Location', 'site_name'),
    ]);

    const myTimeEntries = timeEntriesAll.filter((r:any) => sameEmail(r, 'officer_email', email) || String(r?.created_by_id || '') === String(me.id || ''));
    const mySchedules = schedulesAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myBids = bidsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myCompletions = completionsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myAssignments = assignmentsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myNotifications = notificationsAll.filter((r:any) => sameEmail(r, 'recipient_email', email));
    const myCallOuts = callOutsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myScans = scansAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myIncidents = incidentsAll.filter((r:any) => sameEmail(r, 'officer_email', email) || sameEmail(r, 'created_by', email) || String(r?.created_by_id || '') === String(me.id || ''));
    const myCommendations = commendationsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myComplaints = complaintsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myFeedback = feedbackAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myReviews = reviewsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myDailyReports = dailyReportsAll.filter((r:any) => sameEmail(r, 'officer_email', email) || String(r?.created_by_id || '') === String(me.id || '')); 

    return Response.json({
      success: true,
      timeEntries: myTimeEntries,
      schedules: mySchedules,
      bids: myBids,
      trainingCompletions: myCompletions,
      trainingAssignments: myAssignments,
      notifications: myNotifications,
      callOuts: myCallOuts,
      qrScanEvents: myScans,
      checkpoints: checkpointsAll.filter((r:any) => r.is_active !== false && r.is_required !== false),
      trainingModules: modulesAll.filter((r:any) => r.active !== false),
      incidents: myIncidents,
      commendations: myCommendations,
      complaints: myComplaints,
      clientFeedback: myFeedback,
      performanceReviews: myReviews,
      dailyActivityReports: myDailyReports,
      dispatchCalls: dispatchCallsAll,
      jobDutyRules: dutyRulesAll.filter((r:any) => r.active !== false),
      locations: locationsAll,
      meta: {
        timeEntries: myTimeEntries.length,
        schedules: mySchedules.length,
        bids: myBids.length,
        trainingCompletions: myCompletions.length,
        trainingAssignments: myAssignments.length,
        qrScans: myScans.length,
        incidents: myIncidents.length,
        commendations: myCommendations.length,
        clientFeedback: myFeedback.length,
        performanceReviews: myReviews.length,
        dailyActivityReports: myDailyReports.length,
        jobDutyRules: dutyRulesAll.length,
      },
    });
  } catch (error) {
    console.error('getMyPerformanceData failed', error);
    return Response.json({ error: error?.message || 'Unable to load performance data' }, { status: 500 });
  }
});
