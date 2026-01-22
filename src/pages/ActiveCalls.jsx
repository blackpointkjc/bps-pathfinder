import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, AlertTriangle, MapPin, Clock, User, Phone, FileText, Save, X, Plus, Search, Filter } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function ActiveCalls() {
    const [currentUser, setCurrentUser] = useState(null);
    const [activeCalls, setActiveCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [units, setUnits] = useState([]);
    const [notes, setNotes] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
        const interval = setInterval(() => loadData(), 5000);
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
            setActiveCalls(callsData || []);
            setUnits(usersData.data?.users || []);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const getPriorityColor = (call) => {
        const incident = call.incident?.toLowerCase() || '';
        if (incident.includes('shooting') || incident.includes('officer') || call.priority === 'critical') {
            return 'border-red-500 bg-red-500/10';
        }
        if (incident.includes('assault') || incident.includes('robbery') || call.priority === 'high') {
            return 'border-orange-500 bg-orange-500/10';
        }
        return 'border-blue-500 bg-blue-500/10';
    };

    const handleAddNote = async () => {
        if (!notes.trim() || !selectedCall) return;
        
        try {
            await base44.entities.CallNote.create({
                call_id: selectedCall.id,
                author_id: currentUser.id,
                author_name: currentUser.full_name,
                note: notes,
                note_type: 'general'
            });
            setNotes('');
            toast.success('Note added');
            loadData();
        } catch (error) {
            toast.error('Failed to add note');
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        if (!selectedCall) return;
        
        try {
            await base44.entities.DispatchCall.update(selectedCall.id, {
                status: newStatus,
                [`time_${newStatus.toLowerCase().replace(' ', '_')}`]: new Date().toISOString()
            });
            toast.success(`Call status: ${newStatus}`);
            loadData();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const filteredCalls = activeCalls.filter(call => {
        const matchesStatus = filterStatus === 'all' || call.status === filterStatus;
        const matchesSearch = !searchQuery || 
            call.incident?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            call.location?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
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
                            <Radio className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">ACTIVE CALLS MANAGEMENT</h1>
                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                {filteredCalls.length} ACTIVE
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-12 gap-6">
                    {/* Left: Calls List */}
                    <div className="col-span-4">
                        <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)]">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Search calls..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="pl-10 bg-slate-900 border-slate-700 text-white font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {['all', 'New', 'Dispatched', 'Enroute', 'On Scene'].map(status => (
                                            <Button
                                                key={status}
                                                size="sm"
                                                variant={filterStatus === status ? 'default' : 'outline'}
                                                onClick={() => setFilterStatus(status)}
                                                className={filterStatus === status ? 
                                                    'bg-blue-600 hover:bg-blue-700 font-mono text-xs' : 
                                                    'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                                }
                                            >
                                                {status === 'all' ? 'ALL' : status.toUpperCase()}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <ScrollArea className="h-[calc(100%-120px)]">
                                <div className="p-4 space-y-2">
                                    {filteredCalls.map((call) => (
                                        <div
                                            key={call.id}
                                            onClick={() => setSelectedCall(call)}
                                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                                                selectedCall?.id === call.id ? 
                                                'bg-blue-500/20 border-blue-500' : 
                                                `${getPriorityColor(call)} hover:border-blue-400`
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-mono font-bold text-sm">
                                                        CALL-{call.id?.slice(-6) || 'UNKNOWN'}
                                                    </span>
                                                </div>
                                                <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                    {call.status}
                                                </Badge>
                                            </div>
                                            <p className="text-white font-semibold text-sm mb-1">{call.incident}</p>
                                            <p className="text-slate-400 text-xs font-mono flex items-center gap-1 mb-2">
                                                <MapPin className="w-3 h-3" />
                                                {call.location}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500 text-xs font-mono">
                                                    {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour12: false })}
                                                </span>
                                                {call.assigned_units?.length > 0 && (
                                                    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 font-mono text-xs">
                                                        {call.assigned_units.length} UNIT{call.assigned_units.length > 1 ? 'S' : ''}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </Card>
                    </div>

                    {/* Right: Call Detail */}
                    <div className="col-span-8">
                        {!selectedCall ? (
                            <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)] flex items-center justify-center">
                                <div className="text-center text-slate-500 font-mono">
                                    <Radio className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>SELECT A CALL TO VIEW DETAILS</p>
                                </div>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {/* Call Information */}
                                <Card className="bg-slate-900 border-slate-800">
                                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-bold text-white font-mono">CALL INFORMATION</h2>
                                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                                CALL-{selectedCall.id?.slice(-6)}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">CALL TYPE</p>
                                            <p className="text-white font-semibold">{selectedCall.incident}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">PRIORITY</p>
                                            <Badge className={selectedCall.priority === 'critical' ? 'bg-red-500' : 'bg-orange-500'}>
                                                {selectedCall.priority?.toUpperCase() || 'MEDIUM'}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">TIME RECEIVED</p>
                                            <p className="text-white font-mono text-sm">
                                                {new Date(selectedCall.time_received || selectedCall.created_date).toLocaleString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">SOURCE</p>
                                            <p className="text-white font-mono text-sm">{selectedCall.agency || 'UNKNOWN'}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-xs text-slate-400 font-mono mb-1">LOCATION</p>
                                            <p className="text-white font-mono text-sm flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-blue-400" />
                                                {selectedCall.location}
                                            </p>
                                        </div>
                                        {selectedCall.description && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-slate-400 font-mono mb-1">DESCRIPTION</p>
                                                <p className="text-white text-sm">{selectedCall.description}</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {/* Status Controls */}
                                <Card className="bg-slate-900 border-slate-800">
                                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                        <h2 className="text-lg font-bold text-white font-mono">CALL STATUS CONTROLS</h2>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdateStatus('Dispatched')}
                                                className="bg-yellow-600 hover:bg-yellow-700 font-mono"
                                            >
                                                DISPATCH
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdateStatus('Enroute')}
                                                className="bg-orange-600 hover:bg-orange-700 font-mono"
                                            >
                                                ENROUTE
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdateStatus('On Scene')}
                                                className="bg-blue-600 hover:bg-blue-700 font-mono"
                                            >
                                                ON SCENE
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdateStatus('Cleared')}
                                                className="bg-green-600 hover:bg-green-700 font-mono"
                                            >
                                                CLEAR
                                            </Button>
                                        </div>
                                    </div>
                                </Card>

                                {/* Notes Section */}
                                <Card className="bg-slate-900 border-slate-800">
                                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                        <h2 className="text-lg font-bold text-white font-mono">DISPATCHER LOG / NOTES</h2>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <Textarea
                                                placeholder="Enter notes..."
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                className="bg-slate-800 border-slate-700 text-white font-mono"
                                                rows={3}
                                            />
                                            <Button
                                                onClick={handleAddNote}
                                                className="bg-blue-600 hover:bg-blue-700"
                                            >
                                                <Save className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <ScrollArea className="h-[200px]">
                                            <div className="space-y-2">
                                                {/* Notes would be loaded here */}
                                                <div className="text-slate-500 text-sm font-mono text-center py-4">
                                                    NO NOTES YET
                                                </div>
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}