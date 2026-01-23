import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { FileText, Clock, User, Activity, Download, Search, Archive } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function DispatchLog() {
    const [currentUser, setCurrentUser] = useState(null);
    const [statusLogs, setStatusLogs] = useState([]);
    const [callLogs, setCallLogs] = useState([]);
    const [externalCalls, setExternalCalls] = useState([]);
    const [unclassifiedCalls, setUnclassifiedCalls] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterSource, setFilterSource] = useState('all'); // all, internal, external
    const [filterStatus, setFilterStatus] = useState('active'); // active, archived, all
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('legacy'); // legacy, external_active, external_archived

    useEffect(() => {
        init();
        
        // Check URL params for view mode
        const params = new URLSearchParams(window.location.search);
        const urlView = params.get('view');
        if (urlView === 'archived_external') {
            setView('external_archived');
        }
        
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
            const [unitLogs, callStatusLogs, activeExternal, archivedExternal] = await Promise.all([
                base44.entities.UnitStatusLog.list('-created_date', 100),
                base44.entities.CallStatusLog.list('-created_date', 100),
                base44.functions.invoke('getExternalCallsWithWindow', { includeArchived: false }).catch(() => ({ data: { calls: [], unclassified: [] } })),
                base44.functions.invoke('getExternalCallsWithWindow', { includeArchived: true }).catch(() => ({ data: { calls: [], unclassified: [] } }))
            ]);
            setStatusLogs(unitLogs || []);
            setCallLogs(callStatusLogs || []);
            
            // Combine external calls (active + archived) and deduplicate
            const activeSet = new Set((activeExternal.data?.calls || []).map(c => c.id));
            const external = [...(activeExternal.data?.calls || []), ...(archivedExternal.data?.calls || []).filter(c => !activeSet.has(c.id))];
            setExternalCalls(external);
            setUnclassifiedCalls(archivedExternal.data?.unclassified || []);
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    };

    const getDisplayLogs = () => {
        if (view === 'external_active') {
            return externalCalls.filter(c => !c.archived).sort((a, b) => 
                new Date(b.time_received || b.created_date) - new Date(a.time_received || a.created_date)
            );
        } else if (view === 'external_archived') {
            return externalCalls.filter(c => c.archived).sort((a, b) => 
                new Date(b.archivedAt) - new Date(a.archivedAt)
            );
        } else {
            // Legacy view
            const allLogs = [
                ...statusLogs.map(log => ({ ...log, type: 'unit', timestamp: log.created_date })),
                ...callLogs.map(log => ({ ...log, type: 'call', timestamp: log.created_date }))
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return allLogs;
        }
    };

    const allLogs = getDisplayLogs();

    const filteredLogs = allLogs.filter(log => {
        const matchesSearch = !searchQuery || 
            log.unit_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.incident_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.incident?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.new_status?.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (view === 'legacy') {
            const matchesType = filterType === 'all' || log.type === filterType;
            return matchesType && matchesSearch;
        } else {
            // For external views, match on source if filtered
            return matchesSearch;
        }
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
                                {view === 'legacy' ? `${filteredLogs.length} ENTRIES` : `${filteredLogs.length} CALLS`}
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
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => window.location.href = createPageUrl('CADHome')}
                                    className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                >
                                    HOME
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => window.location.href = createPageUrl('ActiveCalls')}
                                    className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                >
                                    CALLS
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => window.location.href = createPageUrl('Reports')}
                                    className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                >
                                    REPORTS
                                </Button>
                            </div>
                            <div className="flex gap-2 ml-auto">
                                {/* View Mode Selector */}
                                <Button
                                    size="sm"
                                    variant={view === 'legacy' ? 'default' : 'outline'}
                                    onClick={() => setView('legacy')}
                                    className={view === 'legacy' ? 
                                        'bg-purple-600 hover:bg-purple-700 font-mono text-xs' : 
                                        'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                    }
                                >
                                    LEGACY
                                </Button>
                                <Button
                                    size="sm"
                                    variant={view === 'external_active' ? 'default' : 'outline'}
                                    onClick={() => setView('external_active')}
                                    className={view === 'external_active' ? 
                                        'bg-blue-600 hover:bg-blue-700 font-mono text-xs' : 
                                        'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                    }
                                >
                                    EXT ACTIVE
                                </Button>
                                <Button
                                    size="sm"
                                    variant={view === 'external_archived' ? 'default' : 'outline'}
                                    onClick={() => setView('external_archived')}
                                    className={view === 'external_archived' ? 
                                        'bg-amber-600 hover:bg-amber-700 font-mono text-xs' : 
                                        'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                    }
                                >
                                    <Archive className="w-3 h-3 mr-1" />
                                    EXT ARCHIVED
                                </Button>

                                {/* Legacy view filters */}
                                {view === 'legacy' && (
                                    <div className="flex gap-2 border-l border-slate-700 pl-2">
                                        {['all', 'unit', 'call'].map(type => (
                                            <Button
                                                key={type}
                                                size="sm"
                                                variant={filterType === type ? 'default' : 'outline'}
                                                onClick={() => setFilterType(type)}
                                                className={filterType === type ? 
                                                    'bg-slate-600 hover:bg-slate-700 font-mono text-xs' : 
                                                    'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                                }
                                            >
                                                {type === 'all' ? 'ALL' : type === 'unit' ? 'UNIT' : 'CALL'}
                                            </Button>
                                        ))}
                                    </div>
                                )}
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
                                                 {view === 'legacy' ? (
                                                     <>
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
                                                     </>
                                                 ) : (
                                                     <>
                                                         <Activity className="w-4 h-4 text-amber-400" />
                                                         <Badge className={log.archived ? 
                                                             'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono text-xs' : 
                                                             'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs'
                                                         }>
                                                             {log.source || 'external'} {log.archived ? '(ARCHIVED)' : '(ACTIVE)'}
                                                         </Badge>
                                                     </>
                                                 )}
                                             </div>
                                             <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                                                 <Clock className="w-3 h-3" />
                                                 {new Date(log.timestamp || log.time_received || log.created_date).toLocaleString()}
                                             </div>
                                         </div>
                                         {view === 'legacy' ? (
                                             <>
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
                                             </>
                                         ) : (
                                             <div>
                                                 <p className="text-white font-mono text-sm mb-2">
                                                     <span className="text-amber-400">{log.incident}</span>
                                                 </p>
                                                 <p className="text-slate-400 text-xs font-mono mb-2 flex items-center gap-2">
                                                     📍 {log.location}
                                                 </p>
                                                 <div className="flex gap-2 flex-wrap">
                                                     <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                         {log.agency || 'N/A'}
                                                     </Badge>
                                                     <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                         Status: {log.status}
                                                     </Badge>
                                                     {log.priority && (
                                                         <Badge className={`font-mono text-xs ${
                                                             log.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                                                             log.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                                             'bg-blue-500/20 text-blue-400'
                                                         }`}>
                                                             {log.priority}
                                                         </Badge>
                                                     )}
                                                 </div>
                                                 {log.ai_summary && (
                                                     <p className="text-slate-400 text-xs font-mono mt-2">{log.ai_summary}</p>
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