import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, AlertTriangle, Users, Activity, Clock, MapPin, TrendingUp, Shield, Monitor, Zap, Bell } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function CADHome() {
    const [currentUser, setCurrentUser] = useState(null);
    const [activeCalls, setActiveCalls] = useState([]);
    const [units, setUnits] = useState([]);
    const [criticalCalls, setCriticalCalls] = useState([]);
    const [metrics, setMetrics] = useState({
        totalCalls: 0,
        unitsAvailable: 0,
        unitsBusy: 0,
        avgResponseTime: 0,
        criticalCalls: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
        
        const interval = setInterval(() => {
            loadData();
        }, 5000);
        
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            await loadData();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadData = async () => {
        try {
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.filter({
                    status: { $in: ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'] }
                }),
                base44.functions.invoke('fetchAllUsers', {})
            ]);

            const calls = callsData || [];
            const allUsers = usersData.data?.users || [];

            setActiveCalls(calls);
            setUnits(allUsers);

            // Filter critical calls
            const critical = calls.filter(call => {
                const incident = call.incident?.toLowerCase() || '';
                return incident.includes('shooting') || incident.includes('officer') || 
                       incident.includes('assault') || incident.includes('robbery') ||
                       call.priority === 'critical' || call.priority === 'high';
            });
            setCriticalCalls(critical);

            // Calculate metrics
            const available = allUsers.filter(u => u.status === 'Available').length;
            const busy = allUsers.filter(u => u.status === 'Enroute' || u.status === 'On Scene' || u.status === 'Busy').length;

            setMetrics({
                totalCalls: calls.length,
                unitsAvailable: available,
                unitsBusy: busy,
                avgResponseTime: Math.floor(Math.random() * 5) + 3, // Mock for now
                criticalCalls: critical.length
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const getPriorityColor = (call) => {
        const incident = call.incident?.toLowerCase() || '';
        if (incident.includes('shooting') || incident.includes('officer') || call.priority === 'critical') {
            return 'bg-red-500';
        }
        if (incident.includes('assault') || incident.includes('robbery') || call.priority === 'high') {
            return 'bg-orange-500';
        }
        return 'bg-blue-500';
    };

    const getStatusColor = (status) => {
        const statusMap = {
            'Available': 'bg-green-500',
            'Enroute': 'bg-yellow-500',
            'On Scene': 'bg-blue-500',
            'Busy': 'bg-orange-500',
            'Out of Service': 'bg-gray-500'
        };
        return statusMap[status] || 'bg-gray-500';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
                    <div className="text-blue-400 font-mono text-sm">LOADING CAD SYSTEM...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Top Status Bar */}
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-lg flex items-center justify-center">
                                <Radio className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white tracking-tight font-mono">CAD DISPATCH CONSOLE</h1>
                                <p className="text-xs text-slate-400 font-mono">
                                    {currentUser?.rank && currentUser?.last_name ? `${currentUser.rank} ${currentUser.last_name}` : currentUser?.full_name} • 
                                    {currentUser?.unit_number ? ` UNIT-${currentUser.unit_number}` : ' DISPATCHER'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-green-400 font-mono text-xs font-bold">SYSTEM ONLINE</span>
                            </div>
                            <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded font-mono text-xs text-slate-300">
                                {new Date().toLocaleTimeString('en-US', { hour12: false })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6 space-y-6">
                {/* Metrics Bar */}
                <div className="grid grid-cols-5 gap-4">
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">ACTIVE CALLS</p>
                                <p className="text-3xl font-bold text-white font-mono">{metrics.totalCalls}</p>
                            </div>
                            <Radio className="w-8 h-8 text-blue-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">UNITS AVAILABLE</p>
                                <p className="text-3xl font-bold text-green-400 font-mono">{metrics.unitsAvailable}</p>
                            </div>
                            <Users className="w-8 h-8 text-green-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">UNITS BUSY</p>
                                <p className="text-3xl font-bold text-orange-400 font-mono">{metrics.unitsBusy}</p>
                            </div>
                            <Activity className="w-8 h-8 text-orange-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">AVG RESPONSE</p>
                                <p className="text-3xl font-bold text-blue-400 font-mono">{metrics.avgResponseTime}m</p>
                            </div>
                            <Clock className="w-8 h-8 text-blue-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">CRITICAL</p>
                                <p className="text-3xl font-bold text-red-400 font-mono">{metrics.criticalCalls}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>
                    </Card>
                </div>

                {/* Critical Alerts Section */}
                {criticalCalls.length > 0 && (
                    <div className="bg-gradient-to-r from-red-900/50 to-red-800/50 border-2 border-red-500 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse" />
                            <h2 className="text-lg font-bold text-white font-mono">CRITICAL ALERTS</h2>
                            <Badge className="bg-red-500 text-white font-mono">{criticalCalls.length}</Badge>
                        </div>
                        <div className="space-y-2">
                            {criticalCalls.slice(0, 3).map((call) => (
                                <div key={call.id} className="bg-slate-900/80 border border-red-500/30 rounded-lg p-3 hover:border-red-500 transition-all cursor-pointer"
                                     onClick={() => window.location.href = createPageUrl('DispatchCenter')}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge className="bg-red-500 text-white font-mono text-xs">PRIORITY</Badge>
                                                <span className="text-white font-mono font-bold text-sm">{call.incident}</span>
                                            </div>
                                            <p className="text-slate-400 text-xs font-mono flex items-center gap-2">
                                                <MapPin className="w-3 h-3" />
                                                {call.location}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-400 font-mono">{call.agency}</p>
                                            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-mono text-xs mt-1">
                                                {call.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Grid */}
                <div className="grid grid-cols-3 gap-6">
                    {/* Active Calls Queue */}
                    <div className="col-span-2">
                        <Card className="bg-slate-900 border-slate-800 h-full">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Radio className="w-5 h-5 text-blue-400" />
                                        <h2 className="text-lg font-bold text-white font-mono">ACTIVE CALLS QUEUE</h2>
                                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                            {activeCalls.length}
                                        </Badge>
                                    </div>
                                    <Button 
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                        onClick={() => window.location.href = createPageUrl('DispatchCenter')}
                                    >
                                        VIEW ALL
                                    </Button>
                                </div>
                            </div>
                            <div className="p-4 space-y-2 h-[500px] overflow-y-auto">
                                {activeCalls.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-slate-500 font-mono text-sm">
                                        NO ACTIVE CALLS
                                    </div>
                                ) : (
                                    activeCalls.map((call) => (
                                        <div 
                                            key={call.id}
                                            className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 hover:border-blue-500 transition-all cursor-pointer"
                                            onClick={() => window.location.href = createPageUrl('DispatchCenter')}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-2 h-2 rounded-full mt-2 ${getPriorityColor(call)}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-white font-mono font-bold text-sm">{call.incident}</span>
                                                        <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                            {call.agency}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-slate-400 text-xs font-mono flex items-center gap-2 mb-2">
                                                        <MapPin className="w-3 h-3" />
                                                        {call.location}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                                                            {call.status}
                                                        </Badge>
                                                        {call.assigned_units && call.assigned_units.length > 0 && (
                                                            <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 font-mono text-xs">
                                                                {call.assigned_units.length} UNIT{call.assigned_units.length > 1 ? 'S' : ''}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono">
                                                    {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour12: false })}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Unit Status Board */}
                    <div>
                        <Card className="bg-slate-900 border-slate-800 h-full">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-5 h-5 text-green-400" />
                                        <h2 className="text-lg font-bold text-white font-mono">UNIT STATUS</h2>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 space-y-2 h-[500px] overflow-y-auto">
                                {units.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-slate-500 font-mono text-sm">
                                        NO UNITS ONLINE
                                    </div>
                                ) : (
                                    units.filter(u => u.status !== 'Out of Service').map((unit) => (
                                        <div key={unit.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${getStatusColor(unit.status)}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-white font-mono font-bold text-sm">
                                                            {unit.unit_number ? `UNIT-${unit.unit_number}` : unit.full_name}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-400 text-xs font-mono">
                                                        {unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name}
                                                    </p>
                                                </div>
                                                <Badge className={`${
                                                    unit.status === 'Available' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                                    unit.status === 'Enroute' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                                    unit.status === 'On Scene' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                                    'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                                } border font-mono text-xs`}>
                                                    {unit.status || 'UNKNOWN'}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Navigation Buttons */}
                <div className="grid grid-cols-4 gap-4">
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-blue-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => window.location.href = createPageUrl('DispatchCenter')}
                    >
                        <Monitor className="w-8 h-8 text-blue-400" />
                        <span className="text-white font-mono font-bold">DISPATCH CENTER</span>
                    </Button>
                    
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-green-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => window.location.href = createPageUrl('Navigation')}
                    >
                        <MapPin className="w-8 h-8 text-green-400" />
                        <span className="text-white font-mono font-bold">LIVE MAP</span>
                    </Button>
                    
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-purple-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => window.location.href = createPageUrl('CallHistory')}
                    >
                        <Clock className="w-8 h-8 text-purple-400" />
                        <span className="text-white font-mono font-bold">CALL HISTORY</span>
                    </Button>
                    
                    {currentUser?.role === 'admin' && (
                        <Button 
                            className="h-24 bg-slate-900 border-2 border-red-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                            onClick={() => window.location.href = createPageUrl('AdminPortal')}
                        >
                            <Shield className="w-8 h-8 text-red-400" />
                            <span className="text-white font-mono font-bold">ADMIN</span>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}