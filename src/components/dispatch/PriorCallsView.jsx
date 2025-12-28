import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, Calendar, MapPin, Clock, Users, History } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PriorCallsView({ currentUser, units }) {
    const [priorCalls, setPriorCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [callNotes, setCallNotes] = useState([]);

    useEffect(() => {
        loadPriorCalls();
    }, []);

    useEffect(() => {
        if (selectedCall) {
            loadCallNotes();
        }
    }, [selectedCall?.id]);

    const loadPriorCalls = async () => {
        setLoading(true);
        try {
            const calls = await base44.entities.DispatchCall.filter({
                status: { $in: ['Cleared', 'Closed', 'Cancelled'] }
            });
            setPriorCalls(calls || []);
        } catch (error) {
            console.error('Error loading prior calls:', error);
            toast.error('Failed to load call history');
        } finally {
            setLoading(false);
        }
    };

    const loadCallNotes = async () => {
        if (!selectedCall) return;
        try {
            const notes = await base44.entities.CallNote.filter({ call_id: selectedCall.id });
            setCallNotes(notes || []);
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    };

    const filteredCalls = priorCalls.filter(call => {
        const matchesSearch = searchQuery === '' ||
            call.incident?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            call.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            call.call_id?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesPriority = priorityFilter === 'all' || call.priority === priorityFilter;
        
        const callDate = new Date(call.time_received || call.created_date);
        const matchesDateFrom = !dateFrom || callDate >= new Date(dateFrom);
        const matchesDateTo = !dateTo || callDate <= new Date(dateTo);
        
        return matchesSearch && matchesPriority && matchesDateFrom && matchesDateTo;
    });

    const getAssignedUnitsForCall = (call) => {
        if (!call.assigned_units) return [];
        return units.filter(u => call.assigned_units.includes(u.id));
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'critical': return 'bg-red-600';
            case 'high': return 'bg-orange-500';
            case 'medium': return 'bg-yellow-500';
            default: return 'bg-blue-500';
        }
    };

    return (
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)]">
            {/* Left: Search & Filters */}
            <div className="col-span-4">
                <Card className="h-full bg-slate-900/95 border-slate-700 flex flex-col">
                    <div className="p-4 border-b border-slate-700">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-blue-500" />
                            Prior Calls
                        </h2>

                        {/* Search */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search calls..."
                                className="pl-10 bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                                <Label className="text-slate-400 text-xs">From</Label>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-400 text-xs">To</Label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        {/* Priority Filter */}
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="flex h-10 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-2 text-sm mb-3"
                        >
                            <option value="all">All Priorities</option>
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>

                        <p className="text-sm text-slate-400">
                            {filteredCalls.length} calls found
                        </p>
                    </div>

                    {/* Calls List */}
                    <ScrollArea className="flex-1 p-2">
                        {loading ? (
                            <div className="text-center py-8 text-slate-500">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                            </div>
                        ) : filteredCalls.length === 0 ? (
                            <div className="text-center py-16 text-slate-500">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
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
                                            onClick={() => setSelectedCall(call)}
                                            className={`p-3 rounded-lg cursor-pointer transition-all ${
                                                selectedCall?.id === call.id
                                                    ? 'bg-blue-600 border-2 border-blue-400'
                                                    : 'bg-slate-800 hover:bg-slate-700 border-2 border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-white text-sm truncate">
                                                        {call.incident}
                                                    </h3>
                                                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                                                        <MapPin className="w-3 h-3" />
                                                        <span className="truncate">{call.location}</span>
                                                    </div>
                                                </div>
                                                <Badge className={`${getPriorityColor(call.priority)} text-white text-xs ml-2`}>
                                                    {call.priority}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1 text-slate-400">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(call.time_received || call.created_date).toLocaleDateString()}
                                                </div>
                                                <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                                                    {call.status}
                                                </Badge>
                                            </div>

                                            {assignedUnits.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {assignedUnits.map(unit => (
                                                        <Badge key={unit.id} variant="outline" className="border-blue-500 text-blue-400 text-xs">
                                                            {unit.unit_number}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </Card>
            </div>

            {/* Right: Call Details */}
            <div className="col-span-8">
                {selectedCall ? (
                    <Card className="h-full bg-slate-900/95 border-slate-700">
                        <ScrollArea className="h-full">
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-2">{selectedCall.incident}</h2>
                                        <p className="text-slate-400">Call ID: {selectedCall.call_id || selectedCall.id}</p>
                                    </div>
                                    <Badge className={
                                        selectedCall.status === 'Cleared' ? 'bg-green-600' :
                                        selectedCall.status === 'Closed' ? 'bg-blue-600' : 'bg-slate-600'
                                    }>
                                        {selectedCall.status}
                                    </Badge>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-400 mb-2">Location</h3>
                                        <p className="text-white">{selectedCall.location}</p>
                                        {selectedCall.cross_street && (
                                            <p className="text-sm text-slate-400 mt-1">Cross: {selectedCall.cross_street}</p>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-400 mb-2">Priority & Agency</h3>
                                        <div className="flex gap-2">
                                            <Badge className={getPriorityColor(selectedCall.priority)}>
                                                {selectedCall.priority}
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-600 text-slate-300">
                                                {selectedCall.agency}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {selectedCall.description && (
                                    <div className="mb-6">
                                        <h3 className="text-sm font-semibold text-slate-400 mb-2">Description</h3>
                                        <p className="text-white">{selectedCall.description}</p>
                                    </div>
                                )}

                                {/* Timeline */}
                                <div className="mb-6">
                                    <h3 className="text-sm font-semibold text-slate-400 mb-3">Timeline</h3>
                                    <div className="space-y-2 border-l-2 border-slate-700 pl-4">
                                        {selectedCall.time_received && (
                                            <div>
                                                <p className="text-xs text-slate-500">Received</p>
                                                <p className="text-white">{new Date(selectedCall.time_received).toLocaleString()}</p>
                                            </div>
                                        )}
                                        {selectedCall.time_dispatched && (
                                            <div>
                                                <p className="text-xs text-slate-500">Dispatched</p>
                                                <p className="text-white">{new Date(selectedCall.time_dispatched).toLocaleString()}</p>
                                            </div>
                                        )}
                                        {selectedCall.time_on_scene && (
                                            <div>
                                                <p className="text-xs text-slate-500">On Scene</p>
                                                <p className="text-white">{new Date(selectedCall.time_on_scene).toLocaleString()}</p>
                                            </div>
                                        )}
                                        {selectedCall.time_cleared && (
                                            <div>
                                                <p className="text-xs text-slate-500">Cleared</p>
                                                <p className="text-white">{new Date(selectedCall.time_cleared).toLocaleString()}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Units */}
                                {selectedCall.assigned_units && selectedCall.assigned_units.length > 0 && (
                                    <div className="mb-6">
                                        <h3 className="text-sm font-semibold text-slate-400 mb-3">Assigned Units</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {getAssignedUnitsForCall(selectedCall).map(unit => (
                                                <div key={unit.id} className="bg-slate-800 p-3 rounded-lg">
                                                    <p className="font-semibold text-white">{unit.unit_number}</p>
                                                    <p className="text-xs text-slate-400">{unit.full_name}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                {callNotes.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-400 mb-3">Call Notes</h3>
                                        <div className="space-y-2">
                                            {callNotes.map(note => (
                                                <div key={note.id} className="bg-slate-800 p-3 rounded-lg">
                                                    <div className="flex items-start justify-between mb-1">
                                                        <span className="text-sm font-semibold text-white">{note.author_name}</span>
                                                        <span className="text-xs text-slate-500">
                                                            {new Date(note.created_date).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-300">{note.note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </Card>
                ) : (
                    <Card className="h-full bg-slate-900/95 border-slate-700 flex items-center justify-center">
                        <div className="text-center text-slate-500">
                            <History className="w-16 h-16 mx-auto mb-3 opacity-50" />
                            <p>Select a call to view details</p>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}