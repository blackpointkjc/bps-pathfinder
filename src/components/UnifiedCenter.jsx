import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdaptiveSelector from '@/components/AdaptiveSelector';

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
  const location = useLocation();
  const navigate = useNavigate();
  const safeSections = Array.isArray(sections) ? sections : [];
  const requestedSection = new URLSearchParams(location.search).get(queryParam);
  const fallbackSection = defaultSection && safeSections.some(item => item.id === defaultSection)
    ? defaultSection
    : safeSections[0]?.id;
  const section = requestedSection && safeSections.some(item => item.id === requestedSection)
    ? requestedSection
    : fallbackSection;

  const select = next => {
    const params = new URLSearchParams(location.search);
    params.set(queryParam, next);
    ['entry_id', 'record_id', 'queue_task', 'queue_kind'].forEach(param => params.delete(param));
    if (queryParam === 'section') params.delete('tool');
    else if (queryParam.endsWith('_section')) params.delete(queryParam.replace(/_section$/, '_tool'));
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  };

  return (
    <div className="bps-command-theme min-h-full w-full min-w-0 overflow-x-clip bg-[#080d16] text-slate-100">
      <header className={`shrink-0 border-b border-slate-800 bg-[#0a1220] ${embedded ? 'px-3 py-1 md:px-4' : 'px-3 py-1.5 md:px-4'}`}>
        <div className="w-full min-w-0">
          {!embedded && <>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">{eyebrow}</div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="shrink-0 text-xl font-black tracking-tight text-white md:text-2xl">{title}</h1>
              <p className="min-w-0 flex-1 truncate text-xs text-slate-400">{description}</p>
            </div>
          </>}
          <div className={`${embedded ? 'my-1.5' : 'my-2.5'}`}>
            <AdaptiveSelector
              label={embedded ? 'Section' : `${title} section`}
              options={safeSections}
              value={section || ''}
              onChange={select}
              accent="cyan"
            />
          </div>
        </div>
      </header>
      <div className={`min-h-0 w-full min-w-0 overflow-x-clip border-y border-slate-800/70 ${contentClassName}`}><div className="bps-command-content w-full min-w-0 max-w-full overflow-x-clip">{typeof children === 'function' ? children(section) : children}</div></div>
    </div>
  );
}
