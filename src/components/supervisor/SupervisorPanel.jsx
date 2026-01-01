import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Activity, MapPin, AlertCircle, Radio, Shield, Settings } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export default function SupervisorPanel({ isOpen, onClose, onShowHeatmap, onShowBreadcrumb, onShowGeofences }) {
    const [selectedTab, setSelectedTab] = useState('activity');
    const [geofences, setGeofences] = useState([]);
    const [geofenceEvents, setGeofenceEvents] = useState([]);
    const [newGeofence, setNewGeofence] = useState({
        name: '',
        latitude: '',
        longitude: '',
        radius_meters: 500,
        alert_on_entry: true,
        alert_on_exit: true,
        color: '#3B82F6'
    });
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [showGeofencesLayer, setShowGeofencesLayer] = useState(true);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [allUnits, setAllUnits] = useState([]);

    useEffect(() => {
        if (isOpen) {
            loadGeofences();
            loadGeofenceEvents();
            loadUnits();
        }
    }, [isOpen]);

    const loadGeofences = async () => {
        try {
            const data = await base44.entities.Geofence.list();
            setGeofences(data || []);
        } catch (error) {
            console.error('Error loading geofences:', error);
        }
    };

    const loadGeofenceEvents = async () => {
        try {
            const data = await base44.entities.GeofenceEvent.list('-created_date', 50);
            setGeofenceEvents(data || []);
        } catch (error) {
            console.error('Error loading events:', error);
        }
    };

    const loadUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            setAllUnits(response.data?.users || []);
        } catch (error) {
            console.error('Error loading units:', error);
        }
    };

    const createGeofence = async () => {
        try {
            if (!newGeofence.name || !newGeofence.latitude || !newGeofence.longitude) {
                toast.error('Please fill in all required fields');
                return;
            }

            await base44.entities.Geofence.create({
                ...newGeofence,
                latitude: parseFloat(newGeofence.latitude),
                longitude: parseFloat(newGeofence.longitude),
                radius_meters: parseInt(newGeofence.radius_meters),
                active: true
            });

            setNewGeofence({
                name: '',
                latitude: '',
                longitude: '',
                radius_meters: 500,
                alert_on_entry: true,
                alert_on_exit: true,
                color: '#3B82F6'
            });

            await loadGeofences();
            toast.success('Geofence created');
        } catch (error) {
            toast.error('Failed to create geofence');
        }
    };

    const deleteGeofence = async (id) => {
        try {
            await base44.entities.Geofence.delete(id);
            await loadGeofences();
            toast.success('Geofence deleted');
        } catch (error) {
            toast.error('Failed to delete geofence');
        }
    };

    const handleBroadcast = async () => {
        if (selectedUnits.length === 0) {
            toast.error('Select at least one unit');
            return;
        }

        if (!broadcastMessage.trim()) {
            toast.error('Enter a message');
            return;
        }

        try {
            const response = await base44.functions.invoke('broadcastToUnits', {
                unit_ids: selectedUnits,
                message: broadcastMessage
            });

            if (response.data?.success) {
                toast.success(`Broadcast sent to ${response.data.broadcastedTo} units`);
                setBroadcastMessage('');
                setSelectedUnits([]);
            }
        } catch (error) {
            toast.error('Broadcast failed');
        }
    };

    const toggleUnitSelection = (unitId) => {
        setSelectedUnits(prev => 
            prev.includes(unitId) 
                ? prev.filter(id => id !== unitId)
                : [...prev, unitId]
        );
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 pointer-events-auto"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-4xl max-h-[90vh] z-[10000]"
                >
                    <Card className="bg-slate-900 border-slate-700 text-white">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center">
                                        <Shield className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Supervisor Tools</h2>
                                        <p className="text-sm text-slate-400">Advanced tracking & management</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                                <TabsList className="bg-slate-800 w-full">
                                    <TabsTrigger value="activity" className="flex-1">Activity Heatmap</TabsTrigger>
                                    <TabsTrigger value="geofences" className="flex-1">Geofences</TabsTrigger>
                                    <TabsTrigger value="broadcast" className="flex-1">Broadcast</TabsTrigger>
                                </TabsList>

                                <TabsContent value="activity" className="mt-4">
                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm text-slate-400">
                                                    View unit activity patterns over time
                                                </p>
                                                <Button
                                                    onClick={() => {
                                                        const newState = !showHeatmap;
                                                        setShowHeatmap(newState);
                                                        onShowHeatmap(newState);
                                                        toast.success(newState ? 'Heatmap visible' : 'Heatmap hidden');
                                                    }}
                                                    className={showHeatmap ? 'bg-purple-600' : 'bg-slate-700'}
                                                >
                                                    <Activity className="w-4 h-4 mr-2" />
                                                    {showHeatmap ? 'Hide' : 'Show'} Heatmap
                                                </Button>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <p className="text-sm text-slate-400">
                                                    View unit movement trails (24 hours)
                                                </p>
                                                <Button
                                                    onClick={() => {
                                                        onShowBreadcrumb(true);
                                                        onClose();
                                                    }}
                                                    className="bg-blue-600"
                                                >
                                                    <MapPin className="w-4 h-4 mr-2" />
                                                    View Trails
                                                </Button>
                                            </div>
                                        </div>

                                        {geofenceEvents.length > 0 && (
                                            <div className="bg-slate-800 rounded-lg p-4">
                                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                                    Recent Geofence Events
                                                </h3>
                                                <ScrollArea className="h-64">
                                                    <div className="space-y-2">
                                                        {geofenceEvents.slice(0, 20).map(event => (
                                                            <div key={event.id} className="bg-slate-700 p-3 rounded-lg">
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="font-semibold">{event.unit_name}</div>
                                                                        <div className="text-xs text-slate-400">
                                                                            {event.event_type === 'entry' ? 'Entered' : 'Exited'} {event.geofence_name}
                                                                        </div>
                                                                    </div>
                                                                    <Badge className={event.event_type === 'entry' ? 'bg-green-600' : 'bg-orange-600'}>
                                                                        {event.event_type}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-xs text-slate-500 mt-1">
                                                                    {formatDistanceToNow(new Date(event.created_date), { addSuffix: true })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="geofences" className="mt-4">
                                    <div className="space-y-4">
                                        <div className="bg-slate-800 rounded-lg p-4">
                                            <h3 className="font-semibold mb-3">Create Geofence</h3>
                                            <div className="space-y-3">
                                                <Input
                                                    placeholder="Geofence name (e.g., Police Station)"
                                                    value={newGeofence.name}
                                                    onChange={(e) => setNewGeofence({...newGeofence, name: e.target.value})}
                                                    className="bg-slate-700 border-slate-600"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input
                                                        placeholder="Latitude"
                                                        type="number"
                                                        step="any"
                                                        value={newGeofence.latitude}
                                                        onChange={(e) => setNewGeofence({...newGeofence, latitude: e.target.value})}
                                                        className="bg-slate-700 border-slate-600"
                                                    />
                                                    <Input
                                                        placeholder="Longitude"
                                                        type="number"
                                                        step="any"
                                                        value={newGeofence.longitude}
                                                        onChange={(e) => setNewGeofence({...newGeofence, longitude: e.target.value})}
                                                        className="bg-slate-700 border-slate-600"
                                                    />
                                                </div>
                                                <Input
                                                    placeholder="Radius (meters)"
                                                    type="number"
                                                    value={newGeofence.radius_meters}
                                                    onChange={(e) => setNewGeofence({...newGeofence, radius_meters: e.target.value})}
                                                    className="bg-slate-700 border-slate-600"
                                                />
                                                <Button onClick={createGeofence} className="w-full bg-purple-600">
                                                    Create Geofence
                                                </Button>
                                            </div>
                                        </div>

                                        <ScrollArea className="h-64">
                                            <div className="space-y-2">
                                                {geofences.map(fence => (
                                                    <div key={fence.id} className="bg-slate-800 p-4 rounded-lg">
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <div className="font-semibold">{fence.name}</div>
                                                                <div className="text-xs text-slate-400 mt-1">
                                                                    {fence.radius_meters}m radius
                                                                </div>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => deleteGeofence(fence.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </TabsContent>

                                <TabsContent value="broadcast" className="mt-4">
                                    <div className="space-y-4">
                                        <div className="bg-slate-800 rounded-lg p-4">
                                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                                                <Radio className="w-4 h-4" />
                                                Select Units
                                            </h3>
                                            <ScrollArea className="h-48 mb-3">
                                                <div className="space-y-2">
                                                    {allUnits.map(unit => (
                                                        <div
                                                            key={unit.id}
                                                            onClick={() => toggleUnitSelection(unit.id)}
                                                            className={`p-3 rounded-lg cursor-pointer transition-all ${
                                                                selectedUnits.includes(unit.id)
                                                                    ? 'bg-purple-600 border-2 border-purple-400'
                                                                    : 'bg-slate-700 hover:bg-slate-600'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-semibold">
                                                                        {unit.unit_number || unit.full_name}
                                                                    </div>
                                                                    <div className="text-xs text-slate-400">
                                                                        {unit.status}
                                                                    </div>
                                                                </div>
                                                                {selectedUnits.includes(unit.id) && (
                                                                    <Badge className="bg-white text-purple-600">
                                                                        Selected
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>

                                            <div className="flex gap-2 mb-3">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setSelectedUnits(allUnits.map(u => u.id))}
                                                    className="flex-1"
                                                >
                                                    Select All
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setSelectedUnits([])}
                                                    className="flex-1"
                                                >
                                                    Clear
                                                </Button>
                                            </div>

                                            <Input
                                                placeholder="Enter message to broadcast..."
                                                value={broadcastMessage}
                                                onChange={(e) => setBroadcastMessage(e.target.value)}
                                                className="bg-slate-700 border-slate-600 mb-3"
                                            />

                                            <Button
                                                onClick={handleBroadcast}
                                                className="w-full bg-purple-600 hover:bg-purple-700"
                                                disabled={selectedUnits.length === 0 || !broadcastMessage.trim()}
                                            >
                                                <Radio className="w-4 h-4 mr-2" />
                                                Broadcast to {selectedUnits.length} Unit{selectedUnits.length !== 1 ? 's' : ''}
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}