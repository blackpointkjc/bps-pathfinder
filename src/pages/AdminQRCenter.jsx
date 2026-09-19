import { useState } from 'react';
import { MapPin, Printer, QrCode, Settings2 } from 'lucide-react';
import AdminQRCheckpoints from './AdminQRCheckpoints';
import AdminQRPrintManager from './AdminQRPrintManager';
import AdminPropertyDutyRules from './AdminPropertyDutyRules';

const tools = [
  { id: 'checkpoints', label: 'QR Checkpoints', icon: MapPin },
  { id: 'duty', label: 'Property Duty Rules', icon: Settings2 },
  { id: 'print', label: 'QR Print Manager', icon: Printer },
];

export default function AdminQRCenter({ embedded = false }) {
  const [tool, setTool] = useState('duty');
  const Active = tool === 'print' ? AdminQRPrintManager : tool === 'duty' ? AdminPropertyDutyRules : AdminQRCheckpoints;
  return (
    <div className={embedded ? "bps-command-page min-h-0 bg-[#07111d] p-2 text-white" : "bps-command-page min-h-full bg-[#07111d] p-3 text-white md:p-5"}>
      <div className="mx-auto max-w-[1700px] space-y-3">
        <section className="rounded-2xl border border-slate-700/80 bg-[#0b1725] p-3 shadow-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-cyan-300"><QrCode className="h-4 w-4"/>Patrol Management</div><h1 className="mt-1 text-xl font-black sm:text-2xl">Patrol & Duty Rules</h1><p className="mt-1 text-xs text-slate-400">Checkpoints, property duty rules, and QR print tools in one workspace.</p></div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-xl border border-slate-700 bg-[#08131f] p-1">{tools.map(item=>{const Icon=item.icon;const active=tool===item.id;return <button key={item.id} type="button" onClick={()=>setTool(item.id)} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-black transition ${active?'border-cyan-500/60 bg-cyan-500/15 text-cyan-100':'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'}`}><Icon className="h-3.5 w-3.5"/>{item.label}</button>})}</div>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0b121d] shadow-xl"><Active embedded /></section>
      </div>
    </div>
  );
}
