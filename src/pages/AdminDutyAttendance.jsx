import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, RefreshCw, CheckCircle2, AlertTriangle, Search, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import DutyAttendanceRow from '@/components/admin/DutyAttendanceRow';
import { getRankLastName } from '@/utils/officerDisplay';
import { buildDutyAttendanceRows, reviewPeriodDates, summarizeReview } from '@/lib/dutyAttendanceReview';

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
];

const SORTS = [
  { value: 'name', label: 'Officer name' },
  { value: 'duty', label: 'Lowest job duty' },
  { value: 'attendance', label: 'Most call-outs' },
];

function useReviewSegment(name, enabled, startDate, endDate) {
  return useQuery({
    queryKey: ['dutyAttendanceSegment', name, startDate, endDate],
    queryFn: async () => {
      const result = await base44.functions.invoke('getCompanyAnalyticsSegment', {
        segment: name, start_date: startDate, end_date: endDate,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export default function AdminDutyAttendance() {
  const { user, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [preset, setPreset] = useState('this_month');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [expandedId, setExpandedId] = useState(() => searchParams.get('record_id') || null);
  const [completing, setCompleting] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [followUpSync, setFollowUpSync] = useState({ status: 'idle', open: 0, supervisors: 0, error: '' });
  const syncedFindingsRef = useRef('');

  const queueTask = searchParams.get('queue_task');
  const queueKind = searchParams.get('queue_kind');
  const { start_date: startDate, end_date: endDate } = reviewPeriodDates(preset);

  const isAdmin = user?.role === 'admin' || (user?.additional_roles || []).map(role => String(role).toLowerCase()).includes('full_access');
  const core = useReviewSegment('core', !!user && isAdmin, startDate, endDate);
  const duty = useReviewSegment('duty', !!user && isAdmin && Boolean(core.data || core.isError), startDate, endDate);
  const calls = useReviewSegment('calls', !!user && isAdmin && Boolean(duty.data || duty.isError), startDate, endDate);

  const reviewData = useMemo(() => {
    const payloads = [core.data, duty.data, calls.data].filter(Boolean);
    return payloads.reduce((merged, payload) => ({ ...merged, ...payload }), {});
  }, [core.data, duty.data, calls.data]);

  const segmentsReady = Boolean(core.data && duty.data && calls.data);
  const loading = isLoadingAuth || !isAdmin || core.isLoading || (segmentsReady === false && !core.isError && !duty.isError && !calls.isError);
  const serviceErrors = [core.data, duty.data, calls.data]
    .flatMap(payload => Object.keys(payload?.service_errors || {}))
    .filter((value, index, rows) => rows.indexOf(value) === index);

  const adjustmentsQuery = useQuery({
    queryKey: ['dutyAttendanceAdjustments', startDate, endDate],
    queryFn: () => base44.entities.DutyAttendanceAdjustment.filter({ item_date: { $gte: startDate, $lte: endDate } }, '-created_date', 500),
    enabled: !!user && isAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  const adjustments = useMemo(() => adjustmentsQuery.data || [], [adjustmentsQuery.data]);

  const allRows = useMemo(
    () => segmentsReady ? buildDutyAttendanceRows(reviewData, { start_date: startDate, end_date: endDate, adjustments }) : [],
    [segmentsReady, reviewData, startDate, endDate, adjustments]
  );
  const summary = useMemo(() => summarizeReview(allRows), [allRows]);

  // Every outstanding finding is handed to the supervisor workflow as a reach-out
  // task, so an officer is contacted about the gap instead of it only being scored.
  const findings = useMemo(() => allRows.map(row => {
    const officerEmail = String(row.officer?.email || '').trim().toLowerCase();
    if (!officerEmail) return null;
    const items = [];
    (row.missedDuties || []).filter(item => !item.exempt).forEach(item => {
      items.push({ type: item.item_type || 'duty', label: item.label, date: item.date || '', property: item.property || '' });
    });
    (row.callOutItems || []).filter(item => !item.exempt).forEach(item => {
      items.push({ type: 'call_out', label: item.reason ? `Call-out · ${item.reason}` : 'Call-out recorded', date: item.call_out_date || '', property: item.location || '' });
    });
    if (!items.length) return null;
    return { officer_email: officerEmail, officer_name: getRankLastName(row.officer, officerEmail), officer_id: row.officer.id || '', items };
  }).filter(Boolean), [allRows]);

  const findingsSignature = useMemo(
    () => `${startDate}|${endDate}|${findings.map(item => `${item.officer_email}=${item.items.length}:${item.items.map(entry => entry.label).join('~')}`).join('|')}`,
    [findings, startDate, endDate]
  );

  useEffect(() => {
    if (!isAdmin || !segmentsReady || syncedFindingsRef.current === findingsSignature) return undefined;
    syncedFindingsRef.current = findingsSignature;
    let cancelled = false;
    setFollowUpSync(current => ({ ...current, status: 'saving', error: '' }));
    base44.functions.invoke('syncDutyAttendanceFollowUps', { period_start: startDate, period_end: endDate, findings })
      .then(response => {
        const data = response?.data || response || {};
        if (data.error) throw new Error(data.error);
        if (cancelled) return;
        setFollowUpSync({ status: 'done', open: Number(data.open_count) || 0, supervisors: Number(data.supervisor_count) || 0, error: '' });
      })
      .catch(failure => {
        if (cancelled) return;
        setFollowUpSync({ status: 'error', open: 0, supervisors: 0, error: failure?.message || 'Supervisor follow-ups could not be assigned.' });
      });
    return () => { cancelled = true; };
  }, [findingsSignature, segmentsReady, isAdmin, startDate, endDate, findings]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? allRows.filter(({ officer }) => [officer.full_name, officer.email, officer.rank, officer.unit_number]
        .filter(Boolean).some(value => String(value).toLowerCase().includes(term)))
      : allRows;
    if (sort === 'duty') return [...filtered].sort((a, b) => (a.jobDuty?.score ?? 101) - (b.jobDuty?.score ?? 101));
    if (sort === 'attendance') return [...filtered].sort((a, b) => (b.attendance?.count || 0) - (a.attendance?.count || 0));
    return filtered;
  }, [allRows, search, sort]);

  const refresh = async () => {
    await Promise.all([core.refetch(), duty.refetch(), calls.refetch(), adjustmentsQuery.refetch()]);
  };

  // Exemptions are stored once and read by every scoring surface (this review, the
  // officer performance card and company analytics), so the decision is not a
  // display-only flag.
  const applyExemption = async (officer, item, reason) => {
    if (!item?.key) return;
    setSavingKey(item.key);
    try {
      await base44.entities.DutyAttendanceAdjustment.create({
        officer_email: String(officer.email || '').trim().toLowerCase(),
        officer_name: getRankLastName(officer, officer.email || ''),
        item_key: String(item.key),
        item_type: item.item_type || 'dar',
        item_date: item.date || null,
        property: item.property || '',
        label: item.label || '',
        decision: 'exempt',
        reason,
        decided_by: user?.full_name || user?.email || 'Administrator',
        decided_by_email: user?.email || '',
        decided_at: new Date().toISOString(),
      });
      await refreshScoring();
      toast.success('Obligation exempted. Scores were recalculated.');
    } catch (error) {
      toast.error(error?.message || 'The exemption could not be saved.');
    } finally {
      setSavingKey(null);
    }
  };

  const removeExemption = async (officer, item) => {
    if (!item?.key) return;
    setSavingKey(item.key);
    try {
      const match = adjustments.find(row => String(row.item_key) === String(item.key) && String(row.officer_email || '').trim().toLowerCase() === String(officer.email || '').trim().toLowerCase());
      if (match) await base44.entities.DutyAttendanceAdjustment.delete(match.id);
      await refreshScoring();
      toast.success('Exemption removed. Scores were recalculated.');
    } catch (error) {
      toast.error(error?.message || 'The exemption could not be removed.');
    } finally {
      setSavingKey(null);
    }
  };

  const refreshScoring = async () => {
    await adjustmentsQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ['companyAnalyticsSegment'] });
    queryClient.invalidateQueries({ queryKey: ['companyOfficerPerformanceSnapshots'] });
    queryClient.invalidateQueries({ queryKey: ['myPerformanceData'] });
    queryClient.invalidateQueries({ queryKey: ['adminDashboardWorkQueue'] });
  };

  const completeReviewTask = async () => {
    if (!queueTask) return;
    setCompleting(true);
    try {
      const result = await base44.functions.invoke('getRoleWorkQueue', {
        action: 'complete',
        task_key: queueTask,
        kind: queueKind || '',
        queue_role: 'admin',
        note: 'Duty and attendance review completed.',
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      queryClient.invalidateQueries({ queryKey: ['adminDashboardWorkQueue'] });
      toast.success('Review marked complete.');
    } catch (error) {
      toast.error(error?.message || 'The review could not be marked complete.');
    } finally {
      setCompleting(false);
    }
  };

  if (isLoadingAuth) return <div className="p-8 text-center text-slate-400">Loading administrator access…</div>;
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="mx-auto mb-4 h-16 w-16 text-slate-400" />
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Admin access required</h2>
        <p className="text-slate-600">You don't have permission to review duty and attendance performance.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 bg-[#070d17] p-3 pb-10 text-white sm:p-4">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#10233b] via-[#0b1726] to-[#07101c] p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10"><Shield className="h-5 w-5 text-cyan-300" /></div>
              <div>
                <h1 className="text-xl font-black leading-tight text-white">Duty &amp; Attendance Review</h1>
                <p className="mt-0.5 text-xs text-slate-400">Job duty performance and call-out attendance for any period.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="h-11 w-[170px] border-slate-700 bg-[#0b1725] text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map(period => <SelectItem key={period.value} value={period.value}>{period.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={refresh} disabled={core.isFetching || duty.isFetching || calls.isFetching} className="h-11 border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                <RefreshCw className={`mr-2 h-4 w-4 ${core.isFetching || duty.isFetching || calls.isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Reviewing {startDate} to {endDate}.</p>
        </div>

        {queueTask && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>This review was opened from an administrative work queue task.</span>
            <Button onClick={completeReviewTask} disabled={completing} size="sm" className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25">
              <CheckCircle2 className="mr-2 h-4 w-4" />{completing ? 'Saving…' : 'Mark review complete'}
            </Button>
          </div>
        )}

        {isAdmin && segmentsReady && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            <span className="inline-flex min-w-0 items-center gap-2">
              <ClipboardList className="h-4 w-4 shrink-0 text-cyan-300" />
              {followUpSync.status === 'saving' && 'Assigning officer follow-ups to supervisors…'}
              {followUpSync.status === 'done' && (followUpSync.open
                ? `${followUpSync.open} officer follow-up${followUpSync.open === 1 ? '' : 's'} assigned across ${followUpSync.supervisors} supervisor${followUpSync.supervisors === 1 ? '' : 's'} to reach out to the officer.`
                : 'No outstanding findings need supervisor outreach for this period.')}
              {followUpSync.status === 'error' && (followUpSync.error || 'Supervisor follow-ups could not be assigned.')}
              {followUpSync.status === 'idle' && 'Supervisor follow-ups are assigned automatically for this period.'}
            </span>
            {followUpSync.open > 0 && (
              <Link to={createPageUrl('SupervisorTasks')} className="inline-flex min-h-9 items-center rounded-lg border border-cyan-400/40 bg-[#0b2233] px-3 text-xs font-black text-cyan-100 hover:bg-[#0f2c42]">
                Open Supervisor Action Items
              </Link>
            )}
          </div>
        )}

        {!!serviceErrors.length && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />Partial data: {serviceErrors.join(', ')} could not be loaded. Scores below may be incomplete.
          </div>
        )}
        {!segmentsReady && !loading && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Duty and attendance performance could not load: {(core.error || duty.error || calls.error)?.message || 'data sources unavailable'}.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="bps-kpi-card border border-blue-500/30 bg-[#0d2033] p-4 text-white">
            <div className="bps-kpi-value text-3xl font-black text-white">{summary.officers}</div>
            <div className="bps-kpi-label text-sm font-bold text-white">Officers reviewed</div>
            <p className="bps-kpi-detail text-xs text-blue-200">{summary.flagged} with at least one finding</p>
          </Card>
          <Card className="bps-kpi-card border border-cyan-500/30 bg-[#0d2033] p-4 text-white">
            <div className="bps-kpi-value text-3xl font-black text-white">{summary.averageDuty == null ? '—' : `${summary.averageDuty}%`}</div>
            <div className="bps-kpi-label text-sm font-bold text-white">Average job duty</div>
            <p className="bps-kpi-detail text-xs text-cyan-200">Required duties vs completed</p>
          </Card>
          <Card className="bps-kpi-card border border-amber-500/30 bg-[#0d2033] p-4 text-white">
            <div className="bps-kpi-value text-3xl font-black text-white">{summary.missedDuties}</div>
            <div className="bps-kpi-label text-sm font-bold text-white">Missed required duties</div>
            <p className="bps-kpi-detail text-xs text-amber-200">DAR, incident reports and QR</p>
          </Card>
          <Card className="bps-kpi-card border border-purple-500/30 bg-[#0d2033] p-4 text-white">
            <div className="bps-kpi-value text-3xl font-black text-white">{summary.callOuts}</div>
            <div className="bps-kpi-label text-sm font-bold text-white">Call-outs recorded</div>
            <p className="bps-kpi-detail text-xs text-purple-200">{summary.averageAttendance == null ? 'Attendance not scorable' : `${summary.averageAttendance}% average attendance`}</p>
          </Card>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-4 shadow-lg sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Officer performance</div>
              <h2 className="mt-1 text-xl font-black text-white">Job duty and call-out attendance</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search officer" className="h-11 w-[220px] border-slate-700 bg-[#0b1725] pl-9 text-slate-100 placeholder:text-slate-500" />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-11 w-[180px] border-slate-700 bg-[#0b1725] text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORTS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {loading && <div className="rounded-xl border border-dashed border-slate-800 p-7 text-center text-sm text-slate-400">Loading duty and attendance records…</div>}
            {!loading && !rows.length && (
              <div className="rounded-xl border border-dashed border-slate-800 p-7 text-center text-sm text-slate-400">
                {allRows.length ? 'No officer matches this search.' : 'No officer performance records were returned for this period.'}
              </div>
            )}
            {!loading && rows.map(row => (
              <DutyAttendanceRow
                key={row.officer.id || row.officer.email}
                row={row}
                expanded={expandedId === (row.officer.id || row.officer.email)}
                onToggle={() => setExpandedId(current => (current === (row.officer.id || row.officer.email) ? null : (row.officer.id || row.officer.email)))}
                onExempt={applyExemption}
                onRestore={removeExemption}
                savingKey={savingKey}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Job duty counts required daily activity reports, incident reports for property calls and required QR checkpoints. Attendance counts recorded call-outs against scheduled shifts in the selected period.</p>
        </section>
      </div>
    </div>
  );
}