import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Search, Edit2, MapPin, Save, X } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function Personnel() {
    const [currentUser, setCurrentUser] = useState(null);
    const [personnel, setPersonnel] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [loading, setLoading] = useState(true);
    const [editDialog, setEditDialog] = useState(false);
    const [editForm, setEditForm] = useState({});

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
            const response = await base44.entities.User.list();
            setPersonnel(response || []);
        } catch (error) {
            console.error('Error loading personnel:', error);
        }
    };

    const handleEdit = (person) => {
        const parts = (person.full_name || '').trim().split(' ');
        const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        const firstName = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';
        setEditForm({
            id: person.id,
            first_name: firstName,
            last_name: lastName,
            unit_number: person.unit_number || '',
            rank: person.rank || '',
            status: person.status || 'Available'
        });
        setEditDialog(true);
    };

    const handleSave = async () => {
        try {
            const fullName = [editForm.first_name, editForm.last_name].filter(Boolean).join(' ').trim();
            await base44.functions.invoke('updateUser', {
                userId: editForm.id,
                updates: {
                    full_name: fullName,
                    unit_number: editForm.unit_number,
                    rank: editForm.rank,
                    status: editForm.status
                }
            });
            toast.success('Personnel updated');
            setEditDialog(false);
            await loadPersonnel();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to update: ' + (error?.message || 'Unknown error'));
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
            <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0e1a] font-mono">
            {/* Header */}
            <div className="bg-[#0d1220] border-b border-[#1e2d4a] px-6 py-3 flex items-center gap-3">
                <Users className="w-4 h-4 text-gold" />
                <h1 className="text-sm font-bold text-white tracking-widest">PERSONNEL ROSTER</h1>
                <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full border border-gold/30">
                    {filteredPersonnel.length} PERSONNEL
                </span>
            </div>

            {/* Main Content */}
            <div className="p-4 md:p-6">
                <div className="bg-[#0d1220] border border-[#1e2d4a] rounded-xl overflow-hidden">
                    {/* Toolbar */}
                    <div className="px-4 py-3 border-b border-[#1e2d4a] flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <Input
                                placeholder="Search personnel..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-8 text-xs bg-[#111827] border-[#1e2d4a] text-white placeholder:text-slate-600"
                            />
                        </div>
                        <div className="flex gap-1.5">
                            {['all', 'officer', 'admin', 'dispatch'].map(role => (
                                <button
                                    key={role}
                                    onClick={() => setFilterRole(role)}
                                    className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${
                                        filterRole === role
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'border-[#1e2d4a] text-slate-500 hover:text-white hover:border-slate-500'
                                    }`}
                                >
                                    {role.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#1e2d4a] bg-[#111827]">
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">NAME</th>
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">UNIT</th>
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">RANK</th>
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">STATUS</th>
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">ROLE</th>
                                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-slate-500 tracking-widest">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPersonnel.map((person) => (
                                    <tr key={person.id} className="border-b border-[#1e2d4a] hover:bg-[#111827] transition-colors">
                                        <td className="px-4 py-2.5 text-white font-mono text-xs">
                                            {person.last_name || (() => {
                                                const parts = (person.full_name || '').trim().split(' ');
                                                return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '-';
                                            })()}
                                        </td>
                                        <td className="px-4 py-2.5 text-[#f5a623] font-mono text-xs">
                                            {person.unit_number ? `UNIT-${person.unit_number}` : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-400 text-xs">{person.rank || '-'}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                                                person.status === 'Available' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                                person.status === 'Enroute' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                                                person.status === 'On Scene' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                            }`}>
                                                {person.status || 'UNKNOWN'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                                                person.role === 'admin'
                                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                                                    : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                                            }`}>
                                                {person.role?.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => handleEdit(person)}
                                                    className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 text-[9px] rounded transition-colors"
                                                >
                                                    <Edit2 className="w-3 h-3" /> EDIT
                                                </button>
                                                <button
                                                    onClick={() => window.location.href = createPageUrl('Navigation')}
                                                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 text-[9px] rounded transition-colors"
                                                >
                                                    <MapPin className="w-3 h-3" /> TRACK
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editDialog} onOpenChange={setEditDialog}>
                <DialogContent className="bg-[#0d1220] border-[#1e2d4a] text-white font-mono">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-sm tracking-widest">EDIT PERSONNEL</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] text-slate-400 mb-1.5 block tracking-widest">LAST NAME</label>
                            <Input value={editForm.last_name || ''}
                                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                                className="bg-[#111827] border-[#1e2d4a] text-white font-mono text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 mb-1.5 block tracking-widest">UNIT NUMBER</label>
                            <Input value={editForm.unit_number || ''}
                                onChange={(e) => setEditForm({ ...editForm, unit_number: e.target.value })}
                                className="bg-[#111827] border-[#1e2d4a] text-white font-mono text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 mb-1.5 block tracking-widest">RANK</label>
                            <Input value={editForm.rank || ''}
                                onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
                                className="bg-[#111827] border-[#1e2d4a] text-white font-mono text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 mb-1.5 block tracking-widest">STATUS</label>
                            <select value={editForm.status || 'Available'}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                className="w-full h-9 rounded-md bg-[#111827] border border-[#1e2d4a] text-white font-mono px-3 text-sm">
                                <option value="Available">Available</option>
                                <option value="Enroute">Enroute</option>
                                <option value="On Scene">On Scene</option>
                                <option value="Busy">Busy</option>
                                <option value="Out of Service">Out of Service</option>
                                <option value="On Patrol">On Patrol</option>
                                <option value="Supervisor">Supervisor</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700 font-mono text-xs">
                                <Save className="w-3.5 h-3.5 mr-1.5" /> SAVE
                            </Button>
                            <Button onClick={() => setEditDialog(false)} variant="outline"
                                className="flex-1 border-[#1e2d4a] text-slate-300 hover:bg-[#111827] font-mono text-xs">
                                <X className="w-3.5 h-3.5 mr-1.5" /> CANCEL
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}