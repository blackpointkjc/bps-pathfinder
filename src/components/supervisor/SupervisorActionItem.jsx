import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, MapPin, UserCheck } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { actionItemAgeDays } from '@/lib/supervisorActionItems';

const PRIORITY_TONE = {
  critical: 'border-red-500/40 bg-red-500/15 text-red-200',
  high: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
  normal: 'border-slate-600 bg-slate-800/60 text-slate-300',
  low: 'border-slate-700 bg-slate-900 text-slate-400',
};

const GROUP_TONE = {
  duty: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  reports: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  conduct: 'border-red-500/30 bg-red-500/10 text-red-200',
  reviews: 'border-purple-500/30 bg-purple-500/10 text-purple-200',
  live: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const GROUP_LABEL = {
  duty: 'Duty & attendance',
  reports: 'Report review',
  conduct: 'Conduct',
  reviews: 'Performance review',
  live: 'Live operations',
};

export default function SupervisorActionItem({ item, groupLabel, showAssignee, onComplete, completing }) {
  const [open, setOpen] = useState(false);
  const findings = item.findings || [];
  const age = actionItemAgeDays(item);
  const visibleFindings = open ? findings : findings.slice(0, 2);

  return (
    <div className={`rounded-xl border bg-[#0b1624] ${item.priority === 'critical' ? 'border-red-500/40' : 'border-slate-800'}`}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${GROUP_TONE[item.group] || GROUP_TONE.duty}`}>
              {GROUP_LABEL[item.group] || groupLabel || 'Action'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${PRIORITY_TONE[item.priority] || PRIORITY_TONE.normal}`}>
              {item.priority || 'normal'}
            </span>
            {age >= 3 && <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-orange-200">{age} days open</span>}
            {item.period && <span className="text-[10px] font-bold text-slate-500">{item.period}</span>}
          </div>
          <div className="mt-1.5 text-sm font-black text-white">{item.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 font-bold text-slate-200"><UserCheck className="h-3.5 w-3.5 text-slate-500" />{item.person || 'Officer'}</span>
            {item.detail && <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5 text-slate-500" />{item.detail}</span>}
            {showAssignee && item.assignedTo && <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Assigned: {item.assignedTo}</span>}
          </div>

          {!!findings.length && (
            <div className="mt-2 space-y-1">
              {visibleFindings.map((finding, index) => (
                <div key={`${item.id}-finding-${index}`} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-slate-800 bg-[#081220] px-2.5 py-1.5 text-[11px] text-slate-300">
                  <span className="font-bold text-slate-100">{finding.label}</span>
                  {finding.date && <span className="text-slate-500">{finding.date}</span>}
                  {finding.property && <span className="inline-flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" />{finding.property}</span>}
                </div>
              ))}
              {findings.length > 2 && (
                <button type="button" onClick={() => setOpen(current => !current)} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200">
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {open ? 'Show less' : `Show all ${findings.length} findings`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
          <button
            type="button"
            onClick={() => onComplete(item)}
            disabled={completing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-wait disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />{completing ? 'Saving…' : 'Mark contacted'}
          </button>
          {item.tool && (
            <Link to={createPageUrl(item.tool.page)} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-700 bg-[#101f31] px-3 text-[11px] font-bold text-slate-200 transition hover:border-cyan-500/50 hover:text-white">
              {item.tool.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}