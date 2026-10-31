import { CheckCircle2, Globe2, ShieldQuestion } from 'lucide-react';

export default function BrowserDirectory({ entries = [], onOpen }) {
  if (!entries.length) return null;
  const approved = entries.filter(entry => entry.allowed);
  const restricted = entries.filter(entry => !entry.allowed);
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-cyan-300" />
        <h2 className="text-sm font-bold text-white">Company resources</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">Approved knowledge base, technical research and reference destinations.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {approved.map(entry => (
          <button
            key={entry.domain}
            type="button"
            onClick={() => onOpen(entry.domain, true, 'directory')}
            className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left transition hover:border-cyan-700 hover:bg-slate-900"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-white">{entry.domain}</span>
              <span className="block truncate text-[10px] text-slate-500">{entry.reason}</span>
            </span>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          </button>
        ))}
      </div>

      {restricted.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <ShieldQuestion className="h-3.5 w-3.5" /> Not available on your profile
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {restricted.slice(0, 8).map(entry => (
              <span key={entry.domain} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
                {entry.domain}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}