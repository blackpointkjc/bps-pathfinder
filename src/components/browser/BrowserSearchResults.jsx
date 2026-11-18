import { Ban, CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react';
import { browserCategoryLabel } from '@/lib/browserProfiles';

export default function BrowserSearchResults({ results = [], busyDomain = '', onOpen, onRequest }) {
  if (!results.length) return null;
  return (
    <div className="space-y-2">
      {results.map(result => (
        <article
          key={result.url}
          className={`rounded-xl border p-3 md:p-4 ${result.allowed ? 'border-slate-700 bg-slate-900' : 'border-slate-800 bg-slate-950/70'}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="break-words text-[11px] font-semibold uppercase tracking-wide text-slate-500">{result.domain}</p>
              <h3 className="mt-1 break-words text-sm font-bold text-white md:text-[15px]">{result.title}</h3>
              {result.snippet && <p className="mt-1 text-xs leading-5 text-slate-400">{result.snippet}</p>}
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                result.allowed ? 'border-emerald-700 bg-emerald-500/10 text-emerald-200' : 'border-red-800 bg-red-500/10 text-red-200'
              }`}
            >
              {result.allowed ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
              {result.allowed ? 'Approved' : 'Blocked'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
              {result.category ? browserCategoryLabel(result.category) : 'Reference'}
            </span>
            {result.allowed ? (
              <button
                type="button"
                onClick={() => onOpen(result.url, true, 'search')}
                disabled={busyDomain === result.domain}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-700 bg-cyan-600/15 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-600/25 disabled:opacity-60"
              >
                {busyDomain === result.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Open source
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(result.url, false, 'search')}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  Try anyway
                </button>
                <button
                  type="button"
                  onClick={() => onRequest(result.domain)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
                >
                  <Send className="h-3.5 w-3.5" /> Request access
                </button>
              </>
            )}
          </div>
          {!result.allowed && result.reason && <p className="mt-2 text-[11px] leading-5 text-slate-500">{result.reason}</p>}
        </article>
      ))}
    </div>
  );
}