import { useLocation, useNavigate } from 'react-router-dom';

export default function CenterToolSection({ tools, defaultTool, queryParam = 'tool' }) {
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
    <div className={`w-full ${fullCanvas ? 'flex h-[calc(100vh-150px)] min-h-[680px] flex-col' : ''}`}>
      {safeTools.length > 1 && (
        <div className="border-b border-slate-800 bg-[#08111e] px-3 py-1 md:px-4">
          <div className="flex max-w-full gap-1.5 overflow-x-auto">
            {safeTools.map(item => (
              <button key={item.id} type="button" onClick={() => select(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-left text-[11px] font-bold leading-tight transition ${tool === item.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={fullCanvas
        ? 'min-h-0 min-w-0 flex-1 overflow-hidden [&>div]:!h-full [&>div]:!min-h-0 [&>div]:!max-w-none [&>div]:!mx-0 [&>div]:!p-0'
        : 'min-w-0 overflow-x-hidden'}>{Component ? <Component embedded /> : null}</div>
    </div>
  );
}
