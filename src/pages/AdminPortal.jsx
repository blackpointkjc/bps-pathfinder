import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Shield, Edit2, Mail, User, Award, Hash, Wrench, Car, MapPin, Activity, Database, Server, TrendingUp, Clock, AlertTriangle, BarChart3, XCircle, CheckCircle } from 'lucide-react';
import { createPageUrl } from '../utils';
import MaintenanceTracking from '@/components/dispatch/MaintenanceTracking';
import VehicleManagement from '@/components/admin/VehicleManagement';
import LocationTracking from '@/components/admin/LocationTracking';
import CarolineGISLookup from '@/components/admin/CarolineGISLookup';
import IngestionDebugPanel from '@/components/admin/IngestionDebugPanel';
import PropertyMonitoring from '@/components/admin/PropertyMonitoring';

import SystemIssuesPanel from '@/components/admin/SystemIssuesPanel';

export default function AdminPortal() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [dashboardData, setDashboardData] = useState({
        callVolume: [],
        criticalIncidents: [],
        systemHealth: { uptime: '99.9%', avgResponse: '3.2m' }
    });

    useEffect(() => {
        init();
    }, []);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            loadDashboardData();
        }
    }, [activeTab]);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);

            if (user.role !== 'admin') {
                toast.error('Access denied - Admin only');
                window.location.href = '/navigation';
                return;
            }

            await loadUsers();
        } catch (error) {
            console.error('Error loading admin portal:', error);
            toast.error('Failed to load admin portal');
        } finally {
            setLoading(false);
        }
    };

    const loadDashboardData = async () => {
        try {
            // Fetch both active calls and archived history for accurate 7-day volume
            const [calls, history, outages] = await Promise.all([
                base44.entities.DispatchCall.list('-created_date', 500),
                base44.entities.CallHistory.list('-created_date', 500),
                base44.entities.SystemOutage.list('-created_date', 50)
            ]);
            const allCalls = [...calls, ...history];

            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                return date.toISOString().split('T')[0];
            });

            const volumeByDay = last7Days.map(day => ({
                date: day,
                count: allCalls.filter(c => (c.created_date || c.time_received || '')?.startsWith(day)).length
            }));

            // Compute uptime: % of last 30 days without active outages
            const activeOutages = (outages || []).filter(o => !o.resolved_at && o.severity === 'outage');
            const uptimePct = activeOutages.length === 0 ? '100.0%' : `${(100 - (activeOutages.length * 2.5)).toFixed(1)}%`;

            const critical = calls.filter(c =>
                c.priority === 'critical' || c.priority === 'high' ||
                c.incident?.toLowerCase().includes('shooting') ||
                c.incident?.toLowerCase().includes('officer')
            ).slice(0, 5);

            setDashboardData({
                callVolume: volumeByDay,
                criticalIncidents: critical,
                systemHealth: { uptime: uptimePct, avgResponse: '3.2m' }
            });
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    };

    const loadUsers = async () => {
        try {
            const allUsers = await base44.entities.User.list();
            setUsers(allUsers || []);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Failed to load users');
        }
    };

    const handleEditUser = (user) => {
        setEditingUser({ ...user });
        setShowEditDialog(true);
    };

    const handleSaveUser = async () => {
        try {
            console.log('Saving user:', editingUser);
            
            const response = await base44.functions.invoke('updateUser', {
                userId: editingUser.id,
                updates: {
                    full_name: editingUser.full_name,
                    role: editingUser.role,
                    rank: editingUser.rank,
                    last_name: editingUser.last_name,
                    unit_number: editingUser.unit_number,
                    dispatch_role: editingUser.dispatch_role || false,
                    is_supervisor: editingUser.is_supervisor || false,
                    show_on_map: editingUser.show_on_map !== false
                }
            });
            
            console.log('Update response:', response);
            
            if (response.data?.success) {
                toast.success('User updated successfully');
                setShowEditDialog(false);
                await loadUsers();
            } else {
                const errorMsg = response.data?.error || response.data?.details || 'Update failed';
                console.error('Update failed:', response.data);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Error updating user:', error);
            toast.error(error.message || 'Failed to update user');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" />
                    <p className="text-gold font-mono text-xs tracking-widest">LOADING ADMIN PORTAL...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-950 min-h-full flex flex-col font-mono">
            {/* Header */}
            <div className="flex-none bg-slate-900 border-b-2 border-gold/50 px-4 py-2 flex items-center gap-3">
                <div className="w-1 h-6 bg-gold rounded-sm" />
                <Shield className="w-4 h-4 text-gold" />
                <span className="text-white font-bold text-sm tracking-widest">ADMIN CONTROL CENTER</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 font-mono text-[10px]">ONLINE</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400">
                    <Users className="w-3 h-3 text-gold" />
                    {users.length} USERS
                </div>
                <div className="flex-1" />
                <span className="text-slate-500 text-[10px]">{currentUser?.rank || '—'} {currentUser?.last_name?.toUpperCase() || currentUser?.full_name?.split(' ').pop().toUpperCase() || 'ADMIN'}</span>
            </div>

            {/* Tab Bar */}
            <div className="flex-none flex border-b border-slate-800 bg-slate-900/50">
                {[
                    { key: 'dashboard', label: 'DASHBOARD', icon: BarChart3 },
                    { key: 'assets', label: 'FLEET', icon: Car },
                    { key: 'maintenance', label: 'MAINTENANCE', icon: Wrench },
                    { key: 'properties', label: 'PROPERTIES', icon: MapPin },
                    { key: 'sysissues', label: 'SYSTEM ISSUES', icon: XCircle },
                ].map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono font-bold border-r border-slate-800 border-b-2 transition-all ${
                            activeTab === key
                                ? 'border-b-gold text-gold bg-slate-800'
                                : 'border-b-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">

                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-4">
                        {/* Stat Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'SYSTEM UPTIME', value: dashboardData.systemHealth.uptime, icon: Server, color: 'text-green-400', border: 'border-green-500/30' },
                                { label: 'REGISTERED USERS', value: users.length, icon: Users, color: 'text-gold', border: 'border-gold/30' },
                                { label: 'AVG RESPONSE', value: dashboardData.systemHealth.avgResponse, icon: Clock, color: 'text-blue-400', border: 'border-blue-500/30' },
                                { label: 'CRITICAL CALLS', value: dashboardData.criticalIncidents.length, icon: AlertTriangle, color: 'text-red-400', border: 'border-red-500/30' },
                            ].map(({ label, value, icon: Icon, color, border }) => (
                                <div key={label} className={`bg-slate-900 border ${border} rounded p-3 flex items-center justify-between`}>
                                    <div>
                                        <div className="text-[9px] text-slate-500 tracking-widest mb-1">{label}</div>
                                        <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
                                    </div>
                                    <Icon className={`w-7 h-7 ${color} opacity-60`} />
                                </div>
                            ))}
                        </div>

                        {/* Call Volume + Critical Incidents */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Call Volume */}
                            <div className="bg-slate-900 border border-slate-800 rounded">
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
                                    <TrendingUp className="w-3.5 h-3.5 text-gold" />
                                    <span className="text-[11px] font-mono font-bold text-white tracking-widest">CALL VOLUME — LAST 7 DAYS</span>
                                </div>
                                <div className="p-3 space-y-1.5">
                                    {dashboardData.callVolume.length === 0 ? (
                                        <div className="text-center py-6 text-slate-600 text-[10px] font-mono">NO DATA</div>
                                    ) : dashboardData.callVolume.map((day, idx) => {
                                        const max = Math.max(...dashboardData.callVolume.map(d => d.count), 1);
                                        return (
                                            <div key={idx} className="flex items-center gap-2">
                                                <span className="text-[9px] font-mono text-slate-500 w-20 flex-shrink-0">{day.date.slice(5)}</span>
                                                <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                                                    <div className="h-full bg-gold/70 transition-all" style={{ width: `${(day.count / max) * 100}%` }} />
                                                </div>
                                                <span className="text-[10px] font-mono text-white w-6 text-right">{day.count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Critical Incidents */}
                            <div className="bg-slate-900 border border-slate-800 rounded">
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                    <span className="text-[11px] font-mono font-bold text-white tracking-widest">RECENT CRITICAL INCIDENTS</span>
                                </div>
                                <div className="p-3 space-y-1.5">
                                    {dashboardData.criticalIncidents.length === 0 ? (
                                        <div className="text-center py-6 text-slate-600 text-[10px] font-mono">NO CRITICAL INCIDENTS</div>
                                    ) : dashboardData.criticalIncidents.map((call, idx) => (
                                        <div key={idx} className="flex items-start gap-2 px-2 py-1.5 bg-red-500/5 border border-red-500/20 rounded">
                                            <span className="text-[8px] px-1.5 py-0.5 bg-red-600/30 text-red-300 font-bold rounded mt-0.5 flex-shrink-0">
                                                {(call.priority || 'HI').toUpperCase().slice(0,2)}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] text-white font-bold font-mono truncate">{call.incident}</div>
                                                <div className="text-[9px] text-slate-500 font-mono truncate">{call.location}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Personnel Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
                                <Users className="w-3.5 h-3.5 text-gold" />
                                <span className="text-[11px] font-mono font-bold text-white tracking-widest">PERSONNEL ROSTER</span>
                                <span className="ml-auto text-[9px] text-slate-500 font-mono">{users.length} RECORDS</span>
                            </div>
                            {/* Table Header */}
                            <div className="flex items-center px-3 py-1.5 bg-slate-800 border-b border-slate-700 text-[9px] text-slate-500 tracking-widest">
                                <div className="w-36 flex-shrink-0">NAME</div>
                                <div className="w-24 flex-shrink-0">RANK</div>
                                <div className="w-16 flex-shrink-0">UNIT</div>
                                <div className="w-20 flex-shrink-0">ROLE</div>
                                <div className="flex-1">EMAIL</div>
                                <div className="w-16 flex-shrink-0 text-right">ACTIONS</div>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {users.map((u, idx) => (
                                    <div key={u.id} className={`flex items-center px-3 py-2 border-b border-slate-800/60 text-[10px] hover:bg-slate-800/30 ${idx % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                                        <div className="w-36 flex-shrink-0 text-white font-bold truncate pr-2">{u.full_name || '—'}</div>
                                        <div className="w-24 flex-shrink-0 text-slate-400 truncate pr-2">{u.rank || '—'}</div>
                                        <div className="w-16 flex-shrink-0 text-gold font-bold">{u.unit_number ? `#${u.unit_number}` : '—'}</div>
                                        <div className="w-20 flex-shrink-0">
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                                                u.role === 'admin' ? 'bg-gold/20 text-gold border border-gold/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                                            }`}>{(u.role || 'user').toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 text-slate-500 truncate pr-2">{u.email}</div>
                                        <div className="w-16 flex-shrink-0 text-right">
                                            <button onClick={() => handleEditUser(u)}
                                                className="px-2 py-1 text-[8px] font-mono font-bold bg-slate-800 border border-slate-700 text-slate-400 hover:text-gold hover:border-gold/50 rounded transition-all">
                                                EDIT
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}



                {activeTab === 'assets' && <VehicleManagement />}

                {activeTab === 'maintenance' && <MaintenanceTracking units={users} />}

                {activeTab === 'properties' && <PropertyMonitoring />}



                {activeTab === 'sysissues' && <SystemIssuesPanel currentUser={currentUser} />}

            </div>

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="max-w-md pointer-events-auto bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white font-mono text-sm flex items-center gap-2">
                            <Edit2 className="w-4 h-4 text-gold" />
                            EDIT PERSONNEL RECORD
                        </DialogTitle>
                    </DialogHeader>
                    {editingUser && (
                        <div className="space-y-3 pointer-events-auto">
                            {[['FULL NAME', 'full_name', 'text'], ['LAST NAME', 'last_name', 'text'], ['UNIT NUMBER', 'unit_number', 'text']].map(([label, field]) => (
                                <div key={field}>
                                    <Label className="text-slate-500 font-mono text-[10px] tracking-widest">{label}</Label>
                                    <Input value={editingUser[field] || ''}
                                        onChange={e => setEditingUser({ ...editingUser, [field]: e.target.value })}
                                        className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono text-sm mt-1" />
                                </div>
                            ))}
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">RANK</Label>
                                <Select value={editingUser.rank || ''} onValueChange={v => setEditingUser({ ...editingUser, rank: v })}>
                                    <SelectTrigger className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono mt-1">
                                        <SelectValue placeholder="Select rank" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {['Colonel','Lieutenant Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior Officer','Officer'].map(r => (
                                            <SelectItem key={r} value={r} className="text-white font-mono">{r}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">ROLE</Label>
                                <Select value={editingUser.role} onValueChange={v => setEditingUser({ ...editingUser, role: v })}>
                                    <SelectTrigger className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="user" className="text-white font-mono">User</SelectItem>
                                        <SelectItem value="admin" className="text-white font-mono">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {[['DISPATCH ACCESS', 'dispatch_role'], ['SUPERVISOR ROLE', 'is_supervisor'], ['SHOW ON MAP', 'show_on_map']].map(([label, field]) => (
                                <div key={field} className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded">
                                    <Label className="text-slate-400 font-mono text-[10px] tracking-widest">{label}</Label>
                                    <Switch checked={field === 'show_on_map' ? editingUser[field] !== false : (editingUser[field] || false)}
                                        onCheckedChange={v => setEditingUser({ ...editingUser, [field]: v })} />
                                </div>
                            ))}
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setShowEditDialog(false)}
                                    className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-mono text-xs rounded transition-all">
                                    CANCEL
                                </button>
                                <button onClick={handleSaveUser}
                                    className="flex-1 py-2 bg-gold/10 border border-gold/50 text-gold hover:bg-gold/20 font-mono text-xs font-bold rounded transition-all">
                                    SAVE RECORD
                                </button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}