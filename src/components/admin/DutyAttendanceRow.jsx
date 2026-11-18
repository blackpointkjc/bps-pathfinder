import { ChevronDown, ChevronRight } from 'lucide-react';
import { getRankLastName } from '@/utils/officerDisplay';
import DutyAttendanceItem from '@/components/admin/DutyAttendanceItem';

const scoreTone = score => {
  if (score == null) return 'border-slate-600 bg-slate-800/40 text-slate-300';
  if (score >= 90) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (score >= 75) return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-red-500/40 bg-red-500/10 text-red-200';
};

const scoreLabel = score => score == null ? 'No obligation' : `${score}%`;

export default function DutyAttendanceRow({ row, expanded, onToggle, onExempt, onRestore, savingKey }) {
  const { officer, jobDuty, attendance, missedDuties = [], callOutItems = [], exemptionReasons = {} } = row;
  const name = getRankLastName(officer, officer?.email || 'Unknown officer');
  const exempted = row.exemptions?.length || 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1a2a]">
      <button type="button" onClick={onToggle} className="flex w-full flex-col gap-3 px-4 py-3 text-left sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-cyan-300" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{name}</div>
            <div className="truncate text-xs text-slate-400">
              {officer.unit_number ? `Unit ${officer.unit_number}` : 'No unit assigned'}
              {exempted ? ` · ${exempted} exempted` : ''}
            </div>
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
            <div className="text-[11px] font-black uppercase tracking-[.14em] text-amber-300">Job duty items ({missedDuties.length})</div>
            <div className="mt-2 space-y-1.5">
              {missedDuties.length ? missedDuties.map(item => (
                <DutyAttendanceItem
                  key={item.key || `${item.date}-${item.label}`}
                  item={item}
                  reason={exemptionReasons[item.key] || ''}
                  saving={savingKey === item.key}
                  onExempt={reason => onExempt(officer, item, reason)}
                  onRestore={() => onRestore(officer, item)}
                />
              )) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-emerald-300">No outstanding job duties in this period.</div>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-[.14em] text-cyan-300">Call-out attendance ({callOutItems.length})</div>
            <div className="mt-2 space-y-1.5">
              {callOutItems.length ? callOutItems.map(item => (
                <DutyAttendanceItem
                  key={item.key}
                  item={{
                    key: item.key,
                    exempt: item.exempt,
                    date: item.call_out_date,
                    property: item.location,
                    label: `${item.call_out_time ? `${item.call_out_time} · ` : ''}${item.reason || 'Reason not recorded'}${item.supervisor_name ? ` · ${item.supervisor_name}` : ''}`,
                  }}
                  reason={exemptionReasons[item.key] || ''}
                  saving={savingKey === item.key}
                  onExempt={reason => onExempt(officer, { ...item, item_type: 'call_out', date: item.call_out_date, property: item.location, label: item.reason || 'Call-out' }, reason)}
                  onRestore={() => onRestore(officer, { key: item.key, item_type: 'call_out' })}
                />
              )) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-emerald-300">No call-outs recorded in this period.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}