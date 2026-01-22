import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, AlertCircle, Clock, MapPin, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import OptimalDispatchPanel from './OptimalDispatchPanel';

export default function ActiveCallsQueue({ calls, selectedCallId, onSelectCall, units, onUpdate }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showOptimalDispatch, setShowOptimalDispatch] = useState(false);
    const [selectedCallForDispatch, setSelectedCallForDispatch] = useState(null);

    const filteredCalls = calls.filter(call => {
        // Exclude scraped calls from external sources
        if (call.source === 'richmond' || call.source === 'henrico' || call.source === 'chesterfield') {
            return false;
        }
        
        const matchesSearch = searchQuery === '' || 
            call.incident?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            call.location?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesPriority = priorityFilter === 'all' || call.priority === priorityFilter;
        const matchesStatus = statusFilter === 'all' || call.status === statusFilter;
        
        return matchesSearch && matchesPriority && matchesStatus;
    });

    const counts = {
        active: calls.filter(c => ['Dispatched', 'Enroute', 'On Scene'].includes(c.status)).length,
        pending: calls.filter(c => c.status === 'New' || c.status === 'Pending').length,
        unassigned: calls.filter(c => !c.assigned_units || c.assigned_units.length === 0).length,
        all: calls.length
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'critical': return 'bg-red-600';
            case 'high': return 'bg-orange-500';
            case 'medium': return 'bg-yellow-500';
            default: return 'bg-blue-500';
        }
    };

    const getAssignedUnitsForCall = (call) => {
        if (!call.assigned_units) return [];
        return units.filter(u => call.assigned_units.includes(u.id));
    };

    return (
        <Card className="h-full bg-slate-900/95 border-slate-700 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    Active Calls
                </h2>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-1 mb-3">
                    <Button
                        size="sm"
                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setStatusFilter('all')}
                        className="flex flex-col h-auto py-1 px-1"
                    >
                        <span className="text-[10px] text-slate-400">All</span>
                        <span className="text-sm font-bold">{counts.all}</span>
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'active' ? 'default' : 'outline'}
                        onClick={() => setStatusFilter('active')}
                        className="flex flex-col h-auto py-1 px-1"
                    >
                        <span className="text-[10px] text-slate-400">Active</span>
                        <span className="text-sm font-bold">{counts.active}</span>
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'pending' ? 'default' : 'outline'}
                        onClick={() => setStatusFilter('pending')}
                        className="flex flex-col h-auto py-1 px-1"
                    >
                        <span className="text-[10px] text-slate-400">Pend</span>
                        <span className="text-sm font-bold">{counts.pending}</span>
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === 'unassigned' ? 'default' : 'outline'}
                        onClick={() => setStatusFilter('unassigned')}
                        className="flex flex-col h-auto py-1 px-1"
                    >
                        <span className="text-[10px] text-slate-400">Unsgn</span>
                        <span className="text-sm font-bold text-red-500">{counts.unassigned}</span>
                    </Button>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search calls..."
                        className="pl-10 bg-slate-800 border-slate-700 text-white"
                    />
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="flex h-8 rounded-md border bg-slate-800 border-slate-700 text-white px-2 text-xs flex-1"
                    >
                        <option value="all">All Priorities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
            </div>

            {/* Calls List */}
            <ScrollArea className="flex-1 p-2">
                {filteredCalls.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No calls found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredCalls.map(call => {
                            const assignedUnits = getAssignedUnitsForCall(call);
                            return (
                                <motion.div
                                    key={call.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`p-3 rounded-lg transition-all ${
                                        selectedCallId === call.id
                                            ? 'bg-red-600 border-2 border-red-400'
                                            : 'bg-slate-800 hover:bg-slate-700 border-2 border-transparent'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelectCall(call)}>
                                            <h3 className="font-bold text-white text-sm truncate">
                                                {call.incident}
                                            </h3>
                                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate">{call.location}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1 ml-2">
                                            <Badge className={`${getPriorityColor(call.priority)} text-white text-xs`}>
                                                {call.priority}
                                            </Badge>
                                            {(!call.assigned_units || call.assigned_units.length === 0) && (
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedCallForDispatch(call);
                                                        setShowOptimalDispatch(true);
                                                    }}
                                                    className="h-6 px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                                >
                                                    <Target className="w-3 h-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-xs text-slate-400">
                                        <Clock className="w-3 h-3" />
                                        {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { 
                                            timeZone: 'America/New_York',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        })}
                                    </div>
                                        <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                                            {call.status}
                                        </Badge>
                                    </div>

                                    {assignedUnits.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {assignedUnits.map(unit => (
                                                <Badge key={unit.id} variant="outline" className="border-blue-500 text-blue-400 text-xs">
                                                    {unit.unit_number || 'Unit'}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}

                                    {(!call.assigned_units || call.assigned_units.length === 0) && (
                                        <Badge variant="outline" className="border-red-500 text-red-400 text-xs mt-2">
                                            Unassigned
                                        </Badge>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

            <OptimalDispatchPanel
                isOpen={showOptimalDispatch}
                onClose={() => {
                    setShowOptimalDispatch(false);
                    setSelectedCallForDispatch(null);
                }}
                call={selectedCallForDispatch}
                onUnitAssigned={() => {
                    if (onUpdate) onUpdate();
                }}
            />
        </Card>
    );
}