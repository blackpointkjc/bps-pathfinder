from pathlib import Path
p=Path('src/components/dispatch/UnitDutyBoard.jsx');s=p.read_text().replace('</div>}}','</div>}');p.write_text(s)
p=Path('src/pages/BOLOAlerts.jsx');s=p.read_text()
s=s.replace('text-sm font-black tracking-[0.16em]','text-xl font-bold tracking-tight')
s=s.replace('text-[10px] tracking-[0.18em] text-slate-500','mt-1 text-xs text-slate-400')
s=s.replace('text-[10px] text-white outline-none focus:border-blue-500','text-sm text-white outline-none focus:border-blue-500').replace('h-8 w-full rounded border','h-10 w-full rounded-lg border')
a=s.index('      <div className="hidden flex-none grid-cols-12');b=s.index('\n      {modal &&',a)
s=s[:a]+'''      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? <div role="status" className="p-10 text-center text-sm text-slate-400">Loading intelligence records…</div> : filtered.length===0 ? <div className="rounded-xl border border-dashed border-slate-600 p-12 text-center text-slate-400"><AlertOctagon className="mx-auto mb-3 h-8 w-8"/><p>No records match this view.</p></div> :
        <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map(bolo=>{
          const cfg=TYPE_CONFIG[bolo.alert_type]||TYPE_CONFIG.watch_notice,Icon=cfg.icon;
          const party=primaryParty(bolo),vehicle=primaryVehicle(bolo);
          const subject=party?.name?titleCase(party.name):vehicle?[vehicle.year,titleCase(vehicle.color),titleCase(vehicle.make),titleCase(vehicle.model)].filter(Boolean).join(' '):'General information';
          return <article key={bolo.id} className={'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-slate-900 shadow-lg '+(bolo.priority==='critical'&&bolo.status==='active'?'border-red-500':'border-slate-700')}>
            <button type="button" onClick={()=>setModal({mode:bolo.status==='draft'?'edit':'view',bolo})} className="flex-1 p-5 text-left hover:bg-slate-800/60">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-amber-300">{bolo.bolo_number||'BOLO pending'}</span><span className={'rounded border px-2 py-1 text-xs font-bold '+(PRIORITY_STYLE[bolo.priority]||PRIORITY_STYLE.medium)}>{String(bolo.priority||'medium').toUpperCase()}</span></div>
              <div className="mt-4 flex gap-4">{bolo.photo_urls?.[0]&&<img src={bolo.photo_urls[0]} alt="BOLO subject" className="h-24 w-24 shrink-0 rounded-lg border border-slate-600 object-cover"/>}<div className="min-w-0"><div className="flex items-center gap-2 text-xs text-cyan-300"><Icon className="h-4 w-4"/>{cfg.label}</div><h2 className="mt-2 break-words text-lg font-semibold text-white">{titleCase(bolo.title)}</h2><p className="mt-1 break-words text-sm text-slate-300">{subject}</p></div></div>
              {vehicle?.plate&&<span className="mt-3 inline-block rounded border border-amber-500/50 bg-amber-950 px-3 py-1 font-mono text-sm font-bold text-amber-200">{String(vehicle.plate).toUpperCase()}</span>}
              <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-300">{bolo.description||'Open record for full intelligence details.'}</p>
              <dl className="mt-4 grid gap-2 border-t border-slate-700 pt-3 text-xs"><div><dt className="text-slate-500">Last known location</dt><dd className="mt-1 text-slate-200">{titleCase(bolo.last_known_location||'Unknown')}</dd></div>{bolo.linked_call_number&&<div><dt className="text-slate-500">Linked CAD call</dt><dd className="mt-1 text-cyan-200">{bolo.linked_call_number}</dd></div>}</dl>
            </button>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-950/60 px-5 py-3"><div className="text-xs"><span className={bolo.status==='active'?'text-emerald-300':'text-slate-300'}>{String(bolo.status||'').toUpperCase()}</span><p className="mt-1 text-slate-500">{fmt(bolo.created_date)}</p></div><div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={()=>setModal({mode:bolo.status==='draft'?'edit':'view',bolo})}>{bolo.status==='draft'?'Continue draft':'Open record'}</Button>
              {canEditRecord(bolo)&&bolo.status==='active'&&<><button type="button" aria-label={'Edit '+bolo.bolo_number} onClick={()=>setModal({mode:'edit',bolo:{...bolo}})} className="rounded border border-slate-600 px-2 text-slate-300"><Edit2 className="h-4 w-4"/></button><Button size="sm" disabled={resolving===bolo.id} onClick={e=>openResolveDialog(bolo,e)} className="bg-emerald-800 hover:bg-emerald-700">{resolving===bolo.id?'Resolving…':'Resolve'}</Button></>}
            </div></footer>
          </article>;
        })}</div>}
      </div>
'''+s[b:];p.write_text(s)
# Field post orders become an indexed reference document with clear, dark readable sections.
p=Path('src/pages/PostOrders.jsx');s=p.read_text();s="import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';\n"+s
a=s.index('        <div className="flex items-center gap-4">');b=s.index('\n        <Card',a)
s=s[:a]+'''        <WorkspaceHeader eyebrow="Field operations / Site reference" title="Post Orders" description="Site instructions, patrol requirements, contacts and the chain of command." metrics={[
          {label:'Active properties',value:locations?.length||0},
          {label:'Selected property',value:selectedSite||'Select a site'}
        ]}/>
'''+s[b:]
s=s.replace('max-w-5xl mx-auto','max-w-6xl mx-auto')
s=s.replace('<CardTitle>Select Your Site</CardTitle>','<CardTitle className="text-sm">Property reference</CardTitle>')
s=s.replace('<div className="space-y-6">\n            {/* Site Header */}',"""<div className="space-y-5">
            <nav aria-label="Post order contents" className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-xl border border-slate-600 bg-slate-950/95 p-3 shadow-lg backdrop-blur">{[['contacts','Contacts & command'],['overview','Site overview'],['general','Company orders'],['patrol','Patrol schedule'],['duties','Special duties'],['emergency','Emergency contacts']].map(([id,title])=><a key={id} href={'#post-'+id} className="rounded-lg px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-slate-800">{title}</a>)}</nav>
            {/* Site Header */}""")
