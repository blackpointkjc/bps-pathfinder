import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CALL_TYPES } from '@/lib/cadCallTypes';
import { classifyCall } from '@/lib/cadCallTypes';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, TrendingUp, AlertTriangle, Filter, X } from 'lucide-react';

export default function CallCodeInsights() {
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCodes, setSelectedCodes] = useState([]);
    const [timeRange, setTimeRange] = useState('24h');

    useEffect(() => {
        loadData();
    }, [timeRange]);

    const loadData = async () => {
        try {
            setLoading(true);
            const callsData = await base44.entities.DispatchCall.list('-created_date', 500);
            setCalls(callsData || []);
        } catch (error) {
            console.error('Error loading calls:', error);
        } finally {
            setLoading(false);
        }
    };

    const getTimeFilter = () => {
        const now = new Date();
        const timeFilters = {
            '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
            '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        };
        return timeFilters[timeRange] || timeFilters['24h'];
    };

    const filteredCalls = calls.filter(c => {
        const callTime = new Date(c.created_date || c.time_received);
        return callTime >= getTimeFilter();
    });

    // Classify all calls and count by code
    const codeStats = {};
    filteredCalls.forEach(call => {
        const classified = classifyCall(call.incident || '');
        const code = classified.matched_code || 'other';
        if (!codeStats[code]) {
            codeStats[code] = { code, label: classified.matched_label || 'Other', count: 0, priority: classified.matched_type?.priority || 'low' };
        }
        codeStats[code].count++;
    });

    const chartData = Object.values(codeStats).sort((a, b) => b.count - a.count);
    
    const toggleCodeFilter = (code) => {
        if (selectedCodes.includes(code)) {
            setSelectedCodes(selectedCodes.filter(c => c !== code));
        } else {
            setSelectedCodes([...selectedCodes, code]);
        }
    };

    const filteredBySelection = selectedCodes.length > 0
        ? chartData.filter(d => selectedCodes.includes(d.code))
        : chartData;

    const criticalCount = filteredBySelection.filter(d => d.priority === 'critical').reduce((sum, d) => sum + d.count, 0);
    const highCount = filteredBySelection.filter(d => d.priority === 'high').reduce((sum, d) => sum + d.count, 0);

    const COLORS = {
        critical: '#ef4444',
        high: '#f97316',
        medium: '#eab308',
        low: '#3b82f6'
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-blue-400 font-mono">LOADING INSIGHTS...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white font-mono mb-2">CALL CODE INSIGHTS</h1>
                    <p className="text-slate-400 font-mono text-sm">Real-time heatmap of incident types</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white font-mono text-xs"
                    >
                        <option value="24h">LAST 24H</option>
                        <option value="7d">LAST 7D</option>
                        <option value="30d">LAST 30D</option>
                    </select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="bg-slate-900 border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-mono text-slate-400 mb-1">TOTAL INCIDENTS</p>
                            <p className="text-3xl font-bold text-white">{filteredBySelection.reduce((sum, d) => sum + d.count, 0)}</p>
                        </div>
                        <Activity className="w-8 h-8 text-blue-400" />
                    </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-mono text-slate-400 mb-1">CRITICAL</p>
                            <p className="text-3xl font-bold text-red-400">{criticalCount}</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-mono text-slate-400 mb-1">HIGH PRIORITY</p>
                            <p className="text-3xl font-bold text-orange-400">{highCount}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-orange-400" />
                    </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-mono text-slate-400 mb-1">CALL CODES</p>
                            <p className="text-3xl font-bold text-blue-400">{filteredBySelection.length}</p>
                        </div>
                        <Filter className="w-8 h-8 text-blue-400" />
                    </div>
                </Card>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-2 gap-6">
                {/* Bar Chart */}
                <Card className="bg-slate-900 border-slate-800 p-6">
                    <h2 className="text-white font-mono font-bold mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" />
                        INCIDENT VOLUME BY CODE
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={filteredBySelection}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="code" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                                labelStyle={{ color: '#e2e8f0' }}
                                formatter={(value) => [`${value} calls`, 'Count']}
                            />
                            <Bar
                                dataKey="count"
                                fill="#3b82f6"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Pie Chart - Priority Distribution */}
                <Card className="bg-slate-900 border-slate-800 p-6">
                    <h2 className="text-white font-mono font-bold mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        PRIORITY DISTRIBUTION
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={[
                                    { name: 'Critical', value: filteredBySelection.filter(d => d.priority === 'critical').reduce((sum, d) => sum + d.count, 0) },
                                    { name: 'High', value: filteredBySelection.filter(d => d.priority === 'high').reduce((sum, d) => sum + d.count, 0) },
                                    { name: 'Medium', value: filteredBySelection.filter(d => d.priority === 'medium').reduce((sum, d) => sum + d.count, 0) },
                                    { name: 'Low', value: filteredBySelection.filter(d => d.priority === 'low').reduce((sum, d) => sum + d.count, 0) },
                                ]}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                <Cell fill={COLORS.critical} />
                                <Cell fill={COLORS.high} />
                                <Cell fill={COLORS.medium} />
                                <Cell fill={COLORS.low} />
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                                labelStyle={{ color: '#e2e8f0' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Code Filter & Details */}
            <Card className="bg-slate-900 border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-mono font-bold flex items-center gap-2">
                        <Filter className="w-5 h-5 text-blue-400" />
                        FILTER BY CODE
                    </h2>
                    {selectedCodes.length > 0 && (
                        <button
                            onClick={() => setSelectedCodes([])}
                            className="text-slate-400 hover:text-white flex items-center gap-1 text-xs font-mono"
                        >
                            <X className="w-4 h-4" /> CLEAR
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                    {CALL_TYPES.map(type => {
                        const count = codeStats[type.code]?.count || 0;
                        const isSelected = selectedCodes.includes(type.code);
                        return (
                            <button
                                key={type.code}
                                onClick={() => toggleCodeFilter(type.code)}
                                className={`px-3 py-2 rounded border font-mono text-xs transition-all ${
                                    isSelected
                                        ? `bg-${type.priority === 'critical' ? 'red' : 'orange'}-500/20 border-${type.priority === 'critical' ? 'red' : 'orange'}-500 text-${type.priority === 'critical' ? 'red' : 'orange'}-400`
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                            >
                                {type.code}: {type.label} ({count})
                            </button>
                        );
                    })}
                </div>

                {/* Detailed Code Table */}
                <div className="space-y-2">
                    {filteredBySelection.map(codeData => (
                        <div key={codeData.code} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                            <div>
                                <span className={`inline-block px-2 py-1 rounded text-xs font-bold mr-2 ${
                                    codeData.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                                    codeData.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                    'bg-blue-500/20 text-blue-400'
                                }`}>
                                    CODE {codeData.code}
                                </span>
                                <span className="text-white font-mono font-bold">{codeData.label}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <Badge className="bg-slate-700 text-slate-200 font-mono">
                                    {codeData.count} INCIDENTS
                                </Badge>
                                <span className={`text-sm font-mono font-bold ${
                                    codeData.priority === 'critical' ? 'text-red-400' :
                                    codeData.priority === 'high' ? 'text-orange-400' :
                                    'text-blue-400'
                                }`}>
                                    {((codeData.count / filteredBySelection.reduce((sum, d) => sum + d.count, 0)) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}