import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
export default function InlineSection({id,title,description,children,initialOpen=false}){
 const [open,setOpen]=useState(initialOpen);
 return <section id={id} className="scroll-mt-24 overflow-hidden rounded-xl border border-slate-700 bg-[#0b1522]">
  <button type="button" aria-expanded={open} aria-controls={id+'-content'} onClick={()=>setOpen(value=>!value)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-800/40">
   {open?<ChevronDown className="h-4 w-4 text-cyan-300"/>:<ChevronRight className="h-4 w-4 text-slate-400"/>}
   <span><strong className="block text-sm text-white">{title}</strong><span className="mt-1 block text-xs text-slate-400">{description}</span></span>
  </button>
  {open&&<div id={id+'-content'} className="min-w-0 border-t border-slate-700 p-3">{children}</div>}
 </section>;
}
