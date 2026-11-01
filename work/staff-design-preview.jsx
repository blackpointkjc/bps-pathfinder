import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import '@/lib/AuthContext';
import {base44} from '@/api/base44Client';
import ProfessionalStandards from '@/pages/ProfessionalStandards';
import '@/index.css';
import '@/globals.css';
const rows=[
{id:'design1',reference:'PS-2026-EXAMPLE-01',kind:'complaint',officers:'Example Officer',location:'Sample assignment',status:'new',priority:'normal',investigator_id:'',created_date:'2026-11-01T10:00:00Z',version:1,description:'Synthetic design preview only.'},
{id:'design2',reference:'PS-2026-EXAMPLE-02',kind:'complaint',officers:'Example Officer',location:'Sample assignment',status:'investigating',priority:'high',investigator_id:'reviewer',due_date:'2026-11-06',created_date:'2026-10-30T10:00:00Z',version:1,description:'Synthetic design preview only.'},
{id:'design3',reference:'PS-2026-EXAMPLE-03',kind:'commendation',officers:'Example Officer',location:'Sample assignment',status:'pending_review',priority:'normal',investigator_id:'reviewer',due_date:'2026-11-04',created_date:'2026-10-29T10:00:00Z',version:1,description:'Synthetic design preview only.'}
];
const user={id:'reviewer',role:'admin',rank:'Colonel',last_name:'Example',additional_roles:['ia'],ps_role:'reviewer'};
base44.functions.invoke=async(name,payload)=>{
if(name!=='professionalStandards')return {data:{success:true,delivered:0,failed:0}};
if(payload.action==='get')return {data:{case:rows.find(r=>r.id===payload.case_id),records:[],audit:[],staff:[{id:'reviewer',name:'Example Investigator'}]}};
return {data:{cases:rows,staff:[{id:'reviewer',name:'Example Investigator'}],findings:{sustained:1,not_sustained:2},has_more:false,events:[]}};
};
const Context=globalThis.__BPS_PATHFINDER_AUTH_CONTEXT__;
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/ProfessionalStandards?ps_area=investigations&section=cases']}><Context.Provider value={{user}}><div className="bg-[#050a12] text-white"><div className="flex h-14 items-center gap-4 border-b border-slate-700 px-4"><span className="font-black text-cyan-300">PATHFINDER</span><span className="rounded border border-blue-500 bg-blue-950 px-3 py-2 text-xs font-bold">⌂ Administration Main</span><span className="text-xs text-slate-400">STAFF WORKSPACE · DESIGN PREVIEW</span></div><ProfessionalStandards/></div></Context.Provider></MemoryRouter>);
