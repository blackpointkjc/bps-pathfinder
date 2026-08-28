import { useMemo, useState } from 'react';

export default function CenterToolSection({ tools, defaultTool }) {
  const initial = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('tool');
    return tools.some(tool => tool.id === requested) ? requested : defaultTool || tools[0]?.id;
  }, [tools, defaultTool]);
  const [tool, setTool] = useState(initial);

  const select = next => {
    setTool(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tool', next);
    window.history.replaceState({}, '', url);
  };

  const active = tools.find(item => item.id === tool) || tools[0];
  const Component = active?.component;
  const fullCanvas = active?.id === 'map';

  return (
    <div className={`w-full ${fullCanvas ? 'flex h-[calc(100vh-150px)] min-h-[680px] flex-col' : ''}`}>
      {tools.length > 1 && (
        <div className="sticky top-0 z-20 border-b border-slate-800 bg-[#08111e]/95 px-4 py-2 backdrop-blur md:px-6">
          <div className="flex flex-wrap gap-2">
            {tools.map(item => (
              <button key={item.id} type="button" onClick={() => select(item.id)}
                className={`min-w-0 whitespace-normal break-words rounded-lg border px-3 py-2 text-left text-xs font-bold leading-tight transition ${tool === item.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
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
