import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GraduationCap, Users, BookOpen, ShieldCheck, ClipboardCheck, FileText, Search } from 'lucide-react';
import ManageStudents from './ManageStudents';
import AdminTrainingCompliance from './AdminTrainingCompliance';
import TrainingRecords from './TrainingRecords';
import AdminTraining from './AdminTraining';
import AdminDocuments from './AdminDocuments';
import TrainerOverview from './TrainerOverview';

const workflows = [
 {id:'students',title:'Students & Approvals',detail:'Invite, review, and approve students',Icon:Users,View:ManageStudents},
 {id:'compliance',title:'Certification Reviews',detail:'Review officer files, renewals, and compliance',Icon:ShieldCheck,View:AdminTrainingCompliance},
 {id:'courses',title:'Build & Assign Training',detail:'Create lessons, courses, and assignments',Icon:GraduationCap,View:AdminTraining},
 {id:'classes',title:'Classes & Certificates',detail:'Manage rosters, completions, and certificates',Icon:BookOpen,View:TrainingRecords},
 {id:'documents',title:'Training Resources',detail:'Documents and training policies',Icon:FileText,View:AdminDocuments},
 {id:'overview',title:'Activity & Reporting',detail:'Review workload, metrics, and submissions',Icon:ClipboardCheck,View:TrainerOverview},
];

export default function TrainerCenter({embedded=false}) {
 const [params,setParams] = useSearchParams();
 const sectionKey=embedded?'trainer_section':'section';
 const selected=workflows.find(w=>w.id===params.get(sectionKey))||workflows[0];
 const [filter,setFilter]=useState('');
 const choose=id=>{const next=new URLSearchParams(params);next.set(sectionKey,id);setParams(next,{replace:true});};
 const View=selected.View;
 return <div className="min-h-full bg-[#080d18] text-slate-100">
  <header className="border-b border-violet-600/20 bg-gradient-to-r from-[#1d1539] to-[#0a1728] px-4 py-5 md:px-7">
   <div className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">Black Point · Training Department</div>
   <h1 className="mt-1 text-3xl font-black">Trainer Workbench</h1>
   <p className="mt-1 text-sm text-slate-400">One workspace, organized around the job you need to finish—not a collection of separate dashboards.</p>
  </header>
  <div className="flex flex-col lg:min-h-[70vh] lg:flex-row">
   <aside className="w-full shrink-0 border-b border-slate-800 bg-[#0b1524] p-3 lg:w-[290px] lg:border-b-0 lg:border-r">
    <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-500"/><input aria-label="Find trainer workflow" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find a workflow…" className="h-10 w-full bg-transparent text-sm text-white outline-none"/></label>
    <nav aria-label="Trainer workflows" className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
    {workflows.filter(w=>(w.title+' '+w.detail).toLowerCase().includes(filter.toLowerCase())).map(w=><button type="button" key={w.id} onClick={()=>choose(w.id)} aria-current={selected.id===w.id?'page':undefined} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selected.id===w.id?'border-violet-500/60 bg-violet-500/20 text-white':'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/50'}`}><w.Icon className="h-5 w-5 shrink-0 text-violet-300"/><span><span className="block text-sm font-bold">{w.title}</span><span className="block text-[11px] text-slate-400">{w.detail}</span></span></button>)}
    </nav>
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">Student approvals, officer certification reviews, and course creation have their own clearly named work areas. You do not need to return to a dashboard between tasks.</div>
   </aside>
   <main className="min-w-0 flex-1"><div className="border-b border-slate-800 bg-[#101a2a] px-4 py-4 md:px-6"><div className="text-[10px] font-black uppercase tracking-widest text-violet-300">Current task</div><h2 className="mt-1 text-xl font-black">{selected.title}</h2><p className="text-xs text-slate-400">{selected.detail}</p></div><div className={selected.id === 'overview' ? '' : 'min-w-0 bg-slate-50 text-slate-900'}><View embedded /></div></main>
  </div>
 </div>;
}