import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, MapPin, Clock, User, Send, Radio } from 'lucide-react';

export default function Dispatch() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [newCall, setNewCall] = useState({
        incident: '',
        location: '',
        description: '',
        priority: 'medium',
        agency: 'RPD'
    });
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            if (user.role !== 'admin' && !user.dispatch_role) {
                toast.error('Dispatch access restricted to administrators and dispatch users');
                return;
            }

            const [allUsers, dispatchCalls] = await Promise.all([
                base44.asServiceRole.entities.User.list('-last_updated', 100),
                base44.entities.DispatchCall.list('-created_date', 50)
            ]);

            // Filter users with location data (active units)
            const activeUsers = allUsers.filter(u => u.latitude && u.longitude);
            setUnits(activeUsers || []);
            setCalls(dispatchCalls || []);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load dispatch data');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCall = async () => {
        if (!newCall.incident || !newCall.location) {
            toast.error('Please enter incident type and location');
            return;
        }

        setCreating(true);
        try {
            const callData = {
                ...newCall,
                assigned_units: selectedUnits,
                status: 'Dispatched',
                time_received: new Date().toISOString(),
                created_by: currentUser.email
            };

            await base44.entities.DispatchCall.create(callData);
            
            toast.success('Call created and dispatched');
            setNewCall({
                incident: '',
                location: '',
                description: '',
                priority: 'medium',
                agency: 'RPD'
            });
            setSelectedUnits([]);
            loadData();
        } catch (error) {
            console.error('Error creating call:', error);
            toast.error('Failed to create call');
        } finally {
            setCreating(false);
        }
    };

    const toggleUnitSelection = (unitId) => {
        setSelectedUnits(prev => 
            prev.includes(unitId) 
                ? prev.filter(id => id !== unitId)
                : [...prev, unitId]
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
            </div>
        );
    }

    if (!currentUser || (currentUser.role !== 'admin' && !currentUser.dispatch_role)) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="p-8 max-w-md text-center">
                    <Radio className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
                    <p className="text-gray-600 mb-6">
                        Only administrators and dispatch users can access the dispatch panel.
                    </p>
                    <Button onClick={() => window.location.href = '/'}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Navigation
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 mb-2">Dispatch Center</h1>
                        <p className="text-gray-600">Create and manage service calls</p>
                    </div>
                    <Button variant="outline" onClick={() => window.location.href = '/'}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Map
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Create New Call */}
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                                <Plus className="w-6 h-6 text-red-600" />
                            </div>
                            <h2 className="text-2xl font-bold">Create Service Call</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label>Incident Type</Label>
                                <Input
                                    value={newCall.incident}
                                    onChange={(e) => setNewCall({...newCall, incident: e.target.value})}
                                    placeholder="e.g., Traffic Accident, Suspicious Activity"
                                />
                            </div>

                            <div>
                                <Label>Location</Label>
                                <Input
                                    value={newCall.location}
                                    onChange={(e) => setNewCall({...newCall, location: e.target.value})}
                                    placeholder="e.g., 123 Main St"
                                />
                            </div>

                            <div>
                                <Label>Description</Label>
                                <Textarea
                                    value={newCall.description}
                                    onChange={(e) => setNewCall({...newCall, description: e.target.value})}
                                    placeholder="Additional details..."
                                    rows={3}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Priority</Label>
                                    <select
                                        value={newCall.priority}
                                        onChange={(e) => setNewCall({...newCall, priority: e.target.value})}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>Agency</Label>
                                    <select
                                        value={newCall.agency}
                                        onChange={(e) => setNewCall({...newCall, agency: e.target.value})}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="RPD">RPD</option>
                                        <option value="HPD">HPD</option>
                                        <option value="CCPD">CCPD</option>
                                        <option value="CCFD">CCFD</option>
                                        <option value="BPS">BPS</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-3 block">Assign Units</Label>
                                <ScrollArea className="h-48 border rounded-lg p-3">
                                    {units.length === 0 ? (
                                        <p className="text-sm text-gray-500 text-center py-4">No active units available</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {units.map(unit => (
                                                <div
                                                    key={unit.id}
                                                    onClick={() => toggleUnitSelection(unit.id)}
                                                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                                                        selectedUnits.includes(unit.id)
                                                            ? 'bg-red-100 border-2 border-red-500'
                                                            : 'bg-gray-50 border-2 border-transparent hover:border-gray-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="font-semibold text-sm">
                                                                {unit.unit_number || unit.full_name}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {unit.rank && `${unit.rank} `}{unit.last_name || unit.full_name} • {unit.status || 'Available'}
                                                            </p>
                                                        </div>
                                                        {selectedUnits.includes(unit.id) && (
                                                            <Badge className="bg-red-600">Selected</Badge>
                                                        )}
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
                                className="w-full bg-red-600 hover:bg-red-700 py-6 text-lg"
                            >
                                <Send className="w-5 h-5 mr-2" />
                                {creating ? 'Creating...' : 'Dispatch Call'}
                            </Button>
                        </div>
                    </Card>

                    {/* Recent Calls */}
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                                <Radio className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">Recent Dispatches</h2>
                                <p className="text-sm text-gray-500">{calls.length} active calls</p>
                            </div>
                        </div>

                        <ScrollArea className="h-[600px]">
                            {calls.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Radio className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    <p>No active dispatch calls</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {calls.map((call) => (
                                        <motion.div
                                            key={call.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                        >
                                            <Card className="p-4">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h3 className="font-bold text-lg">{call.incident}</h3>
                                                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                                                            <MapPin className="w-4 h-4" />
                                                            <span>{call.location}</span>
                                                        </div>
                                                    </div>
                                                    <Badge className={
                                                        call.priority === 'critical' ? 'bg-red-600' :
                                                        call.priority === 'high' ? 'bg-orange-500' :
                                                        call.priority === 'medium' ? 'bg-yellow-500' :
                                                        'bg-blue-500'
                                                    }>
                                                        {call.priority}
                                                    </Badge>
                                                </div>
                                                {call.description && (
                                                    <p className="text-sm text-gray-600 mb-3">{call.description}</p>
                                                )}
                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(call.time_received).toLocaleTimeString()}
                                                    </div>
                                                    <Badge variant="outline">{call.agency}</Badge>
                                                </div>
                                            </Card>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </Card>
                </div>
            </div>
        </div>
    );
}