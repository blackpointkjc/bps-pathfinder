import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock3, FileText, AlertTriangle } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

const normalizeSite = value => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
const emailKey = value => String(value || '').trim().toLowerCase();
const officerLabel = officer => {
  const rank = String(officer?.rank || '').trim();
  const last = String(officer?.last_name || '').trim();
  return [rank, last].filter(Boolean).join(' ') || officer?.email || 'Unknown officer';
};

export default function MissingReportsCheck({ schedules: _schedules, allUsers = [], filteredUsers = [], weekStart, weekEnd }) {
  const periodStart = weekStart || startOfMonth(new Date());
  const periodEnd = weekEnd || endOfMonth(new Date());

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['allDutyActivityReports', format(periodStart, 'yyyy-MM-dd'), format(periodEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const [daily, shift] = await Promise.all([
        base44.entities.DailyActivityReport.list('-report_date', 500),
        base44.entities.ShiftReport.list('-shift_date', 500),
      ]);
      return [
        ...(daily || []).map(report => ({ ...report, source_report_type: 'daily_activity_report' })),
        ...(shift || []).map(report => ({
          ...report,
          source_report_type: 'shift_report',
          report_date: report.report_date || report.shift_date,
          hourly_entries: report.hourly_entries || report.activities || '',
        })),
      ];
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });
  const { data: timeEntries = [], isLoading: timeLoading } = useQuery({
    queryKey: ['missingReportTimeEntries', format(periodStart, 'yyyy-MM-dd'), format(periodEnd, 'yyyy-MM-dd')],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in', 2000),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  const checks = useMemo(() => {
    const start = format(periodStart, 'yyyy-MM-dd');
    const end = format(periodEnd, 'yyyy-MM-dd');
    const usersByEmail = new Map((allUsers.length ? allUsers : filteredUsers).map(user => [String(user.email || '').toLowerCase(), user]));

    const completedEntries = timeEntries
      .filter(entry => entry.clock_in && entry.clock_out && entry.officer_email && entry.archived !== true && entry.performance_exception !== true)
      .map(entry => ({ ...entry, worked_date: format(parseISO(entry.clock_in), 'yyyy-MM-dd') }))
      .filter(entry => entry.worked_date >= start && entry.worked_date <= end)
      .sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));

    // Merge contiguous TimeEntry rows created by Switch Site into one duty
    // session so the report checker cannot require two DARs for one continuous shift.
    const sessions = [];
    const byOfficer = new Map();
    completedEntries.forEach(entry => {
      const email = emailKey(entry.officer_email);
      if (!byOfficer.has(email)) byOfficer.set(email, []);
      byOfficer.get(email).push(entry);
    });
    byOfficer.forEach((entries, email) => {
      let current = null;
      entries.forEach(entry => {
        const startMs = new Date(entry.clock_in).getTime();
        const endMs = new Date(entry.clock_out).getTime();
        if (!current || startMs > current.endMs + 20 * 60 * 1000) {
          current = { id: `session-${entry.id}`, email, startMs, endMs, entries: [], sites: new Set(), dates: new Set() };
          sessions.push(current);
        }
        current.entries.push(entry);
        current.endMs = Math.max(current.endMs, endMs);
        current.sites.add(normalizeSite(entry.location));
        current.dates.add(entry.worked_date);
      });
    });

    return sessions.map(session => {
      const officer = usersByEmail.get(session.email);
      const entryIds = new Set(session.entries.map(entry => String(entry.id)));
      const matching = reports
        .filter(report => {
          if (String(report?.status || '').toLowerCase() === 'rejected') return false;
          if (report.shift_id && entryIds.has(String(report.shift_id))) return true;
          const reportDate = String(report.report_date || report.shift_date || '').slice(0, 10);
          const sameDate = session.dates.has(reportDate);
          const sameSite = session.sites.has(normalizeSite(report.location));
          if (!sameDate || !sameSite) return false;

          // Team reports satisfy the shared duty-session requirement. Explicit
          // attachment is strongest evidence, but a submitted report for the same
          // site/session also prevents every partner officer being marked missing.
          const attachedIds = new Set((report.attached_officer_ids || []).map(String));
          const attachedEmails = new Set((report.attached_officer_emails || []).map(emailKey));
          const explicitCredit = (officer?.id && attachedIds.has(String(officer.id)))
            || attachedEmails.has(session.email)
            || emailKey(report.officer_email) === session.email
            || (officer?.id && String(report.created_by_id || '') === String(officer.id));
          return explicitCredit || !['draft', 'rejected'].includes(String(report.status || '').toLowerCase());
        })
        .sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))[0];

      const rawStatus = String(matching?.status || '').toLowerCase();
      const status = !matching
        ? 'missing'
        : ['approved', 'accepted'].includes(rawStatus)
          ? 'accepted'
          : ['submitted', 'pending', 'pending_approval', 'under_review'].includes(rawStatus)
            ? 'pending'
            : rawStatus === 'draft'
              ? 'draft'
              : 'pending';

      return {
        id: session.id,
        officer: officerLabel(officer) || session.email,
        email: session.email,
        date: format(new Date(session.startMs), 'yyyy-MM-dd'),
        location: [...session.sites].filter(Boolean).join(' / '),
        time: `${format(new Date(session.startMs), 'HH:mm')}-${format(new Date(session.endMs), 'HH:mm')}`,
        status,
        reportId: matching?.id,
        reportType: matching?.source_report_type,
      };
    }).sort((a, b) => b.date.localeCompare(a.date) || a.officer.localeCompare(b.officer));
  }, [timeEntries, allUsers, filteredUsers, reports, periodStart, periodEnd]);

  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  if (reportsLoading || timeLoading) return <div className="py-8 text-center text-sm text-slate-500">Checking worked shifts and reports…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3"><div className="flex items-center gap-2 font-bold text-red-800"><AlertTriangle className="h-4 w-4" /> Missing</div><div className="mt-1 text-2xl font-black text-red-900">{counts.missing || 0}</div></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 font-bold text-amber-800"><Clock3 className="h-4 w-4" /> Pending review</div><div className="mt-1 text-2xl font-black text-amber-900">{(counts.pending || 0) + (counts.draft || 0)}</div></div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3"><div className="flex items-center gap-2 font-bold text-green-800"><CheckCircle2 className="h-4 w-4" /> Accepted</div><div className="mt-1 text-2xl font-black text-green-900">{counts.accepted || 0}</div></div>
      </div>

      {checks.length === 0 ? (
        <div className="py-8 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-green-500" /><p className="font-semibold text-green-700">No completed worked shifts require report review for this period.</p></div>
      ) : (
        <ScrollArea className="h-80">
          <div className="space-y-2 pr-2">
            {checks.map(item => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-bold text-slate-900">{item.officer}</p><p className="text-sm text-slate-600">{item.location} · {item.time}</p><p className="text-xs text-slate-500">{format(parseISO(item.date), 'EEEE, MMM d, yyyy')}</p></div>
                  <Badge className={item.status === 'accepted' ? 'bg-green-600' : item.status === 'missing' ? 'bg-red-600' : item.status === 'draft' ? 'bg-slate-600' : 'bg-amber-600'}>
                    {item.status === 'accepted' ? 'Accepted' : item.status === 'missing' ? 'Missing' : item.status === 'draft' ? 'Draft' : 'Pending review'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
