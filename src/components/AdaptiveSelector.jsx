import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export default function AdaptiveSelector({
  label,
  options = [],
  value,
  onChange,
  accent = 'cyan',
}) {
  const [open, setOpen] = useState(false);
  const active = useMemo(() => options.find(item => item.id === value) || options[0], [options, value]);
  const ActiveIcon = active?.icon;
  const accentClasses = accent === 'blue'
    ? 'border-blue-400/50 bg-blue-500/15 text-blue-100'
    : 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100';

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const choose = id => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="group flex min-h-10 w-full items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0b1624] px-2.5 py-1.5 text-left transition hover:border-cyan-500/60"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${accentClasses}`}>
            {ActiveIcon ? <ActiveIcon className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-white">{active?.label || 'Select'}</span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/60 text-slate-300">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      <div className="hidden lg:flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-[#060d17]/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map(({ id, label: optionLabel, icon: Icon }) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              aria-pressed={selected}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-left transition-all ${selected ? accentClasses : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900/80 hover:text-white'}`}
            >
              {Icon && <Icon className={`h-3 w-3 shrink-0 ${selected ? '' : 'text-slate-600'}`} />}
              <span className="whitespace-nowrap text-[10px] font-black">{optionLabel}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-[100000] flex items-end bg-black/75 p-2 backdrop-blur-sm lg:hidden" role="presentation" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="max-h-[82dvh] w-full overflow-hidden rounded-[22px] border border-slate-700 bg-[#09131f] text-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Choose workspace</div>
                <h2 className="mt-0.5 truncate text-base font-black">{label}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300" aria-label="Close selector">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[calc(82dvh-64px)] gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {options.map(item => {
                const Icon = item.icon;
                const selected = value === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item.id)}
                    className={`flex min-h-12 items-center gap-2 rounded-xl border p-2.5 text-left transition ${selected ? accentClasses : 'border-slate-800 bg-[#0d1826] text-slate-200 active:bg-slate-800'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/10' : 'bg-slate-950/70 text-slate-500'}`}>
                      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black">{item.label}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
