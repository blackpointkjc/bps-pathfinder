import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Activity, Radio, Users, CheckCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { createPageUrl } from '../utils';
import NavigationMenu from '@/components/NavigationMenu';

export default function SystemDiagnostics() {
    const [currentUser, setCurrentUser] = useState(null);
    const [diagnostics, setDiagnostics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            if (user.role !== 'admin') {
                toast.error('Admin access required');
                window.location.href = '/cadhome';
                return;
            }
            
            await loadDiagnostics();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadDiagnostics = async () => {
        setRefreshing(true);
        try {
            const startTime = performance.now();
            
            const [externalFeed, appCalls, users, statusLogs, callLogs] = await Promise.all([
                base44.functions.invoke('getExternalCalls', {}),
                base44.entities.DispatchCall.list(),
                base44.functions.invoke('fetchAllUsers', {}),
                base44.entities.UnitStatusLog.list('-created_date', 10),
                base44.entities.CallStatusLog.list('-created_date', 10)
            ]);
            
            const endTime = performance.now();
            const loadTime = Math.round(endTime - startTime);
            
            setDiagnostics({
                externalFeed: {
                    status: externalFeed.data?.status || 'unknown',
                    callCount: externalFeed.data?.calls?.length || 0,
                    lastRefresh: externalFeed.data?.lastRefresh || 'N/A',
                    cached: externalFeed.data?.cached || false,
                    stale: externalFeed.data?.stale || false
                },
                appCalls: {
                    total: appCalls?.length || 0,
                    active: appCalls?.filter(c => ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'].includes(c.status)).length || 0
                },
                users: {
                    total: users.data?.users?.length || 0,
                    online: users.data?.users?.filter(u => u.status !== 'Out of Service').length || 0
                },
                performance: {
                    loadTime: loadTime,
                    lastCheck: new Date().toISOString()
                },
                recentActivity: {
                    unitLogs: statusLogs?.length || 0,
                    callLogs: callLogs?.length || 0
                }
            });
            
            toast.success('Diagnostics refreshed');
        } catch (error) {
            toast.error('Failed to load diagnostics');
            console.error(error);
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <NavigationMenu currentUser={currentUser} />
                            <Shield className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">SYSTEM DIAGNOSTICS</h1>
                        </div>
                        <Button
                            onClick={loadDiagnostics}
                            disabled={refreshing}
                            className="bg-blue-600 hover:bg-blue-700 font-mono"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            REFRESH
                        </Button>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* External Feed Status */}
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                            <Radio className="w-5 h-5 text-blue-400" />
                            EXTERNAL FEED STATUS
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-4 gap-4">
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">STATUS</p>
                            <Badge className={`${
                                diagnostics?.externalFeed.status === 'ok' ? 'bg-green-500' :
                                diagnostics?.externalFeed.stale ? 'bg-orange-500' : 'bg-red-500'
                            } text-white font-mono`}>
                                {diagnostics?.externalFeed.stale ? 'STALE' : 
                                 diagnostics?.externalFeed.status === 'ok' ? 'OK' : 'ERROR'}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">EXTERNAL CALLS</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.externalFeed.callCount}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">LAST REFRESH</p>
                            <p className="text-white font-mono text-sm">
                                {diagnostics?.externalFeed.lastRefresh !== 'N/A' 
                                    ? new Date(diagnostics.externalFeed.lastRefresh).toLocaleTimeString()
                                    : 'N/A'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">CACHED</p>
                            <Badge className={diagnostics?.externalFeed.cached ? 'bg-blue-500' : 'bg-slate-700'}>
                                {diagnostics?.externalFeed.cached ? 'YES' : 'NO'}
                            </Badge>
                        </div>
                    </div>
                </Card>

                {/* Data Counts */}
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                            <Activity className="w-5 h-5 text-green-400" />
                            DATA STATISTICS
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-4 gap-4">
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">APP CALLS (TOTAL)</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.appCalls.total}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">ACTIVE CALLS</p>
                            <p className="text-2xl font-bold text-green-400 font-mono">{diagnostics?.appCalls.active}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">TOTAL USERS</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.users.total}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">UNITS ONLINE</p>
                            <p className="text-2xl font-bold text-blue-400 font-mono">{diagnostics?.users.online}</p>
                        </div>
                    </div>
                </Card>

                {/* Performance Metrics */}
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                            <Clock className="w-5 h-5 text-purple-400" />
                            PERFORMANCE
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">LOAD TIME</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.performance.loadTime}ms</p>
                            <p className="text-xs text-slate-500 font-mono mt-1">
                                {diagnostics?.performance.loadTime < 1000 ? 'EXCELLENT' : 
                                 diagnostics?.performance.loadTime < 2000 ? 'GOOD' : 'SLOW'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">LAST CHECK</p>
                            <p className="text-white font-mono text-sm">
                                {diagnostics?.performance.lastCheck 
                                    ? new Date(diagnostics.performance.lastCheck).toLocaleTimeString()
                                    : 'N/A'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">SYSTEM STATUS</p>
                            <Badge className="bg-green-500 text-white font-mono">
                                OPERATIONAL
                            </Badge>
                        </div>
                    </div>
                </Card>

                {/* Recent Activity */}
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                            <Users className="w-5 h-5 text-cyan-400" />
                            RECENT ACTIVITY (Last 10)
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">UNIT STATUS CHANGES</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.recentActivity.unitLogs}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-mono mb-2">CALL STATUS CHANGES</p>
                            <p className="text-2xl font-bold text-white font-mono">{diagnostics?.recentActivity.callLogs}</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}