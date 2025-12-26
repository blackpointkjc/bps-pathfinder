import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Car, Radio, CheckCircle, AlertCircle, Clock, XCircle } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const statusOptions = [
    { value: 'Available', icon: CheckCircle, color: 'bg-gray-100 text-gray-700', iconColor: 'text-gray-600' },
    { value: 'Enroute', icon: Radio, color: 'bg-red-100 text-red-700', iconColor: 'text-red-600' },
    { value: 'On Scene', icon: AlertCircle, color: 'bg-green-100 text-green-700', iconColor: 'text-green-600' },
    { value: 'Busy', icon: Clock, color: 'bg-orange-100 text-orange-700', iconColor: 'text-orange-600' },
    { value: 'Out of Service', icon: XCircle, color: 'bg-gray-100 text-gray-500', iconColor: 'text-gray-400' }
];

export default function UnitStatusPanel({ isOpen, onClose, currentStatus, unitName, onStatusChange, activeCall }) {
    const [selectedStatus, setSelectedStatus] = useState(currentStatus);

    const handleSave = () => {
        onStatusChange(selectedStatus);
        onClose();
    };

    const currentOption = statusOptions.find(opt => opt.value === currentStatus) || statusOptions[0];
    const StatusIcon = currentOption.icon;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[2000]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] w-full max-w-md p-4"
                    >
                        <Card className="p-6 bg-white shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-gray-900">Unit Status</h3>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                                    <Car className="w-5 h-5 text-blue-600" />
                                    <div>
                                        <p className="text-sm text-gray-600">Unit</p>
                                        <p className="font-bold text-blue-600">{unitName}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                    <StatusIcon className={`w-5 h-5 ${currentOption.iconColor}`} />
                                    <div>
                                        <p className="text-sm text-gray-600">Current Status</p>
                                        <Badge className={currentOption.color}>{currentStatus}</Badge>
                                    </div>
                                </div>

                                {activeCall && (
                                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                                        <Radio className="w-5 h-5 text-red-600 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-gray-600">Active Call</p>
                                            <p className="text-sm font-semibold text-gray-900">{activeCall}</p>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                                        Change Status
                                    </label>
                                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {statusOptions.map((option) => {
                                                const Icon = option.icon;
                                                return (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        <div className="flex items-center gap-2">
                                                            <Icon className={`w-4 h-4 ${option.iconColor}`} />
                                                            <span>{option.value}</span>
                                                        </div>
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button variant="outline" onClick={onClose} className="flex-1">
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700">
                                        Update Status
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}