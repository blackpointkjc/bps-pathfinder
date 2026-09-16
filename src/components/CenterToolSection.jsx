import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import AdaptiveSelector from '@/components/AdaptiveSelector';

export default function CenterToolSection({ tools, defaultTool, queryParam = 'tool', workspaceClassName = '', componentProps = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
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

  return (
    <div className={`w-full ${workspaceClassName} ${fullCanvas ? 'flex h-[65dvh] min-h-[320px] xl:h-[calc(100vh-150px)] xl:min-h-[680px] flex-col' : ''}`}>
      {safeTools.length > 1 && (
        <div className="border-b border-slate-800 bg-[#08111e] px-3 py-2 md:px-4">
          <AdaptiveSelector
            label="Page"
            options={safeTools}
            value={tool || ''}
            onChange={select}
            accent="blue"
          />
        </div>
      )}
      <div className={fullCanvas
        ? 'min-h-0 min-w-0 flex-1 overflow-hidden [&>div]:!h-full [&>div]:!min-h-0 [&>div]:!max-w-none [&>div]:!mx-0 [&>div]:!p-0'
        : 'min-w-0 overflow-x-clip'}>{Component ? <Component embedded {...componentProps} /> : null}</div>
    </div>
  );
}
