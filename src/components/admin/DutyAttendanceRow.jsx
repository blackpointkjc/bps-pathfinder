import { ChevronDown, ChevronRight, CalendarDays, MapPin } from 'lucide-react';

const scoreTone = score => {
  if (score == null) return 'border-slate-600 bg-slate-800/40 text-slate-300';
  if (score >= 90) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (score >= 75) return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-red-500/40 bg-red-500/10 text-red-200';
};

const scoreLabel = score => score == null ? 'No obligation' : `${score}%`;

export default function DutyAttendanceRow({ row, expanded, onToggle }) {
  const { officer, jobDuty, attendance, missedDuties } = row;
  const name = officer.full_name || [officer.first_name, officer.last_name].filter(Boolean).join(' ') || officer.email;
  const callOuts = attendance?.items || [];

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1a2a]">
      <button type="button" onClick={onToggle} className="flex w-full flex-col gap-3 px-4 py-3 text-left sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-cyan-300" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{name}</div>
            <div className="truncate text-xs text-slate-400">{officer.rank || 'Officer'}{officer.unit_number ? ` · Unit ${officer.unit_number}` : ''}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          <div className={`rounded-lg border px-3 py-1.5 text-center ${scoreTone(jobDuty?.score)}`}>
            <div className="text-sm font-black">{scoreLabel(jobDuty?.score)}</div>
            <div className="text-[10px] font-bold opacity-80">Job duty</div>
          </div>
          <div className={`rounded-lg border px-3 py-1.5 text-center ${scoreTone(attendance?.score)}`}>
            <div className="text-sm font-black">{scoreLabel(attendance?.score)}</div>
            <div className="text-[10px] font-bold opacity-80">Attendance</div>
          </div>
          <div className="rounded-lg border border-slate-700 px-3 py-1.5 text-center text-slate-200">
            <div className="text-sm font-black">{attendance?.count || 0}</div>
            <div className="text-[10px] font-bold text-slate-400">Call-outs</div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-800 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-[#0a1421] px-3 py-2 text-xs text-slate-300">
              DAR <span className="font-black text-white">{jobDuty?.dailyActivity.completed || 0}/{jobDuty?.dailyActivity.required || 0}</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0a1421] px-3 py-2 text-xs text-slate-300">
              Incident <span className="font-black text-white">{jobDuty?.incidentReports.completed || 0}/{jobDuty?.incidentReports.required || 0}</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0a1421] px-3 py-2 text-xs text-slate-300">
              QR <span className="font-black text-white">{jobDuty?.qrCompliance.completed || 0}/{jobDuty?.qrCompliance.required || 0}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-[.14em] text-amber-300">Missed job duties ({missedDuties.length})</div>
            <div className="mt-2 space-y-1.5">
              {missedDuties.length ? missedDuties.map((item, index) => (
                <div key={`${item.date}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
                  <CalendarDays className="h-3.5 w-3.5 text-amber-300" />
                  <span className="font-bold text-white">{item.date || 'Date missing'}</span>
                  <MapPin className="h-3.5 w-3.5 text-slate-500" />
                  <span className="truncate">{item.property || 'Assigned post'}</span>
                  <span className="w-full text-slate-400 sm:w-auto">{item.label}</span>
                </div>
              )) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-emerald-300">No missed required duties in this period.</div>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-[.14em] text-cyan-300">Call-out attendance ({callOuts.length})</div>
            <div className="mt-2 space-y-1.5">
              {callOuts.length ? callOuts.map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
                  <span className="font-bold text-white">{item.call_out_date || 'Date missing'}{item.call_out_time ? ` · ${item.call_out_time}` : ''}</span>
                  <span className="truncate">{item.location || 'Scheduled assignment'}</span>
                  <span className="w-full text-slate-400 sm:w-auto">{item.reason || 'Reason not recorded'}{item.supervisor_name ? ` · ${item.supervisor_name}` : ''}</span>
                </div>
              )) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-emerald-300">No call-outs recorded in this period.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}