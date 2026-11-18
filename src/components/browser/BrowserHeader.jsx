import { Globe2, Lock, ShieldCheck } from 'lucide-react';
import { profileLabel, profileTone } from '@/lib/browserProfiles';

export default function BrowserHeader({ policy, engine, loading }) {
  return (
    <header className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-700 bg-cyan-500/10">
            <Globe2 className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight md:text-2xl">Company secure browser</h1>
            <p className="text-xs text-slate-400">Approved work research only</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Protected
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${profileTone(policy?.profile)}`}>
            <Lock className="h-3.5 w-3.5" />
            {loading ? 'Loading profile…' : profileLabel(policy?.profile)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        Company browsing policy is enforced. Search results and destinations are checked against your assigned profile
        {policy?.name ? ` (${policy.name})` : ''}
        {engine ? ` · ${engine}` : ''}.
      </p>
    </header>
  );
}