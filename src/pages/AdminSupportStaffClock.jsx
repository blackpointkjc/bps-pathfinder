import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Coffee, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const elapsedHours = (entry) => {
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
  const completedBreakMs = (entry.break_periods || []).reduce((total, period) => {
    if (!period?.start || !period?.end) return total;
    return total + Math.max(0, new Date(period.end).getTime() - new Date(period.start).getTime());
  }, 0);
  const activeBreakMs = entry.on_break && entry.break_started_at
    ? Math.max(0, Date.now() - new Date(entry.break_started_at).getTime())
    : 0;
  return Math.max(0, (end - start - completedBreakMs - activeBreakMs) / 3600000);
};

export default function AdminSupportStaffClock() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const rank = String(user?.rank || '').toLowerCase();
  const hasAccess = user?.role === 'admin' || roles.has('hr') || roles.has('trainer') || roles.has('full_access') || roles.has('support_staff') || ['support staff', 'human resources'].includes(rank);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['mySupportTimeEntries', user?.email],
    queryFn: async () => {
      const records = await base44.entities.TimeEntry.filter({ officer_email: user.email }, '-clock_in', 100);
      return records || [];
    },
    enabled: hasAccess && !!user?.email,
    refetchInterval: 5000,
    initialData: [],
  });

  const activeEntry = useMemo(() => entries.find(entry => !entry.clock_out), [entries]);
  const pastEntries = useMemo(() => entries.filter(entry => entry.clock_out).slice(0, 25), [entries]);
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Current User';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mySupportTimeEntries', user?.email] });

  const clockIn = useMutation({
    mutationFn: () => base44.entities.TimeEntry.create({
      officer_email: user.email,
      clock_in: new Date().toISOString(),
      location: 'Office - Administrative',
      clock_in_latitude: 0,
      clock_in_longitude: 0,
      on_break: false,
      break_periods: [],
    }),
    onSuccess: refresh,
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!activeEntry) return;
      const periods = [...(activeEntry.break_periods || [])];
      if (activeEntry.on_break && activeEntry.break_started_at) {
        periods.push({ start: activeEntry.break_started_at, end: new Date().toISOString() });
      }
      return base44.entities.TimeEntry.update(activeEntry.id, {
        clock_out: new Date().toISOString(),
        clock_out_latitude: 0,
        clock_out_longitude: 0,
        on_break: false,
        break_started_at: null,
        break_periods: periods,
      });
    },
    onSuccess: refresh,
  });

  const startBreak = useMutation({
    mutationFn: async () => {
      if (!activeEntry?.id) throw new Error('No active time entry was found');
      if (activeEntry.on_break) throw new Error('Break is already active');
      return base44.entities.TimeEntry.update(activeEntry.id, {
        on_break: true,
        break_started_at: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Break started');
    },
    onError: error => toast.error(error?.message || 'Unable to start break'),
  });

  const endBreak = useMutation({
    mutationFn: async () => {
      if (!activeEntry?.id) throw new Error('No active time entry was found');
      if (!activeEntry.on_break || !activeEntry.break_started_at) throw new Error('No active break was found');
      const ended = new Date().toISOString();
      return base44.entities.TimeEntry.update(activeEntry.id, {
        on_break: false,
        break_started_at: null,
        break_periods: [...(Array.isArray(activeEntry.break_periods) ? activeEntry.break_periods : []), { start: activeEntry.break_started_at, end: ended }],
      });
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Break ended');
    },
    onError: error => toast.error(error?.message || 'Unable to end break'),
  });

  if (!hasAccess) {
    return <div className="p-8 text-center"><h2 className="text-2xl font-bold">Support Clock Access Required</h2></div>;
  }

  return (
    <div className="min-h-full bg-[#0b1420] p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Support Staff Time Clock</h1>
          <p className="mt-1 text-slate-400">Personal time clock for {displayName}</p>
        </div>

        <Card className="border-slate-700 bg-slate-900/80 text-slate-100">
          <CardHeader><CardTitle>Current Status</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-950/50 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-white">{displayName}</p>
                  <Badge className={activeEntry ? activeEntry.on_break ? 'bg-amber-600' : 'bg-emerald-600' : 'bg-slate-700'}>
                    {activeEntry ? activeEntry.on_break ? 'ON UNPAID BREAK' : 'CLOCKED IN' : 'CLOCKED OUT'}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400">{user?.rank || 'Support Personnel'} · {user?.email}</p>
                {activeEntry && <p className="mt-2 text-sm text-slate-300">Clocked in {format(new Date(activeEntry.clock_in), 'MMM d, yyyy h:mm a')} · Paid time {elapsedHours(activeEntry).toFixed(2)} hrs</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!activeEntry && <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending} className="bg-emerald-600 hover:bg-emerald-700"><LogIn className="mr-2 h-4 w-4" />Clock In</Button>}
                {activeEntry && !activeEntry.on_break && <Button onClick={() => startBreak.mutate()} disabled={startBreak.isPending} className="bg-amber-600 hover:bg-amber-700"><Coffee className="mr-2 h-4 w-4" />Start Break</Button>}
                {activeEntry?.on_break && <Button onClick={() => endBreak.mutate()} disabled={endBreak.isPending} className="bg-blue-600 hover:bg-blue-700"><Coffee className="mr-2 h-4 w-4" />End Break</Button>}
                {activeEntry && <Button onClick={() => clockOut.mutate()} disabled={clockOut.isPending} variant="outline" className="border-red-600 text-red-300 hover:bg-red-950"><LogOut className="mr-2 h-4 w-4" />Clock Out</Button>}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Break time is unpaid and is automatically removed from paid hours.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900/80 text-slate-100">
          <CardHeader><CardTitle>Past Clock Entries</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-slate-400">Loading entries…</p> : pastEntries.length === 0 ? <p className="py-8 text-center text-slate-500">No completed clock entries yet.</p> : (
              <div className="space-y-3">
                {pastEntries.map(entry => (
                  <div key={entry.id} className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950/40 p-4 md:grid-cols-4">
                    <div><p className="text-xs uppercase text-slate-500">Date</p><p className="font-semibold">{format(new Date(entry.clock_in), 'MMM d, yyyy')}</p></div>
                    <div><p className="text-xs uppercase text-slate-500">Clock In</p><p>{format(new Date(entry.clock_in), 'h:mm a')}</p></div>
                    <div><p className="text-xs uppercase text-slate-500">Clock Out</p><p>{format(new Date(entry.clock_out), 'h:mm a')}</p></div>
                    <div><p className="text-xs uppercase text-slate-500">Paid Hours</p><p className="font-bold text-emerald-400">{elapsedHours(entry).toFixed(2)}</p></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}