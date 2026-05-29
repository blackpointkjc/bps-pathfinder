import { Flame } from 'lucide-react';

export default function HeatmapToggle({ enabled, onChange, callCount }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="text-white font-mono font-bold text-sm">Hot Zones</span>
        </div>
        <p className="text-slate-400 text-xs font-mono">{callCount} calls plotted</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`flex-shrink-0 px-3 py-1.5 rounded text-xs font-mono font-bold transition-colors ${
          enabled
            ? 'bg-orange-900/40 border border-orange-700 text-orange-300 hover:bg-orange-800'
            : 'bg-slate-700 border border-slate-600 text-slate-400 hover:bg-slate-600'
        }`}
      >
        {enabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}