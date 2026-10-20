export default function WorkspaceHeader({eyebrow,title,description,children,metrics=[]}){
 return <header className="mb-5 overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
  <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6"><div className="min-w-0">
   {eyebrow&&<p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-cyan-300">{eyebrow}</p>}
   <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
   {description&&<p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{description}</p>}
  </div>{children&&<div className="flex flex-wrap items-center gap-2">{children}</div>}</div>
  {!!metrics.length&&<dl className="grid grid-cols-2 divide-x divide-slate-700 border-t border-slate-700 bg-slate-950/40 sm:flex">{metrics.map(({label,value})=><div key={label} className="min-w-0 px-5 py-3 sm:flex-1"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 text-xl font-semibold text-white">{value}</dd></div>)}</dl>}
 </header>;
}
