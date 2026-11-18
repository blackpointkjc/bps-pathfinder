import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
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
    // Release the modal/focus lock if resizing reveals the desktop navigation.
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => { if (media.matches) setOpen(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [open]);

  const choose = id => {
    onChange(id);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="xl:hidden">
        <Dialog.Trigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="group flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0b1624] px-2.5 py-1.5 text-left transition hover:border-cyan-500/60"
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
        </Dialog.Trigger>
      </div>

      <div className="hidden xl:flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-[#060d17]/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map(({ id, label: optionLabel, icon: Icon }) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              aria-pressed={selected}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-left transition-all ${selected ? accentClasses : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900/80 hover:text-white'}`}
            >
              {Icon && <Icon className={`h-3 w-3 shrink-0 ${selected ? '' : 'text-slate-600'}`} />}
              <span className="whitespace-nowrap text-[10px] font-black">{optionLabel}</span>
            </button>
          );
        })}
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="bps-selector-overlay" />
          <Dialog.Content
            aria-describedby={undefined}
            className="bps-selector-sheet"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Choose workspace</div>
                <Dialog.Title className="mt-0.5 break-words text-base font-black">{label}</Dialog.Title>
              </div>
              <Dialog.Close type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300" aria-label="Close selector">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="bps-selector-options grid min-h-0 gap-2 overflow-y-auto overscroll-contain p-3 sm:grid-cols-2">
              {options.map(item => {
                const Icon = item.icon;
                const selected = value === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item.id)}
                    aria-pressed={selected}
                    className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left transition ${selected ? accentClasses : 'border-slate-800 bg-[#0d1826] text-slate-200 active:bg-slate-800'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/10' : 'bg-slate-950/70 text-slate-500'}`}>
                      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-black">{item.label}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
