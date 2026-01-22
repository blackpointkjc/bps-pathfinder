import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, MapPin, Clock, Activity, Search, Shield } from 'lucide-react';
import { createPageUrl } from '../utils';
import NavigationMenu from '@/components/NavigationMenu';

export default function Units() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
        const interval = setInterval(() => loadUnits(), 3000);
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            await loadUnits();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            setUnits(response.data?.users || []);
        } catch (error) {
            console.error('Error loading units:', error);
        }
    };

    const getStatusColor = (status) => {
        const statusMap = {
            'Available': 'bg-green-500',
            'Enroute': 'bg-yellow-500',
            'On Scene': 'bg-blue-500',
            'On Patrol': 'bg-indigo-500',
            'Busy': 'bg-orange-500',
            'Out of Service': 'bg-gray-500'
        };
        return statusMap[status] || 'bg-gray-500';
    };

    const filteredUnits = units.filter(unit => {
        const matchesStatus = filterStatus === 'all' || unit.status === filterStatus;
        const matchesSearch = !searchQuery || 
            unit.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            unit.unit_number?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <NavigationMenu currentUser={currentUser} />
                            <Users className="w-6 h-6 text-green-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">UNIT MANAGEMENT</h1>
                            <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 font-mono">
                                {filteredUnits.length} UNITS
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-12 gap-6">
                    {/* Left: Units List */}
                    <div className="col-span-4">
                        <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)]">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Search units..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 bg-slate-900 border-slate-700 text-white font-mono text-sm"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Button
                                            size="sm"
                                            onClick={() => window.location.href = createPageUrl('CADHome')}
                                            className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                        >
                                            HOME
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => window.location.href = createPageUrl('ActiveCalls')}
                                            className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                        >
                                            CALLS
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => window.location.href = createPageUrl('Reports')}
                                            className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                        >
                                            REPORTS
                                        </Button>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {['all', 'Available', 'Enroute', 'On Scene', 'Busy'].map(status => (
                                            <Button
                                                key={status}
                                                size="sm"
                                                variant={filterStatus === status ? 'default' : 'outline'}
                                                onClick={() => setFilterStatus(status)}
                                                className={filterStatus === status ? 
                                                    'bg-blue-600 hover:bg-blue-700 font-mono text-xs' : 
                                                    'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                                }
                                            >
                                                {status === 'all' ? 'ALL' : status.toUpperCase()}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <ScrollArea className="h-[calc(100%-140px)]">
                                <div className="p-4 space-y-2">
                                    {filteredUnits.map((unit) => (
                                        <div
                                            key={unit.id}
                                            onClick={() => setSelectedUnit(unit)}
                                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                                                selectedUnit?.id === unit.id ? 
                                                'bg-blue-500/20 border-blue-500' : 
                                                'border-slate-700 hover:border-blue-400'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-3 h-3 rounded-full ${getStatusColor(unit.status)}`} />
                                                <span className="text-white font-mono font-bold text-sm">
                                                    {unit.unit_number ? `UNIT-${unit.unit_number}` : unit.full_name}
                                                </span>
                                            </div>
                                            <p className="text-slate-400 text-xs font-mono mb-2">
                                                {unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <Badge className={`${
                                                    unit.status === 'Available' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                                    unit.status === 'Enroute' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                                    unit.status === 'On Scene' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                                    'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                                } border font-mono text-xs`}>
                                                    {unit.status || 'UNKNOWN'}
                                                </Badge>
                                                {unit.current_call_info && (
                                                    <Activity className="w-4 h-4 text-red-400" />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </Card>
                    </div>

                    {/* Right: Unit Detail */}
                    <div className="col-span-8">
                        {!selectedUnit ? (
                            <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)] flex items-center justify-center">
                                <div className="text-center text-slate-500 font-mono">
                                    <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>SELECT A UNIT TO VIEW DETAILS</p>
                                </div>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {/* Unit Information */}
                                <Card className="bg-slate-900 border-slate-800">
                                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-bold text-white font-mono">UNIT INFORMATION</h2>
                                            <div className={`w-3 h-3 rounded-full ${getStatusColor(selectedUnit.status)}`} />
                                        </div>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">UNIT NUMBER</p>
                                            <p className="text-white font-semibold font-mono">
                                                {selectedUnit.unit_number ? `UNIT-${selectedUnit.unit_number}` : 'N/A'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">STATUS</p>
                                            <Badge className={`${
                                                selectedUnit.status === 'Available' ? 'bg-green-500' :
                                                selectedUnit.status === 'Enroute' ? 'bg-yellow-500' :
                                                selectedUnit.status === 'On Scene' ? 'bg-blue-500' :
                                                'bg-orange-500'
                                            } font-mono`}>
                                                {selectedUnit.status || 'UNKNOWN'}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">OFFICER</p>
                                            <p className="text-white font-mono text-sm">
                                                {selectedUnit.rank && selectedUnit.last_name ? 
                                                    `${selectedUnit.rank} ${selectedUnit.last_name}` : 
                                                    selectedUnit.full_name}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 font-mono mb-1">ROLE</p>
                                            <Badge className="bg-slate-700 text-slate-300 font-mono text-xs">
                                                {selectedUnit.role?.toUpperCase() || 'USER'}
                                            </Badge>
                                        </div>
                                        {selectedUnit.current_call_info && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-slate-400 font-mono mb-1">CURRENT ASSIGNMENT</p>
                                                <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                                                    <p className="text-white font-mono text-sm">{selectedUnit.current_call_info}</p>
                                                </div>
                                            </div>
                                        )}
                                        {selectedUnit.latitude && selectedUnit.longitude && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-slate-400 font-mono mb-1">LAST KNOWN LOCATION</p>
                                                <p className="text-white font-mono text-sm flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-blue-400" />
                                                    {selectedUnit.latitude.toFixed(6)}, {selectedUnit.longitude.toFixed(6)}
                                                </p>
                                            </div>
                                        )}
                                        {selectedUnit.last_updated && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-slate-400 font-mono mb-1">LAST UPDATE</p>
                                                <p className="text-white font-mono text-sm flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-blue-400" />
                                                    {new Date(selectedUnit.last_updated).toLocaleString()}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {/* Unit Actions */}
                                <Card className="bg-slate-900 border-slate-800">
                                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                        <h2 className="text-lg font-bold text-white font-mono">UNIT ACTIONS</h2>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => toast.info('Feature coming soon')}
                                                className="bg-blue-600 hover:bg-blue-700 font-mono"
                                            >
                                                VIEW ON MAP
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => toast.info('Feature coming soon')}
                                                className="bg-purple-600 hover:bg-purple-700 font-mono"
                                            >
                                                MESSAGE UNIT
                                            </Button>
                                            {currentUser?.role === 'admin' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => window.location.href = createPageUrl('AdminPortal')}
                                                    className="bg-red-600 hover:bg-red-700 font-mono"
                                                >
                                                    <Shield className="w-4 h-4 mr-2" />
                                                    EDIT UNIT
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}