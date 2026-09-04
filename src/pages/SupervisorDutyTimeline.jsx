import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Printer, ShieldCheck } from 'lucide-react';
import { openBlackPointReport } from '@/lib/reportPrint';

const lower = value => String(value || '').trim().toLowerCase();
const minutes = value => {
  const [hour = 0, minute = 0] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
};
const intervalFor = (dateValue, startValue, endValue) => {
  const date = String(dateValue || '').slice(0, 10);
  const start = new Date(`${date}T${String(startValue || '00:00').slice(0, 5)}:00`).getTime();
  let end = new Date(`${date}T${String(endValue || '00:00').slice(0, 5)}:00`).getTime();
  if (end <= start) end += 86400000;
  return [start, end];
};
const displayArea = value => value === 'ALL' ? 'All Sites' : value || 'All Sites';

export default function SupervisorDutyTimeline() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: users = [] } = useQuery({ queryKey: ['dutyTimelineUsers'], queryFn: () => listDirectoryUsers('last_name', 1000), staleTime: 60000 });
  const { data: assignments = [], isLoading, error } = useQuery({
    queryKey: ['supervisorDutyTimeline'],
    queryFn: () => base44.entities.DutySupervisorAssignment.list('-assignment_date', 1000),
    refetchInterval: 30000,
  });

  const personLabel = email => {
    const person = users.find(row => lower(row.email) === lower(email));
    return person ? [person.rank, person.last_name || person.first_name].filter(Boolean).join(' ') : email;
  };

  const groups = useMemo(() => {
    const dayStart = new Date(`${selectedDate}T00:00:00`).getTime();
    const dayEnd = dayStart + 86400000;
    const grouped = new Map();
    assignments.filter(row => lower(row.status) !== 'cancelled').forEach(row => {
      const [start, end] = intervalFor(row.assignment_date, row.start_time, row.end_time);
      if (!(start < dayEnd && dayStart < end)) return;
      const visibleStart = Math.max(start, dayStart);
      const visibleEnd = Math.min(end, dayEnd);
      const identity = lower(row.supervisor_email || row.supervisor_name);
      const key = [identity, visibleStart, visibleEnd].join('|');
      const current = grouped.get(key) || { ...row, visibleStart, visibleEnd, rows: [], locations: [] };
      current.rows.push(row);
      if (!current.locations.includes(row.location || 'ALL')) current.locations.push(row.location || 'ALL');
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => a.visibleStart - b.visibleStart || a.visibleEnd - b.visibleEnd || personLabel(a.supervisor_email).localeCompare(personLabel(b.supervisor_email)));
  }, [assignments, selectedDate, users]);

  const dayStart = new Date(`${selectedDate}T00:00:00`).getTime();
  const timelineHeight = 1440;
  const positionFor = group => ({
    top: `${((group.visibleStart - dayStart) / 60000)}px`,
    height: `${Math.max(44, (group.visibleEnd - group.visibleStart) / 60000)}px`,
  });
  const timeLabel = timestamp => {
    const value = new Date(timestamp);
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  };
  const moveDay = amount => setSelectedDate(format(addDays(new Date(`${selectedDate}T12:00:00`), amount), 'yyyy-MM-dd'));
  const printTimeline = () => openBlackPointReport({
    title: 'Daily Duty Supervisor Roster',
    subtitle: 'BlackPoint Command Coverage',
    status: 'Published',
    meta: [
      { label: 'Duty Date', value: format(new Date(`${selectedDate}T12:00:00`), 'EEEE, MMMM d, yyyy') },
      { label: 'Coverage Blocks', value: String(groups.length) },
    ],
    sections: [{
      title: '24-Hour Duty Coverage',
      fields: groups.length ? groups.map(group => ({
        label: `${timeLabel(group.visibleStart)}–${timeLabel(group.visibleEnd)}`,
        value: `${group.supervisor_name || personLabel(group.supervisor_email)}\n${group.locations.map(displayArea).join(' • ')}${group.notes ? `\n${group.notes}` : ''}`,
        wide: true,
      })) : [{ label: 'Coverage', value: 'No duty supervisor coverage is scheduled for this date.', wide: true }],
    }],
    officer: { name: user?.full_name || user?.email || 'Supervisor' },
    footerNote: 'Official BlackPoint daily duty supervisor command roster.',
  });

  return (
    <div className="bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[.24em] text-cyan-300">Supervisor Command</div>
              <h1 className="mt-2 text-3xl font-black">Daily Duty Timeline</h1>
              <p className="mt-2 text-sm text-slate-400">All duty supervisors covering the selected calendar day, displayed from 00:00 through 24:00.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => moveDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}>TODAY</Button>
              <Button variant="outline" onClick={() => moveDay(1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button onClick={printTimeline} className="bg-cyan-700 hover:bg-cyan-600"><Printer className="mr-2 h-4 w-4" />PRINT</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#09111d] px-3 py-2">
              <CalendarDays className="h-4 w-4 text-cyan-300" />
              <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className="bg-transparent text-sm font-bold text-white outline-none" />
            </div>
            <Badge variant="outline">{groups.length} COVERAGE BLOCK{groups.length === 1 ? '' : 'S'}</Badge>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/25 p-4 text-sm text-red-200">Duty coverage could not load: {error.message}</div>}

        <section className="overflow-hidden rounded-[26px] border border-slate-700/80 bg-[#0d1420] shadow-xl">
          <div className="border-b border-slate-700 px-5 py-4">
            <div className="font-black">{format(new Date(`${selectedDate}T12:00:00`), 'EEEE, MMMM d, yyyy')}</div>
            <div className="mt-1 text-xs text-slate-500">Times are shown in 24-hour format. Overnight coverage from the prior date carries into this timeline.</div>
          </div>
          {isLoading ? <div className="p-10 text-center text-sm text-slate-500">Loading duty coverage…</div> : (
            <div className="overflow-x-auto p-4">
              <div className="relative min-w-[680px]" style={{ height: timelineHeight }}>
                {Array.from({ length: 25 }, (_, hour) => (
                  <div key={hour} className="absolute left-0 right-0 border-t border-slate-800" style={{ top: hour * 60 }}>
                    <span className="-translate-y-1/2 inline-block w-16 bg-[#0d1420] pr-3 text-right font-mono text-[10px] font-bold text-slate-500">{String(hour).padStart(2, '0')}:00</span>
                  </div>
                ))}
                <div className="absolute bottom-0 left-20 right-3 top-0 border-x border-slate-800 bg-[#09111d]/60">
                  {groups.map((group, index) => (
                    <div key={`${group.supervisor_email}-${group.visibleStart}-${group.visibleEnd}`} style={positionFor(group)} className="absolute left-3 right-3 overflow-hidden rounded-xl border border-cyan-700/60 bg-cyan-950/90 px-3 py-2 shadow-lg">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-black text-cyan-50">{group.supervisor_name || personLabel(group.supervisor_email)}</div>
                            <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-cyan-300"><Clock3 className="h-3 w-3" />{timeLabel(group.visibleStart)}–{timeLabel(group.visibleEnd)}</div>
                          </div>
                          <div className="mt-1 flex items-start gap-1 text-[10px] text-slate-300"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span>{group.locations.map(displayArea).join(' • ')}</span></div>
                          {group.notes && <div className="mt-1 text-[10px] text-slate-400">{group.notes}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {groups.length === 0 && <div className="absolute inset-x-4 top-20 rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No duty supervisor coverage is scheduled for this date.</div>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
