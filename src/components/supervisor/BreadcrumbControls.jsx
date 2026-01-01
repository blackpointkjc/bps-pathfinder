import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';

export default function BreadcrumbControls({ onSelectUnit, selectedUnitId, onClose }) {
    const [units, setUnits] = useState([]);

    useEffect(() => {
        loadUnits();
    }, []);

    const loadUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            setUnits(response.data?.users || []);
        } catch (error) {
            console.error('Error loading units:', error);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-24 left-1/2 -translate-x-1/2 z-[1002] w-96 max-w-[calc(100vw-32px)] pointer-events-auto"
            >
                <Card className="bg-white/95 backdrop-blur-xl p-4 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-purple-600" />
                            <h3 className="font-bold text-gray-900">Unit Breadcrumb Trail</h3>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <Select 
                        value={selectedUnitId || ''} 
                        onValueChange={onSelectUnit}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select unit to view trail" />
                        </SelectTrigger>
                        <SelectContent>
                            {units.map(unit => (
                                <SelectItem key={unit.id} value={unit.id}>
                                    {unit.unit_number || unit.full_name} - {unit.status}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {selectedUnitId && (
                        <div className="mt-3 text-xs text-gray-600">
                            <Badge className="bg-purple-100 text-purple-700">
                                Showing last 24 hours
                            </Badge>
                        </div>
                    )}
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}