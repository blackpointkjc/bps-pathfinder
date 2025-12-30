import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Users, UserPlus, UserMinus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function UnitGroupingPanel({ isOpen, onClose, currentUser }) {
    const [unions, setUnions] = useState([]);
    const [availableUnits, setAvailableUnits] = useState([]);
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [unionName, setUnionName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchUnions();
            fetchAvailableUnits();
        }
    }, [isOpen]);

    const fetchUnions = async () => {
        try {
            const data = await base44.entities.UnitUnion.list('-created_date', 50);
            setUnions(data.filter(u => u.status === 'active'));
        } catch (error) {
            console.error('Error fetching unions:', error);
        }
    };

    const fetchAvailableUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];
            setAvailableUnits(users.filter(u => u.id !== currentUser?.id));
        } catch (error) {
            console.error('Error fetching units:', error);
        }
    };

    const createUnion = async () => {
        if (selectedUnits.length === 0) {
            toast.error('Select at least one unit to group');
            return;
        }

        setLoading(true);
        try {
            const unionNumber = unions.length + 1;
            const unionId = `union-${String(unionNumber).padStart(2, '0')}`;

            await base44.entities.UnitUnion.create({
                union_name: unionId,
                lead_unit_id: currentUser.id,
                member_unit_ids: [currentUser.id, ...selectedUnits],
                status: 'active',
                formed_date: new Date().toISOString()
            });

            // Update all units with union name
            const newUnitNumber = `${currentUser.unit_number || currentUser.full_name} ${unionId}`;
            await base44.auth.updateMe({
                unit_number: newUnitNumber,
                union_id: unionId
            });

            for (const unitId of selectedUnits) {
                const unit = availableUnits.find(u => u.id === unitId);
                if (unit) {
                    await base44.functions.invoke('updateUser', {
                        user_id: unitId,
                        data: {
                            unit_number: `${unit.unit_number || unit.full_name} ${unionId}`,
                            union_id: unionId
                        }
                    });
                }
            }

            toast.success(`Created ${unionId} with ${selectedUnits.length + 1} units`);
            setSelectedUnits([]);
            fetchUnions();
            fetchAvailableUnits();
        } catch (error) {
            console.error('Error creating union:', error);
            toast.error('Failed to create union');
        } finally {
            setLoading(false);
        }
    };

    const leaveUnion = async (union) => {
        setLoading(true);
        try {
            // Remove union from user
            await base44.auth.updateMe({
                unit_number: currentUser.unit_number?.split(' union-')[0] || currentUser.full_name,
                union_id: null
            });

            // Update union
            const updatedMembers = union.member_unit_ids.filter(id => id !== currentUser.id);
            
            if (updatedMembers.length <= 1) {
                // Disband if only 1 or fewer members
                await base44.entities.UnitUnion.update(union.id, {
                    status: 'disbanded',
                    disbanded_date: new Date().toISOString()
                });
                toast.success('Union disbanded');
            } else {
                await base44.entities.UnitUnion.update(union.id, {
                    member_unit_ids: updatedMembers
                });
                toast.success('Left union');
            }

            fetchUnions();
            fetchAvailableUnits();
        } catch (error) {
            console.error('Error leaving union:', error);
            toast.error('Failed to leave union');
        } finally {
            setLoading(false);
        }
    };

    const currentUnion = unions.find(u => u.member_unit_ids?.includes(currentUser?.id));

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl"
                >
                    <Card className="bg-white">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Unit Grouping</h2>
                                        <p className="text-sm text-gray-500">Form tactical units</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                }}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Current Union */}
                            {currentUnion && (
                                <Card className="p-4 mb-6 bg-indigo-50 border-indigo-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Shield className="w-5 h-5 text-indigo-600" />
                                                <h3 className="font-bold text-gray-900">{currentUnion.union_name}</h3>
                                                <Badge className="bg-indigo-600 text-white">Active</Badge>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                {currentUnion.member_unit_ids?.length || 0} units in this group
                                            </p>
                                        </div>
                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                leaveUnion(currentUnion);
                                            }}
                                            disabled={loading}
                                            variant="outline"
                                            className="border-red-300 text-red-600 hover:bg-red-50"
                                        >
                                            <UserMinus className="w-4 h-4 mr-2" />
                                            Leave
                                        </Button>
                                    </div>
                                </Card>
                            )}

                            {!currentUnion && (
                                <>
                                    {/* Create New Union */}
                                    <Card className="p-4 mb-6">
                                        <h3 className="font-semibold text-gray-900 mb-3">Create New Unit Group</h3>
                                        
                                        <ScrollArea className="h-48 mb-4">
                                            <div className="space-y-2 pr-4">
                                                {availableUnits
                                                    .filter(u => !u.union_id)
                                                    .map((unit) => (
                                                        <div
                                                            key={unit.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (selectedUnits.includes(unit.id)) {
                                                                    setSelectedUnits(selectedUnits.filter(id => id !== unit.id));
                                                                } else {
                                                                    setSelectedUnits([...selectedUnits, unit.id]);
                                                                }
                                                            }}
                                                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                                selectedUnits.includes(unit.id)
                                                                    ? 'border-indigo-500 bg-indigo-50'
                                                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="font-semibold text-gray-900">
                                                                        {unit.unit_number || unit.full_name}
                                                                    </p>
                                                                    <p className="text-xs text-gray-600">{unit.status}</p>
                                                                </div>
                                                                {selectedUnits.includes(unit.id) && (
                                                                    <Shield className="w-5 h-5 text-indigo-600" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </ScrollArea>

                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                createUnion();
                                            }}
                                            disabled={loading || selectedUnits.length === 0}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            <UserPlus className="w-4 h-4 mr-2" />
                                            Create Union ({selectedUnits.length + 1} units)
                                        </Button>
                                    </Card>
                                </>
                            )}

                            {/* All Active Unions */}
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-3">All Active Unions</h3>
                                <ScrollArea className="h-64">
                                    {unions.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500">
                                            <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                            <p>No active unions</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {unions.map((union) => (
                                                <Card key={union.id} className="p-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Shield className="w-4 h-4 text-indigo-600" />
                                                                <span className="font-semibold text-gray-900">
                                                                    {union.union_name}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-600">
                                                                {union.member_unit_ids?.length || 0} units
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline" className="bg-green-50 text-green-700">
                                                            Active
                                                        </Badge>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}