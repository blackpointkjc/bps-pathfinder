import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, MapPin, RefreshCw } from 'lucide-react';
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
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [forcedOverrides, setForcedOverrides] = useState([]);
    const [statusUpdatingId, setStatusUpdatingId] = useState(null);

    useEffect(() => {
        init();
        const interval = setInterval(() => loadPersonnel(), 10000);
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            await Promise.all([loadPersonnel(), loadOverrides(user)]);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const canForceStatus = (user = currentUser) => {
        const roles = Array.isArray(user?.additional_roles) ? user.additional_roles.map(role => String(role).toLowerCase()) : [];
        return user?.role === 'admin' || user?.role === 'dispatch' || roles.includes('full_access') || roles.includes('supervisor') || roles.includes('dispatch');
    };

    const loadOverrides = async (actor = currentUser) => {
        if (!canForceStatus(actor)) return setForcedOverrides([]);
        try {
            const response = await base44.functions.invoke('forceOfficerStatus', { action: 'list' });
            const payload = response?.data || response || {};
            setForcedOverrides(payload.overrides || []);
        } catch (error) {
            console.warn('Unable to load forced status overrides:', error?.message);
        }
    };

    const loadPersonnel = async () => {
        try {
            const response = await base44.entities.User.list();
            // CAD Personnel roster only shows operational officers who have BOTH
            // required roles. Client, student, admin-only, and full-access-only users
            // must not appear on the CAD personnel/status roster.
            const cadPersonnel = (response || []).filter(user => {
                const roles = Array.isArray(user.additional_roles) ? user.additional_roles.map(role => String(role).toLowerCase()) : [];
                return roles.includes('cad_access') && roles.includes('officer');
            });
            setPersonnel(cadPersonnel);
            setLastRefresh(new Date());
        } catch (error) { console.error(error); }
        finally { setRefreshing(false); }
    };


    const handleForceStatus = async (person) => {
        const existingOverride = forcedOverrides.find(entry => entry.officer_id === person.id);
        const action = existingOverride ? 'release' : 'force_oos';
        let reason = '';
        if (action === 'force_oos') {
            reason = window.prompt(`Reason for forcing ${person.rank || 'Officer'} ${person.last_name || person.full_name || person.email} Out of Service:`, '') ?? '';
            if (reason === '' && !window.confirm('No reason was entered. Force this officer Out of Service anyway?')) return;
        } else if (!window.confirm(`Release the forced Out of Service status for ${person.rank || 'Officer'} ${person.last_name || person.full_name || person.email}?`)) {
            return;
        }

        setStatusUpdatingId(person.id);
        try {
            await base44.functions.invoke('forceOfficerStatus', { officer_id: person.id, action, reason });
            toast.success(action === 'force_oos' ? 'Officer forced Out of Service' : 'Out of Service override released');
            await Promise.all([loadPersonnel(), loadOverrides()]);
        } catch (error) {
            const message = error?.response?.data?.error || error?.message || 'Status update failed';
            toast.error(message);
        } finally {
            setStatusUpdatingId(null);
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
            <div className="flex-none border-b-2 border-gold/50 bg-slate-900 px-3 py-2.5 sm:px-4 sm:py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
            <div className="flex-none grid grid-cols-2 border-b border-slate-800 sm:grid-cols-4">
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
            <div className="flex-none flex flex-col gap-2 border-b border-slate-800 bg-slate-900/50 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="SEARCH NAME / UNIT / EMAIL..."
                        className="w-full rounded border border-slate-700 bg-slate-800 py-2 pl-8 pr-3 text-[10px] text-white placeholder-slate-600 focus:border-gold focus:outline-none sm:w-56 sm:py-1.5" />
                </div>
                <div className="hidden h-5 w-px bg-slate-700 sm:block" />
                <span className="text-[9px] text-slate-500">FILTER:</span>
                <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto">
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
                <div className="sticky top-0 z-10 hidden items-center border-b-2 border-slate-700 bg-slate-800 px-4 py-1.5 text-[9px] tracking-widest text-slate-500 md:flex">
                    <div className="w-6 flex-shrink-0" />
                    <div className="w-24 flex-shrink-0">UNIT</div>
                    <div className="w-40 flex-shrink-0">RANK / NAME</div>
                    <div className="flex-1">EMAIL</div>
                    <div className="w-28 flex-shrink-0">STATUS</div>
                    <div className="w-20 flex-shrink-0">ROLE</div>
                    <div className="w-52 flex-shrink-0">ACTIONS</div>
                </div>

                {filteredPersonnel.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-xs tracking-widest">— NO PERSONNEL MATCH FILTERS —</div>
                ) : filteredPersonnel.map((person, idx) => {
                    const cfg = STATUS_CFG[person.status] || STATUS_CFG['Out of Service'];
                    return (
                        <div key={person.id} className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-b border-slate-800/60 px-3 py-3 text-[10px] hover:bg-slate-800/30 md:flex md:items-center md:px-4 md:py-2 ${idx % 2 === 0 ? '' : 'bg-slate-900/30'}`}> 
                            <div className="w-6 flex-shrink-0">
                                <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
                            </div>
                            <div className="min-w-0 font-bold text-gold md:w-24 md:flex-shrink-0">
                                {person.unit_number ? `UNIT-${person.unit_number}` : '—'}
                            </div>
                            <div className="min-w-0 md:w-40 md:flex-shrink-0">
                                <div className="text-white font-bold">{person.last_name || '—'}</div>
                                {person.rank && <div className="text-slate-500 text-[9px]">{person.rank}</div>}
                            </div>
                            <div className="col-span-2 min-w-0 break-all text-slate-400 md:col-span-1 md:flex-1 md:truncate md:pr-2">{person.email || '—'}</div>
                            <div className="min-w-0 md:w-28 md:flex-shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${cfg.badge}`}>{person.status || 'UNKNOWN'}</span>
                            </div>
                            <div className="min-w-0 md:w-20 md:flex-shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${person.role === 'admin' ? 'bg-purple-900/40 text-purple-300 border-purple-600/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                    {person.role === 'admin' ? 'ADMIN' : person.dispatch_role ? 'DISP' : 'USER'}
                                </span>
                            </div>
                            <div className="col-span-2 flex w-full flex-wrap gap-1.5 md:col-span-1 md:w-52 md:flex-shrink-0 md:flex-nowrap">
                                <button onClick={() => window.location.href = createPageUrl('Navigation')}
                                    className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 rounded text-[9px] transition-all">
                                    <MapPin className="w-2.5 h-2.5" />MAP
                                </button>
                                {canForceStatus() && (() => {
                                    const forced = forcedOverrides.some(entry => entry.officer_id === person.id);
                                    return (
                                        <button onClick={() => handleForceStatus(person)} disabled={statusUpdatingId === person.id}
                                            title={forced ? 'Release forced Out of Service override' : 'Force this officer Out of Service'}
                                            className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-bold transition-all disabled:opacity-50 ${forced ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300 hover:bg-emerald-900' : 'bg-red-950/60 border-red-700 text-red-300 hover:bg-red-900'}`}>
                                            {statusUpdatingId === person.id ? 'WORKING…' : forced ? 'RELEASE OOS' : 'FORCE OOS'}
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Status Bar */}
            <div className="flex-none flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 bg-slate-900 px-3 py-1 text-[9px] text-slate-500 sm:px-4">
                <span>SHOWING <span className="text-white">{filteredPersonnel.length}</span> OF <span className="text-white">{personnel.length}</span> PERSONNEL</span>
                <div className="flex-1" />
                <span className="text-green-500">● LIVE — 10s REFRESH</span>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editDialog} onOpenChange={setEditDialog}>
                <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto border-slate-700 bg-slate-900 p-3 font-mono text-white sm:p-6">
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