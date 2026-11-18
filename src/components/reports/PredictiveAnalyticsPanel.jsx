import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MapPin, Clock, TrendingUp, Target, AlertTriangle } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: i === 0 ? '12A' : i < 12 ? `${i}A` : i === 12 ? '12P' : `${i - 12}P`,
}));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PredictiveAnalyticsPanel({ data }) {
    if (!data) return null;

    const { hourly, dayOfWeek, hotLocations, totalCalls, peakHour, peakDay, recommendations } = data;

    const maxHourly = Math.max(...hourly.map(h => h.count), 1);
    const maxDay = Math.max(...dayOfWeek.map(d => d.count), 1);

    const getHeatColor = (val, max) => {
        const ratio = val / max;
        if (ratio >= 0.8) return '#ef4444';
        if (ratio >= 0.6) return '#f97316';
        if (ratio >= 0.4) return '#eab308';
        if (ratio >= 0.2) return '#3b82f6';
        return '#1e3a5f';
    };

    return (
        <div className="space-y-5">
            {/* Summary Strip */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'CALLS ANALYZED', value: totalCalls, color: 'text-blue-400', border: 'border-blue-500/30' },
                    { label: 'PEAK HOUR', value: peakHour, color: 'text-orange-400', border: 'border-orange-500/30' },
                    { label: 'PEAK DAY', value: peakDay, color: 'text-red-400', border: 'border-red-500/30' },
                    { label: 'HOT ZONES', value: hotLocations.length, color: 'text-yellow-400', border: 'border-yellow-500/30' },
                ].map(({ label, value, color, border }) => (
                    <div key={label} className={`bg-slate-800/60 border ${border} rounded-lg p-3`}>
                        <p className="text-[10px] text-slate-500 font-mono tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Hourly Demand Heatmap */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-white font-mono font-bold text-sm">HOURLY CALL DEMAND</span>
                    <span className="text-slate-500 text-[10px] font-mono ml-2">— deploy units 30–45 min before peak</span>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={hourly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'monospace' }} />
                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', fontFamily: 'monospace', fontSize: 11 }}
                            formatter={(v) => [`${v} calls`, 'Volume']}
                        />
                        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                            {hourly.map((h, i) => (
                                <Cell key={i} fill={getHeatColor(h.count, maxHourly)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 justify-end">
                    {[['Low', '#1e3a5f'], ['Moderate', '#3b82f6'], ['High', '#eab308'], ['Peak', '#ef4444']].map(([label, color]) => (
                        <div key={label} className="flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                            <span className="text-[9px] text-slate-500 font-mono">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Day of Week */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-mono font-bold text-sm">DAY-OF-WEEK DEMAND</span>
                </div>
                <div className="flex gap-2">
                    {dayOfWeek.map((d, i) => {
                        const ratio = d.count / maxDay;
                        const h = Math.round(ratio * 80) + 8;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div className="text-[9px] font-mono text-white font-bold">{d.count}</div>
                                <div className="w-full rounded-t" style={{ height: h, background: getHeatColor(d.count, maxDay) }} />
                                <div className="text-[9px] font-mono text-slate-500">{DAYS[i]}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Hot Locations */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-red-400" />
                    <span className="text-white font-mono font-bold text-sm">HIGH-DEMAND LOCATIONS</span>
                </div>
                <div className="space-y-2">
                    {hotLocations.map((loc, i) => (
                        <div key={i} className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0 ${
                                i === 0 ? 'bg-red-500/30 text-red-300' : i === 1 ? 'bg-orange-500/30 text-orange-300' : 'bg-blue-500/30 text-blue-300'
                            }`}>#{i + 1}</div>
                            <div className="flex-1 min-w-0">
                                <div className="text-white text-xs font-mono font-bold truncate">{loc.location}</div>
                                <div className="text-slate-500 text-[10px] font-mono">{loc.topIncident} · most common</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className="text-white font-mono text-sm font-bold">{loc.count}</div>
                                <div className="text-slate-500 text-[10px] font-mono">calls</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Deployment Recommendations */}
            <div className="bg-blue-950/30 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-300 font-mono font-bold text-sm">AI DEPLOYMENT RECOMMENDATIONS</span>
                </div>
                <div className="space-y-2">
                    {recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs font-mono">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <span className="text-slate-300">{rec}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}