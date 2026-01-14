import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { MapPin, Clock, Navigation } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function LocationTracking({ users }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [locationLogs, setLocationLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (selectedUser) {
            loadLocationLogs();
        }
    }, [selectedUser, selectedDate]);

    const loadLocationLogs = async () => {
        if (!selectedUser) return;
        
        setLoading(true);
        try {
            const logs = await base44.entities.LocationLog.filter({
                user_id: selectedUser.id,
                shift_date: selectedDate
            }, '-created_date', 500);
            
            setLocationLogs(logs || []);
        } catch (error) {
            console.error('Error loading location logs:', error);
            toast.error('Failed to load location history');
        } finally {
            setLoading(false);
        }
    };

    const activeUsers = users?.filter(u => u.unit_number) || [];
    const hasLogs = locationLogs.length > 0;
    const pathCoordinates = locationLogs.map(log => [log.latitude, log.longitude]);
    const center = hasLogs ? [locationLogs[0].latitude, locationLogs[0].longitude] : [37.5407, -77.4360];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controls */}
            <Card className="p-6 lg:col-span-1">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-600" />
                    Location Tracking
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block">Select Officer</label>
                        <Select value={selectedUser?.id} onValueChange={(id) => setSelectedUser(activeUsers.find(u => u.id === id))}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose officer..." />
                            </SelectTrigger>
                            <SelectContent>
                                {activeUsers.map(user => (
                                    <SelectItem key={user.id} value={user.id}>
                                        {user.rank} {user.last_name} - #{user.unit_number}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-2 block">Shift Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>

                    {selectedUser && (
                        <Card className="p-4 bg-blue-50 border-blue-200">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-blue-600">
                                        Unit #{selectedUser.unit_number}
                                    </Badge>
                                </div>
                                <p className="text-sm font-semibold text-gray-900">
                                    {selectedUser.rank} {selectedUser.last_name}
                                </p>
                                <p className="text-xs text-gray-600">
                                    {locationLogs.length} location points logged
                                </p>
                            </div>
                        </Card>
                    )}
                </div>

                {/* Location History */}
                {selectedUser && (
                    <div className="mt-6">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Location History
                        </h3>
                        <ScrollArea className="h-[400px]">
                            <div className="space-y-2">
                                {loading && (
                                    <div className="text-center py-8 text-gray-500">Loading...</div>
                                )}
                                {!loading && locationLogs.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        No location data for this date
                                    </div>
                                )}
                                {locationLogs.map((log, idx) => (
                                    <Card key={log.id} className="p-3 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                <MapPin className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-900">
                                                    {new Date(log.created_date).toLocaleTimeString()}
                                                </p>
                                                <p className="text-xs text-gray-600 truncate">
                                                    {log.address || `${log.latitude.toFixed(4)}, ${log.longitude.toFixed(4)}`}
                                                </p>
                                                {log.status && (
                                                    <Badge variant="outline" className="text-xs mt-1">
                                                        {log.status}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}
            </Card>

            {/* Map */}
            <Card className="p-0 lg:col-span-2 overflow-hidden" style={{ height: '700px' }}>
                {!selectedUser && (
                    <div className="h-full flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-600">Select an officer to view their location tracking</p>
                        </div>
                    </div>
                )}
                {selectedUser && (
                    <MapContainer
                        center={center}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        
                        {/* Path line */}
                        {pathCoordinates.length > 1 && (
                            <Polyline
                                positions={pathCoordinates}
                                color="#2563eb"
                                weight={3}
                                opacity={0.7}
                            />
                        )}

                        {/* Location markers */}
                        {locationLogs.map((log, idx) => (
                            <Marker
                                key={log.id}
                                position={[log.latitude, log.longitude]}
                            >
                                <Popup>
                                    <div className="text-sm">
                                        <p className="font-semibold">
                                            {selectedUser.rank} {selectedUser.last_name}
                                        </p>
                                        <p className="text-xs text-gray-600">
                                            {new Date(log.created_date).toLocaleString()}
                                        </p>
                                        {log.address && (
                                            <p className="text-xs mt-1">{log.address}</p>
                                        )}
                                        {log.status && (
                                            <Badge className="mt-1 text-xs">{log.status}</Badge>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                )}
            </Card>
        </div>
    );
}