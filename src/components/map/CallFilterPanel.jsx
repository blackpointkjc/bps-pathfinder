import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function CallFilterPanel({ isOpen, onClose, filters, onFilterChange }) {
    const [localFilters, setLocalFilters] = useState(filters);

    const handleToggle = (agency) => {
        const newFilters = {
            ...localFilters,
            [agency]: !localFilters[agency]
        };
        setLocalFilters(newFilters);
        onFilterChange(newFilters);
    };

    if (!isOpen) return null;

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
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] w-96 max-w-[90vw]"
                    >
                        <Card className="bg-white shadow-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-blue-600" />
                                    <h3 className="text-lg font-bold text-gray-900">Filter Active Calls</h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => handleToggle('showRPD')}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${localFilters.showRPD ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                            {localFilters.showRPD && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">Richmond PD</div>
                                            <div className="text-xs text-gray-500">RPD</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => handleToggle('showHPD')}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${localFilters.showHPD ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
                                            {localFilters.showHPD && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">Henrico PD</div>
                                            <div className="text-xs text-gray-500">HPD / HCPD</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => handleToggle('showCCPD')}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${localFilters.showCCPD ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}>
                                            {localFilters.showCCPD && (
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">Chesterfield PD</div>
                                            <div className="text-xs text-gray-500">CCPD</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <Button
                                    onClick={onClose}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    Done
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}