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
    const [isSearching, setIsSearching] = useState(false);

    const richmondBeats = {
        '1st Precinct': ['111', '112', '113'],
        '2nd Precinct': ['211', '212', '213'],
        '3rd Precinct': ['311', '312', '313'],
        '4th Precinct': ['411', '412', '413']
    };
    const henricoDistricts = ['Brookland', 'Fairfield', 'Three Chopt', 'Tuckahoe', 'Varina'];
    const chesterfieldDistricts = ['Bermuda', 'Clover Hill', 'Dale', 'Matoaca', 'Midlothian'];
    const hanoverDistricts = ['Ashland', 'Beaverdam', 'Cold Harbor', 'Henry', 'Mechanicsville', 'South Anna'];
    const staffordDistricts = ['Aquia', 'Falmouth', 'Garrisonville', 'George Washington', 'Hartwood', 'Rock Hill'];
    const spotsylvaniaDistricts = ['Berkeley', 'Chancellor', 'Lee Hill', 'Salem Church'];

    const princeWilliamDistricts = ['Brentsville', 'Coles', 'Dumfries', 'Gainesville', 'Neabsco', 'Occoquan', 'Potomac', 'Woodbridge'];
    const fairfaxDistricts = ['Braddock', 'Dranesville', 'Hunter Mill', 'Lee', 'Mason', 'Mount Vernon', 'Providence', 'Springfield', 'Sully'];
    const arlingtonBeats = ['Beat 100', 'Beat 200', 'Beat 300', 'Beat 400', 'Beat 500'];

    const dcPSAs = ['101', '102', '103', '104', '105', '106', '107', '201', '202', '203', '204', '205', '206', '207', '208', '301', '302', '303', '304', '305', '306', '307', '308', '309', '401', '402', '403', '404', '405', '406', '407', '501', '502', '503', '504', '505', '506', '507', '601', '602', '603', '604', '605', '606', '607', '701', '702', '703', '704', '705', '706', '707', '708'];
    const baseMapTypes = [
        { value: 'street', label: 'Street Map' },
        { value: 'satellite', label: 'Satellite' },
        { value: 'topo', label: 'Topographic' },
    ];

    const handleAddressSearch = async () => {
        if (!searchAddress.trim()) return;
        
        setIsSearching(true);
        try {
            onFilterChange({ ...filters, searchAddress: searchAddress.trim() });
            setSearchAddress(''); // Clear input after search
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
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
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, x: 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[10000] overflow-y-auto pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
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

                            {/* Toggles */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-700">Show Police Stations</Label>
                                    <Switch
                                        checked={filters.showPoliceStations ?? true}
                                        onCheckedChange={(checked) => onFilterChange({ ...filters, showPoliceStations: checked })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-700">Show Fire Stations</Label>
                                    <Switch
                                        checked={filters.showFireStations ?? false}
                                        onCheckedChange={(checked) => onFilterChange({ ...filters, showFireStations: checked })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-700">Show EMS/Rescue</Label>
                                    <Switch
                                        checked={filters.showEMS ?? false}
                                        onCheckedChange={(checked) => onFilterChange({ ...filters, showEMS: checked })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-700">Show Jails</Label>
                                    <Switch
                                        checked={filters.showJails ?? true}
                                        onCheckedChange={(checked) => onFilterChange({ ...filters, showJails: checked })}
                                    />
                                </div>
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
                                        className="flex-1 pointer-events-auto"
                                    />
                                    <Button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleAddressSearch();
                                        }} 
                                        size="sm"
                                        disabled={isSearching}
                                        className="pointer-events-auto"
                                    >
                                        {isSearching ? 'Searching...' : 'Search'}
                                    </Button>
                                </div>
                            </div>

                            {/* Base Map Type */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                                <Label className="text-sm font-semibold text-gray-700 mb-2">Base Map</Label>
                                <Select
                                    value={filters.baseMapType}
                                    onValueChange={(value) => {
                                        onFilterChange({ ...filters, baseMapType: value });
                                    }}
                                >
                                    <SelectTrigger className="pointer-events-auto">
                                        <SelectValue placeholder="Select map type" />
                                    </SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        {baseMapTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value} className="pointer-events-auto">
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Richmond Beats Filter */}
                            <div className="mb-6 p-4 bg-blue-50 rounded-xl">
                                <Label className="text-sm font-semibold text-blue-700 mb-3">Richmond Police Beats</Label>
                                <div className="space-y-3">
                                    <Button
                                        variant={filters.richmondBeat === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onFilterChange({ ...filters, richmondBeat: 'all' });
                                        }}
                                        className="w-full pointer-events-auto"
                                    >
                                        Show All Beats
                                    </Button>
                                    {Object.entries(richmondBeats).map(([precinct, beats]) => (
                                        <div key={precinct} className="space-y-2">
                                            <p className="text-xs font-semibold text-blue-600">{precinct}</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {beats.map((beat) => (
                                                    <Button
                                                        key={beat}
                                                        variant={filters.richmondBeat === beat ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            onFilterChange({ ...filters, richmondBeat: beat });
                                                        }}
                                                        className="pointer-events-auto"
                                                    >
                                                        {beat}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Henrico Districts Filter */}
                            <div className="mb-6 p-4 bg-purple-50 rounded-xl">
                                <Label className="text-sm font-semibold text-purple-700 mb-3">Henrico Districts</Label>
                                <div className="space-y-2">
                                    <Button
                                        variant={filters.henricoDistrict === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onFilterChange({ ...filters, henricoDistrict: 'all' });
                                        }}
                                        className="w-full pointer-events-auto"
                                    >
                                        Show All Districts
                                    </Button>
                                    <div className="space-y-2">
                                        {henricoDistricts.map((district) => (
                                            <Button
                                                key={district}
                                                variant={filters.henricoDistrict === district ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onFilterChange({ ...filters, henricoDistrict: district });
                                                }}
                                                className="w-full text-left justify-start pointer-events-auto"
                                            >
                                                {district}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Chesterfield Districts Filter */}
                            <div className="mb-6 p-4 bg-green-50 rounded-xl">
                                <Label className="text-sm font-semibold text-green-700 mb-3">Chesterfield Districts</Label>
                                <div className="space-y-2">
                                    <Button
                                        variant={filters.chesterfieldDistrict === 'all' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onFilterChange({ ...filters, chesterfieldDistrict: 'all' });
                                        }}
                                        className="w-full pointer-events-auto"
                                    >
                                        Show All Districts
                                    </Button>
                                    <div className="space-y-2">
                                        {chesterfieldDistricts.map((district) => (
                                            <Button
                                                key={district}
                                                variant={filters.chesterfieldDistrict === district ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onFilterChange({ ...filters, chesterfieldDistrict: district });
                                                }}
                                                className="w-full text-left justify-start pointer-events-auto"
                                            >
                                                {district}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Hanover Districts */}
                            <div className="mb-6 p-4 bg-red-50 rounded-xl">
                                <Label className="text-sm font-semibold text-red-700 mb-3">Hanover Districts</Label>
                                <Select value={filters.hanoverDistrict || 'all'} onValueChange={(value) => onFilterChange({ ...filters, hanoverDistrict: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Districts</SelectItem>
                                        {hanoverDistricts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Stafford Districts */}
                            <div className="mb-6 p-4 bg-yellow-50 rounded-xl">
                                <Label className="text-sm font-semibold text-yellow-700 mb-3">Stafford Districts</Label>
                                <Select value={filters.staffordDistrict || 'all'} onValueChange={(value) => onFilterChange({ ...filters, staffordDistrict: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Districts</SelectItem>
                                        {staffordDistricts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Spotsylvania Districts */}
                            <div className="mb-6 p-4 bg-orange-50 rounded-xl">
                                <Label className="text-sm font-semibold text-orange-700 mb-3">Spotsylvania Districts</Label>
                                <Select value={filters.spotsylvaniaDistrict || 'all'} onValueChange={(value) => onFilterChange({ ...filters, spotsylvaniaDistrict: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Districts</SelectItem>
                                        {spotsylvaniaDistricts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>



                            {/* Prince William Districts */}
                            <div className="mb-6 p-4 bg-indigo-50 rounded-xl">
                                <Label className="text-sm font-semibold text-indigo-700 mb-3">Prince William Districts</Label>
                                <Select value={filters.princeWilliamDistrict || 'all'} onValueChange={(value) => onFilterChange({ ...filters, princeWilliamDistrict: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Districts</SelectItem>
                                        {princeWilliamDistricts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Fairfax Districts */}
                            <div className="mb-6 p-4 bg-lime-50 rounded-xl">
                                <Label className="text-sm font-semibold text-lime-700 mb-3">Fairfax Districts</Label>
                                <Select value={filters.fairfaxDistrict || 'all'} onValueChange={(value) => onFilterChange({ ...filters, fairfaxDistrict: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Districts</SelectItem>
                                        {fairfaxDistricts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Arlington Beats */}
                            <div className="mb-6 p-4 bg-amber-50 rounded-xl">
                                <Label className="text-sm font-semibold text-amber-700 mb-3">Arlington Beats</Label>
                                <Select value={filters.arlingtonBeat || 'all'} onValueChange={(value) => onFilterChange({ ...filters, arlingtonBeat: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001]">
                                        <SelectItem value="all">All Beats</SelectItem>
                                        {arlingtonBeats.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>



                            {/* DC PSAs */}
                            <div className="mb-6 p-4 bg-red-100 rounded-xl">
                                <Label className="text-sm font-semibold text-red-800 mb-3">Washington DC PSAs</Label>
                                <Select value={filters.dcPSA || 'all'} onValueChange={(value) => onFilterChange({ ...filters, dcPSA: value })}>
                                    <SelectTrigger className="pointer-events-auto"><SelectValue /></SelectTrigger>
                                    <SelectContent className="pointer-events-auto z-[10001] max-h-60">
                                        <SelectItem value="all">All PSAs</SelectItem>
                                        {dcPSAs.map((d) => <SelectItem key={d} value={d}>PSA {d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>



                            {/* Reset Filters */}
                            <Button
                                variant="outline"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onFilterChange({
                                        richmondBeat: 'all',
                                        henricoDistrict: 'all',
                                        chesterfieldDistrict: 'all',
                                        hanoverDistrict: 'all',
                                        staffordDistrict: 'all',
                                        spotsylvaniaDistrict: 'all',
                                        carolineDistrict: 'all',
                                        princeWilliamDistrict: 'all',
                                        arlingtonBeat: 'all',
                                        fairfaxDistrict: 'all',
                                        loudounDistrict: 'all',
                                        dcPSA: 'all',
                                        baseMapType: 'street',
                                        searchAddress: ''
                                    });
                                }}
                                className="w-full pointer-events-auto"
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