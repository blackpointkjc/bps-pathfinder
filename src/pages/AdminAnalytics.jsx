import { calculateCompanyHours } from '@/lib/companyHours';
import { comparePersonnel } from '@/utils/rankPolicy';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useEffect, useState, useMemo } from "react";
import { base44, clearBase44ReadCacheMatching } from "@/api/base44Client";
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  BarChart3, Users, Clock, AlertTriangle, 
  CheckCircle2, Award, Shield, Send, Loader2, MailCheck, X, RefreshCw
} from "lucide-react";
import { format as dateFnsFormat, parseISO as dateFnsParseISO, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import MissingReportsCheck from "../components/MissingReportsCheck";
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { calculatePunctuality, calculateBidStanding, calculateTrainingScore, calculateCallOutAttendance, calculateClientFeedback, calculateSupervisorRating, calculateRecognition, calculateJobDutyCompliance, buildOverallPerformance } from '@/lib/performanceScoring';
import { toast } from 'sonner';

const parseISO = value => typeof value === 'string' ? dateFnsParseISO(value) : new Date(NaN);
const format = (value, pattern) => value instanceof Date && Number.isFinite(value.getTime()) ? dateFnsFormat(value, pattern) : 'Unknown date';
import IncidentPerformanceDetails from '@/components/admin/IncidentPerformanceDetails';
import { readCompanyAnalyticsSnapshot, saveCompanyAnalyticsSnapshot } from '@/lib/analyticsSnapshot';

const ANALYTICS_SEGMENTS = {
  core: {
    fields: { users: 'User', divisions: 'Division', timeEntries: ['User','TimeEntry'], schedules: ['User','Schedule'], incidentReports: ['User','IncidentReport'] },
    interval: 2 * 60 * 1000,
  },
  training: {
    fields: { bids: ['User','ShiftBid'], trainingCompletions: ['User','TrainingCompletion'], trainingAssignments: ['User','TrainingAssignment'], trainingModules: ['User','TrainingModule'] },
    interval: 5 * 60 * 1000,
  },
  duty: {
    fields: { qrScans: ['User','QRScanEvent'], qrCheckpoints: 'QRCheckpoint', dailyActivityReports: ['User','DailyActivityReport','ShiftReport'], callOuts: ['User','CallOut'], dutyRules: 'JobDutyRule', locations: 'Location' },
    interval: 3 * 60 * 1000,
  },
  calls: {
    fields: { dispatchCalls: ['DispatchCall','CallHistory','PropertyAlert','CallPerformanceDecision'], callAssignments: 'CallAssignment' },
    interval: 30 * 1000,
  },
  quality: {
    fields: { commendations: ['User','Commendation'], complaints: ['User','Complaint'], clientFeedback: ['User','ClientFeedback'], performanceReviews: ['User','PerformanceReview'] },
    interval: 5 * 60 * 1000,
  },
};

function mergeAnalyticsSegments(previous = {}, payloads = {}) {
  const merged = { ...previous };
  const serviceErrors = {};
  let latestGeneratedAt = previous?.generated_at || '';
  let loaded = 0;

  Object.entries(ANALYTICS_SEGMENTS).forEach(([segmentName, config]) => {
    const payload = payloads[segmentName];
    if (!payload) return;
    loaded += 1;
    const segmentErrors = payload.service_errors || {};
    Object.entries(config.fields).forEach(([field, sources]) => {
      const dependencies = Array.isArray(sources) ? sources : [sources];
      if (!dependencies.some(source => segmentErrors[source]) && Object.prototype.hasOwnProperty.call(payload, field)) {
        merged[field] = payload[field];
      }
    });
    Object.assign(serviceErrors, segmentErrors);
    if (payload.generated_at && (!latestGeneratedAt || payload.generated_at > latestGeneratedAt)) latestGeneratedAt = payload.generated_at;
  });

  merged.generated_at = latestGeneratedAt || new Date().toISOString();
  merged.service_errors = serviceErrors;
  merged.analytics_segments_loaded = loaded;
  return merged;
}

function useAnalyticsSegment(name, enabled, startDate, endDate) {
  const config = ANALYTICS_SEGMENTS[name];
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['companyAnalyticsSegment', name, startDate, endDate],
    queryFn: async () => {
      const result = await base44.functions.invoke('getCompanyAnalyticsSegment', { segment: name, start_date: startDate, end_date: endDate });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      if (Object.keys(payload.service_errors||{}).length) { clearBase44ReadCacheMatching('function:getCompanyAnalyticsSegment:'); }
      const previous = queryClient.getQueryData(['companyAnalyticsSegment', name, startDate, endDate]);
      const retained = { ...payload };
      for (const [field, sources] of Object.entries(config.fields)) {
        if ([sources].flat().some(source => payload.service_errors?.[source]) && previous?.[field] !== undefined) retained[field] = previous[field];
      }
      return retained;
    },
    enabled,
    staleTime: config?.interval || 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: query => query.state.error || Object.keys(query.state.data?.service_errors||{}).length ? 60000 : Math.max(config?.interval || 5 * 60 * 1000, 5 * 60 * 1000),
    refetchIntervalInBackground: false,
    retry: false,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey?.[2] === startDate && previousQuery?.queryKey?.[3] === endDate ? previousData : undefined,
  });
}

const emailKey = (value) => String(value || '').trim().toLowerCase();
const officerIdentitySet = officer => new Set([
  officer?.email,
  officer?.work_email,
  officer?.pathfinder_email,
  officer?.microsoft_email,
  officer?.outlook_email,
  ...(Array.isArray(officer?.email_aliases) ? officer.email_aliases : []),
].map(emailKey).filter(Boolean));
const recordMatchesOfficer = (record, officer, emailFields = ['officer_email'], idFields = ['officer_id','user_id']) => {
  const identities = officerIdentitySet(officer);
  if (emailFields.some(field => identities.has(emailKey(record?.[field])))) return true;
  // Ownership is the officer named on the record. created_by_id is only the
  // account that keyed the row in, so an administrator who builds the schedule
  // or punches entries must never inherit those shifts as their own; fall back
  // to a user id only when the record carries no officer email at all.
  const hasOwnerEmail = emailFields.some(field => emailKey(record?.[field]));
  if (hasOwnerEmail) return false;
  return idFields.some(field => officer?.id && String(record?.[field] || '') === String(officer.id));
};
const isPunctualityLeaderboardOfficer = (officer) => {
  const roles = new Set((officer?.additional_roles || []).map(role => String(role).trim().toLowerCase()));
  if (hasSupervisorAccess(officer)) return false;
  return roles.has('officer') || String(officer?.role || '').trim().toLowerCase() === 'officer';
};


