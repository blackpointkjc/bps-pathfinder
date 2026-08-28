import { useEffect, useMemo, useState } from 'react';

export function useDesktopViewport() {
  const [desktop, setDesktop] = useState(() => typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = event => setDesktop(event.matches);
    setDesktop(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return desktop;
}

export default function UnifiedCenter({ eyebrow, title, description, sections, defaultSection, children, contentClassName = 'bg-[#070d17] text-slate-100' }) {
  const initial = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return sections.some(section => section.id === requested) ? requested : defaultSection || sections[0]?.id;
  }, [sections, defaultSection]);
  const [section, setSection] = useState(initial);

  const select = next => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set('section', next);
    window.history.replaceState({}, '', url);
  };

  const sectionGrid = sections.length >= 6
    ? 'md:grid-cols-3 xl:grid-cols-6'
    : sections.length === 5
      ? 'md:grid-cols-3 xl:grid-cols-5'
      : sections.length === 4
        ? 'md:grid-cols-4'
        : sections.length === 3
          ? 'md:grid-cols-3'
          : 'md:grid-cols-2';

  return (
    <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-[#070d17] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0a1220] px-4 py-4 md:px-6">
        <div className="mx-auto w-full min-w-0 max-w-[1700px]">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">{eyebrow}</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-400">{description}</p>
          <div className={`mt-5 grid grid-cols-2 gap-2 ${sectionGrid}`}>
            {sections.map(({ id, label, description: sectionDescription, icon: Icon }) => {
              const active = section === id;
              return (
                <button key={id} type="button" onClick={() => select(id)} aria-pressed={active}
                  className={`min-w-0 rounded-xl border p-3 text-left transition ${active ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,.12)]' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-900'}`}>
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />}
                    <span className={`min-w-0 whitespace-normal break-words text-[11px] font-black leading-tight sm:text-xs ${active ? 'text-white' : 'text-slate-300'}`}>{label}</span>
                  </div>
                  {sectionDescription && <p className="mt-1 hidden whitespace-normal break-words text-[10px] leading-4 text-slate-500 xl:block">{sectionDescription}</p>}
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <main className={`mx-auto min-h-[calc(100vh-190px)] w-full max-w-[1700px] min-w-0 overflow-x-hidden border-x border-slate-800/70 ${contentClassName}`}><div className="w-full min-w-0 max-w-full overflow-x-hidden">{children(section)}</div></main>
    </div>
  );
}
