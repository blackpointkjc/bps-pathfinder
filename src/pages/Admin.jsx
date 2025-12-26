import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ArrowLeft, Users, Edit, Save, X, Shield } from 'lucide-react';

export default function Admin() {
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            if (user.role !== 'admin') {
                toast.error('Admin access required');
                return;
            }

            const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 1000);
            setUsers(allUsers || []);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load user data');
        } finally {
            setLoading(false);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setEditForm({
            full_name: user.full_name || '',
            email: user.email || '',
            unit_number: user.unit_number || '',
            rank: user.rank || '',
            last_name: user.last_name || '',
            role: user.role || 'user',
            dispatch_role: user.dispatch_role || false
        });
    };

    const handleSaveUser = async () => {
        if (!editingUser) return;

        try {
            await base44.asServiceRole.entities.User.update(editingUser.id, editForm);
            toast.success('User updated successfully');
            setEditingUser(null);
            loadData();
        } catch (error) {
            console.error('Error updating user:', error);
            toast.error('Failed to update user');
        }
    };

    const handleCancelEdit = () => {
        setEditingUser(null);
        setEditForm({});
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="p-8 max-w-md text-center">
                    <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
                    <p className="text-gray-600 mb-6">
                        Only administrators can access this panel.
                    </p>
                    <Button onClick={() => window.location.href = '/'}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Navigation
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
                        <p className="text-gray-600">Manage users and permissions</p>
                    </div>
                    <Button variant="outline" onClick={() => window.location.href = '/'}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Map
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">User Management</h2>
                            <p className="text-sm text-gray-500">{users.length} total users</p>
                        </div>
                    </div>

                    <ScrollArea className="h-[700px]">
                        {users.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                <p>No users found</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {users.map((user) => (
                                    <motion.div
                                        key={user.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        {editingUser?.id === user.id ? (
                                            <Card className="p-6 border-2 border-blue-500">
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <Label>Full Name</Label>
                                                            <Input
                                                                value={editForm.full_name}
                                                                onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Email</Label>
                                                            <Input
                                                                value={editForm.email}
                                                                onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                                                                type="email"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Unit Number</Label>
                                                            <Input
                                                                value={editForm.unit_number}
                                                                onChange={(e) => setEditForm({...editForm, unit_number: e.target.value})}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Rank</Label>
                                                            <Input
                                                                value={editForm.rank}
                                                                onChange={(e) => setEditForm({...editForm, rank: e.target.value})}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Last Name</Label>
                                                            <Input
                                                                value={editForm.last_name}
                                                                onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Role</Label>
                                                            <select
                                                                value={editForm.role}
                                                                onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                            >
                                                                <option value="user">User</option>
                                                                <option value="admin">Admin</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                        <div>
                                                            <Label className="text-sm font-semibold">Dispatch Access</Label>
                                                            <p className="text-xs text-gray-500">Allow user to create and manage service calls</p>
                                                        </div>
                                                        <Switch
                                                            checked={editForm.dispatch_role}
                                                            onCheckedChange={(checked) => setEditForm({...editForm, dispatch_role: checked})}
                                                        />
                                                    </div>

                                                    <div className="flex gap-3 justify-end">
                                                        <Button variant="outline" onClick={handleCancelEdit}>
                                                            <X className="w-4 h-4 mr-2" />
                                                            Cancel
                                                        </Button>
                                                        <Button onClick={handleSaveUser} className="bg-blue-600 hover:bg-blue-700">
                                                            <Save className="w-4 h-4 mr-2" />
                                                            Save Changes
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Card>
                                        ) : (
                                            <Card className="p-4 hover:shadow-lg transition-shadow">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <h3 className="font-bold text-lg">{user.full_name}</h3>
                                                            <Badge className={user.role === 'admin' ? 'bg-purple-600' : 'bg-gray-600'}>
                                                                {user.role}
                                                            </Badge>
                                                            {user.dispatch_role && (
                                                                <Badge className="bg-blue-600">Dispatch</Badge>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                                                            <div>
                                                                <span className="font-semibold">Email:</span> {user.email}
                                                            </div>
                                                            {user.unit_number && (
                                                                <div>
                                                                    <span className="font-semibold">Unit:</span> {user.unit_number}
                                                                </div>
                                                            )}
                                                            {user.rank && (
                                                                <div>
                                                                    <span className="font-semibold">Rank:</span> {user.rank}
                                                                </div>
                                                            )}
                                                            {user.last_name && (
                                                                <div>
                                                                    <span className="font-semibold">Last Name:</span> {user.last_name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    <Button
                                                        onClick={() => handleEditUser(user)}
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        <Edit className="w-4 h-4 mr-2" />
                                                        Edit
                                                    </Button>
                                                </div>
                                            </Card>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </Card>
            </div>
        </div>
    );
}