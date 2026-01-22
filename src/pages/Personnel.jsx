import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Shield, Mail, User, Search, Edit2, MapPin, Clock } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Personnel() {
    const [currentUser, setCurrentUser] = useState(null);
    const [personnel, setPersonnel] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        init();
        const interval = setInterval(() => loadPersonnel(), 10000);
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            await loadPersonnel();
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPersonnel = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            setPersonnel(response.data?.users || []);
        } catch (error) {
            console.error('Error loading personnel:', error);
        }
    };

    const filteredPersonnel = personnel.filter(person => {
        const matchesRole = filterRole === 'all' || 
            (filterRole === 'officer' && person.role !== 'admin') ||
            (filterRole === 'admin' && person.role === 'admin') ||
            (filterRole === 'dispatch' && person.dispatch_role);
        const matchesSearch = !searchQuery || 
            person.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.unit_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesRole && matchesSearch;
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
                            <Button
                                variant="ghost"
                                onClick={() => window.location.href = createPageUrl('CADHome')}
                                className="text-slate-400 hover:text-white"
                            >
                                ← BACK
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <Users className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">PERSONNEL ROSTER</h1>
                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                {filteredPersonnel.length} PERSONNEL
                            </Badge>
                        </div>
                        {currentUser?.role === 'admin' && (
                            <Button
                                onClick={() => window.location.href = createPageUrl('AdminPortal')}
                                className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                            >
                                <Edit2 className="w-4 h-4 mr-2" />
                                MANAGE PERSONNEL
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <div className="grid grid-cols-12 gap-6">
                    {/* Left: Personnel List */}
                    <div className="col-span-4">
                        <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)]">
                            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Search personnel..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 bg-slate-900 border-slate-700 text-white font-mono text-sm"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        {['all', 'officer', 'admin', 'dispatch'].map(role => (
                                            <Button
                                                key={role}
                                                size="sm"
                                                variant={filterRole === role ? 'default' : 'outline'}
                                                onClick={() => setFilterRole(role)}
                                                className={filterRole === role ? 
                                                    'bg-blue-600 hover:bg-blue-700 font-mono text-xs' : 
                                                    'border-slate-700 text-slate-400 hover:text-white font-mono text-xs'
                                                }
                                            >
                                                {role.toUpperCase()}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <ScrollArea className="h-[calc(100%-140px)]">
                                <div className="p-4 space-y-2">
                                    {filteredPersonnel.map((person) => (
                                        <div
                                            key={person.id}
                                            onClick={() => setSelectedPerson(person)}
                                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                                                selectedPerson?.id === person.id ? 
                                                'bg-blue-500/20 border-blue-500' : 
                                                'border-slate-700 hover:border-blue-400'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-white font-mono font-bold text-sm">
                                                        {person.rank && person.last_name ? 
                                                            `${person.rank} ${person.last_name}` : 
                                                            person.full_name}
                                                    </p>
                                                    {person.unit_number && (
                                                        <p className="text-slate-400 text-xs font-mono">UNIT-{person.unit_number}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className={person.role === 'admin' ? 
                                                    'bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono text-xs' : 
                                                    'bg-slate-700 text-slate-300 font-mono text-xs'
                                                }>
                                                    {person.role?.toUpperCase()}
                                                </Badge>
                                                {person.dispatch_role && (
                                                    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                                                        DISPATCH
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </Card>
                    </div>

                    {/* Right: Person Detail */}
                    <div className="col-span-8">
                        {!selectedPerson ? (
                            <Card className="bg-slate-900 border-slate-800 h-[calc(100vh-180px)] flex items-center justify-center">
                                <div className="text-center text-slate-500 font-mono">
                                    <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>SELECT PERSONNEL TO VIEW DETAILS</p>
                                </div>
                            </Card>
                        ) : (
                            <Card className="bg-slate-900 border-slate-800">
                                <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-bold text-white font-mono">PERSONNEL RECORD</h2>
                                        {currentUser?.role === 'admin' && (
                                            <Button
                                                size="sm"
                                                onClick={() => window.location.href = createPageUrl('AdminPortal')}
                                                className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                            >
                                                <Edit2 className="w-3 h-3 mr-2" />
                                                EDIT
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">BADGE/ID</p>
                                        <p className="text-white font-mono font-bold">{selectedPerson.id?.slice(-8).toUpperCase()}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">RANK</p>
                                        <p className="text-white font-semibold">{selectedPerson.rank || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">FULL NAME</p>
                                        <p className="text-white font-semibold">{selectedPerson.full_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">UNIT NUMBER</p>
                                        <p className="text-white font-mono font-bold">
                                            {selectedPerson.unit_number ? `UNIT-${selectedPerson.unit_number}` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-xs text-slate-400 font-mono mb-1">EMAIL</p>
                                        <p className="text-white font-mono text-sm flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-blue-400" />
                                            {selectedPerson.email}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">ROLE</p>
                                        <Badge className={selectedPerson.role === 'admin' ? 
                                            'bg-purple-500 font-mono' : 
                                            'bg-slate-700 text-slate-300 font-mono'
                                        }>
                                            {selectedPerson.role?.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 font-mono mb-1">CURRENT STATUS</p>
                                        <Badge className={`${
                                            selectedPerson.status === 'Available' ? 'bg-green-500' :
                                            selectedPerson.status === 'Enroute' ? 'bg-yellow-500' :
                                            selectedPerson.status === 'On Scene' ? 'bg-blue-500' :
                                            'bg-orange-500'
                                        } font-mono`}>
                                            {selectedPerson.status || 'UNKNOWN'}
                                        </Badge>
                                    </div>
                                    {selectedPerson.dispatch_role && (
                                        <div className="col-span-2">
                                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                                DISPATCH CERTIFIED
                                            </Badge>
                                        </div>
                                    )}
                                    {selectedPerson.is_supervisor && (
                                        <div className="col-span-2">
                                            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-mono">
                                                SUPERVISOR
                                            </Badge>
                                        </div>
                                    )}
                                    {selectedPerson.current_call_info && (
                                        <div className="col-span-2">
                                            <p className="text-xs text-slate-400 font-mono mb-1">CURRENT ASSIGNMENT</p>
                                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                                                <p className="text-white font-mono text-sm">{selectedPerson.current_call_info}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}