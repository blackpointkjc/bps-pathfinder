from pathlib import Path
p=Path('src/components/SupervisorScheduleWorkspace.jsx');s=p.read_text().replace("import Schedule from '@/pages/Schedule';\n","")
s=s.replace(" const [view,setView]=useState(()=>new URLSearchParams(window.location.search).get('duty_view')||'personal');\n","")
a=s.index('  <header');b=s.index('  <Dialog',a)
s=s[:a]+"""  <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4"><div><h2 className="text-xl font-bold">Duty Supervisor Coverage</h2><p className="mt-1 text-sm text-slate-400">Company command coverage by date, supervisor and service area.</p></div>{hasSupervisorAccess(user)&&<button type="button" onClick={()=>setEditing(true)} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold">Assign duty supervisor</button>}</header>
  <SupervisorDutyTimeline/>
"""+s[b:];p.write_text(s)
p=Path('src/pages/AdminUsers.jsx');s=p.read_text()
s=s.replace('  const [pendingOnly,setPendingOnly]=useState(false);\n','')
s=s.replace("   if(pendingOnly&&(!isPendingUser(u)||approvedUserIds.has(u.id)))return false;\n","")
anchor='  const assignUserCategory ='
s=s.replace(anchor,"""  const pendingUsers=activeUsers.filter(person=>isPendingUser(person)&&!approvedUserIds.has(person.id));
  const approvedStaff=activeUsers.filter(person=>!isPendingUser(person));

"""+anchor)
a=s.index('<label className="flex min-h-10');b=s.index('</label>',a)+len('</label>')
s=s[:a]+"""<Button variant="outline" onClick={()=>setActiveTab('pending')}>Pending onboarding ({pendingUsers.length})</Button>"""+s[b:]
s=s.replace('Active staff accounts ({activeUsers.length})','Active staff accounts ({approvedStaff.length})')
s=s.replace('<TabsTrigger value="terminated">','<TabsTrigger value="pending">Pending Onboarding ({pendingUsers.length})</TabsTrigger>\n            <TabsTrigger value="terminated">')
a=s.index('             <div className="overflow-x-auto',s.index('<TabsContent value="active"'));b=s.index('\n            </TabsContent>',a)
table=s[a:b]
s=s[:a]+table.replace('activeUsers','approvedStaff')+s[b:]
pos=s.index('            <TabsContent value="terminated"')
pending=table.replace('activeUsers','pendingUsers').replace('No accounts match these filters.','No accounts are awaiting onboarding approval.')
s=s[:pos]+"""            <TabsContent value="pending" className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-100"><strong>Onboarding review</strong><p className="mt-1 text-amber-200/80">Review the submitted profile, then assign the appropriate access role. Officer approval checks the required personal, emergency and licensing information.</p></div>
"""+pending+"""
            </TabsContent>
"""+s[pos:];p.write_text(s)
# Company orders are a top-level mode, independent of the selected property.
p=Path('src/components/AdminOperationsWorkbench.jsx');s=p.read_text().replace(" const [search,setSearch]"," const [scope,setScope]=useState('site');\n const [search,setSearch]")
a=s.index('     <Section id="operations-company"');b=s.index('\n     </Section>',a)+len('\n     </Section>')
company=s[a:b]
s=s[:a]+s[b:]
s=s.replace("[['instructions','Instructions'],['duties','Patrol standards'],['checkpoints','Checkpoints'],['company','Company orders']]","[['instructions','Instructions'],['duties','Patrol standards'],['checkpoints','Checkpoints']]")
s=s.replace("seed={{section_title:'',content:'',active:true,sort_order:general.length+1}}","seed={{section_key:'company_'+crypto.randomUUID(),section_title:'',content:'',active:true,sort_order:general.length+1}}")
# same new-record required key in extracted branch
company=company.replace("seed={{section_title:'',content:'',active:true,sort_order:general.length+1}}","seed={{section_key:'company_'+crypto.randomUUID(),section_title:'',content:'',active:true,sort_order:general.length+1}}")
a=s.index('   <div className="grid items-start');s=s[:a]+"""   <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2" role="tablist" aria-label="Operations scope">{[['site','Property operations'],['company','Universal company orders']].map(([id,label])=><button key={id} type="button" role="tab" aria-selected={scope===id} onClick={()=>setScope(id)} className="rounded-lg px-4 py-3 text-sm font-bold aria-selected:bg-cyan-800 aria-selected:text-white hover:bg-slate-800">{label}</button>)}</div>
   {scope==='company'&&<div className="space-y-4"><header className="rounded-xl border border-cyan-900 bg-cyan-950/40 p-5"><h2 className="text-xl font-bold">Black Point company orders</h2><p className="mt-2 text-sm text-slate-300">Applies across the company. Property selection is not required.</p></header>
"""+company+"""
   </div>}
   {scope==='site'&&
"""+s[a:]
# close site-mode conditional immediately following site grid
end=s.rfind('   </div>\n  </div>\n </div>;')
assert end>=0;s=s[:end]+s[end:].replace('   </div>','   </div>}',1)
p.write_text(s)
