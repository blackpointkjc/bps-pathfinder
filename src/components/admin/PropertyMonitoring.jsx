import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Plus, Edit2, Trash2, CheckCircle, XCircle, Circle, Pentagon } from 'lucide-react';
import PropertyDrawMap from './PropertyDrawMap';

export default function PropertyMonitoring() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingProperty, setEditingProperty] = useState(null);
    const [drawMode, setDrawMode] = useState('circle'); // 'circle' | 'polygon'
    const [circleCenter, setCircleCenter] = useState(null); // [lat, lng]
    const [polygonPoints, setPolygonPoints] = useState([]); // [[lat, lng], ...]
    const [flyTo, setFlyTo] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        radiusMeters: 500,
        enabled: true
    });

    useEffect(() => {
        loadProperties();
    }, []);

    const loadProperties = async () => {
        try {
            const data = await base44.entities.MonitoredProperty.list('-created_date');
            setProperties(data || []);
        } catch (error) {
            console.error('Error loading properties:', error);
            toast.error('Failed to load properties');
        } finally {
            setLoading(false);
        }
    };

    const resetDrawing = () => {
        setCircleCenter(null);
        setPolygonPoints([]);
    };

    const handleAddNew = () => {
        setEditingProperty(null);
        setDrawMode('circle');
        resetDrawing();
        setFormData({ name: '', address: '', radiusMeters: 500, enabled: true });
        setShowDialog(true);
    };

    const handleEdit = (property) => {
        setEditingProperty(property);
        const mode = property.boundary_type || 'circle';
        setDrawMode(mode);
        if (mode === 'polygon' && property.polygon?.length) {
            setPolygonPoints(property.polygon);
            setCircleCenter(null);
        } else {
            setCircleCenter(property.latitude ? [property.latitude, property.longitude] : null);
            setPolygonPoints([]);
            if (property.latitude) setFlyTo([property.latitude, property.longitude]);
        }
        setFormData({
            name: property.name,
            address: property.address,
            radiusMeters: property.radiusMeters || 500,
            enabled: property.enabled
        });
        setShowDialog(true);
    };

    const handleSave = async () => {
        try {
            if (!formData.name || !formData.address) {
                toast.error('Name and address are required');
                return;
            }
            if (drawMode === 'circle' && !circleCenter) {
                toast.error('Click the map to set the property center');
                return;
            }
            if (drawMode === 'polygon' && polygonPoints.length < 3) {
                toast.error('Draw at least 3 points on the map to define the polygon');
                return;
            }

            const data = {
                name: formData.name,
                address: formData.address,
                enabled: formData.enabled,
                boundary_type: drawMode,
                ...(drawMode === 'circle' ? {
                    latitude: circleCenter[0],
                    longitude: circleCenter[1],
                    radiusMeters: parseFloat(formData.radiusMeters) || 500,
                    polygon: null
                } : {
                    latitude: polygonPoints[0][0],
                    longitude: polygonPoints[0][1],
                    polygon: polygonPoints,
                    radiusMeters: null
                })
            };

            if (editingProperty) {
                await base44.entities.MonitoredProperty.update(editingProperty.id, data);
                toast.success('Property updated');
            } else {
                await base44.entities.MonitoredProperty.create(data);
                toast.success('Property added');
            }

            setShowDialog(false);
            await loadProperties();
        } catch (error) {
            console.error('Error saving property:', error);
            toast.error('Failed to save property');
        }
    };

    const handleDelete = async (property) => {
        if (!confirm(`Delete property "${property.name}"? Past alerts will be preserved.`)) {
            return;
        }

        try {
            await base44.entities.MonitoredProperty.delete(property.id);
            toast.success('Property deleted');
            await loadProperties();
        } catch (error) {
            console.error('Error deleting property:', error);
            toast.error('Failed to delete property');
        }
    };

    const handleToggleEnabled = async (property) => {
        try {
            await base44.entities.MonitoredProperty.update(property.id, {
                enabled: !property.enabled
            });
            toast.success(property.enabled ? 'Property disabled' : 'Property enabled');
            await loadProperties();
        } catch (error) {
            console.error('Error updating property:', error);
            toast.error('Failed to update property');
        }
    };

    const handleGeocode = async () => {
        if (!formData.address) {
            toast.error('Enter an address first');
            return;
        }
        const loadingToast = toast.loading('Locating address...');
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `GPS coordinates for: "${formData.address}"`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: 'object',
                    properties: { latitude: { type: 'number' }, longitude: { type: 'number' } },
                    required: ['latitude', 'longitude']
                }
            });
            toast.dismiss(loadingToast);
            if (result.latitude && result.longitude) {
                const center = [result.latitude, result.longitude];
                setCircleCenter(center);
                setFlyTo(center);
                toast.success('Location found — map centered');
            } else {
                toast.error('Could not find coordinates');
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Geocoding failed');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="font-mono space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-gold rounded-sm" />
                    <MapPin className="w-4 h-4 text-gold" />
                    <span className="text-white font-bold text-sm tracking-widest">PROPERTY MONITORING</span>
                    <span className="text-slate-500 text-[10px] ml-1">{properties.length} ZONES</span>
                </div>
                <button onClick={handleAddNew}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 border border-gold/40 text-gold hover:bg-gold/20 text-[10px] font-bold rounded transition-all">
                    <Plus className="w-3 h-3" />
                    ADD PROPERTY
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {properties.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <MapPin className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-600 text-xs font-mono">NO MONITORED ZONES</p>
                    </div>
                ) : properties.map((property) => (
                    <div key={property.id} className="bg-slate-900 border border-slate-800 rounded p-3">
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-white font-bold text-xs truncate">{property.name}</span>
                                    {property.enabled
                                        ? <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                                        : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                                </div>
                                <p className="text-[9px] text-slate-500 mt-0.5 truncate">{property.address}</p>
                            </div>
                        </div>
                        <div className="space-y-1 text-[9px] text-slate-500 mb-3">
                            <div className="flex justify-between">
                                <span>TYPE</span>
                                <span className="text-gold font-bold">{(property.boundary_type || 'circle').toUpperCase()}</span>
                            </div>
                            {property.boundary_type !== 'polygon' && property.radiusMeters && (
                                <div className="flex justify-between">
                                    <span>RADIUS</span>
                                    <span className="text-slate-300">{property.radiusMeters >= 1000 ? `${(property.radiusMeters/1000).toFixed(1)} km` : `${property.radiusMeters} m`}</span>
                                </div>
                            )}
                            {property.boundary_type === 'polygon' && (
                                <div className="flex justify-between">
                                    <span>VERTICES</span>
                                    <span className="text-slate-300">{property.polygon?.length || 0} pts</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span>STATUS</span>
                                <span className={property.enabled ? 'text-green-400' : 'text-red-400'}>{property.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handleEdit(property)}
                                className="flex-1 py-1 text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-400 hover:text-gold hover:border-gold/40 rounded transition-all flex items-center justify-center gap-1">
                                <Edit2 className="w-2.5 h-2.5" /> EDIT
                            </button>
                            <button onClick={() => handleToggleEnabled(property)}
                                className={`flex-1 py-1 text-[9px] font-bold border rounded transition-all ${
                                    property.enabled
                                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                                }`}>
                                {property.enabled ? 'DISABLE' : 'ENABLE'}
                            </button>
                            <button onClick={() => handleDelete(property)}
                                className="px-2 py-1 text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all">
                                <Trash2 className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <Dialog open={showDialog} onOpenChange={(v) => { setShowDialog(v); if (!v) { resetDrawing(); setFlyTo(null); } }}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 pointer-events-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white font-mono text-sm flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gold" />
                            {editingProperty ? 'EDIT MONITORED ZONE' : 'ADD MONITORED ZONE'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pointer-events-auto">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">ZONE NAME</Label>
                                <Input value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Police HQ Campus"
                                    className="mt-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">ADDRESS</Label>
                                <div className="flex gap-1 mt-1">
                                    <Input value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="200 W Grace St, Richmond VA"
                                        className="flex-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                                    <button type="button" onClick={handleGeocode}
                                        className="px-2 py-1 bg-slate-700 border border-slate-600 text-gold text-[9px] font-bold rounded hover:bg-slate-600 transition-all">
                                        FIND
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Draw mode toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[10px] tracking-widest">BOUNDARY TYPE:</span>
                            <div className="flex border border-slate-700 rounded overflow-hidden">
                                <button onClick={() => { setDrawMode('circle'); setPolygonPoints([]); }}
                                    className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold transition-all ${
                                        drawMode === 'circle' ? 'bg-gold/20 text-gold border-r border-gold/30' : 'bg-slate-800 text-slate-500 border-r border-slate-700 hover:text-slate-300'
                                    }`}>
                                    <Circle className="w-3 h-3" /> CIRCLE
                                </button>
                                <button onClick={() => { setDrawMode('polygon'); setCircleCenter(null); }}
                                    className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold transition-all ${
                                        drawMode === 'polygon' ? 'bg-gold/20 text-gold' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                                    }`}>
                                    <Pentagon className="w-3 h-3" /> POLYGON
                                </button>
                            </div>
                            <button onClick={resetDrawing}
                                className="ml-auto px-2 py-1 text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-500 hover:text-red-400 rounded transition-all">
                                CLEAR
                            </button>
                        </div>

                        {/* Instructions */}
                        <div className="text-[9px] text-slate-500 px-2 py-1 bg-slate-800/50 border border-slate-700 rounded">
                            {drawMode === 'circle'
                                ? '📍 Click on the map to place the center point, then set the radius below'
                                : '✏️ Click on the map to add polygon vertices. Add 3+ points to define the zone boundary'}
                        </div>

                        {/* Map */}
                        <div className="border border-slate-700 rounded overflow-hidden">
                            <PropertyDrawMap
                                mode={drawMode}
                                center={circleCenter}
                                radius={parseFloat(formData.radiusMeters) || 0}
                                polygon={polygonPoints}
                                onCenterChange={setCircleCenter}
                                onPolygonChange={setPolygonPoints}
                                flyTo={flyTo}
                            />
                        </div>

                        {/* Circle radius or polygon info */}
                        {drawMode === 'circle' ? (
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">RADIUS (METERS) — any size</Label>
                                <Input type="number" min="1" value={formData.radiusMeters}
                                    onChange={e => setFormData({ ...formData, radiusMeters: e.target.value })}
                                    placeholder="e.g., 500 (m), 5000 (5km), 50000 (50km)"
                                    className="mt-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                                <div className="text-[9px] text-slate-600 mt-1">
                                    {formData.radiusMeters >= 1000
                                        ? `= ${(formData.radiusMeters / 1000).toFixed(2)} km`
                                        : `= ${formData.radiusMeters} meters`}
                                    {circleCenter && ` | Center: ${circleCenter[0].toFixed(5)}, ${circleCenter[1].toFixed(5)}`}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-[9px] text-slate-500">
                                <span className="text-gold font-bold">{polygonPoints.length} POINTS PLACED</span>
                                {polygonPoints.length >= 3 && <span className="text-green-400">✓ VALID POLYGON</span>}
                                {polygonPoints.length > 0 && (
                                    <button onClick={() => setPolygonPoints(pts => pts.slice(0, -1))}
                                        className="ml-auto px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded">UNDO LAST</button>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded">
                            <Label className="text-slate-400 font-mono text-[10px] tracking-widest">MONITORING ACTIVE</Label>
                            <Switch checked={formData.enabled}
                                onCheckedChange={v => setFormData({ ...formData, enabled: v })} />
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setShowDialog(false)}
                                className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-mono text-xs rounded transition-all">
                                CANCEL
                            </button>
                            <button onClick={handleSave}
                                className="flex-1 py-2 bg-gold/10 border border-gold/50 text-gold hover:bg-gold/20 font-mono text-xs font-bold rounded transition-all">
                                {editingProperty ? 'UPDATE ZONE' : 'SAVE ZONE'}
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}