function buildOfficerPerformanceFromSnapshot(snapshot, monthStart, monthEnd, exemptionsByEmail = {}) {
  const officer = snapshot?.officer;
  if (!officer?.id && !officer?.email) return null;
  // Exemptions granted in the Duty & Attendance Review remove those obligations
  // from the officer's scored performance here as well.
  const exemptions = exemptionsByEmail[emailKey(officer?.email)] || [];
  const timeEntries = snapshot.timeEntries || [];
  const schedules = snapshot.schedules || [];
  const bids = snapshot.bids || [];
  const completions = snapshot.trainingCompletions || [];
  const assignments = snapshot.trainingAssignments || [];
  const modules = (snapshot.trainingModules || []).filter(module => module.active !== false);
  const callOuts = snapshot.callOuts || [];
  const feedback = snapshot.clientFeedback || [];
  const reviews = snapshot.performanceReviews || [];
  const commendations = snapshot.commendations || [];

  const punctuality = calculatePunctuality(timeEntries, schedules, monthStart, monthEnd, snapshot.incidents || [], officer);
  const training = calculateTrainingScore(officer, modules, completions, assignments);
  const bidStanding = calculateBidStanding(bids, monthStart, monthEnd);
  const clientFeedback = calculateClientFeedback(feedback, monthStart, monthEnd);
  const supervisorRating = calculateSupervisorRating(reviews, monthStart, monthEnd);
  const recognition = calculateRecognition(commendations, feedback, monthStart, monthEnd);
  const callOutAttendance = calculateCallOutAttendance(callOuts, schedules, monthStart, monthEnd, officer, exemptions);
  const jobDuty = calculateJobDutyCompliance({
    officer,
    timeEntries,
    schedules,
    dailyReports: snapshot.dailyActivityReports || [],
    incidentReports: snapshot.incidents || [],
    dispatchCalls: snapshot.dispatchCalls || [],
    callAssignments: snapshot.callAssignments || [],
    callOuts,
    qrScans: snapshot.sharedQrScanEvents || snapshot.qrScanEvents || [],
    allTimeEntries: snapshot.partnerTimeEntries || timeEntries,
    qrCheckpoints: snapshot.checkpoints || [],
    dutyRules: snapshot.jobDutyRules || [],
    locations: snapshot.locations || [],
    exemptions,
    monthStart,
    monthEnd,
  });
  const calculatedOverall = buildOverallPerformance({
    punctuality,
    trainingScore: training.total > 0 ? training.percentage : null,
    jobDuty,
    callOutAttendance,
    bidStanding,
    clientFeedback,
    supervisorRating,
    recognition,
  });
  const incomplete=Boolean(snapshot.is_partial||snapshot.data_health==='partial'||Object.keys(snapshot.service_errors||{}).length);
  // Missing source rows cannot be interpreted as failures. Keep the detailed
  // obligations for review but never publish an unverified numeric grade.
  const overall=incomplete?{...calculatedOverall,score:null,unverified:true}:calculatedOverall;
  const categoryRatings = [
    { label: 'Attendance', score: punctuality.total > 0 ? punctuality.rate : null, detail: (punctuality.total > 0 ? `${punctuality.attended ?? (punctuality.onTime + punctuality.late + punctuality.overrun)} of ${punctuality.total} elapsed shifts worked · ${punctuality.missed || 0} missed${punctuality.exempt ? ` · ${punctuality.exempt} exempt` : ''}` : (punctuality.exempt ? `${punctuality.exempt} elapsed shift${punctuality.exempt === 1 ? '' : 's'} exempt` : 'No elapsed scheduled shifts')) + ' · Clock-in timing excluded' },
    { label: 'Job Duty / Performance', score: jobDuty.score, detail: `DAR ${jobDuty.dailyActivity.completed}/${jobDuty.dailyActivity.required} · Incident ${jobDuty.incidentReports.completed}/${jobDuty.incidentReports.required} · QR ${jobDuty.qrCompliance.completed}/${jobDuty.qrCompliance.required}` },
    { label: 'Call-Out Attendance', score: callOutAttendance.score, detail: callOutAttendance.score != null ? `${callOutAttendance.count} call-out${callOutAttendance.count === 1 ? '' : 's'} across ${callOutAttendance.scheduled} elapsed scheduled shifts` : 'No elapsed scheduled shifts' },
    { label: 'Training Completion', score: training.total > 0 ? training.percentage : null, detail: training.total > 0 ? `${training.completed} complete · ${training.pending} pending · ${training.total} assigned` : 'No assigned training/compliance records' },
    { label: 'Bid Standing', score: bidStanding.score, detail: bidStanding.score != null ? `${bidStanding.accepted} assigned bid${bidStanding.accepted === 1 ? '' : 's'}` : 'No assigned bid outcome to score' },
    { label: 'Client Feedback', score: clientFeedback.score, detail: clientFeedback.score != null ? `${clientFeedback.avgRating.toFixed(1)}/5 average · ${clientFeedback.count} rating${clientFeedback.count === 1 ? '' : 's'}` : 'No client ratings this month' },
    { label: 'Supervisor Rating', score: supervisorRating.score, detail: supervisorRating.score != null ? `${supervisorRating.avgRating.toFixed(1)}/5 average · ${supervisorRating.count} review${supervisorRating.count === 1 ? '' : 's'}` : 'No supervisor rating this month' },
    { label: 'Recognition', score: recognition.score, detail: recognition.score != null ? `${recognition.commendations.length} commendation${recognition.commendations.length === 1 ? '' : 's'} · ${recognition.positiveFeedback.length} positive client recognition` : 'No recognition record this month' },
  ];

  return {
    email: officer.email,
    user_id: officer.id,
    name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
    overall,
    punctuality,
    training,
    bidStanding,
    clientFeedback,
    supervisorRating,
    recognition,
    callOutAttendance,
    jobDuty,
    categoryRatings:incomplete?categoryRatings.map(item=>({...item,score:null,detail:item.detail+' · Source incomplete; not scored'})):categoryRatings,
    dataHealth: incomplete?'partial':'verified',
    serviceErrors: snapshot.service_errors || {},
    generatedAt: snapshot.generated_at || null,
    certificationFile: {dcjs_expiration: officer.dcjs_expiration||'',firearm_expiration: officer.firearm_expiration||'',
      records: officer.officer_certifications||[]},
  };
}

