import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Search, Edit2, MapPin, Save, X } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Personnel() {
    const [currentUser, setCurrentUser] = useState(null);
    const [personnel, setPersonnel] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [loading, setLoading] = useState(true);
    const [editDialog, setEditDialog] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [showTracking, setShowTracking] = useState(false);

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

    const handleEdit = (person) => {
        const nameParts = person.full_name?.split(' ') || ['', ''];
        setEditForm({
            id: person.id,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            unit_number: person.unit_number || '',
            rank: person.rank || '',
            status: person.status || 'Available'
        });
        setEditDialog(true);
    };

    const handleSave = async () => {
        try {
            await base44.functions.invoke('updateUser', {
                userId: editForm.id,
                updates: {
                    full_name: `${editForm.first_name} ${editForm.last_name}`.trim(),
                    unit_number: editForm.unit_number,
                    rank: editForm.rank,
                    status: editForm.status
                }
            });
            toast.success('Personnel updated');
            setEditDialog(false);
            loadPersonnel();
        } catch (error) {
            toast.error('Failed to update personnel');
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
                                className="text-slate-400 hover:text-white font-mono text-xs"
                            >
                                ← CAD HOME
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <Users className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">PERSONNEL ROSTER</h1>
                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                {filteredPersonnel.length} PERSONNEL
                            </Badge>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('ActiveCalls')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                CALLS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Units')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                UNITS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('Reports')}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                REPORTS
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => window.location.href = createPageUrl('AdminPortal') + '#tracking'}
                                className="bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                TRACKING
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
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
                    <ScrollArea className="h-[calc(100vh-240px)]">
                        <div className="p-4">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">NAME</th>
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">UNIT</th>
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">RANK</th>
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">STATUS</th>
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">ROLE</th>
                                        <th className="text-left p-3 text-xs font-mono text-slate-400">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPersonnel.map((person) => (
                                        <tr key={person.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="p-3 text-white font-mono text-sm">{person.full_name}</td>
                                            <td className="p-3 text-white font-mono text-sm">
                                                {person.unit_number ? `UNIT-${person.unit_number}` : '-'}
                                            </td>
                                            <td className="p-3 text-slate-300 text-sm">{person.rank || '-'}</td>
                                            <td className="p-3">
                                                <Badge className={`${
                                                    person.status === 'Available' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                                    person.status === 'Enroute' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                                    person.status === 'On Scene' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                                    'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                                } border font-mono text-xs`}>
                                                    {person.status || 'UNKNOWN'}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <Badge className={person.role === 'admin' ? 
                                                    'bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono text-xs' : 
                                                    'bg-slate-700 text-slate-300 font-mono text-xs'
                                                }>
                                                    {person.role?.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleEdit(person)}
                                                        className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                                    >
                                                        <Edit2 className="w-3 h-3 mr-1" />
                                                        EDIT
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => window.location.href = createPageUrl('AdminPortal') + '#tracking'}
                                                        className="bg-purple-600 hover:bg-purple-700 font-mono text-xs"
                                                    >
                                                        <MapPin className="w-3 h-3 mr-1" />
                                                        TRACK
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </ScrollArea>
                </Card>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editDialog} onOpenChange={setEditDialog}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="font-mono">EDIT PERSONNEL</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">FIRST NAME</label>
                                <Input
                                    value={editForm.first_name}
                                    onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">LAST NAME</label>
                                <Input
                                    value={editForm.last_name}
                                    onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-mono mb-2 block">UNIT NUMBER</label>
                            <Input
                                value={editForm.unit_number}
                                onChange={(e) => setEditForm({...editForm, unit_number: e.target.value})}
                                className="bg-slate-800 border-slate-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-mono mb-2 block">RANK</label>
                            <Input
                                value={editForm.rank}
                                onChange={(e) => setEditForm({...editForm, rank: e.target.value})}
                                className="bg-slate-800 border-slate-700 text-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-mono mb-2 block">STATUS</label>
                            <Input
                                value={editForm.status}
                                onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                className="bg-slate-800 border-slate-700 text-white font-mono"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSave}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 font-mono"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                SAVE
                            </Button>
                            <Button
                                onClick={() => setEditDialog(false)}
                                variant="outline"
                                className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 font-mono"
                            >
                                <X className="w-4 h-4 mr-2" />
                                CANCEL
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}