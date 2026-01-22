import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Clock, User, Activity, Download, Search } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function DispatchLog() {
    const [currentUser, setCurrentUser] = useState(null);
    const [statusLogs, setStatusLogs] = useState([]);
    const [callLogs, setCallLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
        const interval = setInterval(() => loadLogs(), 10000);
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            await loadLogs();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadLogs = async () => {
        try {
            const [unitLogs, callStatusLogs] = await Promise.all([
                base44.entities.UnitStatusLog.list('-created_date', 100),
                base44.entities.CallStatusLog.list('-created_date', 100)
            ]);
            setStatusLogs(unitLogs || []);
            setCallLogs(callStatusLogs || []);
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    };

    const allLogs = [
        ...statusLogs.map(log => ({ ...log, type: 'unit', timestamp: log.created_date })),
        ...callLogs.map(log => ({ ...log, type: 'call', timestamp: log.created_date }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const filteredLogs = allLogs.filter(log => {
        const matchesType = filterType === 'all' || log.type === filterType;
        const matchesSearch = !searchQuery || 
            log.unit_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.incident_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.new_status?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

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
                                className="text-slate-400 hover:text-white"
                            >
                                ← BACK
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <FileText className="w-6 h-6 text-purple-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">DISPATCH LOG</h1>
                            <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono">
                                {filteredLogs.length} ENTRIES
                            </Badge>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => toast.info('Export feature coming soon')}
                            className="bg-blue-600 hover:bg-blue-700 font-mono"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            EXPORT LOG
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search log entries..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-slate-900 border-slate-700 text-white font-mono text-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                {['all', 'unit', 'call'].map(type => (
                                    <Button
                                        key={type}
                                        size="sm"
                                        variant={filterType === type ? 'default' : 'outline'}
                                        onClick={() => setFilterType(type)}
                                        className={filterType === type ? 
                                            'bg-blue-600 hover:bg-blue-700 font-mono text-xs' : 
                                            'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                        }
                                    >
                                        {type === 'all' ? 'ALL' : type === 'unit' ? 'UNIT LOGS' : 'CALL LOGS'}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <ScrollArea className="h-[calc(100vh-240px)]">
                        <div className="p-4 space-y-2">
                            {filteredLogs.length === 0 ? (
                                <div className="text-center text-slate-500 font-mono py-8">
                                    NO LOG ENTRIES FOUND
                                </div>
                            ) : (
                                filteredLogs.map((log, idx) => (
                                    <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {log.type === 'unit' ? (
                                                    <User className="w-4 h-4 text-green-400" />
                                                ) : (
                                                    <Activity className="w-4 h-4 text-blue-400" />
                                                )}
                                                <Badge className={log.type === 'unit' ? 
                                                    'bg-green-500/20 text-green-400 border border-green-500/30 font-mono text-xs' : 
                                                    'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs'
                                                }>
                                                    {log.type === 'unit' ? 'UNIT STATUS' : 'CALL STATUS'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                                                <Clock className="w-3 h-3" />
                                                {new Date(log.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        {log.type === 'unit' ? (
                                            <div>
                                                <p className="text-white font-mono text-sm mb-1">
                                                    <span className="text-blue-400">{log.unit_name}</span> changed status:
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                        {log.old_status || 'N/A'}
                                                    </Badge>
                                                    <span className="text-slate-500">→</span>
                                                    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                                                        {log.new_status}
                                                    </Badge>
                                                </div>
                                                {log.notes && (
                                                    <p className="text-slate-400 text-xs font-mono mt-2">{log.notes}</p>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-white font-mono text-sm mb-1">
                                                    Call <span className="text-blue-400">{log.incident_type}</span> at {log.location}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                        {log.old_status || 'N/A'}
                                                    </Badge>
                                                    <span className="text-slate-500">→</span>
                                                    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                                                        {log.new_status}
                                                    </Badge>
                                                </div>
                                                {log.unit_name && (
                                                    <p className="text-slate-400 text-xs font-mono mt-2">
                                                        Unit: {log.unit_name}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    );
}