import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdaptiveSelector from '@/components/AdaptiveSelector';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

export default function UnifiedCenter({ eyebrow, title, description, sections, defaultSection, children, contentClassName = 'bg-[#070d17] text-slate-100', queryParam = 'section', embedded = false, headerAction = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const collapseKey = `bps:center-nav-collapsed:${title || 'center'}`;
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; } });
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

  const toggleCollapsed = () => setCollapsed(value => { const next = !value; try { localStorage.setItem(collapseKey, next ? '1' : '0'); } catch {} return next; });

  const actionNode = typeof headerAction === 'function' ? headerAction(section) : headerAction;

  return (
    <div className="bps-command-theme min-h-full w-full min-w-0 overflow-x-clip bg-[#080d16] text-slate-100">
      <header className="shrink-0 border-b border-slate-800/80 bg-[#09121f] px-2 py-1.5 md:px-3">
        <div className="flex min-w-0 items-center gap-2">
          {!embedded && (
            <div className="flex shrink-0 items-center gap-2 pr-1">
              <h1 className="text-[15px] font-black tracking-tight text-white md:text-base">{title}</h1>
              {eyebrow && <span className="hidden rounded-md border border-cyan-900/60 bg-cyan-950/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-400 lg:inline">{eyebrow}</span>}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <AdaptiveSelector
                label={embedded ? 'Section' : `${title} section`}
                options={safeSections}
                value={section || ''}
                onChange={select}
                accent="cyan"
              />
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {actionNode}
            <button type="button" onClick={toggleCollapsed} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-cyan-600 hover:text-white" title={collapsed ? 'Show navigation' : 'Hide navigation'} aria-label={collapsed ? 'Show navigation' : 'Hide navigation'}>
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>
      <div className={`min-h-0 w-full min-w-0 overflow-x-clip ${contentClassName}`}><div className="bps-command-content w-full min-w-0 max-w-full overflow-x-clip">{typeof children === 'function' ? children(section) : children}</div></div>
    </div>
  );
}
