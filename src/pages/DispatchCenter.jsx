import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Radio, MapPin, Clock, Users, History, Send, Shield, AlertCircle, Navigation, Trash2 } from 'lucide-react';

export default function DispatchCenter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [externalCalls, setExternalCalls] = useState([]);
    const [callHistory, setCallHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [selectedUnits, setSelectedUnits] = useState([]);
    
    const [newCall, setNewCall] = useState({
        incident: '',
        location: '',
        description: '',
        priority: 'medium',
        agency: 'RPD'
    });

    useEffect(() => {
        init();
        const interval = setInterval(() => {
            loadExternalCalls();
            loadUnits();
        }, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Officers (non-dispatch) should see external calls only
            if (user.role !== 'admin' && !user.dispatch_role) {
                await loadExternalCalls();
                setLoading(false);
                return;
            }

            // Dispatch users see everything
            await Promise.all([
                loadUnits(),
                loadActiveCalls(),
                loadExternalCalls(),
                loadCallHistory()
            ]);
        } catch (error) {
            console.error('Error initializing:', error);
            toast.error('Failed to load dispatch center');
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const allUsers = response.data?.users || [];
            const active = allUsers.filter(u => u.latitude && u.longitude);
            setUnits(active);
        } catch (error) {
            console.error('Error loading units:', error);
        }
    };

    const loadActiveCalls = async () => {
        try {
            const calls = await base44.entities.DispatchCall.list('-created_date', 100);
            setActiveCalls(calls || []);
        } catch (error) {
            console.error('Error loading active calls:', error);
        }
    };

    const loadExternalCalls = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllActiveCalls', {});
            if (response.data?.success) {
                setExternalCalls(response.data.geocodedCalls || []);
            }
        } catch (error) {
            console.error('Error loading external calls:', error);
        }
    };

    const loadCallHistory = async () => {
        try {
            const history = await base44.entities.CallHistory.list('-archived_date', 50);
            setCallHistory(history || []);
        } catch (error) {
            console.error('Error loading call history:', error);
        }
    };

    const handleCreateCall = async () => {
        if (!newCall.incident || !newCall.location) {
            toast.error('Incident and location required');
            return;
        }

        setCreating(true);
        try {
            // Geocode
            const geoResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newCall.location + ', Virginia, USA')}&limit=1`,
                { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
            );
            const geoData = await geoResponse.json();
            
            let latitude = null, longitude = null;
            if (geoData && geoData.length > 0) {
                latitude = parseFloat(geoData[0].lat);
                longitude = parseFloat(geoData[0].lon);
            }

            const callData = {
                ...newCall,
                latitude,
                longitude,
                ai_summary: `${newCall.incident} at ${newCall.location}`,
                assigned_units: selectedUnits,
                status: 'Dispatched',
                time_received: new Date().toISOString()
            };

            await base44.entities.DispatchCall.create(callData);
            
            toast.success('Call dispatched');
            setNewCall({ incident: '', location: '', description: '', priority: 'medium', agency: 'RPD' });
            setSelectedUnits([]);
            await loadActiveCalls();
        } catch (error) {
            console.error('Error creating call:', error);
            toast.error('Failed to dispatch call');
        } finally {
            setCreating(false);
        }
    };

    const toggleUnit = (unitId) => {
        setSelectedUnits(prev => 
            prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
            </div>
        );
    }

    // Officer View (non-dispatch users)
    if (currentUser && currentUser.role !== 'admin' && !currentUser.dispatch_role) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
                                    <AlertCircle className="w-8 h-8 text-white" />
                                </div>
                                Active Calls
                            </h1>
                            <p className="text-slate-400">View live emergency calls from all agencies</p>
                        </div>
                        <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-800" onClick={() => window.location.href = '/navigation'}>
                            Back to Navigation
                        </Button>
                    </div>

                    <Card className="p-6 bg-slate-800/50 border-slate-700 backdrop-blur">
                        <ScrollArea className="h-[calc(100vh-240px)]">
                            {externalCalls.length === 0 ? (
                                <div className="text-center py-16">
                                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                    <p className="text-slate-500">No active calls</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {externalCalls.map((call, idx) => (
                                        <ExternalCallCard key={idx} call={call} />
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </Card>
                </div>
            </div>
        );
    }

    // Dispatch View (admin and dispatch_role users)
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-red-600 flex items-center justify-center">
                                <Radio className="w-8 h-8 text-white" />
                            </div>
                            Dispatch Center
                        </h1>
                        <p className="text-slate-400">Real-time call management and unit coordination</p>
                    </div>
                    <div className="flex gap-3">
                        {currentUser?.role === 'admin' && (
                            <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-800" onClick={() => window.location.href = '/adminportal'}>
                                <Shield className="w-4 h-4 mr-2" />
                                Admin Portal
                            </Button>
                        )}
                        <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-800" onClick={() => window.location.href = '/navigation'}>
                            Back to Navigation
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Create Call */}
                    <Card className="p-6 bg-slate-800/50 border-slate-700 backdrop-blur">
                        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                            <Plus className="w-6 h-6 text-red-500" />
                            New Call
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <Label className="text-slate-300">Incident Type</Label>
                                <Input
                                    value={newCall.incident}
                                    onChange={(e) => setNewCall({...newCall, incident: e.target.value})}
                                    placeholder="Traffic Accident, Burglary..."
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Location</Label>
                                <Input
                                    value={newCall.location}
                                    onChange={(e) => setNewCall({...newCall, location: e.target.value})}
                                    placeholder="123 Main St, Richmond VA"
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Description (Optional)</Label>
                                <Textarea
                                    value={newCall.description}
                                    onChange={(e) => setNewCall({...newCall, description: e.target.value})}
                                    placeholder="Additional details..."
                                    rows={3}
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-300">Priority</Label>
                                    <select
                                        value={newCall.priority}
                                        onChange={(e) => setNewCall({...newCall, priority: e.target.value})}
                                        className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-slate-300">Agency</Label>
                                    <select
                                        value={newCall.agency}
                                        onChange={(e) => setNewCall({...newCall, agency: e.target.value})}
                                        className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                                    >
                                        <option value="RPD">RPD</option>
                                        <option value="RFD">RFD</option>
                                        <option value="HPD">HPD</option>
                                        <option value="CCPD">CCPD</option>
                                        <option value="CCFD">CCFD</option>
                                        <option value="BPS">BPS</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <Label className="text-slate-300 mb-3 block">Active Units ({units.length})</Label>
                                <ScrollArea className="h-40 border border-slate-700 rounded-lg p-2 bg-slate-900/50">
                                    {units.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-4">No units online</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {units.map(unit => (
                                                <div
                                                    key={unit.id}
                                                    onClick={() => toggleUnit(unit.id)}
                                                    className={`p-2 rounded-lg cursor-pointer transition-all ${
                                                        selectedUnits.includes(unit.id)
                                                            ? 'bg-red-600 text-white'
                                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-semibold">
                                                            Unit {unit.unit_number || 'N/A'}
                                                        </span>
                                                        <Badge variant="outline" className={selectedUnits.includes(unit.id) ? 'border-white text-white' : 'border-slate-600 text-slate-400'}>
                                                            {unit.status || 'Available'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>

                            <Button
                                onClick={handleCreateCall}
                                disabled={creating}
                                className="w-full bg-red-600 hover:bg-red-700 py-6 text-lg font-semibold"
                            >
                                <Send className="w-5 h-5 mr-2" />
                                {creating ? 'Dispatching...' : 'Dispatch Call'}
                            </Button>
                        </div>
                    </Card>

                    {/* Calls Tabs */}
                    <div className="lg:col-span-2">
                        <Tabs defaultValue="active" className="w-full">
                            <TabsList className="grid w-full grid-cols-3 bg-slate-800 border border-slate-700">
                                <TabsTrigger value="active" className="data-[state=active]:bg-red-600">
                                    <Radio className="w-4 h-4 mr-2" />
                                    Active ({activeCalls.length})
                                </TabsTrigger>
                                <TabsTrigger value="external" className="data-[state=active]:bg-blue-600">
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    External ({externalCalls.length})
                                </TabsTrigger>
                                <TabsTrigger value="history" className="data-[state=active]:bg-slate-700">
                                    <History className="w-4 h-4 mr-2" />
                                    History ({callHistory.length})
                                </TabsTrigger>
                            </TabsList>

                            {/* Active Dispatch Calls */}
                            <TabsContent value="active">
                                <Card className="p-6 bg-slate-800/50 border-slate-700 backdrop-blur">
                                    <ScrollArea className="h-[calc(100vh-380px)]">
                                        {activeCalls.length === 0 ? (
                                            <div className="text-center py-16">
                                                <Radio className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                                <p className="text-slate-500">No active dispatch calls</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {activeCalls.map(call => (
                                                    <CallCard key={call.id} call={call} onUpdate={loadActiveCalls} />
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </Card>
                            </TabsContent>

                            {/* External Calls */}
                            <TabsContent value="external">
                                <Card className="p-6 bg-slate-800/50 border-slate-700 backdrop-blur">
                                    <ScrollArea className="h-[calc(100vh-380px)]">
                                        {externalCalls.length === 0 ? (
                                            <div className="text-center py-16">
                                                <AlertCircle className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                                <p className="text-slate-500">No external calls</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {externalCalls.map((call, idx) => (
                                                    <ExternalCallCard key={idx} call={call} />
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </Card>
                            </TabsContent>

                            {/* Call History */}
                            <TabsContent value="history">
                                <Card className="p-6 bg-slate-800/50 border-slate-700 backdrop-blur">
                                    <ScrollArea className="h-[calc(100vh-380px)]">
                                        {callHistory.length === 0 ? (
                                            <div className="text-center py-16">
                                                <History className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                                <p className="text-slate-500">No call history</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {callHistory.map(call => (
                                                    <HistoryCallCard key={call.id} call={call} />
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CallCard({ call, onUpdate }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <Card className="p-4 bg-slate-900 border-slate-700 hover:border-red-500 transition-all">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-white mb-1">{call.incident}</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                            <MapPin className="w-4 h-4" />
                            <span>{call.location}</span>
                        </div>
                        {!call.latitude && (
                            <Badge variant="outline" className="mt-2 border-amber-500 text-amber-500">
                                No GPS
                            </Badge>
                        )}
                    </div>
                    <Badge className={
                        call.priority === 'critical' ? 'bg-red-600' :
                        call.priority === 'high' ? 'bg-orange-500' :
                        call.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                    }>
                        {call.priority}
                    </Badge>
                </div>

                {call.description && (
                    <p className="text-sm text-slate-400 mb-3">{call.description}</p>
                )}

                <div className="flex items-center gap-2 mb-3">
                    <select
                        value={call.status}
                        onChange={async (e) => {
                            try {
                                await base44.entities.DispatchCall.update(call.id, { status: e.target.value });
                                toast.success('Status updated');
                                onUpdate();
                            } catch (error) {
                                toast.error('Failed to update');
                            }
                        }}
                        className="flex h-8 rounded-md border bg-slate-900 border-slate-700 text-white px-2 text-xs flex-1"
                    >
                        <option value="Dispatched">Dispatched</option>
                        <option value="Enroute">Enroute</option>
                        <option value="On Scene">On Scene</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                            if (confirm('Delete this call?')) {
                                try {
                                    await base44.entities.DispatchCall.delete(call.id);
                                    toast.success('Call deleted');
                                    onUpdate();
                                } catch (error) {
                                    toast.error('Failed to delete');
                                }
                            }
                        }}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(call.time_received).toLocaleTimeString()}
                    </div>
                    <Badge variant="outline" className="border-slate-600 text-slate-400">{call.agency}</Badge>
                </div>
            </Card>
        </motion.div>
    );
}

function ExternalCallCard({ call }) {
    return (
        <Card className="p-4 bg-slate-900 border-slate-700">
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                    <h3 className="font-bold text-white mb-1">{call.incident}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <MapPin className="w-4 h-4" />
                        <span>{call.location}</span>
                    </div>
                    {!call.latitude && (
                        <Badge variant="outline" className="mt-2 border-amber-500 text-amber-500 text-xs">
                            No GPS Available
                        </Badge>
                    )}
                    {call.latitude && (
                        <Badge variant="outline" className="mt-2 border-green-500 text-green-500 text-xs">
                            GPS: {call.latitude.toFixed(4)}, {call.longitude.toFixed(4)}
                        </Badge>
                    )}
                </div>
                <Badge className="bg-blue-600">{call.agency}</Badge>
            </div>
            
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3">
                <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {call.timeReceived}
                </div>
                <Badge variant="outline" className="border-slate-600 text-slate-400">{call.status}</Badge>
            </div>
        </Card>
    );
}

function HistoryCallCard({ call }) {
    return (
        <Card className="p-4 bg-slate-900 border-slate-700 opacity-60">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h3 className="font-bold text-white mb-1">{call.incident}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <MapPin className="w-4 h-4" />
                        <span>{call.location}</span>
                    </div>
                </div>
                <Badge className="bg-slate-700">{call.agency}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3">
                <span>{new Date(call.archived_date).toLocaleDateString()}</span>
                <Badge variant="outline" className="border-slate-600 text-slate-400">{call.status}</Badge>
            </div>
        </Card>
    );
}