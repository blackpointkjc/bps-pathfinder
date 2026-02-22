import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, AlertTriangle, Users, Activity, Clock, MapPin, TrendingUp, Shield, Monitor, Zap, Bell, RefreshCw, CheckCircle2, Car, XCircle, ClipboardList } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import CallDetailView from '@/components/map/CallDetailView';
import NavigationMenu from '@/components/NavigationMenu';
import PropertyAlertsBanner from '@/components/dispatch/PropertyAlertsBanner';
import IncidentReportModal from '@/components/dispatch/IncidentReportModal';

const STATUS_OPTIONS = [
    { label: 'Available', value: 'Available', color: 'bg-green-600 hover:bg-green-700', activeColor: 'bg-green-500/20 border-green-500 text-green-400' },
    { label: 'On Patrol', value: 'On Patrol', color: 'bg-indigo-600 hover:bg-indigo-700', activeColor: 'bg-indigo-500/20 border-indigo-500 text-indigo-400' },
    { label: 'On Scene', value: 'On Scene', color: 'bg-blue-600 hover:bg-blue-700', activeColor: 'bg-blue-500/20 border-blue-500 text-blue-400' },
    { label: 'Enroute', value: 'Enroute', color: 'bg-yellow-600 hover:bg-yellow-700', activeColor: 'bg-yellow-500/20 border-yellow-500 text-yellow-400' },
    { label: 'Out of Service', value: 'Out of Service', color: 'bg-gray-600 hover:bg-gray-700', activeColor: 'bg-gray-500/20 border-gray-500 text-gray-400' },
];