export default function AdminAnalytics() {
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedSubdivision, setSelectedSubdivision] = useState('all');
  const [analyticsStartDate, setAnalyticsStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [analyticsEndDate, setAnalyticsEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summarySending, setSummarySending] = useState(false);
  const [summaryResult, setSummaryResult] = useState(null);
  const [summaryPreview,setSummaryPreview]=useState(null);
  const [summaryPreviewBusy,setSummaryPreviewBusy]=useState(false);
  const [summaryPreviewError,setSummaryPreviewError]=useState('');
  const [summaryPreviewSearch,setSummaryPreviewSearch]=useState('');
  const queryClient = useQueryClient();

  const { user, isLoadingAuth } = useAuth();

  const previewCompanySummary=async()=>{
    if(summaryPreviewBusy||summarySending)return;
    setSummaryPreviewBusy(true);setSummaryPreviewError('');setSummaryPreview(null);
    try{
      const response=await base44.functions.invoke('sendDailyCompanySummary',{action:'preview'});
      const payload=response?.data||response||{};
      if(payload.error)throw Object.assign(new Error(payload.error),{detail:payload});
      setSummaryPreview(payload);
    }catch(error){
      const details=error?.response?.data||error?.data||error?.detail||{};
      setSummaryPreviewError((details.error||error.message||'Summary verification unavailable')+
        (Array.isArray(details.source_issues)?' · Missing: '+details.source_issues.slice(0,6).join(', '):''));
    }finally{setSummaryPreviewBusy(false)}
  };
  const sendCompanySummaryNow = async () => {
    setSummarySending(true);
    setSummaryResult(null);
    try {
      const result = await base44.functions.invoke('sendDailyCompanySummary', { action: 'send_now' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      setSummaryResult(payload);
      if (payload.email_sent) {
        toast.success(`Company summary sent from management@blackpointkjc.com to ${payload.recipient_count || 0} active company member${payload.recipient_count === 1 ? '' : 's'}.`);
      } else {
        toast.warning('In-app summaries were created, but the management@blackpointkjc.com Outlook delivery needs attention.');
      }
    } catch (error) {
      const details=error?.response?.data||error?.data||{};
      const explain=String(details.error||error?.message||'Delivery failed.');
      const missing=Array.isArray(details.source_issues)&&details.source_issues.length?` Missing sources: ${details.source_issues.slice(0,8).join(', ')}`:'';
      toast.error(explain);
      setSummaryResult({ success: false, email_sent: false, error: explain+missing });
    } finally {
      setSummarySending(false);
    }
  };

  const refreshCompanyAnalytics = async () => {
    clearBase44ReadCacheMatching('function:getCompanyAnalyticsSegment:');
    clearBase44ReadCacheMatching('function:getMyPerformanceData:');
    clearBase44ReadCacheMatching('function:getCompanyPerformanceData:');
    await queryClient.invalidateQueries({ queryKey: ['companyOfficerPerformanceSnapshots'], refetchType: 'none' });
    const segments = ['core', 'training', 'duty', 'calls', 'quality'];
    await Promise.all(segments.map(segment => queryClient.invalidateQueries({ queryKey: ['companyAnalyticsSegment', segment], refetchType: 'none' })));
    await queryClient.refetchQueries({ queryKey: ['companyAnalyticsSegment', 'core'], type: 'active' });
    for (const segment of ['duty','calls','training','quality']) {
      await queryClient.refetchQueries({ queryKey: ['companyAnalyticsSegment', segment], type: 'active' });
    }
    await queryClient.refetchQueries({ queryKey: ['companyOfficerPerformanceSnapshots'], type: 'active' });
  };

  const companySnapshotRequest = { start_date: analyticsStartDate, end_date: analyticsEndDate };
  const companySnapshot = readCompanyAnalyticsSnapshot(companySnapshotRequest);
  const hasVerifiedCore = Boolean(companySnapshot?.data?.users?.length);
  const coreAnalytics = useAnalyticsSegment('core', !!user, analyticsStartDate, analyticsEndDate);
  // Once core is available, enqueue the four independent segments together. The
  // shared Base44 client limits reads to two at a time, so this remains a controlled
  // two-wave load without the extra React render/dependency delay between waves.
  const secondarySegmentsEnabled = Boolean(user && (coreAnalytics.data || coreAnalytics.isError));
  const dutyAnalytics = useAnalyticsSegment('duty', secondarySegmentsEnabled, analyticsStartDate, analyticsEndDate);
  const callsAnalytics = useAnalyticsSegment('calls', secondarySegmentsEnabled && Boolean(dutyAnalytics.data || dutyAnalytics.isError), analyticsStartDate, analyticsEndDate);
  // Keep analytics segments in two controlled waves so the backend does not
  // start four large multi-entity scans at once during a rate-limited session.
  const laterSegmentsEnabled = secondarySegmentsEnabled && Boolean(dutyAnalytics.data || dutyAnalytics.isError) && Boolean(callsAnalytics.data || callsAnalytics.isError);
  const trainingAnalytics = useAnalyticsSegment('training', laterSegmentsEnabled, analyticsStartDate, analyticsEndDate);
  const qualityAnalytics = useAnalyticsSegment('quality', laterSegmentsEnabled && Boolean(trainingAnalytics.data || trainingAnalytics.isError), analyticsStartDate, analyticsEndDate);

  const currentSegmentPayloads = useMemo(() => ({
    core: coreAnalytics.data,
    training: trainingAnalytics.data,
    duty: dutyAnalytics.data,
    calls: callsAnalytics.data,
    quality: qualityAnalytics.data,
  }), [coreAnalytics.data, trainingAnalytics.data, dutyAnalytics.data, callsAnalytics.data, qualityAnalytics.data]);

  const currentSegmentsReady = Object.values(currentSegmentPayloads).every(Boolean);
  const liveAnalyticsData = useMemo(
    () => mergeAnalyticsSegments({}, currentSegmentPayloads),
    [currentSegmentPayloads]
  );
  // Officer performance must NEVER be calculated from the persisted company
  // snapshot. It is a current-month compliance view, so wait for all five current
  // segments before calculating a percentage. This keeps Company Analytics on the
  // same complete monthly generation used by Officer My Performance.
  const performanceCriticalErrors = useMemo(() => ({
    ...(coreAnalytics.data?.service_errors || {}),
    ...(trainingAnalytics.data?.service_errors || {}),
    ...(dutyAnalytics.data?.service_errors || {}),
    ...(callsAnalytics.data?.service_errors || {}),
    ...(qualityAnalytics.data?.service_errors || {}),
  }), [coreAnalytics.data, trainingAnalytics.data, dutyAnalytics.data, callsAnalytics.data, qualityAnalytics.data]);
  const performanceAnalyticsData = useMemo(() => mergeAnalyticsSegments({}, {
    core: coreAnalytics.data,
    duty: dutyAnalytics.data,
    calls: callsAnalytics.data,
    training: trainingAnalytics.data,
    quality: qualityAnalytics.data,
  }), [coreAnalytics.data, dutyAnalytics.data, callsAnalytics.data, trainingAnalytics.data, qualityAnalytics.data]);

  const analyticsData = useMemo(() => {
    // Never calculate officer scores from a mixture of an old persisted snapshot
    // and newly arrived segments. Until all five current segments are present,
    // show the last coherent verified snapshot as a whole. Once ready, switch the
    // entire dashboard to one current data generation.
    const base = currentSegmentsReady
      ? liveAnalyticsData
      : (companySnapshot?.data || liveAnalyticsData || {});
    const merged = { ...base, service_errors: { ...(base.service_errors || {}) } };
    const queryErrors = {
      core: coreAnalytics.error,
      training: trainingAnalytics.error,
      duty: dutyAnalytics.error,
      calls: callsAnalytics.error,
      quality: qualityAnalytics.error,
    };
    Object.entries(queryErrors).forEach(([segment, error]) => {
      if (error) merged.service_errors[`segment:${segment}`] = error.message || 'Segment could not be loaded';
    });
    merged.is_updating = !currentSegmentsReady;
    return merged;
  }, [
    companySnapshot?.data,
    currentSegmentsReady,
    liveAnalyticsData,
    coreAnalytics.error,
    trainingAnalytics.error,
    dutyAnalytics.error,
    callsAnalytics.error,
    qualityAnalytics.error,
  ]);

  const analyticsLoading = isLoadingAuth || (!hasVerifiedCore && coreAnalytics.isLoading);
  const analyticsRefreshing = [coreAnalytics, trainingAnalytics, dutyAnalytics, callsAnalytics, qualityAnalytics].some(query => query.isFetching);
  const analyticsError = !hasVerifiedCore ? coreAnalytics.error : null;

  useEffect(() => {
    if (analyticsData.analytics_segments_loaded === 5 && Object.keys(analyticsData.service_errors || {}).length === 0) {
      saveCompanyAnalyticsSnapshot(companySnapshotRequest, analyticsData);
    }
  }, [analyticsData]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const timers = new Map();
    const entitySegments = {
      TimeEntry: ['core'],
      Schedule: ['core'],
      IncidentReport: ['core'],
      DailyActivityReport: ['duty'],
      ShiftReport: ['duty'],
      CallOut: ['duty'],
      QRScanEvent: ['duty'],
      JobDutyRule: ['duty'],
      QRCheckpoint: ['duty'],
      Location: ['duty'],
      TrainingCompletion: ['training'],
      TrainingAssignment: ['training'],
      TrainingModule: ['training'],
      ShiftBid: ['training'],
      ClientFeedback: ['quality'],
      PerformanceReview: ['quality'],
      Commendation: ['quality'],
      Complaint: ['quality'],
      DispatchCall: ['calls'],
      CallHistory: ['calls'],
      PropertyAlert: ['calls'],
      CallPerformanceDecision: ['calls'],
      CallAssignment: ['calls'],
    };

    const scheduleSegmentRefresh = segment => {
      const prior = timers.get(segment);
      if (prior) window.clearTimeout(prior);
      timers.set(segment, window.setTimeout(() => {
        // A realtime change must bypass the shared function read cache or the
        // query invalidation can immediately receive the same stale segment.
        clearBase44ReadCacheMatching('function:getCompanyAnalyticsSegment:');
        queryClient.invalidateQueries({ queryKey: ['companyAnalyticsSegment', segment] });
        clearBase44ReadCacheMatching('function:getMyPerformanceData:');
    clearBase44ReadCacheMatching('function:getCompanyPerformanceData:');
        queryClient.invalidateQueries({ queryKey: ['companyOfficerPerformanceSnapshots'] });
        timers.delete(segment);
      }, 60000));
    };

    const unsubscribers = [];
    Object.entries(entitySegments).forEach(([entity, segments]) => {
      try {
        const stop = base44.entities[entity].subscribe(() => segments.forEach(scheduleSegmentRefresh));
        if (typeof stop === 'function') unsubscribers.push(stop);
      } catch { /* Segment polling remains available. */ }
    });

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      unsubscribers.forEach(stop => stop());
    };
  }, [queryClient, user?.id]);

  const allUsers = analyticsData.users || [];
  const divisions = analyticsData.divisions || [];
  const timeEntries = analyticsData.timeEntries || [];
  const schedules = analyticsData.schedules || [];

  const performanceUsers = performanceAnalyticsData.users || [];
  const performanceOfficerUsers = useMemo(() => {
    const officers = performanceUsers.filter(isOperationalOfficer);
    return (selectedDivision === 'all' ? officers : officers.filter(u => String(u.division || '') === String(selectedDivision)))
      .filter(officer => officer?.id && (selectedSubdivision === 'all' || String(officer.subdivision || officer.substation || '') === selectedSubdivision))
      .sort(comparePersonnel);
  }, [performanceUsers, selectedDivision, selectedSubdivision]);
  const performanceOfficerKey = performanceOfficerUsers.map(officer => officer.id).join(',');
  // Officer scoring reads its own authoritative snapshot per officer. It only
  // depends on the core segment (the user directory), so it no longer waits on
  // the training/quality segment chain before it can render.
  const performanceRequestEnabled = Boolean(user && (coreAnalytics.data || coreAnalytics.isError) && performanceOfficerUsers.length > 0);
  const officerPerformanceSnapshots = useQuery({
    queryKey: ['companyOfficerPerformanceSnapshots', performanceOfficerKey, analyticsStartDate, analyticsEndDate],
    queryFn: async () => {
      const previous = queryClient.getQueryData(['companyOfficerPerformanceSnapshots', performanceOfficerKey, analyticsStartDate, analyticsEndDate]);
      const snapshots = { ...(previous?.snapshots || {}) };
      const errors = {};
      // Publish completed officer batches as they arrive. A slow officer/source
      // cannot discard every other officer's successfully loaded snapshot.
      for (let offset = 0; offset < performanceOfficerUsers.length; offset += 5) {
        const batch = performanceOfficerUsers.slice(offset, offset + 5);
        try {
          const result = await base44.functions.invoke('getCompanyPerformanceData', {
            officer_ids: batch.map(officer => officer.id),
            start_date: analyticsStartDate, end_date: analyticsEndDate,
          });
          const payload = result?.data || result || {};
          if (payload.error) throw new Error(payload.error);
          Object.assign(snapshots, payload.snapshots || {});
          Object.assign(errors, payload.errors || {});
          for (const officer of batch) {
            if (!payload.snapshots?.[officer.id] && !errors[officer.id]) errors[officer.id] = 'No complete snapshot returned. Retry refresh.';
          }
        } catch (error) {
          for (const officer of batch) errors[officer.id] = error?.message || 'Unable to load officer data';
        }
        queryClient.setQueryData(['companyOfficerPerformanceSnapshots', performanceOfficerKey, analyticsStartDate, analyticsEndDate], {
          snapshots: { ...snapshots }, errors: { ...errors }, generated_at: new Date().toISOString(),
        });
      }
      if (Object.keys(errors).length) clearBase44ReadCacheMatching('function:getCompanyPerformanceData:');
      return { snapshots, errors, generated_at: new Date().toISOString() };
    },
    enabled: performanceRequestEnabled,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: query => query.state.error || Object.keys(query.state.data?.errors || {}).length ? 60_000 : 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    retry: false,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey?.[2] === analyticsStartDate && previousQuery?.queryKey?.[3] === analyticsEndDate ? previousData : undefined,
  });
  const trainingCompletions = analyticsData.trainingCompletions || [];
  const allTraining = (analyticsData.trainingModules || []).filter(module => module.active !== false);
  const dispatchCalls = analyticsData.dispatchCalls || [];
  const callAssignments = analyticsData.callAssignments || [];
  const allCommendations = analyticsData.commendations || [];
  const allComplaints = analyticsData.complaints || [];
  const analyticsServiceErrors = analyticsData.service_errors || {};
  const analyticsServiceErrorNames = Object.keys(analyticsServiceErrors);

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    // Company officer rankings must contain actual operational officers only.
    // A dispatch/HR/accounting/support account is not promoted into the officer
    // leaderboard merely because an old time, schedule, or training row exists.
    const active = allUsers.filter(isOperationalOfficer).filter(u => selectedSubdivision === 'all' || String(u.subdivision || u.substation || '') === selectedSubdivision);
    if (selectedDivision === 'all') return active;
    return active.filter(u => String(u.division || '') === String(selectedDivision));
  }, [allUsers, selectedDivision, selectedSubdivision]);

  const currentMonthStart = analyticsStartDate;
  const currentMonthEnd = analyticsEndDate;

  const companyOnTimeStats = useMemo(() => {
    const coreErrors = coreAnalytics.data?.service_errors || {};
    if (!coreAnalytics.data || ['User','TimeEntry','Schedule','IncidentReport'].some(name => coreErrors[name])) return { rate: null, byOfficer: [], leaderboard: [] };
    const coreUsers = (coreAnalytics.data.users || []).filter(isOperationalOfficer).filter(u => selectedSubdivision === 'all' || String(u.subdivision || u.substation || '') === selectedSubdivision);
    const selectedCoreUsers = selectedDivision === 'all'
      ? coreUsers
      : coreUsers.filter(u => String(u.division || '') === String(selectedDivision));
    const coreEntries = coreAnalytics.data.timeEntries || [];
    const coreSchedules = coreAnalytics.data.schedules || [];
    const coreIncidents = coreAnalytics.data.incidentReports || [];
    const byOfficer = selectedCoreUsers.map(officer => {
      const stats = calculatePunctuality(
        coreEntries.filter(entry => recordMatchesOfficer(entry, officer)),
        coreSchedules.filter(schedule => recordMatchesOfficer(schedule, officer)),
        currentMonthStart,
        currentMonthEnd,
        coreIncidents,
        officer
      );
      return { name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email, email: officer.email, ...stats };
    }).filter(item => item.total > 0).sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const totalOnTime = byOfficer.reduce((sum, item) => sum + (item.attended ?? (item.onTime + item.late + item.overrun)), 0);
    const totalEntries = byOfficer.reduce((sum, item) => sum + item.total, 0);
    const leaderboard = byOfficer.filter(item => {
      const officer = selectedCoreUsers.find(user => emailKey(user.email) === emailKey(item.email));
      return officer && isPunctualityLeaderboardOfficer(officer);
    }).slice(0, 3);
    return { rate: totalEntries ? Math.round((totalOnTime / totalEntries) * 100) : null, onTimeCount: totalOnTime, scoredCount: totalEntries, byOfficer, leaderboard };
  }, [coreAnalytics.data, selectedDivision, selectedSubdivision, currentMonthStart, currentMonthEnd]);

  const hoursBreakdown = useMemo(() => calculateCompanyHours(
    timeEntries, filteredUsers, currentMonthStart, currentMonthEnd
  ), [timeEntries, filteredUsers, currentMonthStart, currentMonthEnd]);

  const { data: dutyAdjustmentRecords } = useQuery({
    queryKey: ['companyDutyExemptions', analyticsStartDate, analyticsEndDate],
    queryFn: () => base44.entities.DutyAttendanceAdjustment.filter({ item_date: { $gte: analyticsStartDate, $lte: analyticsEndDate } }, '-created_date', 500),
    enabled: Boolean(user),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const exemptionsByOfficerEmail = useMemo(() => (dutyAdjustmentRecords || []).reduce((map, row) => {
    const key = emailKey(row.officer_email);
    if (!key || !row.item_key) return map;
    map[key] = [...(map[key] || []), String(row.item_key)];
    return map;
  }, {}), [dutyAdjustmentRecords]);

  const overallByOfficer = useMemo(() => {
    const snapshots = officerPerformanceSnapshots.data?.snapshots || {};
    return performanceOfficerUsers
      .map(officer => buildOfficerPerformanceFromSnapshot(snapshots[officer.id], currentMonthStart, currentMonthEnd, exemptionsByOfficerEmail))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.user_id).localeCompare(String(b.user_id)));
  }, [officerPerformanceSnapshots.data, performanceOfficerUsers, currentMonthStart, currentMonthEnd, exemptionsByOfficerEmail]);

  // Training alerts use the very same verified, officer-specific snapshot
  // and scoring engine as the performance cards. A missing backend response
  // never produces a fictitious unfinished-training notification.
  const trainingByOfficer=useMemo(()=>overallByOfficer.filter(row=>row.dataHealth==='verified'&&row.training.total>0&&row.training.percentage<100)
    .map(row=>({name:row.name,email:row.email,completed:row.training.completed,total:row.training.total,
      percentage:row.training.percentage,pending:row.training.pendingNames||[]})).sort((a,b)=>a.percentage-b.percentage),[overallByOfficer]);

  // Keep the officer windows mounted during background refreshes. The previous
  // isFetching check removed the entire section every refresh cycle, which made
  // the page flash and jump. Existing snapshots stay visible and only the
  // numbers update in place when the new generation lands.
  // A section with nothing to request must report that state, not sit on a
  // permanent "loading" message (for example a division filter with no officers).
  const performanceCardsReady = Boolean(officerPerformanceSnapshots.data) || !performanceRequestEnabled;

  const companyOverallScore = useMemo(() => {
    const scored = overallByOfficer.filter(item => item.overall.score != null);
    return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.overall.score, 0) / scored.length) : null;
  }, [overallByOfficer]);

  const responseTimeStats = useMemo(() => {
    // Response time begins the moment Black Point dispatches a unit. Do not wait
    // for the assignment to be cleared: as soon as an officer marks (or is auto-
    // marked) On Scene, Company Analytics should include that response.
    const earliestAssignmentAt = new Map();
    callAssignments
      .filter(assignment => assignment.assigned_at)
      .forEach(assignment => {
        const key = String(assignment.call_id || '');
        if (!key) return;
        const at = new Date(assignment.assigned_at).getTime();
        if (!Number.isFinite(at)) return;
        const prior = earliestAssignmentAt.get(key);
        if (!Number.isFinite(prior) || at < prior) earliestAssignmentAt.set(key, at);
      });

    const responseTimes = dispatchCalls
      .map(call => {
        if (!call?.time_on_scene) return null;
        const ids = [call.id, call.original_call_id, call.call_id].filter(Boolean).map(String);
        const assignmentTimes = ids.map(id => earliestAssignmentAt.get(id)).filter(Number.isFinite);
        const callDispatchAt = new Date(call.time_dispatched || 0).getTime();
        const anchors = [...assignmentTimes, ...(Number.isFinite(callDispatchAt) && callDispatchAt > 0 ? [callDispatchAt] : [])];
        if (!anchors.length) return null;
        const dispatchedAt = Math.min(...anchors);
        const sceneAt = parseISO(call.time_on_scene).getTime();
        const minutes = (sceneAt - dispatchedAt) / 60000;
        return Number.isFinite(minutes) && minutes >= 0 && minutes <= 240 ? minutes : null;
      })
      .filter(minutes => minutes != null);

    const avg = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, minutes) => sum + minutes, 0) / responseTimes.length)
      : null;

    return { avg, total: responseTimes.length };
  }, [dispatchCalls, callAssignments]);

  const commendationStats = useMemo(() => {
    if (!allCommendations || !filteredUsers) return { byOfficer: [], total: 0 };

    const monthStart = currentMonthStart;
    const monthEnd = currentMonthEnd;

    const officerCommendations = {};

    filteredUsers.forEach(officer => {
      officerCommendations[emailKey(officer.email)] = {
        name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
        count: 0,
        points: 0
      };
    });

    allCommendations.forEach(comm => {
      const key = emailKey(comm.officer_email);
      if (!officerCommendations[key]) return;
      const commDate = format(parseISO(comm.commendation_date), 'yyyy-MM-dd');
      if (commDate >= monthStart && commDate <= monthEnd) {
        officerCommendations[key].count++;
        officerCommendations[key].points += comm.points_awarded || 1;
      }
    });

    const byOfficer = Object.entries(officerCommendations)
      .filter(([_, stats]) => stats.count > 0)
      .map(([email, stats]) => ({ email, ...stats }))
      .sort((a, b) => b.points - a.points);

    return { byOfficer, total: byOfficer.reduce((sum, o) => sum + o.count, 0) };
  }, [allCommendations, filteredUsers, currentMonthStart, currentMonthEnd]);

  const complaintStats = useMemo(() => {
    if (!allComplaints || !filteredUsers) return { byOfficer: [], total: 0, pending: 0 };

    const monthStart = currentMonthStart;
    const monthEnd = currentMonthEnd;

    const officerComplaints = {};

    filteredUsers.forEach(officer => {
      officerComplaints[emailKey(officer.email)] = {
        name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
        count: 0,
        sustained: 0
      };
    });

    let pending = 0;

    allComplaints.forEach(comp => {
      const key = emailKey(comp.officer_email);
      if (!officerComplaints[key]) return;
      const compDate = format(parseISO(comp.complaint_date), 'yyyy-MM-dd');
      if (compDate >= monthStart && compDate <= monthEnd) {
        officerComplaints[key].count++;
        if (comp.investigation_status === 'sustained') {
          officerComplaints[key].sustained++;
        }
        if (comp.investigation_status === 'pending' || comp.investigation_status === 'under_investigation') {
          pending++;
        }
      }
    });

    const byOfficer = Object.entries(officerComplaints)
      .filter(([_, stats]) => stats.count > 0)
      .map(([email, stats]) => ({ email, ...stats }))
      .sort((a, b) => b.count - a.count);

    return { byOfficer, total: byOfficer.reduce((sum, o) => sum + o.count, 0), pending };
  }, [allComplaints, filteredUsers, currentMonthStart, currentMonthEnd]);

  if (isLoadingAuth || (analyticsLoading && !coreAnalytics.data && !companySnapshot?.data)) {
    return <div className="min-h-screen bg-slate-950 p-8 text-slate-300">Loading company analytics…</div>;
  }

  if (analyticsError && !analyticsData?.generated_at) {
    return <div className="min-h-screen bg-slate-950 p-8 text-red-300">Company analytics could not load: {analyticsError.message}</div>;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-white">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#10233a_0,_#07101c_42%,_#050a12_100%)] p-3 text-white sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#10233b] via-[#0b1726] to-[#07101c] p-5 shadow-2xl sm:flex-row sm:items-center sm:justify-between md:p-7">
          <div>
            <h1 className="flex min-w-0 items-center gap-3 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Company Analytics
            </h1>
            <p className="text-slate-400">Performance metrics across all officers</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={refreshCompanyAnalytics}
              disabled={analyticsRefreshing}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-900/50 disabled:opacity-50 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${analyticsRefreshing ? 'animate-spin' : ''}`} />
              {analyticsRefreshing ? 'Updating' : 'Refresh Analytics'}
            </button>
            <button
              type="button"
              onClick={() => { setSummaryResult(null);setSummaryPreview(null);setSummaryPreviewError('');setSummaryPreviewSearch('');setShowSummaryDialog(true); }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-amber-950/20 transition hover:from-amber-400 hover:to-yellow-400 sm:flex-none"
            >
              <Send className="h-4 w-4" />
              Send Company Summary
            </button>
            <div className="grid min-w-[310px] grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-2">
              <div><Label className="text-[10px] uppercase tracking-wide text-slate-400">Start</Label><Input type="date" value={analyticsStartDate} max={analyticsEndDate} onChange={e=>setAnalyticsStartDate(e.target.value)} className="mt-1 h-9 border-slate-700 bg-slate-950"/></div>
              <div><Label className="text-[10px] uppercase tracking-wide text-slate-400">End</Label><Input type="date" value={analyticsEndDate} min={analyticsStartDate} onChange={e=>setAnalyticsEndDate(e.target.value)} className="mt-1 h-9 border-slate-700 bg-slate-950"/></div>
            </div>
            <Select value={selectedDivision} onValueChange={value => { setSelectedDivision(value); setSelectedSubdivision('all'); }}>
              <SelectTrigger className="min-h-11 flex-1 border-slate-700 bg-slate-900 sm:w-48 sm:flex-none">
                <SelectValue placeholder="All Divisions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions?.map(d => (
                  <SelectItem key={d.id} value={d.division_name}>{d.division_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedSubdivision} onValueChange={setSelectedSubdivision}>
              <SelectTrigger className="min-h-11 border-slate-700 bg-slate-900 sm:w-52"><SelectValue placeholder="All regions / substations" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All regions / substations</SelectItem>
                {[...new Set(performanceUsers.filter(u => selectedDivision === 'all' || String(u.division || '') === selectedDivision).map(u => String(u.subdivision || u.substation || '')).filter(Boolean))].sort().map(region => <SelectItem key={region} value={region}>{region}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {analyticsData.is_updating && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
            Updating all five analytics data groups. Officer percentages stay on the last coherent verified generation until the current generation is complete.
          </div>
        )}

        {analyticsError && analyticsData?.generated_at && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {analyticsError.message} Showing the last verified company analytics from {new Date(analyticsData.generated_at).toLocaleString()}.
          </div>
        )}

        {analyticsServiceErrorNames.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Company Analytics loaded with temporary data-source issues in {analyticsServiceErrorNames.join(', ')}. The dashboard will retry automatically; affected metrics are not treated as verified zero activity.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-9">
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{companyOnTimeStats.rate != null ? `${companyOnTimeStats.rate}%` : '—'}</p>
              <p className="text-xs text-slate-400">Attendance Rate</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <BarChart3 className="w-6 h-6 text-cyan-500 mb-2" />
              <p className="text-2xl font-bold text-cyan-400">{companyOverallScore != null ? `${companyOverallScore}%` : '—'}</p>
              <p className="text-xs text-slate-400">Overall Performance</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <Users className="w-6 h-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-blue-600">{filteredUsers.length}</p>
              <p className="text-xs text-slate-400">Active Officers</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <Clock className="mb-2 h-6 w-6 text-blue-400" />
              <p className="text-2xl font-bold text-blue-300">{hoursBreakdown.reduce((sum, officer) => sum + Number(officer.regular || 0) + Number(officer.overtime || 0), 0).toFixed(1)}h</p>
              <p className="text-xs text-slate-400">Hours in Range</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <Award className="w-6 h-6 text-purple-600 mb-2" />
              <p className="text-2xl font-bold text-purple-600">
                {trainingByOfficer.length}
              </p>
              <p className="text-xs text-slate-400">Need Training</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <Clock className="w-6 h-6 text-amber-600 mb-2" />
              <p className="text-2xl font-bold text-amber-600">{responseTimeStats.avg != null ? `${responseTimeStats.avg}m` : '—'}</p>
              <p className="text-xs text-slate-400">Avg Dispatch-to-Scene</p>
              <p className="mt-1 text-[10px] text-slate-500">{responseTimeStats.total} resolved call{responseTimeStats.total === 1 ? '' : 's'}</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <AlertTriangle className="w-6 h-6 text-red-600 mb-2" />
              <p className="text-2xl font-bold text-red-600">
                {(hoursBreakdown?.reduce((sum, o) => sum + (o.overtime || 0), 0) || 0).toFixed(1)}h
              </p>
              <p className="text-xs text-slate-400">Total OT</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <Award className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{commendationStats.total || 0}</p>
              <p className="text-xs text-slate-400">Commendations</p>
            </CardContent>
          </Card>
          <Card className="bps-kpi-card min-w-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111d2e] to-[#0a1320] p-4 text-white shadow-xl">
            <CardContent className="flex w-full flex-col items-center justify-center p-0 text-center">
              <AlertTriangle className="w-6 h-6 text-rose-600 mb-2" />
              <p className="text-2xl font-bold text-rose-600">{complaintStats.total || 0}</p>
              <p className="text-xs text-slate-400">Complaints</p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Officer Overall Performance — {format(parseISO(currentMonthStart), 'MMM d, yyyy')} to {format(parseISO(currentMonthEnd), 'MMM d, yyyy')}
            </CardTitle>
            <p className="text-xs text-slate-400">Uses the same scoring engine as Officer My Performance. Job Duty includes DAR, required Incident Reports, and QR compliance. When there is no obligation, the count is shown as 0/0 and does not create a fake 100% score.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!performanceCardsReady && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 text-sm text-cyan-100">
                  {officerPerformanceSnapshots.error ? 'Officer Performance Could Not Be Loaded.' : 'Loading Officer Performance For This Period…'}
                  {officerPerformanceSnapshots.error && <button className="ml-3 underline" onClick={()=>officerPerformanceSnapshots.refetch()}>Retry Officer Performance</button>}
                  {Object.keys(performanceCriticalErrors).length > 0 && (
                    <div className="mt-2 text-amber-200">Sources awaiting refresh: {Object.keys(performanceCriticalErrors).join(', ')}</div>
                  )}
                  {Object.keys(officerPerformanceSnapshots.data?.errors || {}).length > 0 && (
                    <div className="mt-2 text-amber-200">Officer snapshots awaiting refresh: {Object.values(officerPerformanceSnapshots.data.errors).join(' · ')}</div>
                  )}
                </div>
              )}
              {performanceCardsReady && <div className="min-h-5 text-xs text-slate-400" aria-live="polite">{officerPerformanceSnapshots.isFetching ? 'Refreshing figures…' : Object.keys(performanceCriticalErrors).length || Object.keys(officerPerformanceSnapshots.data?.errors || {}).length ? 'Some figures could not refresh. Last verified figures remain visible.' : 'Figures are up to date.'}</div>}
              {performanceCardsReady && overallByOfficer.map(officer => (
                <div key={officer.email} className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{officer.name}</p>
                      <p className="text-xs text-slate-400">{officer.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {officer.punctuality.exempt > 0 && <Badge className="bg-emerald-700 text-white">{officer.punctuality.exempt} Performance Exempt</Badge>}
                      {officer.dataHealth!=='verified'&&<Badge className="bg-amber-700 text-white">Unverified source data</Badge>}
                      <Badge className={officer.overall.score == null ? 'bg-slate-600' : officer.overall.score >= 90 ? 'bg-green-600' : officer.overall.score >= 75 ? 'bg-amber-600' : 'bg-red-600'}>
                        {officer.overall.score != null ? `${officer.overall.score}%` : 'Not scored'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-md border border-slate-600 px-2 py-1">Training: {officer.training.total?`${officer.training.completed}/${officer.training.total} completed · ${officer.training.percentage}%`:'No assigned courses'}</span>{[['DCJS',officer.certificationFile?.dcjs_expiration],['Firearm',officer.certificationFile?.firearm_expiration]].map(([label,expiry])=><span key={label} className="rounded-md border border-slate-600 px-2 py-1">{label}: {expiry?(String(expiry).slice(0,10)>=new Date().toISOString().slice(0,10)?`On file · ${String(expiry).slice(0,10)}`:`Expired ${String(expiry).slice(0,10)}`):'Not on file'}</span>)}</div>
                  {officer.dataHealth!=='verified'&&<p role="status" className="mt-2 rounded-md border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">Performance score withheld because {Object.keys(officer.serviceErrors||{}).join(', ')||'one or more required sources'} did not return verified data. Refresh rather than treating missing records as a failure.</p>}
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {officer.categoryRatings.map(category => (
                      <div key={category.label} className="rounded-md border border-slate-600 bg-slate-900 px-2.5 py-2 text-xs text-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{category.label}</span>
                          <strong className={category.score == null ? 'text-slate-500' : 'text-cyan-300'}>{category.score == null ? 'Not scored' : `${category.score}%`}</strong>
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{category.detail}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">DAR:</span> <span className="text-slate-300">{officer.jobDuty.dailyActivity.completed}/{officer.jobDuty.dailyActivity.required}</span>{officer.jobDuty.dailyActivity.score != null && <span className="text-slate-500"> · {officer.jobDuty.dailyActivity.score}%</span>}
                    </div>
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">Incident:</span> <span className="text-slate-300">{officer.jobDuty.incidentReports.completed}/{officer.jobDuty.incidentReports.required}</span>{officer.jobDuty.incidentReports.score != null && <span className="text-slate-500"> · {officer.jobDuty.incidentReports.score}%</span>}
                    </div>
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">QR:</span> <span className="text-slate-300">{officer.jobDuty.qrCompliance.completed}/{officer.jobDuty.qrCompliance.required}</span>{officer.jobDuty.qrCompliance.score != null && <span className="text-slate-500"> · {officer.jobDuty.qrCompliance.score}%</span>}
                    </div>
                  </div>
                  <IncidentPerformanceDetails jobDuty={officer.jobDuty} isAdmin={user?.role === "admin"} onChanged={refreshCompanyAnalytics} />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                    {officer.callOutAttendance.score != null && <span>Call-Out Attendance: {officer.callOutAttendance.score}% ({officer.callOutAttendance.count} call-out{officer.callOutAttendance.count === 1 ? '' : 's'})</span>}
                    {officer.bidStanding.score != null && <span>Bid Standing: {officer.bidStanding.score}% ({officer.bidStanding.accepted} assigned bid{officer.bidStanding.accepted === 1 ? '' : 's'})</span>}
                    {officer.clientFeedback.score != null && <span>Client Feedback: {officer.clientFeedback.score}% ({officer.clientFeedback.avgRating.toFixed(1)}/5)</span>}
                    {officer.recognition.score != null && <span>Recognition: {officer.recognition.count} record{officer.recognition.count === 1 ? '' : 's'}</span>}
                    {officer.supervisorRating.score != null && <span>Supervisor Rating: {officer.supervisorRating.score}%</span>}
                  </div>
                </div>
              ))}
              {performanceCardsReady && Object.entries(officerPerformanceSnapshots.data?.errors || {}).map(([officerId, message]) => {
                const officer = performanceOfficerUsers.find(item => String(item.id) === String(officerId));
                return (
                  <div key={officerId} className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-100">
                    <div className="font-semibold">{officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email : 'Officer performance'} could not be refreshed.</div>
                    <div className="mt-1 text-xs text-amber-200/80">{message}</div>
                  </div>
                );
              })}
              {performanceCardsReady && overallByOfficer.length === 0 && Object.keys(officerPerformanceSnapshots.data?.errors || {}).length === 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">No operational officer performance snapshots are available for this period.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle>Hours by Officer ({format(parseISO(currentMonthStart), 'MMM d')} – {format(parseISO(currentMonthEnd), 'MMM d, yyyy')})</CardTitle>
          </CardHeader>
          <CardContent>
            {hoursBreakdown.length > 0 ? (
              <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[620px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursBreakdown.slice(0, 15)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="regular" stackId="a" fill="#3b82f6" name="Regular" />
                  <Bar dataKey="overtime" stackId="a" fill="#ef4444" name="Overtime" />
                </BarChart>
              </ResponsiveContainer>
              </div>
              </div>
            ) : (
              <p className="text-center text-slate-300 py-8">No data available</p>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Attendance Leaderboard (Selected Period)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {companyOnTimeStats.leaderboard && companyOnTimeStats.leaderboard.length > 0 ? companyOnTimeStats.leaderboard.map((officer, idx) => (
                  <div key={officer.email} className="flex items-center justify-between p-2 border border-slate-700 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-300'
                      }`}>{idx + 1}</span>
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                    </div>
                    <Badge className={`${officer.rate >= 90 ? 'bg-green-600' : officer.rate >= 75 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                      {officer.rate}%
                    </Badge>
                  </div>
                )) : (
                  <p className="text-center text-slate-300 py-4">No eligible non-supervisor officers have elapsed scheduled shifts this month.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-green-600" />
                Top Commendations (Selected Period)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {commendationStats.byOfficer.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {commendationStats.byOfficer.slice(0, 10).map((officer, idx) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-emerald-800 bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-300'
                        }`}>{idx + 1}</span>
                        <span className="text-sm font-medium text-white">{officer.name}</span>
                      </div>
                      <Badge className="bg-green-600 text-white">
                        {officer.count} ({officer.points} pts)
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-300 py-8">No commendations this month</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-600" />
                Officers Needing Training
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trainingByOfficer.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-600" />
                  <p className="text-slate-300">All officers up to date!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {trainingByOfficer.slice(0, 10).map((officer) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-slate-700 bg-slate-800 rounded-lg">
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${officer.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${officer.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300 w-16">{officer.completed}/{officer.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Complaints Status (Selected Period)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {complaintStats.byOfficer.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {complaintStats.byOfficer.slice(0, 10).map((officer) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-red-900 bg-slate-800 rounded-lg">
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                      <Badge className={officer.sustained > 0 ? 'bg-red-600' : 'bg-amber-600'}>
                        {officer.count} ({officer.sustained} sustained)
                      </Badge>
                    </div>
                  ))}
                  {complaintStats.pending > 0 && (
                    <div className="mt-3 p-2 bg-amber-100 rounded border border-amber-300">
                      <p className="text-xs font-bold text-amber-900">{complaintStats.pending} pending investigation</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-slate-300 py-8">No complaints this month</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Officers Missing Shift Reports (Selected Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MissingReportsCheck sourceReports={analyticsData.dailyActivityReports || []} sourceTimeEntries={analyticsData.timeEntries || []} sourceLoading={!coreAnalytics.data || !dutyAnalytics.data} 
              schedules={schedules}
              allUsers={allUsers}
              filteredUsers={filteredUsers}
            />
          </CardContent>
        </Card>
      </div>

      {showSummaryDialog && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => !summarySending && setShowSummaryDialog(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="company-summary-dialog-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/40 bg-[#0b1522] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-[#111d2d] to-[#0b1522] p-5">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-300"><MailCheck className="h-5 w-5" /></div>
                <div>
                  <h2 id="company-summary-dialog-title" className="text-lg font-black text-white">Send Company Summary</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">The automated version sends every day at 8:00 AM Eastern.</p>
                </div>
              </div>
              <button type="button" disabled={summarySending} onClick={() => setShowSummaryDialog(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              {!summaryResult ? (
                <>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-sm leading-relaxed text-slate-300">
                    <p className="font-bold text-white">This sends one Black Point HTML email and one in-app notification to every active internal company member.</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-400">
                      <li>• Company-wide aggregate performance snapshot only</li>
                      <li>• Active operational team count as a company total</li>
                      <li>• The recipient’s complete personal list of missing DARs, report corrections, training, modules, and certification items</li>
                      <li>• No other officer’s name, individual score, ranking position, or missing items are shown</li>
                      <li>• Email is sent from management@blackpointkjc.com through the shared Outlook connection</li>
                    </ul>
                  </div>
                  <section className="space-y-3 rounded-xl border border-cyan-700/50 bg-[#09263a]/60 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-cyan-200">Check the real summary data</h3><p className="text-xs text-slate-400">Optional administrator-only verification. Scores here are operational performance, not DCJS/firearm certificate completion.</p></div><button type="button" disabled={summaryPreviewBusy||summarySending} onClick={previewCompanySummary} className="rounded-md border border-cyan-600 px-3 py-2 text-xs font-bold text-cyan-100">{summaryPreviewBusy?'Verifying source records…':'Preview officer score breakdown'}</button></div>
                    {summaryPreviewError&&<p role="alert" className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs text-amber-200">{summaryPreviewError}</p>}
                    {summaryPreview&&<><p className="text-xs text-emerald-200">Verified company performance average: {summaryPreview.company_overall==null?'Not scored':`${summaryPreview.company_overall}%`} · {summaryPreview.recipient_count||0} active recipients. No emails have been sent by this preview.</p><input className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-3 text-xs text-white" value={summaryPreviewSearch} onChange={event=>setSummaryPreviewSearch(event.target.value)} placeholder="Find an officer by name (for example, Hiers)…" aria-label="Search summary preview officers"/><div className="max-h-48 space-y-2 overflow-y-auto">{(summaryPreview.rankings||[]).filter(item=>String(item.name||'').toLowerCase().includes(summaryPreviewSearch.toLowerCase())).slice(0,30).map(item=><div key={item.name} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200"><div className="font-black text-white">{item.name} · {item.overall_score==null?'Not scored':`${item.overall_score}% overall performance`}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-400"><span>Attendance: {item.attendance_coverage==null?'N/A':`${item.attendance_coverage}%`}</span><span>Job duty: {item.job_duty_score==null?'N/A':`${item.job_duty_score}%`}</span><span>Training: {item.training_percentage==null?'N/A':`${item.training_percentage}%`}</span></div><div className="mt-1 text-slate-500">{(item.categories||[]).map(category=>`${category.label}: ${category.score}%`).join(' · ')||'No scoreable operating categories'}</div></div>)}</div></>}
                  </section>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" disabled={summarySending} onClick={() => setShowSummaryDialog(false)} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Cancel</button>
                    <button type="button" disabled={summarySending} onClick={sendCompanySummaryNow} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-70">
                      {summarySending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send Now</>}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`rounded-xl border p-4 ${summaryResult.email_sent ? 'border-emerald-600/40 bg-emerald-950/25' : 'border-amber-600/40 bg-amber-950/25'}`}>
                    <div className="flex items-center gap-2 font-black text-white">
                      {summaryResult.email_sent ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                      {summaryResult.email_sent ? 'Company summary delivered' : summaryResult.in_app_delivered ? 'In-app summary delivered' : 'Delivery needs attention'}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div className="rounded-lg bg-black/20 p-3"><div className="text-slate-500">Active recipients</div><div className="mt-1 text-lg font-black text-white">{summaryResult.recipient_count || 0}</div></div>
                      <div className="rounded-lg bg-black/20 p-3"><div className="text-slate-500">Missing items listed</div><div className="mt-1 text-lg font-black text-white">{summaryResult.missing_item_count || 0}</div></div>
                    </div>
                    {summaryResult.email_error && <p className="mt-3 text-xs leading-relaxed text-amber-200">{summaryResult.email_error}</p>}
                    {summaryResult.error && <p className="mt-3 text-xs leading-relaxed text-red-200">{summaryResult.error}</p>}
                    <p className="mt-3 text-[11px] text-slate-500">Email sender: {summaryResult.email_sender || 'management@blackpointkjc.com'} • In-app delivery remains separate from email.</p>
                  </div>
                  <button type="button" onClick={() => setShowSummaryDialog(false)} className="ml-auto flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-5 text-sm font-bold text-white hover:bg-slate-800">Done</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}