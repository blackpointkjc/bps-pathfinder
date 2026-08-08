import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock3, FileText, AlertTriangle } from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

const normalizeSite = value => String(value || '').split(':')[0].trim().toLowerCase();
const officerLabel = officer => {
  const rank = String(officer?.rank || '').trim();
  const last = String(officer?.last_name || '').trim();
  return [rank, last].filter(Boolean).join(' ') || officer?.email || 'Unknown officer';
};

export default function MissingReportsCheck({ schedules, allUsers = [], filteredUsers = [], weekStart, weekEnd }) {
  const currentWeekStart = weekStart || startOfWeek(new Date(), { weekStartsOn: 0 });
  const currentWeekEnd = weekEnd || endOfWeek(new Date(), { weekStartsOn: 0 });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['allDailyActivityReports', format(currentWeekStart, 'yyyy-MM-dd'), format(currentWeekEnd, 'yyyy-MM-dd')],
    queryFn: () => base44.entities.DailyActivityReport.list('-report_date'),
    refetchInterval: 15000,
  });

  const checks = useMemo(() => {
    if (!schedules) return [];
    const start = format(currentWeekStart, 'yyyy-MM-dd');
    const end = format(currentWeekEnd, 'yyyy-MM-dd');
    const usersByEmail = new Map((allUsers.length ? allUsers : filteredUsers).map(user => [String(user.email || '').toLowerCase(), user]));

    const shiftHasEnded = shift => {
      if (!shift?.shift_date || !shift?.start_time || !shift?.end_time) return false;
      const [startHour = 0, startMinute = 0] = String(shift.start_time).split(':').map(Number);
      const [endHour = 0, endMinute = 0] = String(shift.end_time).split(':').map(Number);
      const startDateTime = new Date(`${shift.shift_date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`);
      const endDateTime = new Date(`${shift.shift_date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`);
      const overnight = endHour * 60 + endMinute <= startHour * 60 + startMinute;
      if (overnight) endDateTime.setDate(endDateTime.getDate() + 1);
      return Number.isFinite(startDateTime.getTime()) && Number.isFinite(endDateTime.getTime()) && Date.now() >= endDateTime.getTime();
    };

    return schedules
      .filter(shift => shift.shift_date >= start && shift.shift_date <= end && shiftHasEnded(shift) && shift.officer_email && shift.officer_email !== 'OPEN')
      .map(shift => {
        const email = String(shift.officer_email || '').toLowerCase();
        const officer = usersByEmail.get(email);
        const matching = reports
          .filter(report => {
            const sameOfficer = officer?.id
              ? String(report.created_by_id || '') === String(officer.id)
              : false;
            return sameOfficer && report.report_date === shift.shift_date && normalizeSite(report.location) === normalizeSite(shift.location);
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
          id: `${email}-${shift.shift_date}-${shift.location}-${shift.start_time}`,
          officer: officerLabel(officer),
          email,
          date: shift.shift_date,
          location: String(shift.location || '').split(':')[0],
          time: `${shift.start_time || ''}-${shift.end_time || ''}`,
          status,
          reportId: matching?.id,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.officer.localeCompare(b.officer));
  }, [schedules, allUsers, filteredUsers, reports, currentWeekStart, currentWeekEnd]);

  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) return <div className="py-8 text-center text-sm text-slate-500">Checking scheduled shifts and reports…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3"><div className="flex items-center gap-2 font-bold text-red-800"><AlertTriangle className="h-4 w-4" /> Missing</div><div className="mt-1 text-2xl font-black text-red-900">{counts.missing || 0}</div></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 font-bold text-amber-800"><Clock3 className="h-4 w-4" /> Pending review</div><div className="mt-1 text-2xl font-black text-amber-900">{(counts.pending || 0) + (counts.draft || 0)}</div></div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3"><div className="flex items-center gap-2 font-bold text-green-800"><CheckCircle2 className="h-4 w-4" /> Accepted</div><div className="mt-1 text-2xl font-black text-green-900">{counts.accepted || 0}</div></div>
      </div>

      {checks.length === 0 ? (
        <div className="py-8 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-green-500" /><p className="font-semibold text-green-700">No completed scheduled shifts require review for this week.</p></div>
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
