from pathlib import Path
# A full roster table at full-page size; the compact embedded duty cards stay available.
p=Path('src/components/dispatch/UnitDutyBoard.jsx');s=p.read_text()
s=s.replace("    const [expanded, setExpanded]", "    const [platoon,setPlatoon]=useState('ALL');\n    const [expanded, setExpanded]")
s=s.replace("const rows = dutyRows(units, calls, query, status);","const rows = dutyRows(units, calls, query, status).filter(u=>platoon==='ALL'||u.platoon===platoon);")
s=s.replace('            {expanded && <>','''            {expanded && <>
                {fullPage&&<select aria-label="Filter status by platoon" value={platoon} onChange={e=>setPlatoon(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm"><option value="ALL">All platoons</option>{[...new Set(units.map(u=>u.platoon).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select>}''')
a=s.index('        {expanded && <div');b=s.index('\n    </section>',a);old=s[a:b]
s=s[:a]+'''        {expanded && fullPage ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr><th className="p-4">Officer / Unit</th><th className="p-4">Platoon</th><th className="p-4">Duty status</th><th className="p-4">Current assignment</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">
          {rows.map(u=><tr key={u.id||u.email||u.officer_email} className="hover:bg-slate-900"><td className="p-4"><div className="flex items-center gap-3">{u.profile_photo_url?<img src={u.profile_photo_url} alt="" className="h-11 w-11 rounded-full object-cover"/>:<span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-xs text-cyan-300">{u.unit_number||'—'}</span>}<div><strong className="block text-white">{u.last_name?[normalizeRank(u.rank),u.last_name].filter(Boolean).join(' '):u.officer_name||'Officer'}</strong><span className="text-xs text-slate-400">Unit {u.unit_number||'—'}</span></div></div></td><td className="p-4">{u.platoon||'—'}</td><td className="p-4"><span className={'inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs '+(u.status==='Available'?'border-emerald-700 bg-emerald-950 text-emerald-200':u.status==='Out of Service'?'border-slate-600 text-slate-400':u.status==='Distress'?'border-red-500 bg-red-950 text-red-200':'border-amber-800 bg-amber-950 text-amber-200')}>{u.status}</span></td><td className="max-w-xl p-4 text-slate-300">{u.assignment}</td></tr>)}
        </tbody></table>{!rows.length&&<p className="p-8 text-center text-sm text-slate-400">No officers match these filters.</p>}</div> : '''+old.replace('        {expanded && <div','expanded && <div',1)+'''}
'''+s[b:]
# old JSX ending } is already conditional closure; remove extra on construction
s=s.replace('        </div>}\n}\n','        </div>}\n')
# Generated ternary old already braces: close correct.
s=s.replace("        </div>}\n\n    </section>","        </div>}\n\n    </section>")
p.write_text(s)
p=Path('src/pages/UnitStatus.jsx');s=p.read_text();s="import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';\nimport { isOperationalOfficer } from '@/lib/directoryUtils';\n"+s
a=s.index('        <div className="mb-4');b=s.index('        {loading &&',a)
s=s[:a]+'''        <WorkspaceHeader eyebrow="CAD / Personnel" title="Officer Status" description="Live duty state and assignments, organized by the company rank structure." metrics={[
          {label:'Operational officers',value:units.filter(isOperationalOfficer).length},
          {label:'Available',value:units.filter(isOperationalOfficer).filter(u=>u.status==='Available').length},
          {label:'On scene',value:units.filter(isOperationalOfficer).filter(u=>u.status==='On Scene').length}
        ]}><button type="button" onClick={()=>manualRefresh()} className="rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800">Refresh statuses</button></WorkspaceHeader>
'''+s[b:];p.write_text(s)
p=Path('src/pages/OfficerDispatchQueue.jsx');s=p.read_text();s="import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';\n"+s
s=s.replace("  const [selectedId", "  const [queueSearch,setQueueSearch]=useState('');\n  const [selectedId")
s=s.replace("  const queue = payload.queue || [];","  const queue = payload.queue || [];\n  const visibleQueue=queue.filter(call=>[call.agency_cad_number,call.bps_reference,call.call_id,call.incident,call.location].join(' ').toLowerCase().includes(queueSearch.toLowerCase()));")
a=s.index('      <header className=');b=s.index('\n      {!queue.length',a)
s=s[:a]+'''      <WorkspaceHeader eyebrow="CAD / Field operations" title="Officer Dispatch Queue" description="Your assigned calls, with response controls, welfare checks and the shared CAD timeline." metrics={[
        {label:'Assigned calls',value:queue.length},{label:'Critical / high',value:queue.filter(c=>['critical','high'].includes(String(c.priority).toLowerCase())).length},{label:'Current call',value:queue[0]?.agency_cad_number||queue[0]?.bps_reference||queue[0]?.call_id||'None'}
      ]}><Button variant="outline" onClick={()=>refetch()}>Refresh queue</Button></WorkspaceHeader>
'''+s[b:]
s=s.replace('lg:grid-cols-[360px_1fr]','xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]')
s=s.replace('<aside className="space-y-2">','''<aside className="space-y-3"><Input aria-label="Find an assigned call" value={queueSearch} onChange={e=>setQueueSearch(e.target.value)} placeholder="Find reference, incident or location" className="border-slate-600 bg-slate-900"/>{!visibleQueue.length&&<p className="p-4 text-sm text-slate-400">No matching assigned calls.</p>}''')
s=s.replace('queue.map((call,index)', 'visibleQueue.map((call,index)')
s=s.replace('#{index+1} IN QUEUE','#{queue.indexOf(call)+1} IN QUEUE')
s=s.replace('className="space-y-4">\n          <section','className="min-w-0 space-y-4">\n          <section')
p.write_text(s)
# Live command: add visible workspace identity and searchable queue, retain critical alerts and all controls.
p=Path('src/pages/CommandDashboard.jsx');s=p.read_text()
s=s.replace("const [agencyFilter, setAgencyFilter]", "const [incidentSearch,setIncidentSearch]=useState('');\n    const [agencyFilter, setAgencyFilter]")
s=s.replace("const sortedCalls = [...visibleCalls].sort", "const sortedCalls = visibleCalls.filter(call=>[call.incident,call.location,call.agency_cad_number,call.bps_reference,call.call_id].join(' ').toLowerCase().includes(incidentSearch.toLowerCase())).sort")
s=s.replace('<div className="command-dashboard-spacer flex-1" />','<div className="min-w-0 flex-1 py-1"><h1 className="text-lg font-bold tracking-tight text-white">Live Command</h1><p className="text-xs text-slate-400">Incidents · response · field status</p></div>')
s=s.replace('command-dashboard-system-bar flex-none bg-slate-900/90 border-b border-slate-700/80 px-2.5 py-1.5 flex items-center gap-2','command-dashboard-system-bar flex-none bg-slate-900/90 border-b border-slate-700/80 px-4 py-3 flex flex-wrap items-center gap-3')
s=s.replace('md:grid-cols-9','md:grid-cols-5 xl:grid-cols-9')
s=s.replace('<select value={agencyFilter}', '<input aria-label="Search live incidents" value={incidentSearch} onChange={e=>setIncidentSearch(e.target.value)} placeholder="Find incident or location" className="min-w-32 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"/>\n                        <select aria-label="Filter live command by agency" value={agencyFilter}')
s=s.replace('command-queue-header flex items-center justify-between gap-3','command-queue-header flex flex-wrap items-center justify-between gap-3')
p.write_text(s)
