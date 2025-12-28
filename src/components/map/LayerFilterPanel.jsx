import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Filter, Layers, Search } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export default function LayerFilterPanel({ isOpen, onClose, filters, onFilterChange }) {
    const [searchAddress, setSearchAddress] = useState('');

    const richmondBeats = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const henricoDistricts = ['Brookland', 'Fairfield', 'Three Chopt', 'Tuckahoe', 'Varina'];
    const baseMapTypes = [
        { value: 'street', label: 'Street Map' },
        { value: 'satellite', label: 'Satellite' },
        { value: 'topo', label: 'Topographic' },
    ];

    const handleAddressSearch = () => {
        if (searchAddress.trim()) {
            onFilterChange({ ...filters, searchAddress: searchAddress.trim() });
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1100] pointer-events-auto"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, x: 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[1101] overflow-y-auto pointer-events-auto"
                    >
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                        <Layers className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Map Controls</h2>
                                        <p className="text-sm text-gray-500">Filter layers & search</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onClose}
                                    className="rounded-full"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Address Search */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                                <Label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <Search className="w-4 h-4" />
                                    Search Address or Place
                                </Label>
                                <div className="flex gap-2 mt-2">
                                    <Input
                                        placeholder="Enter address..."
                                        value={searchAddress}
                                        onChange={(e) => setSearchAddress(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
                                        className="flex-1"
                                    />
                                    <Button onClick={handleAddressSearch} size="sm">
                                        Search
                                    </Button>
                                </div>
                            </div>

                            {/* Base Map Type */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                                <Label className="text-sm font-semibold text-gray-700 mb-2">Base Map</Label>
                                <Select
                                    value={filters.baseMapType}
                                    onValueChange={(value) => onFilterChange({ ...filters, baseMapType: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select map type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {baseMapTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Richmond Beats Filter */}
                            <div className="mb-6 p-4 bg-blue-50 rounded-xl">
                                <Label className="text-sm font-semibold text-blue-700 mb-3">Richmond Police Beats</Label>
                                <div className="space-y-2">
                                    <Button
                                        variant={filters.richmondBeat === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => onFilterChange({ ...filters, richmondBeat: 'all' })}
                                        className="w-full"
                                    >
                                        Show All Beats
                                    </Button>
                                    <div className="grid grid-cols-4 gap-2">
                                        {richmondBeats.map((beat) => (
                                            <Button
                                                key={beat}
                                                variant={filters.richmondBeat === beat ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => onFilterChange({ ...filters, richmondBeat: beat })}
                                            >
                                                {beat}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Henrico Districts Filter */}
                            <div className="mb-6 p-4 bg-purple-50 rounded-xl">
                                <Label className="text-sm font-semibold text-purple-700 mb-3">Henrico Districts</Label>
                                <div className="space-y-2">
                                    <Button
                                        variant={filters.henricoDistrict === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => onFilterChange({ ...filters, henricoDistrict: 'all' })}
                                        className="w-full"
                                    >
                                        Show All Districts
                                    </Button>
                                    <div className="space-y-2">
                                        {henricoDistricts.map((district) => (
                                            <Button
                                                key={district}
                                                variant={filters.henricoDistrict === district ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => onFilterChange({ ...filters, henricoDistrict: district })}
                                                className="w-full text-left justify-start"
                                            >
                                                {district}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Chesterfield County */}
                            <div className="mb-6 p-4 bg-green-50 rounded-xl">
                                <Label className="text-sm font-semibold text-green-700 mb-3">Chesterfield County</Label>
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm text-gray-700">Show County Boundary</Label>
                                    <Switch
                                        checked={filters.showChesterfield}
                                        onCheckedChange={(checked) => onFilterChange({ ...filters, showChesterfield: checked })}
                                    />
                                </div>
                            </div>

                            {/* Reset Filters */}
                            <Button
                                variant="outline"
                                onClick={() => onFilterChange({
                                    richmondBeat: 'all',
                                    henricoDistrict: 'all',
                                    showChesterfield: true,
                                    baseMapType: 'street',
                                    searchAddress: ''
                                })}
                                className="w-full"
                            >
                                Reset All Filters
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}