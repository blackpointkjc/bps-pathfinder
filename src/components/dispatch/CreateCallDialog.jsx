import React, { useState } from 'react';
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
import { X, Send, MapPin, AlertCircle } from 'lucide-react';

export default function CreateCallDialog({ units, currentUser, onClose, onCreated, initialCallType, initialPriority }) {
    const [creating, setCreating] = useState(false);
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [activeUnions, setActiveUnions] = useState(new Set());
    const [formData, setFormData] = useState({
        incident: initialCallType || '',
        location: '',
        cross_street: '',
        landmark: '',
        description: '',
        priority: initialPriority || 'medium',
        agency: 'BPS',
        zone: '',
        caller_name: '',
        caller_phone: '',
        hazards: ''
    });

    React.useEffect(() => {
        const fetchUnions = async () => {
            try {
                const unions = await base44.entities.UnitUnion.filter({ status: 'active' });
                setActiveUnions(new Set(unions.map(u => u.union_name)));
            } catch (error) {
                console.error('Error fetching unions:', error);
            }
        };
        fetchUnions();
    }, []);

    const handleCreate = async () => {
        if (!formData.incident || !formData.location) {
            toast.error('Incident type and location are required');
            return;
        }

        setCreating(true);
        try {
            // Geocode address
            const geoResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.location + ', Virginia, USA')}&limit=1`,
                { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
            );
            const geoData = await geoResponse.json();
            
            let latitude = null, longitude = null;
            if (geoData && geoData.length > 0) {
                latitude = parseFloat(geoData[0].lat);
                longitude = parseFloat(geoData[0].lon);
            }

            // Generate CAD number in format: YYYY-NNNNNN (e.g., 2025-000123)
            const now = new Date();
            const year = now.getFullYear();
            const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / 86400000);
            const sequenceNumber = Math.floor(now.getTime() / 1000) % 1000000;
            const cadNumber = `${year}-${String(dayOfYear).padStart(3, '0')}${String(sequenceNumber).padStart(3, '0')}`;
            
            const callData = {
                ...formData,
                call_id: cadNumber,
                latitude,
                longitude,
                assigned_units: selectedUnits,
                status: selectedUnits.length > 0 ? 'Dispatched' : 'Pending',
                time_received: new Date().toISOString(),
                time_dispatched: selectedUnits.length > 0 ? new Date().toISOString() : null,
                source: 'dispatch'
            };

            const createdCall = await base44.entities.DispatchCall.create(callData);

            // Create assignment records
            for (const unitId of selectedUnits) {
                await base44.entities.CallAssignment.create({
                    call_id: createdCall.id,
                    unit_id: unitId,
                    role: selectedUnits.indexOf(unitId) === 0 ? 'primary' : 'backup',
                    assigned_at: new Date().toISOString(),
                    status: 'pending'
                });
            }

            // Create audit log
            await base44.entities.AuditLog.create({
                entity_type: 'DispatchCall',
                entity_id: createdCall.id,
                action: 'create',
                actor_id: currentUser.id,
                actor_name: currentUser.rank && currentUser.last_name ? `${currentUser.rank} ${currentUser.last_name}` : currentUser.full_name,
                after_value: JSON.stringify(callData),
                timestamp: new Date().toISOString()
            });

            onCreated();
        } catch (error) {
            console.error('Error creating call:', error);
            toast.error('Failed to create call');
        } finally {
            setCreating(false);
        }
    };

    const toggleUnit = (unitId) => {
        setSelectedUnits(prev =>
            prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-4xl"
            >
                <Card className="bg-slate-900 border-slate-700">
                    <div className="p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                                Create New Call
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Left Column */}
                            <ScrollArea className="h-[600px] pr-4">
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-slate-300">Call Type *</Label>
                                        <Input
                                            value={formData.incident}
                                            onChange={(e) => setFormData({...formData, incident: e.target.value})}
                                            placeholder="Traffic Accident, Burglary, Medical Emergency..."
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Location *</Label>
                                        <Input
                                            value={formData.location}
                                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                                            placeholder="123 Main St, Richmond VA"
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Cross Street</Label>
                                            <Input
                                                value={formData.cross_street}
                                                onChange={(e) => setFormData({...formData, cross_street: e.target.value})}
                                                placeholder="Near..."
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Landmark</Label>
                                            <Input
                                                value={formData.landmark}
                                                onChange={(e) => setFormData({...formData, landmark: e.target.value})}
                                                placeholder="Building, park..."
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Description</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                                            placeholder="Detailed call information..."
                                            rows={4}
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Priority</Label>
                                            <select
                                                value={formData.priority}
                                                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                                                className="flex h-10 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-2 text-sm"
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
                                                value={formData.agency}
                                                onChange={(e) => setFormData({...formData, agency: e.target.value})}
                                                className="flex h-10 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-2 text-sm"
                                            >
                                                <option value="BPS">BPS - Black Point Security</option>
                                                <option value="RPD">RPD - Richmond Police</option>
                                                <option value="HPD">HPD - Henrico Police</option>
                                                <option value="CCPD">CCPD - Chesterfield Police</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Zone/Beat</Label>
                                            <Input
                                                value={formData.zone}
                                                onChange={(e) => setFormData({...formData, zone: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Caller Name</Label>
                                            <Input
                                                value={formData.caller_name}
                                                onChange={(e) => setFormData({...formData, caller_name: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Caller Phone</Label>
                                            <Input
                                                value={formData.caller_phone}
                                                onChange={(e) => setFormData({...formData, caller_phone: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Hazards / Warnings</Label>
                                        <Textarea
                                            value={formData.hazards}
                                            onChange={(e) => setFormData({...formData, hazards: e.target.value})}
                                            placeholder="Known hazards, weapons, aggressive animals..."
                                            rows={2}
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>
                                </div>
                            </ScrollArea>

                            {/* Right Column - Unit Selection */}
                            <div>
                                <Label className="text-slate-300 mb-3 block">
                                    Assign Units ({selectedUnits.length} selected)
                                </Label>
                                <ScrollArea className="h-[600px] border border-slate-700 rounded-lg p-3 bg-slate-800/50">
                                    {units.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-8">No units available</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {(() => {
                                                // Group units by union and hide OOS solo units
                                                const grouped = [];
                                                const processedUnitIds = new Set();
                                                const processedUnionIds = new Set();
                                                
                                                units.forEach(unit => {
                                                    if (unit.union_id && activeUnions.has(unit.union_id) && !processedUnionIds.has(unit.union_id)) {
                                                        processedUnionIds.add(unit.union_id);
                                                        const unionMembers = units
                                                            .filter(u => u.union_id === unit.union_id && u.status !== 'Out of Service')
                                                            .sort((a, b) => {
                                                                const aNum = parseInt(a.unit_number) || 999;
                                                                const bNum = parseInt(b.unit_number) || 999;
                                                                return aNum - bNum;
                                                            });
                                                        
                                                        // Only add union if it has available members
                                                        if (unionMembers.length > 0) {
                                                            unionMembers.forEach(m => processedUnitIds.add(m.id));
                                                            grouped.push({
                                                                isUnion: true,
                                                                id: unit.union_id,
                                                                name: unit.union_id,
                                                                members: unionMembers,
                                                                status: unionMembers[0]?.status || 'Available'
                                                            });
                                                        }
                                                    } else if ((!unit.union_id || !activeUnions.has(unit.union_id)) && !processedUnitIds.has(unit.id) && unit.status !== 'Out of Service') {
                                                        processedUnitIds.add(unit.id);
                                                        grouped.push(unit);
                                                    }
                                                });
                                                
                                                return grouped.map(item => {
                                                    if (item.isUnion) {
                                                        const leadUnit = item.members[0];
                                                        const isSelected = selectedUnits.includes(leadUnit.id);
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                onClick={() => toggleUnit(leadUnit.id)}
                                                                className={`p-3 rounded-lg cursor-pointer transition-all ${
                                                                    isSelected ? 'bg-red-600 text-white' : 'bg-indigo-900/50 hover:bg-indigo-800/50 text-slate-300 border-2 border-indigo-600'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="font-semibold">{item.name}</span>
                                                                    <Badge variant="outline" className={isSelected ? 'border-white text-white' : 'border-indigo-400 text-indigo-300'}>
                                                                        {item.status}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-sm space-y-1 ml-2 mt-2">
                                                                    {item.members.map((member, idx) => (
                                                                        <div key={member.id} className="flex items-start gap-2">
                                                                            <span className={isSelected ? 'text-white/70' : 'text-slate-500'}>•</span>
                                                                            <div>
                                                                                <span className={idx === 0 ? 'font-semibold' : ''}>
                                                                                    {member.unit_number || 'N/A'}
                                                                                </span>
                                                                                <span className={isSelected ? 'text-white/80 ml-2' : 'text-slate-400 ml-2'}>
                                                                                    {member.rank && member.last_name ? `${member.rank} ${member.last_name}` : member.full_name}
                                                                                </span>
                                                                                {idx === 0 && <span className="text-yellow-400 ml-2">(Lead)</span>}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {selectedUnits.indexOf(leadUnit.id) === 0 && (
                                                                    <Badge className="mt-2 bg-yellow-600 text-white text-xs">Primary</Badge>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                    
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => toggleUnit(item.id)}
                                                            className={`p-3 rounded-lg cursor-pointer transition-all ${
                                                                selectedUnits.includes(item.id) ? 'bg-red-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-semibold">{item.unit_number || 'Unit N/A'}</span>
                                                                <Badge variant="outline" className={selectedUnits.includes(item.id) ? 'border-white text-white' : 'border-slate-600 text-slate-400'}>
                                                                    {item.status || 'Available'}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs opacity-80">
                                                                {item.rank && item.last_name ? `${item.rank} ${item.last_name}` : item.full_name}
                                                            </p>
                                                            {selectedUnits.indexOf(item.id) === 0 && (
                                                                <Badge className="mt-2 bg-yellow-600 text-white text-xs">Primary</Badge>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-slate-700">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                className="border-slate-600 text-white"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={creating}
                                className="bg-red-600 hover:bg-red-700 px-8"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                {creating ? 'Creating...' : 'Create & Dispatch'}
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </motion.div>
    );
}