for marker,section in [('Contacts','contacts'),('Site Overview','overview'),('General Post Orders - ALWAYS SHOWN - pulled from DB','general'),('Patrol Schedule','patrol'),('Special Duties & Instructions','duties'),('Emergency Contacts','emergency')]:
 a=s.index('{/* '+marker+' */}');b=s.index('<Card ',a);s=s[:b]+s[b:].replace('<Card ',f'<Card id="post-{section}" ',1)
for old,new in [
 ('border-none shadow-lg','scroll-mt-24 border-slate-700 bg-slate-900 text-slate-100 shadow-lg'),
 ('border-none shadow-xl','scroll-mt-24 border-slate-700 bg-slate-900 text-slate-100 shadow-xl'),
 ('bg-gradient-to-r from-blue-600 to-purple-600','bg-gradient-to-r from-cyan-950 to-slate-900'),
 ('text-slate-900','text-slate-100'),('text-slate-700','text-slate-300'),('text-slate-600','text-slate-400'),
 ('bg-amber-50','bg-amber-950/40'),('text-amber-900','text-amber-200'),('border-amber-300','border-amber-800'),
 ('bg-red-50','bg-red-950/50'),('text-red-900','text-red-200'),('border-red-300','border-red-700'),
 ('bg-blue-50','bg-blue-950/40'),('text-blue-900','text-blue-200'),('border-blue-200','border-blue-700'),
]:s=s.replace(old,new)
import re
s=re.sub(r'bg-gradient-to-r from-(?:green|blue|slate|purple|orange|red)-50 to-[a-z]+-(?:50|100)', 'border-b border-slate-700 bg-slate-800',s)
# The structured chain already has names/photos/acting coverage; stale duplicate supervisor labels conflict.
s=s.replace('<p className="text-sm font-semibold text-green-700">Assigned Supervisors:</p>','<p className="text-sm font-semibold text-cyan-300">Site supervisor & chain of command</p>')
s=s.replace('<p className="break-words text-slate-100 font-medium">{getSupervisorNames(selectedPostOrder.assigned_supervisors)}</p>','')
p.write_text(s)
