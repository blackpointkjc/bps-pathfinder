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
import { Users, Shield, Edit2, Mail, User, Award, Hash, Wrench, Car, MapPin, Activity, Database, Server } from 'lucide-react';
import { createPageUrl } from '../utils';
import MaintenanceTracking from '@/components/dispatch/MaintenanceTracking';
import VehicleManagement from '@/components/admin/VehicleManagement';
import LocationTracking from '@/components/admin/LocationTracking';

export default function AdminPortal() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [activeTab, setActiveTab] = useState('users');

    useEffect(() => {
        init();
    }, []);

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

    const loadUsers = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            setUsers(response.data?.users || []);
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
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
                    <div className="text-blue-400 font-mono text-sm">LOADING SYSTEM...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header Bar */}
            <div className="bg-slate-900 border-b border-slate-800 shadow-lg">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white tracking-tight">ADMIN CONTROL CENTER</h1>
                                    <p className="text-xs text-slate-400 font-mono">System Management Portal</p>
                                </div>
                            </div>
                            <div className="h-8 w-px bg-slate-700 mx-2" />
                            <div className="flex items-center gap-2 text-xs">
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-green-400 font-mono">ONLINE</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 border border-slate-700 rounded">
                                    <Users className="w-3 h-3 text-blue-400" />
                                    <span className="text-slate-300 font-mono">{users.length} USERS</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => window.location.href = createPageUrl('CADHome')}
                                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white font-mono text-xs"
                            >
                                ← CAD HOME
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => window.location.href = createPageUrl('DispatchCenter')}
                                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white font-mono text-xs"
                            >
                                <Activity className="w-3 h-3 mr-2" />
                                DISPATCH
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => window.location.href = createPageUrl('Navigation')}
                                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white font-mono text-xs"
                            >
                                <MapPin className="w-3 h-3 mr-2" />
                                MAP
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="border-t border-slate-800">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-mono border-r border-slate-800 transition-colors ${
                                activeTab === 'users' 
                                    ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            PERSONNEL
                        </button>
                        <button
                            onClick={() => setActiveTab('assets')}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-mono border-r border-slate-800 transition-colors ${
                                activeTab === 'assets' 
                                    ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                        >
                            <Car className="w-4 h-4" />
                            FLEET
                        </button>
                        <button
                            onClick={() => setActiveTab('maintenance')}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-mono border-r border-slate-800 transition-colors ${
                                activeTab === 'maintenance' 
                                    ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                        >
                            <Wrench className="w-4 h-4" />
                            MAINTENANCE
                        </button>
                        <button
                            onClick={() => setActiveTab('tracking')}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-mono border-r border-slate-800 transition-colors ${
                                activeTab === 'tracking' 
                                    ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                        >
                            <MapPin className="w-4 h-4" />
                            TRACKING
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-6">

                {/* Personnel Tab */}
                {activeTab === 'users' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users className="w-5 h-5 text-blue-400" />
                                    <h2 className="text-lg font-bold text-white font-mono">PERSONNEL ROSTER</h2>
                                    <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                                        {users.length} ACTIVE
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <ScrollArea className="h-[calc(100vh-280px)]">
                            <div className="p-4 space-y-2">
                                {users.map(user => (
                                    <div 
                                        key={user.id} 
                                        className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 hover:bg-slate-800 transition-all group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
                                                    <User className="w-6 h-6 text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h3 className="font-bold text-white font-mono text-sm">
                                                            {user.rank && <span className="text-blue-400">{user.rank}</span>} {user.last_name || user.full_name}
                                                        </h3>
                                                        {user.unit_number && (
                                                            <Badge className="bg-slate-700 text-blue-400 border border-slate-600 font-mono text-xs">
                                                                UNIT-{user.unit_number}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                                            <Mail className="w-3 h-3" />
                                                            {user.email}
                                                        </span>
                                                        <Badge className={user.role === 'admin' 
                                                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono text-xs' 
                                                            : 'bg-slate-700 text-slate-300 border border-slate-600 font-mono text-xs'
                                                        }>
                                                            {user.role.toUpperCase()}
                                                        </Badge>
                                                        {user.dispatch_role && (
                                                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                                                                DISPATCH
                                                            </Badge>
                                                        )}
                                                        {user.is_supervisor && (
                                                            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-mono text-xs">
                                                                SUPERVISOR
                                                            </Badge>
                                                        )}
                                                        {!user.show_on_map && (
                                                            <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-xs">
                                                                HIDDEN
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEditUser(user)}
                                                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Edit2 className="w-3 h-3 mr-2" />
                                                EDIT
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {/* Assets Tab */}
                {activeTab === 'assets' && (
                    <VehicleManagement />
                )}

                {/* Maintenance Tab */}
                {activeTab === 'maintenance' && (
                    <MaintenanceTracking units={users} />
                )}

                {/* Location Tracking Tab */}
                {activeTab === 'tracking' && (
                    <LocationTracking users={users} />
                )}
            </div>

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="max-w-md pointer-events-auto bg-slate-900 border-slate-700">
                    <DialogHeader>
                        <DialogTitle className="text-white font-mono flex items-center gap-2">
                            <Edit2 className="w-4 h-4 text-blue-400" />
                            EDIT PERSONNEL RECORD
                        </DialogTitle>
                    </DialogHeader>
                    {editingUser && (
                        <div className="space-y-4 pointer-events-auto">
                            <div>
                                <Label className="text-slate-300 font-mono text-xs">FULL NAME</Label>
                                <Input
                                    value={editingUser.full_name || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                                    className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300 font-mono text-xs">LAST NAME</Label>
                                <Input
                                    value={editingUser.last_name || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                                    placeholder="Last name"
                                    className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300 font-mono text-xs">RANK</Label>
                                <Select
                                    value={editingUser.rank || ''}
                                    onValueChange={(value) => setEditingUser({ ...editingUser, rank: value })}
                                >
                                    <SelectTrigger className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono">
                                        <SelectValue placeholder="Select rank" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="Colonel" className="text-white font-mono">Colonel</SelectItem>
                                        <SelectItem value="Lieutenant Colonel" className="text-white font-mono">Lieutenant Colonel</SelectItem>
                                        <SelectItem value="Major" className="text-white font-mono">Major</SelectItem>
                                        <SelectItem value="Captain" className="text-white font-mono">Captain</SelectItem>
                                        <SelectItem value="Lieutenant" className="text-white font-mono">Lieutenant</SelectItem>
                                        <SelectItem value="First Sergeant" className="text-white font-mono">First Sergeant</SelectItem>
                                        <SelectItem value="Sergeant" className="text-white font-mono">Sergeant</SelectItem>
                                        <SelectItem value="Corporal" className="text-white font-mono">Corporal</SelectItem>
                                        <SelectItem value="Senior Officer" className="text-white font-mono">Senior Officer</SelectItem>
                                        <SelectItem value="Officer" className="text-white font-mono">Officer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300 font-mono text-xs">UNIT NUMBER</Label>
                                <Input
                                    value={editingUser.unit_number || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, unit_number: e.target.value })}
                                    placeholder="e.g., 23"
                                    className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300 font-mono text-xs">ROLE</Label>
                                <Select
                                    value={editingUser.role}
                                    onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
                                >
                                    <SelectTrigger className="pointer-events-auto bg-slate-800 border-slate-700 text-white font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="user" className="text-white font-mono">User</SelectItem>
                                        <SelectItem value="admin" className="text-white font-mono">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                                <Label className="text-slate-300 font-mono text-xs">DISPATCH ACCESS</Label>
                                <Switch
                                    checked={editingUser.dispatch_role || false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, dispatch_role: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                                <Label className="text-slate-300 font-mono text-xs">SUPERVISOR ROLE</Label>
                                <Switch
                                    checked={editingUser.is_supervisor || false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_supervisor: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                                <Label className="text-slate-300 font-mono text-xs">SHOW ON MAP</Label>
                                <Switch
                                    checked={editingUser.show_on_map !== false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, show_on_map: checked })}
                                />
                            </div>

                            <div className="flex gap-2 pt-4">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setShowEditDialog(false)} 
                                    className="flex-1 pointer-events-auto bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white font-mono"
                                >
                                    CANCEL
                                </Button>
                                <Button 
                                    onClick={handleSaveUser} 
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 pointer-events-auto font-mono"
                                >
                                    SAVE
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}