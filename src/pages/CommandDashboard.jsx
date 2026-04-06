import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Radio, AlertTriangle, Users, Activity, Clock, MapPin, Zap,
    TrendingUp, RefreshCw, CheckCircle2, PhoneCall, Shield,
    ArrowRight, Timer
} from 'lucide-react';

const PRIORITY_COLORS = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
};

const STATUS_BADGE = {
    Available: 'bg-green-500/20 text-green-400 border-green-500/30',
    Enroute: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'On Scene': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    Busy: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Out of Service': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function KPICard({ label, value, sub, icon: Icon, color = 'text-gold' }) {
    return (
        <Card className="bg-slate-900 border-slate-800 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-2xl font-bold text-white font-mono">{value}</p>
                <p className="text-xs text-slate-400 font-mono">{label}</p>
                {sub && <p className="text-[10px] text-slate-500 font-mono">{sub}</p>}
            </div>
        </Card>
    );
}

function getCallPriority(call) {
    const t = `${call.incident || ''} ${call.description || ''}`.toLowerCase();
    if (/shooting|stabbing|officer|shots|active shooter|code 3/.test(t)) return 'critical';
    if (/assault|robbery|burglary|domestic|pursuit|accident with injury/.test(t)) return 'high';
    if (/suspicious|disturbance|trespass|alarm/.test(t)) return 'medium';
    return 'low';
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function CommandDashboard() {
    const navigate = useNavigate();
    const [calls, setCalls] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    useEffect(() => {
        loadData();
        const interval = setInterval(() => loadData(), 20000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            await base44.functions.invoke('ingestGractivecalls', {});
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.list('-created_date', 200),
                base44.entities.User.list()
            ]);
            const active = (callsData || []).filter(c => !['Closed', 'Cleared', 'Cancelled'].includes(c.status));
            setCalls(active);
            setUnits(usersData || []);
            setLastRefresh(new Date());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await base44.functions.invoke('ingestGractivecalls', {});
            await loadData();
        } catch (e) {
            await loadData();
        } finally {
            setRefreshing(false);
        }
    };

    const activeUnits = units.filter(u => u.status && u.status !== 'Out of Service' && u.last_updated && Date.now() - new Date(u.last_updated) < 12 * 3600000);
    const available = activeUnits.filter(u => u.status === 'Available').length;
    const enroute = activeUnits.filter(u => u.status === 'Enroute').length;
    const onScene = activeUnits.filter(u => u.status === 'On Scene').length;

    const criticalCalls = calls.filter(c => getCallPriority(c) === 'critical');
    const highCalls = calls.filter(c => getCallPriority(c) === 'high');
    const unassigned = calls.filter(c => !c.assigned_units || c.assigned_units.length === 0);

    const sortedCalls = [...calls].sort((a, b) => {
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[getCallPriority(a)] ?? 3) - (pOrder[getCallPriority(b)] ?? 3);
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-gold border-t-transparent" />
                    <p className="text-gold font-mono text-sm">LOADING COMMAND CENTER...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-950 p-4 md:p-5 space-y-4 min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white font-mono tracking-tight">COMMAND CENTER</h1>
                    <p className="text-xs text-slate-400 font-mono">
                        Live ops — refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleRefresh} disabled={refreshing} size="sm"
                        className="bg-slate-800 border border-slate-700 text-slate-300 hover:border-gold hover:text-gold font-mono text-xs">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                        REFRESH
                    </Button>
                    <Button onClick={() => navigate(createPageUrl('DispatchCenter'))} size="sm"
                        className="bg-gold text-black font-bold font-mono text-xs hover:bg-yellow-400">
                        <Zap className="w-3.5 h-3.5 mr-1.5" />DISPATCH
                    </Button>
                </div>
            </div>

            {/* Critical Alert Banner */}
            {criticalCalls.length > 0 && (
                <div className="bg-red-950/60 border-2 border-red-500 rounded-xl p-3 flex items-center gap-3 animate-pulse-border">
                    <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0" />
                    <div className="flex-1">
                        <span className="text-red-300 font-mono font-bold text-sm">
                            {criticalCalls.length} CRITICAL INCIDENT{criticalCalls.length > 1 ? 'S' : ''} ACTIVE
                        </span>
                        <span className="text-red-400 font-mono text-xs ml-3">
                            {criticalCalls[0].incident} @ {criticalCalls[0].location}
                        </span>
                    </div>
                    <Button size="sm" onClick={() => navigate(createPageUrl('CallHistory'))}
                        className="bg-red-600 hover:bg-red-500 text-white font-mono text-xs">
                        VIEW <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <KPICard label="ACTIVE CALLS" value={calls.length} icon={Radio} color="text-gold" />
                <KPICard label="CRITICAL" value={criticalCalls.length} icon={AlertTriangle} color="text-red-400" />
                <KPICard label="UNASSIGNED" value={unassigned.length} icon={PhoneCall} color="text-orange-400" />
                <KPICard label="UNITS AVAILABLE" value={available} icon={CheckCircle2} color="text-green-400" />
                <KPICard label="EN ROUTE" value={enroute} icon={Zap} color="text-yellow-400" />
                <KPICard label="ON SCENE" value={onScene} icon={MapPin} color="text-blue-400" />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Priority Call Queue */}
                <div className="lg:col-span-2">                    
                    <Card className="bg-slate-900 border-slate-800">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Radio className="w-4 h-4 text-gold" />
                                <span className="text-white font-mono font-bold text-sm">LIVE INCIDENT QUEUE</span>
                                <Badge className="bg-gold/20 text-gold border-gold/30 font-mono text-xs">{calls.length}</Badge>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => navigate(createPageUrl('DispatchCenter'))}
                                className="text-slate-400 hover:text-gold font-mono text-xs">
                                ALL CALLS <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                        <div className="divide-y divide-slate-800 max-h-[420px] overflow-y-auto">
                            {sortedCalls.length === 0 ? (
                                <div className="flex items-center justify-center py-12 text-slate-500 font-mono text-sm">
                                    NO ACTIVE CALLS
                                </div>
                            ) : sortedCalls.slice(0, 15).map(call => {
                                const priority = getCallPriority(call);
                                return (
                                    <div key={call.id}
                                        onClick={() => navigate(createPageUrl('CallHistory'))}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition-colors">
                                        <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${PRIORITY_COLORS[priority] || 'bg-slate-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-mono font-bold text-sm truncate">{call.incident}</span>
                                                <Badge className={`text-[10px] font-mono border ${priority === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' : priority === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                                                    {priority.toUpperCase()}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-slate-400 text-xs font-mono flex items-center gap-1 truncate">
                                                    <MapPin className="w-3 h-3 flex-shrink-0" />{call.location}
                                                </span>
                                                <span className="text-slate-500 text-[10px] font-mono flex-shrink-0">{call.agency}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                <Timer className="w-3 h-3" />{timeAgo(call.time_received || call.created_date)}
                                            </div>
                                            {call.assigned_units?.length > 0 ? (
                                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] font-mono mt-1">
                                                    {call.assigned_units.length}U
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] font-mono mt-1">
                                                    UNASSIGNED
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>

                {/* Unit Status Board */}
                <div className="space-y-4">
                    <Card className="bg-slate-900 border-slate-800">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
                            <Users className="w-4 h-4 text-gold" />
                            <span className="text-white font-mono font-bold text-sm">UNIT STATUS</span>
                            <Badge className="bg-gold/20 text-gold border-gold/30 font-mono text-xs ml-auto">{activeUnits.length}</Badge>
                        </div>
                        <div className="divide-y divide-slate-800 max-h-[300px] overflow-y-auto">
                            {activeUnits.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 font-mono text-xs">NO UNITS ONLINE</div>
                            ) : activeUnits.map(unit => (
                                <div key={unit.id} className="flex items-center gap-3 px-4 py-2.5">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                        unit.status === 'Available' ? 'bg-green-400' :
                                        unit.status === 'Enroute' ? 'bg-yellow-400' :
                                        unit.status === 'On Scene' ? 'bg-blue-400' : 'bg-orange-400'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-mono text-xs font-bold truncate">
                                            {unit.unit_number ? `UNIT-${unit.unit_number}` : unit.full_name}
                                        </div>
                                        {unit.current_call_info && (
                                            <div className="text-slate-500 text-[10px] font-mono truncate">{unit.current_call_info}</div>
                                        )}
                                    </div>
                                    <Badge className={`text-[10px] font-mono border ${STATUS_BADGE[unit.status] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                                        {(unit.status || 'UNK').toUpperCase()}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Quick Actions */}
                    <Card className="bg-slate-900 border-slate-800 p-3">
                        <div className="text-[10px] text-slate-500 font-mono font-bold mb-2 px-1">QUICK ACTIONS</div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'DISPATCH', icon: Zap, page: 'DispatchCenter', cls: 'border-gold/40 text-gold hover:bg-gold/10' },
                                { label: 'LIVE MAP', icon: MapPin, page: 'Navigation', cls: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                                { label: 'PERSONNEL', icon: Users, page: 'Personnel', cls: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
                                { label: 'REPORTS', icon: TrendingUp, page: 'Reports', cls: 'border-purple-500/40 text-purple-400 hover:bg-purple-500/10' },
                            ].map(({ label, icon: Icon, page, cls }) => (
                                <Button key={page} size="sm" onClick={() => navigate(createPageUrl(page))}
                                    className={`bg-transparent border font-mono text-xs h-10 ${cls}`}>
                                    <Icon className="w-3.5 h-3.5 mr-1.5" />{label}
                                </Button>
                            ))}
                        </div>
                    </Card>

                    {/* Unassigned Alert */}
                    {unassigned.length > 0 && (
                        <Card className="bg-orange-950/40 border-orange-500/40 p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-orange-400" />
                                <span className="text-orange-300 font-mono text-xs font-bold">NEEDS ASSIGNMENT</span>
                            </div>
                            <div className="space-y-1.5">
                                {unassigned.slice(0, 3).map(call => (
                                    <div key={call.id} className="text-orange-400 text-[10px] font-mono truncate">
                                        • {call.incident} @ {call.location}
                                    </div>
                                ))}
                                {unassigned.length > 3 && (
                                    <div className="text-orange-500 text-[10px] font-mono">+{unassigned.length - 3} more</div>
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

        </div>
    );
}