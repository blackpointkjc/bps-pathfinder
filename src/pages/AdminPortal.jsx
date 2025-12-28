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
import { Users, Shield, Edit2, Mail, User, Award, Hash } from 'lucide-react';

export default function AdminPortal() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);

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
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
                            <Shield className="w-10 h-10 text-blue-600" />
                            Admin Portal
                        </h1>
                        <p className="text-gray-600 mt-2">Manage users, roles, and permissions</p>
                    </div>
                    <Button variant="outline" onClick={() => window.location.href = '/navigation'}>
                        Back to Navigation
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Users className="w-6 h-6 text-blue-600" />
                            Users ({users.length})
                        </h2>
                    </div>

                    <ScrollArea className="h-[calc(100vh-300px)]">
                        <div className="space-y-3">
                            {users.map(user => (
                                <Card key={user.id} className="p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                                <User className="w-6 h-6 text-blue-600" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-bold text-gray-900">
                                                        {user.rank && <span className="text-blue-600">{user.rank}</span>} {user.last_name || user.full_name}
                                                    </h3>
                                                    {user.unit_number && (
                                                        <Badge variant="outline" className="text-xs">
                                                            #{user.unit_number}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                                    <span className="flex items-center gap-1">
                                                        <Mail className="w-3 h-3" />
                                                        {user.email}
                                                    </span>
                                                    <Badge className={user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}>
                                                        {user.role}
                                                    </Badge>
                                                    {user.dispatch_role && (
                                                        <Badge className="bg-blue-100 text-blue-700">
                                                            Dispatch
                                                        </Badge>
                                                    )}
                                                    {user.is_supervisor && (
                                                        <Badge className="bg-yellow-100 text-yellow-700">
                                                            Supervisor
                                                        </Badge>
                                                    )}
                                                    {!user.show_on_map && (
                                                        <Badge className="bg-red-100 text-red-700">
                                                            Hidden
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEditUser(user)}
                                        >
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            Edit
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
            </div>

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                    </DialogHeader>
                    {editingUser && (
                        <div className="space-y-4">
                            <div>
                                <Label>Full Name</Label>
                                <Input
                                    value={editingUser.full_name || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>Last Name</Label>
                                <Input
                                    value={editingUser.last_name || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                                    placeholder="Last name"
                                />
                            </div>

                            <div>
                                <Label>Rank</Label>
                                <Select
                                    value={editingUser.rank || ''}
                                    onValueChange={(value) => setEditingUser({ ...editingUser, rank: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select rank" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Colonel">Colonel</SelectItem>
                                        <SelectItem value="Lieutenant Colonel">Lieutenant Colonel</SelectItem>
                                        <SelectItem value="Major">Major</SelectItem>
                                        <SelectItem value="Captain">Captain</SelectItem>
                                        <SelectItem value="Lieutenant">Lieutenant</SelectItem>
                                        <SelectItem value="First Sergeant">First Sergeant</SelectItem>
                                        <SelectItem value="Sergeant">Sergeant</SelectItem>
                                        <SelectItem value="Corporal">Corporal</SelectItem>
                                        <SelectItem value="Senior Officer">Senior Officer</SelectItem>
                                        <SelectItem value="Officer">Officer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>Unit Number</Label>
                                <Input
                                    value={editingUser.unit_number || ''}
                                    onChange={(e) => setEditingUser({ ...editingUser, unit_number: e.target.value })}
                                    placeholder="e.g., 23"
                                />
                            </div>

                            <div>
                                <Label>Role</Label>
                                <Select
                                    value={editingUser.role}
                                    onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">User</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Dispatch Access</Label>
                                <Switch
                                    checked={editingUser.dispatch_role || false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, dispatch_role: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Supervisor Role</Label>
                                <Switch
                                    checked={editingUser.is_supervisor || false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_supervisor: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Show on Map</Label>
                                <Switch
                                    checked={editingUser.show_on_map !== false}
                                    onCheckedChange={(checked) => setEditingUser({ ...editingUser, show_on_map: checked })}
                                />
                            </div>

                            <div className="flex gap-2 pt-4">
                                <Button variant="outline" onClick={() => setShowEditDialog(false)} className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={handleSaveUser} className="flex-1 bg-blue-600 hover:bg-blue-700">
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}