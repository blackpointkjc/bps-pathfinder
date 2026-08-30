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

export default function AdminQRCenter() {
  const [tool, setTool] = useState('checkpoints');
  const Active = tool === 'print' ? AdminQRPrintManager : tool === 'duty' ? AdminPropertyDutyRules : AdminQRCheckpoints;
  return (
    <div className="bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.24em] text-cyan-300"><QrCode className="h-4 w-4"/>Patrol Management</div><h1 className="mt-2 text-3xl font-black md:text-4xl">Patrol & Duty Rules</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">QR checkpoint tools and Property Duty Rules share this workspace as separate sub-tabs. QR Patrol Reports remain in Admin Report Review.</p></div>
            <div className="flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-slate-700 bg-[#09111d] p-1.5">{tools.map(item=>{const Icon=item.icon;const active=tool===item.id;return <button key={item.id} type="button" onClick={()=>setTool(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black transition ${active?'border-cyan-500/60 bg-cyan-500/15 text-cyan-100':'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'}`}><Icon className="h-4 w-4"/>{item.label}</button>})}</div>
          </div>
        </section>
        <section className="overflow-hidden rounded-[28px] border border-slate-700/80 bg-[#0b121d] shadow-2xl"><Active embedded /></section>
      </div>
    </div>
  );
}
