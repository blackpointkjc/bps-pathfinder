import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Save, X, RefreshCw } from 'lucide-react';
import { createPageUrl } from '../utils';

const STATUS_CFG = {
    Available:        { dot: 'bg-green-400',  badge: 'bg-green-900/40 text-green-300 border-green-600/50' },
    Enroute:          { dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-600/50' },
    'On Scene':       { dot: 'bg-blue-400',   badge: 'bg-blue-900/40 text-blue-300 border-blue-600/50' },
    Busy:             { dot: 'bg-orange-400', badge: 'bg-orange-900/40 text-orange-300 border-orange-600/50' },
    'On Patrol':      { dot: 'bg-cyan-400',   badge: 'bg-cyan-900/40 text-cyan-300 border-cyan-600/50' },
    Supervisor:       { dot: 'bg-purple-400', badge: 'bg-purple-900/40 text-purple-300 border-purple-600/50' },
    'Out of Service': { dot: 'bg-gray-500',   badge: 'bg-gray-800 text-gray-500 border-gray-600/50' },
};

export default function Personnel() {
    const [currentUser, setCurrentUser] = useState(null);
    const [personnel, setPersonnel] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editDialog, setEditDialog] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [lastRefresh, setLastRefresh] = useState(new Date());

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
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const loadPersonnel = async () => {
        try {
            const response = await base44.entities.User.list();
            // CAD Personnel roster is restricted to users explicitly granted CAD access.
            // Client- and student-only accounts must never appear here.
            const cadPersonnel = (response || []).filter(user => {
                const roles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
                return roles.includes('cad_access');
            });
            setPersonnel(cadPersonnel);
            setLastRefresh(new Date());
        } catch (error) { console.error(error); }
        finally { setRefreshing(false); }
    };

    const handleEdit = (person) => {
        const parts = (person.full_name || '').trim().split(' ');
        const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        const firstName = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';
        setEditForm({ id: person.id, first_name: firstName, last_name: lastName, unit_number: person.unit_number || '', rank: person.rank || '', status: person.status || 'Available' });
        setEditDialog(true);
    };

    const handleSave = async () => {
        try {
            await base44.functions.invoke('updateUser', { userId: editForm.id, updates: { last_name: editForm.last_name, unit_number: editForm.unit_number, rank: editForm.rank, status: editForm.status } });
            toast.success('Personnel record updated');
            setEditDialog(false);
            await loadPersonnel();
        } catch (error) {
            toast.error('Update failed: ' + (error?.message || 'Unknown error'));
        }
    };

    const filteredPersonnel = personnel.filter(person => {
        const matchesRole = filterRole === 'all' || (filterRole === 'officer' && person.role !== 'admin') || (filterRole === 'admin' && person.role === 'admin') || (filterRole === 'dispatch' && person.dispatch_role);
        const matchesSearch = !searchQuery || person.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || person.unit_number?.toLowerCase().includes(searchQuery.toLowerCase()) || person.email?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesRole && matchesSearch;
    }).sort((a, b) => {
        const unitA = parseInt(a.unit_number) || Infinity;
        const unitB = parseInt(b.unit_number) || Infinity;
        return unitA - unitB;
    });

    const available = filteredPersonnel.filter(p => p.status === 'Available').length;
    const onDuty = filteredPersonnel.filter(p => p.status && p.status !== 'Out of Service').length;

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" /><p className="text-gold font-mono text-xs tracking-widest">LOADING ROSTER...</p></div>
        </div>
    );

    return (
        <div className="bg-slate-950 min-h-full flex flex-col font-mono">
            {/* Header */}
            <div className="flex-none bg-slate-900 border-b-2 border-gold/50 px-4 py-2 flex items-center gap-3">
                <div className="w-1 h-6 bg-gold rounded-sm" />
                <span className="text-white font-bold text-sm tracking-widest">PERSONNEL ROSTER</span>
                <div className="flex-1" />
                <span className="text-slate-600 text-[10px]">REFRESHED {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                <button onClick={() => { setRefreshing(true); loadPersonnel(); }} disabled={refreshing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-white hover:border-gold transition-all text-[10px]">
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />REFRESH
                </button>
            </div>

            {/* Stats Bar */}
            <div className="flex-none grid grid-cols-4 border-b border-slate-800">
                {[
                    { label: 'TOTAL PERSONNEL', val: filteredPersonnel.length, color: 'text-gold' },
                    { label: 'ON DUTY', val: onDuty, color: 'text-green-400' },
                    { label: 'AVAILABLE', val: available, color: 'text-green-400' },
                    { label: 'OFF DUTY / OOS', val: filteredPersonnel.filter(p => !p.status || p.status === 'Out of Service').length, color: 'text-slate-500' },
                ].map(({ label, val, color }) => (
                    <div key={label} className="flex flex-col items-center py-2 border-r last:border-r-0 border-slate-800">
                        <span className={`text-xl font-bold font-mono leading-none ${color}`}>{val}</span>
                        <span className="text-[9px] text-slate-500 tracking-wider mt-0.5">{label}</span>
                    </div>
                ))}
            </div>

            {/* Filter Bar */}
            <div className="flex-none flex items-center gap-3 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="SEARCH NAME / UNIT / EMAIL..."
                        className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-gold w-56" />
                </div>
                <div className="w-px h-5 bg-slate-700" />
                <span className="text-[9px] text-slate-500">FILTER:</span>
                <div className="flex gap-1">
                    {['all', 'officer', 'admin', 'dispatch'].map(role => (
                        <button key={role} onClick={() => setFilterRole(role)}
                            className={`px-2.5 py-1 rounded border text-[9px] font-bold transition-all ${filterRole === role ? 'bg-gold/20 border-gold/50 text-gold' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                            {role.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {/* Column Headers */}
                <div className="sticky top-0 z-10 flex items-center bg-slate-800 border-b-2 border-slate-700 px-4 py-1.5 text-[9px] text-slate-500 tracking-widest">
                    <div className="w-6 flex-shrink-0" />
                    <div className="w-24 flex-shrink-0">UNIT</div>
                    <div className="w-40 flex-shrink-0">RANK / NAME</div>
                    <div className="flex-1">EMAIL</div>
                    <div className="w-28 flex-shrink-0">STATUS</div>
                    <div className="w-20 flex-shrink-0">ROLE</div>
                    <div className="w-28 flex-shrink-0">ACTIONS</div>
                </div>

                {filteredPersonnel.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-xs tracking-widest">— NO PERSONNEL MATCH FILTERS —</div>
                ) : filteredPersonnel.map((person, idx) => {
                    const cfg = STATUS_CFG[person.status] || STATUS_CFG['Out of Service'];
                    const nameParts = (person.full_name || '').trim().split(' ');
                    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || '—';
                    return (
                        <div key={person.id} className={`flex items-center px-4 py-2 border-b border-slate-800/60 hover:bg-slate-800/30 text-[10px] ${idx % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                            <div className="w-6 flex-shrink-0">
                                <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
                            </div>
                            <div className="w-24 flex-shrink-0 text-gold font-bold">
                                {person.unit_number ? `UNIT-${person.unit_number}` : '—'}
                            </div>
                            <div className="w-40 flex-shrink-0">
                                <div className="text-white font-bold">{person.last_name || '—'}</div>
                                {person.rank && <div className="text-slate-500 text-[9px]">{person.rank}</div>}
                            </div>
                            <div className="flex-1 text-slate-400 truncate pr-2">{person.email || '—'}</div>
                            <div className="w-28 flex-shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${cfg.badge}`}>{person.status || 'UNKNOWN'}</span>
                            </div>
                            <div className="w-20 flex-shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${person.role === 'admin' ? 'bg-purple-900/40 text-purple-300 border-purple-600/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                    {person.role === 'admin' ? 'ADMIN' : person.dispatch_role ? 'DISP' : 'USER'}
                                </span>
                            </div>
                            <div className="w-28 flex-shrink-0 flex gap-1.5">

                                <button onClick={() => window.location.href = createPageUrl('Navigation')}
                                    className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 rounded text-[9px] transition-all">
                                    <MapPin className="w-2.5 h-2.5" />MAP
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Status Bar */}
            <div className="flex-none h-6 bg-slate-900 border-t border-slate-800 flex items-center px-4 gap-4 text-[9px] text-slate-500">
                <span>SHOWING <span className="text-white">{filteredPersonnel.length}</span> OF <span className="text-white">{personnel.length}</span> PERSONNEL</span>
                <div className="flex-1" />
                <span className="text-green-500">● LIVE — 10s REFRESH</span>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editDialog} onOpenChange={setEditDialog}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white font-mono max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-sm tracking-widest text-gold">EDIT PERSONNEL RECORD</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {[
                            { label: 'LAST NAME', key: 'last_name', type: 'text' },
                            { label: 'FIRST NAME', key: 'first_name', type: 'text' },
                            { label: 'UNIT NUMBER', key: 'unit_number', type: 'text' },
                            { label: 'RANK', key: 'rank', type: 'text' },
                        ].map(({ label, key, type }) => (
                            <div key={key}>
                                <label className="text-[10px] text-slate-400 tracking-widest mb-1 block">{label}</label>
                                <input type={type} value={editForm[key] || ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 text-white font-mono text-sm px-3 py-2 rounded focus:outline-none focus:border-gold" />
                            </div>
                        ))}
                        <div>
                            <label className="text-[10px] text-slate-400 tracking-widest mb-1 block">STATUS</label>
                            <select value={editForm.status || 'Available'} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 text-white font-mono text-sm px-3 py-2 rounded focus:outline-none focus:border-gold">
                                {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-bold text-sm transition-colors">
                                <Save className="w-4 h-4" />SAVE
                            </button>
                            <button onClick={() => setEditDialog(false)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 rounded text-sm transition-colors">
                                <X className="w-4 h-4" />CANCEL
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}