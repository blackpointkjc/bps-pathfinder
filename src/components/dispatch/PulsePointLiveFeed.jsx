import { useState } from 'react';
const feedUrl = 'https://web.pulsepoint.org/?agencies=76000,EMS1402';
export default function PulsePointLiveFeed() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded border border-cyan-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-cyan-200">PulsePoint live feed</button>
    {open && <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="PulsePoint live feed">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-100">
        <div><strong>PulsePoint · Richmond and Chesterfield</strong><p className="text-xs text-slate-400">Official live view. Automatic import into CAD requires an approved feed connection.</p></div>
        <div className="flex gap-3"><a href={feedUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">Open PulsePoint</a><button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-500 px-3 py-1">Close</button></div>
      </div>
      <iframe src={feedUrl} title="PulsePoint Respond for Web — Richmond and Chesterfield" className="min-h-0 w-full flex-1 rounded border border-slate-700 bg-white" allowFullScreen />
    </div>}
  </>;
}
