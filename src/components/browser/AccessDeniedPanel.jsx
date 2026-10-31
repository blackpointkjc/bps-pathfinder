import { ExternalLink, MessageSquarePlus, ShieldX, X } from 'lucide-react';
import { browserCategoryLabel } from '@/lib/browserProfiles';

export default function AccessDeniedPanel({ state, onDismiss, onRequest }) {
  if (!state) return null;
  const { url, decision } = state;
  const allowed = Boolean(decision?.allowed);
  return (
    <section className="rounded-2xl border border-red-800/70 bg-red-950/25 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-700 bg-red-500/10">
            <ShieldX className="h-5 w-5 text-red-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white md:text-base">
              {allowed ? 'Destination approved' : 'Access denied by company policy'}
            </h2>
            <p className="text-[11px] text-red-200/80">{decision?.domain || url}</p>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <dt className="text-[10px] uppercase tracking-wide text-slate-500">Category</dt>
          <dd className="mt-0.5 text-slate-200">{browserCategoryLabel(decision?.category)}</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <dt className="text-[10px] uppercase tracking-wide text-slate-500">Policy basis</dt>
          <dd className="mt-0.5 text-slate-200">{decision?.basis || 'Company browser policy'}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-5 text-slate-300">{decision?.reason || 'This destination is not approved for your browsing profile.'}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {allowed ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-600/20 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/30"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open approved site
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onRequest(decision?.domain || url)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Request temporary access
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500"
        >
          Back to search
        </button>
      </div>
    </section>
  );
}