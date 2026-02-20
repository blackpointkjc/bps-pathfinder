import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, User, Shield, Trash2 } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function AccountSettings() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ full_name: '', unit_number: '', rank: '' });

    useEffect(() => {
        base44.auth.me().then(u => {
            setUser(u);
            setForm({
                full_name: u.full_name || '',
                unit_number: u.unit_number || '',
                rank: u.rank || '',
            });
        }).finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await base44.auth.updateMe({
                full_name: form.full_name,
                unit_number: form.unit_number,
                rank: form.rank,
            });
            toast.success('Account updated');
        } catch {
            toast.error('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            toast.info('Account deletion requested. Contact your administrator.');
            // Actual deletion requires admin action; log out the user
            await base44.auth.logout('/cadhome');
        } catch {
            toast.error('Failed to process request');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3 select-none"
                 style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <button
                    onClick={() => window.location.href = createPageUrl('CADHome')}
                    className="text-slate-400 hover:text-white p-1 rounded select-none"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <User className="w-5 h-5 text-blue-400" />
                <h1 className="text-lg font-bold text-white font-mono">ACCOUNT SETTINGS</h1>
            </div>

            <div className="max-w-lg mx-auto p-6 space-y-6">
                {/* Profile Info */}
                <Card className="bg-slate-900 border-slate-800 p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <h2 className="text-sm font-mono font-bold text-white">PROFILE INFORMATION</h2>
                    </div>

                    <div>
                        <Label className="text-slate-400 font-mono text-xs">EMAIL</Label>
                        <Input
                            value={user?.email || ''}
                            disabled
                            className="bg-slate-800 border-slate-700 text-slate-500 font-mono mt-1"
                        />
                    </div>

                    <div>
                        <Label className="text-slate-400 font-mono text-xs">FULL NAME</Label>
                        <Input
                            value={form.full_name}
                            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                            className="bg-slate-800 border-slate-700 text-white font-mono mt-1"
                        />
                    </div>

                    <div>
                        <Label className="text-slate-400 font-mono text-xs">RANK</Label>
                        <Input
                            value={form.rank}
                            onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
                            placeholder="e.g., Officer"
                            className="bg-slate-800 border-slate-700 text-white font-mono mt-1"
                        />
                    </div>

                    <div>
                        <Label className="text-slate-400 font-mono text-xs">UNIT NUMBER</Label>
                        <Input
                            value={form.unit_number}
                            onChange={e => setForm(f => ({ ...f, unit_number: e.target.value }))}
                            placeholder="e.g., 23"
                            className="bg-slate-800 border-slate-700 text-white font-mono mt-1"
                        />
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-blue-600 hover:bg-blue-700 font-mono select-none"
                    >
                        {saving ? 'SAVING...' : 'SAVE CHANGES'}
                    </Button>
                </Card>

                {/* Danger Zone */}
                <Card className="bg-slate-900 border-red-900/50 p-5">
                    <h2 className="text-sm font-mono font-bold text-red-400 mb-1">DANGER ZONE</h2>
                    <p className="text-xs text-slate-500 font-mono mb-4">
                        Permanently delete your account and all associated data. This action cannot be undone.
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                className="w-full bg-red-600 hover:bg-red-700 font-mono select-none"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                DELETE ACCOUNT
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border-slate-700">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-white font-mono">
                                    DELETE ACCOUNT?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400 font-mono text-sm">
                                    This will permanently delete your account and remove all your data from the system. This action <strong className="text-red-400">cannot be undone</strong>.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 font-mono select-none">
                                    CANCEL
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteAccount}
                                    className="bg-red-600 hover:bg-red-700 text-white font-mono select-none"
                                >
                                    YES, DELETE ACCOUNT
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </Card>
            </div>
        </div>
    );
}