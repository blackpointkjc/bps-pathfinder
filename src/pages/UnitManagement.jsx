import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Users, MapPin, Clock, Navigation, CheckCircle2, AlertCircle, 
    Search, Filter, Phone, MessageSquare, Radio, Shield,
    XCircle, Car, RefreshCw, Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export default function UnitManagement() {
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [assistanceRequests, setAssistanceRequests] = useState([]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const user = await base44.auth.me();
            setCurrentUser(user);

            // Fetch all units
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const fetchedUnits = response.data?.users || [];
            
            // Fetch active unions
            const activeUnions = await base44.entities.UnitUnion.filter({ status: 'active' });
            
            // Group units by union
            const processedUnits = [];
            const processedUnionIds = new Set();
            
            fetchedUnits.forEach(unit => {
                if (unit.union_id && !processedUnionIds.has(unit.union_id)) {
                    processedUnionIds.add(unit.union_id);
                    const members = fetchedUnits.filter(u => u.union_id === unit.union_id);
                    processedUnits.push({
                        isUnion: true,
                        id: unit.union_id,
                        union_id: unit.union_id,
                        members,
                        status: members[0]?.status || 'Available',
                        current_call_id: members[0]?.current_call_id,
                        current_call_info: members[0]?.current_call_info,
                        latitude: members[0]?.latitude,
                        longitude: members[0]?.longitude,
                        last_updated: members[0]?.last_updated
                    });
                } else if (!unit.union_id) {
                    processedUnits.push(unit);
                }
            });
            
            setUnits(processedUnits);

            // Fetch active calls
            const calls = await base44.entities.DispatchCall.filter({
                status: { $in: ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'] }
            });
            setActiveCalls(calls || []);

            // Fetch assistance requests (messages tagged as assistance)
            const messages = await base44.entities.Message.filter({
                message: { $regex: '(10-33|assistance|backup|help)', $options: 'i' }
            }, '-created_date', 20);
            setAssistanceRequests(messages || []);

        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load unit data');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        if (status === 'Available') return 'bg-green-100 text-green-700 border-green-300';
        if (status === 'Enroute') return 'bg-red-100 text-red-700 border-red-300';
        if (status === 'On Scene') return 'bg-blue-100 text-blue-700 border-blue-300';
        if (status === 'On Patrol') return 'bg-indigo-100 text-indigo-700 border-indigo-300';
        if (status === 'Out of Service') return 'bg-gray-100 text-gray-700 border-gray-300';
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    };

    const getStatusIcon = (status) => {
        if (status === 'Available') return CheckCircle2;
        if (status === 'Enroute') return Navigation;
        if (status === 'On Scene') return MapPin;
        if (status === 'On Patrol') return Car;
        if (status === 'Out of Service') return XCircle;
        return Clock;
    };

    const handleAssignToCall = async (unit, call) => {
        try {
            const unitId = unit.isUnion ? unit.members[0].id : unit.id;
            const unitName = unit.isUnion ? unit.union_id : (unit.unit_number || unit.full_name);

            // Update call assignments
            const currentAssignedUnits = call.assigned_units || [];
            await base44.entities.DispatchCall.update(call.id, {
                assigned_units: [...currentAssignedUnits, unitId],
                status: 'Dispatched',
                time_dispatched: new Date().toISOString()
            });

            // Create assignment record
            await base44.entities.CallAssignment.create({
                call_id: call.id,
                unit_id: unitId,
                role: currentAssignedUnits.length === 0 ? 'primary' : 'backup',
                assigned_at: new Date().toISOString(),
                status: 'pending'
            });

            // Log the assignment
            await base44.entities.CallStatusLog.create({
                call_id: call.id,
                incident_type: call.incident,
                location: call.location,
                old_status: call.status,
                new_status: 'Dispatched',
                unit_id: unitId,
                unit_name: unitName,
                latitude: call.latitude,
                longitude: call.longitude,
                notes: `Assigned ${unitName} to call`
            });

            toast.success(`Assigned ${unitName} to ${call.incident}`);
            loadData();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error('Failed to assign unit');
        }
    };

    const handleRequestAssistance = async (unit) => {
        try {
            const unitId = unit.isUnion ? unit.members[0].id : unit.id;
            const unitName = unit.isUnion ? unit.union_id : (unit.unit_number || unit.full_name);

            await base44.entities.Message.create({
                sender_id: currentUser.id,
                sender_name: currentUser.unit_number || currentUser.full_name,
                recipient_id: unitId,
                recipient_name: unitName,
                message: `🚨 10-33 - Request for assistance from ${currentUser.unit_number || currentUser.full_name}`,
                call_id: currentUser.current_call_id || null
            });

            toast.success(`Assistance request sent to ${unitName}`);
        } catch (error) {
            console.error('Error requesting assistance:', error);
            toast.error('Failed to send assistance request');
        }
    };

    const filteredUnits = units.filter(unit => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = unit.isUnion 
            ? unit.union_id?.toLowerCase().includes(query) ||
              unit.members.some(m => m.unit_number?.toLowerCase().includes(query) || m.full_name?.toLowerCase().includes(query))
            : (unit.unit_number?.toLowerCase().includes(query) || unit.full_name?.toLowerCase().includes(query));
        
        const matchesStatus = statusFilter === 'all' || unit.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const groupedByStatus = filteredUnits.reduce((acc, unit) => {
        const status = unit.status || 'Unknown';
        if (!acc[status]) acc[status] = [];
        acc[status].push(unit);
        return acc;
    }, {});

    const statusOrder = ['Available', 'On Patrol', 'Enroute', 'On Scene', 'Busy', 'At Station', 'Training', 'Out of Service'];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center">
                                <Users className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Unit Management</h1>
                                <p className="text-sm text-gray-500">
                                    {filteredUnits.length} units • {activeCalls.length} active calls
                                </p>
                            </div>
                        </div>
                        <Button onClick={loadData} disabled={loading} className="gap-2">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="units" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="units">All Units</TabsTrigger>
                        <TabsTrigger value="assignments">Call Assignments</TabsTrigger>
                        <TabsTrigger value="assistance">
                            Assistance Requests
                            {assistanceRequests.length > 0 && (
                                <Badge className="ml-2 bg-red-500">{assistanceRequests.length}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* All Units Tab */}
                    <TabsContent value="units">
                        <Card className="p-6">
                            <div className="flex gap-4 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input
                                        placeholder="Search units..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-4 py-2 border rounded-lg"
                                >
                                    <option value="all">All Status</option>
                                    <option value="Available">Available</option>
                                    <option value="On Patrol">On Patrol</option>
                                    <option value="Enroute">Enroute</option>
                                    <option value="On Scene">On Scene</option>
                                    <option value="Busy">Busy</option>
                                    <option value="Out of Service">Out of Service</option>
                                </select>
                            </div>

                            <ScrollArea className="h-[600px]">
                                {loading ? (
                                    <div className="text-center py-12">
                                        <RefreshCw className="w-12 h-12 mx-auto mb-2 text-gray-300 animate-spin" />
                                        <p className="text-gray-500">Loading units...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {statusOrder.map(status => {
                                            const statusUnits = groupedByStatus[status];
                                            if (!statusUnits || statusUnits.length === 0) return null;

                                            const StatusIcon = getStatusIcon(status);

                                            return (
                                                <div key={status}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <StatusIcon className="w-4 h-4 text-gray-600" />
                                                        <h3 className="font-semibold text-gray-900">{status}</h3>
                                                        <Badge variant="outline">{statusUnits.length}</Badge>
                                                    </div>
                                                    <div className="grid gap-3">
                                                        {statusUnits.map(unit => (
                                                            <UnitCard
                                                                key={unit.id}
                                                                unit={unit}
                                                                activeCalls={activeCalls}
                                                                onAssignToCall={handleAssignToCall}
                                                                onRequestAssistance={handleRequestAssistance}
                                                                onViewDetails={setSelectedUnit}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </Card>
                    </TabsContent>

                    {/* Call Assignments Tab */}
                    <TabsContent value="assignments">
                        <Card className="p-6">
                            <h3 className="text-lg font-semibold mb-4">Active Calls Requiring Assignment</h3>
                            <ScrollArea className="h-[600px]">
                                {activeCalls.filter(c => !c.assigned_units || c.assigned_units.length === 0).map(call => (
                                    <CallAssignmentCard
                                        key={call.id}
                                        call={call}
                                        units={units.filter(u => u.status === 'Available' || u.status === 'On Patrol')}
                                        onAssign={handleAssignToCall}
                                    />
                                ))}
                            </ScrollArea>
                        </Card>
                    </TabsContent>

                    {/* Assistance Requests Tab */}
                    <TabsContent value="assistance">
                        <Card className="p-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Bell className="w-5 h-5 text-red-500" />
                                Assistance Requests
                            </h3>
                            <ScrollArea className="h-[600px]">
                                <div className="space-y-3">
                                    {assistanceRequests.map(request => (
                                        <AssistanceRequestCard
                                            key={request.id}
                                            request={request}
                                            units={units}
                                        />
                                    ))}
                                </div>
                            </ScrollArea>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Unit Detail Modal */}
                {selectedUnit && (
                    <UnitDetailModal
                        unit={selectedUnit}
                        onClose={() => setSelectedUnit(null)}
                        onRefresh={loadData}
                    />
                )}
            </div>
        </div>
    );
}

function UnitCard({ unit, activeCalls, onAssignToCall, onRequestAssistance, onViewDetails }) {
    const [showActions, setShowActions] = useState(false);
    const StatusIcon = unit.status === 'Available' ? CheckCircle2 :
                      unit.status === 'Enroute' ? Navigation :
                      unit.status === 'On Scene' ? MapPin :
                      unit.status === 'On Patrol' ? Car :
                      unit.status === 'Out of Service' ? XCircle : Clock;

    const getStatusColor = (status) => {
        if (status === 'Available') return 'bg-green-100 text-green-700 border-green-300';
        if (status === 'Enroute') return 'bg-red-100 text-red-700 border-red-300';
        if (status === 'On Scene') return 'bg-blue-100 text-blue-700 border-blue-300';
        if (status === 'On Patrol') return 'bg-indigo-100 text-indigo-700 border-indigo-300';
        if (status === 'Out of Service') return 'bg-gray-100 text-gray-700 border-gray-300';
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    };

    if (unit.isUnion) {
        return (
            <Card className="p-4 bg-indigo-50 border-2 border-indigo-200 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            <h4 className="font-bold text-indigo-900">{unit.union_id}</h4>
                            <Badge className="bg-indigo-600 text-white">{unit.members.length} Units</Badge>
                            <Badge variant="outline" className={getStatusColor(unit.status)}>
                                {unit.status}
                            </Badge>
                        </div>
                        
                        {unit.current_call_info && (
                            <div className="text-sm text-red-700 bg-red-50 p-2 rounded mb-2">
                                <strong>Active:</strong> {unit.current_call_info}
                            </div>
                        )}

                        <div className="ml-6 space-y-1">
                            {unit.members.map((member, idx) => (
                                <div key={member.id} className="flex items-center gap-2 text-sm">
                                    <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-yellow-500' : 'bg-indigo-400'}`} />
                                    <span className={idx === 0 ? 'font-semibold' : ''}>
                                        {member.unit_number || member.full_name}
                                        {idx === 0 && ' (Lead)'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {unit.last_updated && (
                            <p className="text-xs text-gray-500 mt-2">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {formatDistanceToNow(new Date(unit.last_updated), { addSuffix: true })}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onViewDetails(unit)}>
                            Details
                        </Button>
                        {!unit.current_call_id && (
                            <Button 
                                size="sm" 
                                onClick={() => setShowActions(!showActions)}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                Assign
                            </Button>
                        )}
                    </div>
                </div>

                {showActions && (
                    <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-semibold mb-2">Assign to call:</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {activeCalls.filter(c => !c.assigned_units || c.assigned_units.length === 0).map(call => (
                                <Button
                                    key={call.id}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        onAssignToCall(unit, call);
                                        setShowActions(false);
                                    }}
                                    className="w-full justify-start text-left"
                                >
                                    <span className="truncate">{call.incident} - {call.location}</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </Card>
        );
    }

    return (
        <Card className="p-4 hover:shadow-lg transition-all">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Car className="w-4 h-4 text-gray-600" />
                        <h4 className="font-bold text-gray-900">{unit.unit_number || unit.full_name}</h4>
                        <Badge variant="outline" className={getStatusColor(unit.status)}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {unit.status}
                        </Badge>
                    </div>

                    {unit.current_call_info && (
                        <div className="text-sm text-red-700 bg-red-50 p-2 rounded mb-2">
                            <strong>Active:</strong> {unit.current_call_info}
                        </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        {unit.latitude && unit.longitude && (
                            <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span>{unit.latitude.toFixed(4)}, {unit.longitude.toFixed(4)}</span>
                            </div>
                        )}
                        {unit.last_updated && (
                            <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatDistanceToNow(new Date(unit.last_updated), { addSuffix: true })}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onViewDetails(unit)}>
                        Details
                    </Button>
                    {(unit.status === 'Available' || unit.status === 'On Patrol') && (
                        <Button 
                            size="sm" 
                            onClick={() => setShowActions(!showActions)}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            Assign
                        </Button>
                    )}
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onRequestAssistance(unit)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                        <Radio className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {showActions && (
                <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-semibold mb-2">Assign to call:</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {activeCalls.filter(c => !c.assigned_units || c.assigned_units.length === 0).map(call => (
                            <Button
                                key={call.id}
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    onAssignToCall(unit, call);
                                    setShowActions(false);
                                }}
                                className="w-full justify-start text-left"
                            >
                                <span className="truncate">{call.incident} - {call.location}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
}

function CallAssignmentCard({ call, units, onAssign }) {
    const [selectedUnit, setSelectedUnit] = useState(null);

    return (
        <Card className="p-4 mb-3 border-l-4 border-red-500">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{call.incident}</h4>
                    <p className="text-sm text-gray-600">{call.location}</p>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge className="bg-red-100 text-red-700">Unassigned</Badge>
                        {call.priority && (
                            <Badge className={
                                call.priority === 'critical' ? 'bg-red-600 text-white' :
                                call.priority === 'high' ? 'bg-orange-500 text-white' :
                                'bg-yellow-500 text-white'
                            }>
                                {call.priority.toUpperCase()}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <select
                    value={selectedUnit || ''}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                >
                    <option value="">Select unit...</option>
                    {units.map(unit => (
                        <option key={unit.id} value={unit.id}>
                            {unit.isUnion ? unit.union_id : (unit.unit_number || unit.full_name)} - {unit.status}
                        </option>
                    ))}
                </select>
                <Button
                    size="sm"
                    disabled={!selectedUnit}
                    onClick={() => {
                        const unit = units.find(u => u.id === selectedUnit);
                        if (unit) {
                            onAssign(unit, call);
                            setSelectedUnit(null);
                        }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    Assign
                </Button>
            </div>
        </Card>
    );
}

function AssistanceRequestCard({ request, units }) {
    const sender = units.find(u => u.id === request.sender_id);
    
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
        >
            <Card className="p-4 border-l-4 border-orange-500 bg-orange-50">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <Bell className="w-5 h-5 text-orange-600 animate-pulse" />
                            <h4 className="font-bold text-orange-900">
                                {request.sender_name} requesting assistance
                            </h4>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{request.message}</p>
                        {request.call_id && (
                            <Badge className="bg-red-600 text-white">Call ID: {request.call_id}</Badge>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatDistanceToNow(new Date(request.created_date), { addSuffix: true })}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            Respond
                        </Button>
                        <Button size="sm" variant="outline">
                            View on Map
                        </Button>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}

function UnitDetailModal({ unit, onClose, onRefresh }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">
                        {unit.isUnion ? unit.union_id : (unit.unit_number || unit.full_name)}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <XCircle className="w-5 h-5" />
                    </Button>
                </div>

                {unit.isUnion ? (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-2">Union Members</h3>
                            {unit.members.map((member, idx) => (
                                <div key={member.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded mb-2">
                                    <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-yellow-500' : 'bg-indigo-400'}`} />
                                    <span>{member.unit_number || member.full_name}</span>
                                    {idx === 0 && <Badge variant="outline">Lead</Badge>}
                                </div>
                            ))}
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Status</h3>
                            <Badge className={getStatusColor(unit.status)}>{unit.status}</Badge>
                        </div>

                        {unit.current_call_info && (
                            <div>
                                <h3 className="font-semibold mb-2">Current Assignment</h3>
                                <p className="text-sm bg-red-50 p-3 rounded">{unit.current_call_info}</p>
                            </div>
                        )}

                        {unit.latitude && unit.longitude && (
                            <div>
                                <h3 className="font-semibold mb-2">Location</h3>
                                <p className="text-sm text-gray-600">
                                    {unit.latitude.toFixed(6)}, {unit.longitude.toFixed(6)}
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold mb-2">Officer Details</h3>
                            <p className="text-sm text-gray-600">Name: {unit.full_name}</p>
                            <p className="text-sm text-gray-600">Unit: {unit.unit_number}</p>
                            <p className="text-sm text-gray-600">Email: {unit.email}</p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Status</h3>
                            <Badge className={getStatusColor(unit.status)}>{unit.status}</Badge>
                        </div>

                        {unit.current_call_info && (
                            <div>
                                <h3 className="font-semibold mb-2">Current Assignment</h3>
                                <p className="text-sm bg-red-50 p-3 rounded">{unit.current_call_info}</p>
                            </div>
                        )}

                        {unit.latitude && unit.longitude && (
                            <div>
                                <h3 className="font-semibold mb-2">Location</h3>
                                <p className="text-sm text-gray-600">
                                    {unit.latitude.toFixed(6)}, {unit.longitude.toFixed(6)}
                                </p>
                                {unit.speed > 0 && (
                                    <p className="text-sm text-gray-600">Speed: {Math.round(unit.speed)} mph</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6 flex gap-2">
                    <Button onClick={onClose} variant="outline" className="flex-1">
                        Close
                    </Button>
                    <Button onClick={() => { onRefresh(); onClose(); }} className="flex-1 bg-blue-600">
                        Refresh Data
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function getStatusColor(status) {
    if (status === 'Available') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Enroute') return 'bg-red-100 text-red-700 border-red-300';
    if (status === 'On Scene') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (status === 'On Patrol') return 'bg-indigo-100 text-indigo-700 border-indigo-300';
    if (status === 'Out of Service') return 'bg-gray-100 text-gray-700 border-gray-300';
    return 'bg-yellow-100 text-yellow-700 border-yellow-300';
}