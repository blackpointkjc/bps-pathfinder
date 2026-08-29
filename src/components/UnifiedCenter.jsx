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

export default function UnifiedCenter({ eyebrow, title, description, sections, defaultSection, children, contentClassName = 'bg-[#070d17] text-slate-100', queryParam = 'section', embedded = false }) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const initial = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get(queryParam);
    return safeSections.some(section => section.id === requested) ? requested : defaultSection || safeSections[0]?.id;
  }, [safeSections, defaultSection, queryParam]);
  const [section, setSection] = useState(initial);

  const select = next => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set(queryParam, next);
    window.history.replaceState({}, '', url);
  };

  // Center navigation should read like one compact navigation rail, not another
  // dashboard made of large cards. Keep every center consistent and scannable.
  const sectionGrid = safeSections.length >= 5
    ? 'md:grid-cols-3 xl:grid-cols-6'
    : safeSections.length === 4
      ? 'md:grid-cols-4'
      : safeSections.length === 3
        ? 'md:grid-cols-3'
        : 'md:grid-cols-2';

  return (
    <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-[#070d17] text-slate-100">
      <header className={`border-b border-slate-800 bg-[#0a1220] ${embedded ? 'px-3 py-3 md:px-4' : 'px-4 py-4 md:px-6'}`}>
        <div className="mx-auto w-full min-w-0 max-w-[1700px]">
          {!embedded && <>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">{eyebrow}</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
            <p className="mt-1 max-w-4xl text-sm text-slate-400">{description}</p>
          </>}
          <div className={`${embedded ? '' : 'mt-4'} grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-[#07101c] p-1.5 ${sectionGrid}`}>
            {safeSections.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <button key={id} type="button" onClick={() => select(id)} aria-pressed={active}
                  className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${active ? 'border-cyan-400/50 bg-[#17466a] text-white shadow-sm' : 'border-transparent bg-transparent text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
                  {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />}
                  <span className="min-w-0 truncate text-[11px] font-black sm:text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <main className={`mx-auto min-h-[calc(100vh-190px)] w-full max-w-[1700px] min-w-0 overflow-x-hidden border-x border-slate-800/70 ${contentClassName}`}><div className="w-full min-w-0 max-w-full overflow-x-hidden">{typeof children === 'function' ? children(section) : children}</div></main>
    </div>
  );
}
