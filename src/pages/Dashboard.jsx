import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Users, 
    UserPlus, 
    Shield, 
    Mail, 
    Trash2, 
    Settings,
    ArrowLeft
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('user');
    const [inviting, setInviting] = useState(false);

    useEffect(() => {
        loadUsers();
        loadCurrentUser();
    }, []);

    const loadCurrentUser = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            if (user.role !== 'admin') {
                toast.error('Admin access required');
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    };

    const loadUsers = async () => {
        setLoading(true);
        try {
            const allUsers = await base44.entities.User.list();
            setUsers(allUsers);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleInviteUser = async () => {
        if (!inviteEmail.trim()) {
            toast.error('Please enter an email address');
            return;
        }

        setInviting(true);
        try {
            await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
            toast.success(`Invitation sent to ${inviteEmail}`);
            setInviteEmail('');
            loadUsers();
        } catch (error) {
            console.error('Error inviting user:', error);
            toast.error('Failed to send invitation');
        } finally {
            setInviting(false);
        }
    };

    if (!currentUser) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007AFF]" />
            </div>
        );
    }

    if (currentUser.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
                <Card className="p-8 max-w-md text-center">
                    <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h2>
                    <p className="text-gray-600 mb-6">
                        You need administrator privileges to access this page.
                    </p>
                    <Link to={createPageUrl('Navigation')}>
                        <Button className="bg-[#007AFF] hover:bg-[#0056CC]">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Navigation
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
                        <p className="text-gray-600">Manage users and system settings</p>
                    </div>
                    <Link to={createPageUrl('Navigation')}>
                        <Button variant="outline" className="gap-2">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Navigation
                        </Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Invite User Card */}
                    <Card className="p-6 lg:col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                                <UserPlus className="w-6 h-6 text-[#007AFF]" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Invite User</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                                    Email Address
                                </Label>
                                <div className="relative mt-1">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="officer@example.com"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="pl-10"
                                        disabled={inviting}
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-sm font-medium text-gray-700 mb-2 block">
                                    Role
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setInviteRole('user')}
                                        className={`p-3 rounded-xl border-2 transition-all ${
                                            inviteRole === 'user'
                                                ? 'border-[#007AFF] bg-blue-50 text-[#007AFF]'
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <Users className="w-5 h-5 mx-auto mb-1" />
                                        <p className="text-xs font-medium">Officer</p>
                                    </button>
                                    <button
                                        onClick={() => setInviteRole('admin')}
                                        className={`p-3 rounded-xl border-2 transition-all ${
                                            inviteRole === 'admin'
                                                ? 'border-[#007AFF] bg-blue-50 text-[#007AFF]'
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <Shield className="w-5 h-5 mx-auto mb-1" />
                                        <p className="text-xs font-medium">Admin</p>
                                    </button>
                                </div>
                            </div>

                            <Button
                                onClick={handleInviteUser}
                                disabled={inviting || !inviteEmail.trim()}
                                className="w-full bg-[#007AFF] hover:bg-[#0056CC]"
                            >
                                {inviting ? 'Sending...' : 'Send Invitation'}
                            </Button>
                        </div>
                    </Card>

                    {/* Users List */}
                    <Card className="p-6 lg:col-span-2">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-green-600" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Active Users</h2>
                                    <p className="text-sm text-gray-500">{users.length} total users</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadUsers}
                                disabled={loading}
                            >
                                Refresh
                            </Button>
                        </div>

                        <ScrollArea className="h-[500px]">
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="text-center py-12 text-gray-500">
                                        Loading users...
                                    </div>
                                ) : users.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        No users found
                                    </div>
                                ) : (
                                    users.map((user) => (
                                        <motion.div
                                            key={user.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-[#007AFF] flex items-center justify-center text-white font-semibold">
                                                        {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-900">
                                                            {user.full_name || 'Unknown User'}
                                                        </p>
                                                        <p className="text-sm text-gray-500">{user.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant="secondary"
                                                        className={
                                                            user.role === 'admin'
                                                                ? 'bg-purple-100 text-purple-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                        }
                                                    >
                                                        {user.role === 'admin' ? (
                                                            <>
                                                                <Shield className="w-3 h-3 mr-1" />
                                                                Admin
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Users className="w-3 h-3 mr-1" />
                                                                Officer
                                                            </>
                                                        )}
                                                    </Badge>
                                                    {user.id === currentUser.id && (
                                                        <Badge variant="outline" className="text-green-600 border-green-300">
                                                            You
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </Card>
                </div>
            </div>
        </div>
    );
}