export default function CADHome() {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [unitStatus, setUnitStatus] = useState(() => localStorage.getItem('unitStatus') || 'Available');
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
    const [selectedCall, setSelectedCall] = useState(null);
    const [reportCall, setReportCall] = useState(null);
    const [sortOrder, setSortOrder] = useState('desc');
    const [refreshing, setRefreshing] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    useEffect(() => {
        init();
        
        // Real-time polling every 30 seconds
        const interval = setInterval(loadData, 30000);
        
        return () => clearInterval(interval);
    }, [sortOrder]);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            // Restore status from user profile (persisted in DB), fallback to localStorage
            if (user?.status && user.status !== 'Out of Service') {
                setUnitStatus(user.status);
                localStorage.setItem('unitStatus', user.status);
            } else if (user?.status === 'Out of Service') {
                setUnitStatus('Out of Service');
                localStorage.setItem('unitStatus', 'Out of Service');
            }
            await loadData();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (updatingStatus) return;
        setUpdatingStatus(true);
        const oldStatus = unitStatus;
        setUnitStatus(newStatus);
        localStorage.setItem('unitStatus', newStatus);
        try {
            await base44.functions.invoke('updateOfficerStatus', { status: newStatus });
            const updateData = {
                status: newStatus,
                show_on_map: newStatus !== 'Out of Service',
                last_updated: new Date().toISOString()
            };
            if (newStatus === 'Available' || newStatus === 'Out of Service') {
                updateData.current_call_id = null;
                updateData.current_call_info = null;
            }
            await base44.auth.updateMe(updateData);
            toast.success(`Status: ${newStatus}`);
        } catch (error) {
            setUnitStatus(oldStatus);
            localStorage.setItem('unitStatus', oldStatus);
            toast.error('Failed to update status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const loadData = async () => {
        try {
            // Fetch calls from DispatchCall (populated by ingestGractivecalls from gractivecalls.com) and users
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.list('-created_date', 200),
                base44.entities.User.list()
            ]);

            const calls = callsData || [];
            const allUsers = usersData || [];

            // Filter: all active calls (both dispatch and scraper)
            const recentCalls = calls.filter(call => {
                const isActive = !call.status || !['Closed', 'Cleared', 'Cancelled'].includes(call.status);
                return isActive;
            }).sort((a, b) => {
                const timeA = new Date(a.time_received || a.created_date);
                const timeB = new Date(b.time_received || b.created_date);
                return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });

            console.log('📞 CADHome loaded calls:', recentCalls.length);
            console.log('👥 CADHome loaded users:', allUsers.length);

            setActiveCalls(recentCalls);
            setUnits(allUsers);

            // Filter critical calls - keep them for 12 hours
            const twelveHoursAgo = new Date();
            twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
            
            const critical = calls.filter(call => {
                const incident = call.incident?.toLowerCase() || '';
                const callTime = new Date(call.created_date);
                const isActive = !['Closed', 'Cleared', 'Cancelled'].includes(call.status);
                const isCritical = incident.includes('shooting') || incident.includes('officer') || 
                                   incident.includes('assault') || incident.includes('robbery') ||
                                   call.priority === 'critical' || call.priority === 'high';
                return isCritical && isActive && callTime >= twelveHoursAgo;
            }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            setCriticalCalls(critical);

            // Calculate metrics
            const available = allUsers.filter(u => u.status === 'Available').length;
            const busy = allUsers.filter(u => u.status === 'Enroute' || u.status === 'On Scene' || u.status === 'Busy').length;

            setMetrics({
                totalCalls: recentCalls.length,
                unitsAvailable: available,
                unitsBusy: busy,
                avgResponseTime: Math.floor(Math.random() * 5) + 3, // Mock for now
                criticalCalls: critical.length
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        toast.info('Scraping live feed — this takes ~60 seconds...');
        try {
            await base44.functions.invoke('ingestGractivecalls', {});
            await loadData();
            toast.success('Live feed refreshed!');
        } catch (err) {
            // Even on timeout/error the scrape may have partially completed — reload anyway
            await loadData();
            toast.info('Feed reloaded (scrape may still be running)');
        } finally {
            setRefreshing(false);
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
                            <NavigationMenu currentUser={currentUser} />
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
                            {/* Status Selector */}
                            {currentUser && (
                                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                                    <span className="text-slate-400 font-mono text-xs px-2">MY STATUS:</span>
                                    {STATUS_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => handleStatusChange(opt.value)}
                                            disabled={updatingStatus}
                                            className={`px-3 py-1 rounded font-mono text-xs font-bold transition-all border ${
                                                unitStatus === opt.value
                                                    ? `${opt.activeColor} border`
                                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                                            }`}
                                        >
                                            {opt.label.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <Button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="bg-green-700 hover:bg-green-600 font-mono text-xs"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                                {refreshing ? 'REFRESHING...' : 'REFRESH FEED'}
                            </Button>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded">
                                <Radio className="w-3 h-3 text-green-400 animate-pulse" />
                                <span className="text-green-400 font-mono text-xs font-bold">SYSTEM ONLINE</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded">
                                <Activity className="w-3 h-3 text-blue-400" />
                                <span className="text-blue-400 font-mono text-xs font-bold">{metrics.totalCalls} ACTIVE</span>
                            </div>
                            <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded font-mono text-xs text-slate-300">
                                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6 space-y-6">
                {/* Property Alerts */}
                <PropertyAlertsBanner />
                
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
                                     onClick={() => setSelectedCall(call)}>
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
                                                <div className="flex gap-2">
                                                    <Button 
                                                        size="sm"
                                                        className={`font-mono text-xs ${sortOrder === 'desc' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                                                        onClick={() => setSortOrder('desc')}
                                                    >
                                                        NEWEST
                                                    </Button>
                                                    <Button 
                                                        size="sm"
                                                        className={`font-mono text-xs ${sortOrder === 'asc' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                                                        onClick={() => setSortOrder('asc')}
                                                    >
                                                        OLDEST
                                                    </Button>
                                                    <Button 
                                                        size="sm"
                                                        className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                                        onClick={() => navigate(createPageUrl('DispatchCenter'))}
                                                    >
                                                        VIEW ALL
                                                    </Button>
                                                </div>
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
                                            className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 hover:border-blue-500 transition-all"
                                        >
                                            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedCall(call)}>
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
                                                <div className="text-xs text-slate-500 font-mono shrink-0">
                                                  {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { 
                                                      hour: '2-digit', minute: '2-digit', hour12: true,
                                                      timeZone: 'America/New_York'
                                                  })} EST
                                                </div>
                                            </div>
                                            <div className="mt-2 flex justify-end">
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); setReportCall(call); }}
                                                    className="bg-blue-700 hover:bg-blue-600 font-mono text-xs h-7 px-3"
                                                >
                                                    <ClipboardList className="w-3 h-3 mr-1" />
                                                    WRITE REPORT
                                                </Button>
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
                                    units.filter(u => {
                                       if (!u.status || u.status === 'Out of Service') return false;
                                       // Hide units not updated in 12 hours
                                       const lastUpdate = u.last_updated ? new Date(u.last_updated).getTime() : 0;
                                       return lastUpdate > Date.now() - 12 * 60 * 60 * 1000;
                                    }).map((unit) => (
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
                        onClick={() => navigate(createPageUrl('ActiveCalls'))}
                    >
                        <Radio className="w-8 h-8 text-blue-400" />
                        <span className="text-white font-mono font-bold">ACTIVE CALLS</span>
                    </Button>
                    
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-green-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('DispatchCenter'))}
                    >
                        <Users className="w-8 h-8 text-green-400" />
                        <span className="text-white font-mono font-bold">DISPATCH</span>
                    </Button>
                    
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-purple-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('DispatchLog'))}
                    >
                        <Activity className="w-8 h-8 text-purple-400" />
                        <span className="text-white font-mono font-bold">DISPATCH LOG</span>
                    </Button>
                    
                    <Button 
                        className="h-24 bg-slate-900 border-2 border-orange-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('Reports'))}
                    >
                        <TrendingUp className="w-8 h-8 text-orange-400" />
                        <span className="text-white font-mono font-bold">REPORTS</span>
                    </Button>

                    <Button 
                        className="h-24 bg-slate-900 border-2 border-cyan-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('Personnel'))}
                    >
                        <Users className="w-8 h-8 text-cyan-400" />
                        <span className="text-white font-mono font-bold">PERSONNEL</span>
                    </Button>

                    <Button 
                        className="h-24 bg-slate-900 border-2 border-emerald-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('SystemStatus'))}
                    >
                        <Zap className="w-8 h-8 text-emerald-400" />
                        <span className="text-white font-mono font-bold">SYSTEM STATUS</span>
                    </Button>

                    <Button 
                        className="h-24 bg-slate-900 border-2 border-indigo-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                        onClick={() => navigate(createPageUrl('DispatchCenter'))}
                    >
                        <Monitor className="w-8 h-8 text-indigo-400" />
                        <span className="text-white font-mono font-bold">DISPATCH CENTER</span>
                    </Button>
                    
                    {currentUser?.role === 'admin' && (
                        <Button 
                            className="h-24 bg-slate-900 border-2 border-red-500 hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
                            onClick={() => navigate(createPageUrl('AdminPortal'))}
                        >
                            <Shield className="w-8 h-8 text-red-400" />
                            <span className="text-white font-mono font-bold">ADMIN</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Call Detail Modal */}
            {selectedCall && (
                <CallDetailView
                    call={selectedCall}
                    onClose={() => setSelectedCall(null)}
                    onEnroute={() => {
                        setSelectedCall(null);
                        navigate(createPageUrl('Navigation'));
                    }}
                />
            )}

            {/* Incident Report Modal */}
            {reportCall && (
                <IncidentReportModal
                    call={reportCall}
                    currentUser={currentUser}
                    onClose={() => setReportCall(null)}
                />
            )}
        </div>
    );
}