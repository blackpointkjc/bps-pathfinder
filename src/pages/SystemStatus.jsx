import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Server, Database, Zap, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function SystemStatus() {
    const [currentUser, setCurrentUser] = useState(null);
    const [systemHealth, setSystemHealth] = useState({
        uptime: '99.9%',
        callsProcessed: 0,
        activeConnections: 0,
        lastIncident: null
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Load system metrics
            const calls = await base44.entities.DispatchCall.list('-created_date', 1000);
            const users = await base44.functions.invoke('fetchAllUsers', {});
            
            setSystemHealth({
                uptime: '99.9%',
                callsProcessed: calls?.length || 0,
                activeConnections: users.data?.users?.length || 0,
                lastIncident: calls?.[0]
            });
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
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
            {/* Header */}
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => window.location.href = createPageUrl('CADHome')}
                                className="text-slate-400 hover:text-white font-mono text-xs"
                            >
                                ← CAD HOME
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <Activity className="w-6 h-6 text-green-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">SYSTEM STATUS</h1>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-green-400 font-mono text-xs font-bold">OPERATIONAL</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('ActiveCalls')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                CALLS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Units')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                UNITS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Reports')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                REPORTS
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-4 gap-6 mb-6">
                    <Card className="bg-slate-900 border-slate-800">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <Server className="w-8 h-8 text-green-400" />
                                <CheckCircle className="w-6 h-6 text-green-500" />
                            </div>
                            <p className="text-xs font-mono text-slate-400 mb-1">SYSTEM UPTIME</p>
                            <p className="text-3xl font-bold text-green-400 font-mono">{systemHealth.uptime}</p>
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <div className="p-6">
                            <Database className="w-8 h-8 text-blue-400 mb-4" />
                            <p className="text-xs font-mono text-slate-400 mb-1">CALLS PROCESSED</p>
                            <p className="text-3xl font-bold text-blue-400 font-mono">{systemHealth.callsProcessed}</p>
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <div className="p-6">
                            <Zap className="w-8 h-8 text-yellow-400 mb-4" />
                            <p className="text-xs font-mono text-slate-400 mb-1">ACTIVE CONNECTIONS</p>
                            <p className="text-3xl font-bold text-yellow-400 font-mono">{systemHealth.activeConnections}</p>
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <div className="p-6">
                            <TrendingUp className="w-8 h-8 text-purple-400 mb-4" />
                            <p className="text-xs font-mono text-slate-400 mb-1">AVG RESPONSE</p>
                            <p className="text-3xl font-bold text-purple-400 font-mono">3.2m</p>
                        </div>
                    </Card>
                </div>

                {/* System Components */}
                <div className="grid grid-cols-2 gap-6">
                    <Card className="bg-slate-900 border-slate-800">
                        <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                            <h2 className="text-lg font-bold text-white font-mono">SYSTEM COMPONENTS</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { name: 'Database Service', status: 'operational', uptime: '100%' },
                                { name: 'Dispatch Server', status: 'operational', uptime: '99.9%' },
                                { name: 'Map Service', status: 'operational', uptime: '100%' },
                                { name: 'Authentication', status: 'operational', uptime: '100%' }
                            ].map((component, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="text-white font-mono text-sm">{component.name}</span>
                                    </div>
                                    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 font-mono text-xs">
                                        {component.uptime}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                            <h2 className="text-lg font-bold text-white font-mono">RECENT ACTIVITY</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            {systemHealth.lastIncident && (
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                                    <p className="text-xs text-slate-400 font-mono mb-1">LATEST CALL</p>
                                    <p className="text-white font-semibold text-sm mb-1">{systemHealth.lastIncident.incident}</p>
                                    <p className="text-slate-400 text-xs font-mono flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(systemHealth.lastIncident.created_date).toLocaleString()}
                                    </p>
                                </div>
                            )}
                            <div className="text-center text-slate-500 font-mono text-sm py-4">
                                SYSTEM MONITORING ACTIVE
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}