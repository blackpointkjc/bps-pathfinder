from pathlib import Path
p=Path('src/pages/ManageClients.jsx');s=p.read_text();s="import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';\n"+s
# useState already imported
s=s.replace('export default function ManageClients() {','export default function ManageClients() {\n  const [clientSearch,setClientSearch]=useState("");\n  const [propertyFilter,setPropertyFilter]=useState("all");')
a=s.index('        <div className="flex justify-between items-center flex-wrap gap-4">');b=s.index('      {/*',a) if '      {/*' in s[a:] else -1
# Only replace directory card, preserve complete original dialog.
end=s.index('\n      <Dialog',a)
tail=s[a:end];close=tail.rfind('      </div>');assert close>0
s=s[:a]+"""        <WorkspaceHeader eyebrow="Administration / Client services" title="Manage Clients" description="Client contacts, portfolio access and property assignments." metrics={[
          {label:'Client accounts',value:clientUsers?.length||0},
          {label:'Properties assigned',value:new Set((clientUsers||[]).flatMap(c=>[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean))).size}
        ]}/>
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <Input aria-label="Search client accounts" placeholder="Search client name, email or phone" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} className="min-w-48 flex-1 border-slate-600 bg-slate-950 text-white"/>
          <select aria-label="Filter clients by property" value={propertyFilter} onChange={e=>setPropertyFilter(e.target.value)} className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="all">All properties</option>{[...new Set((clientUsers||[]).flatMap(c=>[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean)))].sort().map(site=><option key={site}>{site}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
          <table className="w-full text-left text-sm"><thead className="border-b border-slate-700 bg-slate-950 text-xs uppercase text-slate-400"><tr><th className="p-4">Client contact</th><th className="p-4">Portfolio access</th><th className="p-4">Contact details</th><th className="p-4 text-right">Manage</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{(clientUsers||[]).filter(c=>{
            const sites=[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean);
            return (propertyFilter==='all'||sites.includes(propertyFilter))&&[c.first_name,c.last_name,c.email,c.mobile_phone].join(' ').toLowerCase().includes(clientSearch.toLowerCase());
          }).map(client=><tr key={client.id} className="align-top hover:bg-slate-800/60">
            <td className="p-4"><div className="font-semibold text-white">{[client.first_name,client.last_name].filter(Boolean).join(' ')||client.email}</div><div className="mt-1 text-xs text-cyan-300">Client</div></td>
            <td className="p-4"><div className="flex max-w-md flex-wrap gap-1">{[...new Set([...(client.assigned_locations||[]),...(client.assigned_sites||[]),client.assigned_location].filter(Boolean))].map(site=><span key={site} className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200">{site}</span>)}</div></td>
            <td className="p-4 text-slate-300"><a className="block break-all text-cyan-200 hover:underline" href={'mailto:'+client.email}>{client.email}</a>{client.mobile_phone&&<a className="mt-1 block hover:underline" href={'tel:'+client.mobile_phone}>{client.mobile_phone}</a>}</td>
            <td className="p-4"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>handleEdit(client)}>Edit access</Button><Button aria-label={'Remove '+client.email} variant="ghost" size="sm" onClick={()=>handleDelete(client.id)} className="text-red-300"><Trash2 className="h-4 w-4"/></Button></div></td>
          </tr>)}</tbody></table>
          {!(clientUsers||[]).length&&<p className="p-10 text-center text-slate-400">No client accounts yet. Assign a pending account to the Client role in Accounts & Access.</p>}
        </div>
      </div>
""" + s[end:]
p.write_text(s)
# Support time: distinct live workspace, date-filtered compact timesheet.
p=Path('src/pages/AdminSupportStaffClock.jsx');s=p.read_text();s="import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';\nimport { Input } from '@/components/ui/input';\n"+s
s=s.replace("import { useMemo }","import { useMemo, useState, useEffect }")
s=s.replace('  const queryClient = useQueryClient();',"""  const queryClient = useQueryClient();
  const [now,setNow]=useState(()=>Date.now());
  const [historyStart,setHistoryStart]=useState('');
  const [historyEnd,setHistoryEnd]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
""")
s=s.replace('const elapsedHours = (entry) =>','const elapsedHours = (entry,now=Date.now()) =>').replace(' : Date.now();',' : now;').replace('Date.now() - new Date(entry.break_started_at)','now - new Date(entry.break_started_at)')
s=s.replace("const { data: entries = [], isLoading }", "const { data: entries = [], isLoading, error: entriesError }")
s=s.replace("return records || [];","return (records || []).filter(entry=>entry.archived!==true);")
s=s.replace("entries.filter(entry => entry.clock_out).slice(0, 25), [entries]","entries.filter(entry => entry.clock_out && (!historyStart || String(entry.clock_in).slice(0,10)>=historyStart) && (!historyEnd || String(entry.clock_in).slice(0,10)<=historyEnd)), [entries,historyStart,historyEnd]")
s=s.replace("onSuccess: refresh,","onSuccess: refresh,\n    onError: error => toast.error(error?.message || 'Unable to update time clock'),")
a=s.index('        <div>\n          <h1');b=s.index('\n        <Card',a)
s=s[:a]+"""        <WorkspaceHeader eyebrow="Administration / Support time" title="Support Staff Time Clock" description={'Personal time clock for '+displayName} metrics={[
          {label:'Duty state',value:activeEntry?(activeEntry.on_break?'On break':'Clocked in'):'Clocked out'},
          {label:'Current paid time',value:activeEntry?elapsedHours(activeEntry,now).toFixed(2)+' h':'—'},
          {label:'Completed hours shown',value:pastEntries.reduce((sum,entry)=>sum+elapsedHours(entry),0).toFixed(2)+' h'}
        ]}/>
        {entriesError&&<p role="alert" className="rounded-lg border border-red-700 bg-red-950 p-3 text-red-200">Time entries could not refresh. {entriesError.message}</p>}
""" + s[b:]
s=s.replace("elapsedHours(activeEntry).toFixed(2)","elapsedHours(activeEntry,now).toFixed(2)")
s=s.replace('<CardHeader><CardTitle>Past Clock Entries</CardTitle></CardHeader>',"""<CardHeader><div className="flex flex-wrap items-end justify-between gap-3"><div><CardTitle>My timesheet</CardTitle><p className="mt-1 text-xs text-slate-400">Latest 100 entries · breaks deducted</p></div><div className="flex flex-wrap gap-2"><label className="text-xs text-slate-400">From<Input aria-label="Timesheet start date" type="date" value={historyStart} onChange={e=>setHistoryStart(e.target.value)} className="mt-1 border-slate-600 bg-slate-950"/></label><label className="text-xs text-slate-400">Through<Input aria-label="Timesheet end date" type="date" min={historyStart} value={historyEnd} onChange={e=>setHistoryEnd(e.target.value)} className="mt-1 border-slate-600 bg-slate-950"/></label></div></div></CardHeader>""")
p.write_text(s)
