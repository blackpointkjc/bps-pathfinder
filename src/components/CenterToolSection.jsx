import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import AdaptiveSelector from '@/components/AdaptiveSelector';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function CenterToolSection({ tools, defaultTool, queryParam = 'tool', workspaceClassName = '', componentProps = {}, headerContent = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const collapseKey = `bps:tool-nav-collapsed:${queryParam}`;
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; } });
  const safeTools = Array.isArray(tools) ? tools : [];
  const requestedTool = new URLSearchParams(location.search).get(queryParam);
  const fallbackTool = defaultTool && safeTools.some(item => item.id === defaultTool)
    ? defaultTool
    : safeTools[0]?.id;
  const tool = requestedTool && safeTools.some(item => item.id === requestedTool)
    ? requestedTool
    : fallbackTool;

  const select = next => {
    const selected = safeTools.find(item => item.id === next);
    if (selected?.page) {
      navigate(createPageUrl(selected.page));
      return;
    }
    const params = new URLSearchParams(location.search);
    params.set(queryParam, next);
    ['entry_id', 'record_id', 'queue_task', 'queue_kind'].forEach(param => params.delete(param));
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  };

  const active = safeTools.find(item => item.id === tool) || safeTools[0];
  const Component = active?.component;
  const fullCanvas = active?.id === 'map';
  const toggleCollapsed = () => setCollapsed(value => { const next = !value; try { localStorage.setItem(collapseKey, next ? '1' : '0'); } catch {} return next; });

  return (
    <div className={`w-full ${workspaceClassName} ${fullCanvas ? 'flex h-[65dvh] min-h-[320px] xl:h-[calc(100vh-150px)] xl:min-h-[680px] flex-col' : ''}`}>
      {safeTools.length > 1 && (
        <div className="flex items-center gap-2 border-b border-slate-800/70 bg-gradient-to-r from-[#08111e] via-[#0a1726] to-[#08111e] px-3 py-1.5 md:px-4">
          {!collapsed && <div className="min-w-0 flex-1">
            <AdaptiveSelector
              label="Page"
              options={safeTools}
              value={tool || ''}
              onChange={select}
              accent="blue"
            />
          </div>}
          <button type="button" onClick={toggleCollapsed} className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-[9px] font-black uppercase text-slate-300 hover:border-blue-600 hover:text-white" title={collapsed ? 'Expand page navigation' : 'Collapse page navigation'}>
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}{collapsed ? 'Show' : 'Hide'} Page Tabs
          </button>
        </div>
      )}
      {headerContent}
      <div className={fullCanvas
        ? 'min-h-0 min-w-0 flex-1 overflow-hidden [&>div]:!h-full [&>div]:!min-h-0 [&>div]:!max-w-none [&>div]:!mx-0 [&>div]:!p-0'
        : 'min-w-0 overflow-x-clip'}>{Component ? <Component embedded {...componentProps} /> : null}</div>
    </div>
  );
}
