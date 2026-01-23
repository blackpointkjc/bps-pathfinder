import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Archive, Clock, Database, Filter, Play, Save, Trash2 } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function ArchiveManager() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState([]);
    const [newRule, setNewRule] = useState({
        name: '',
        days_threshold: 90,
        source: 'all',
        priority: 'all',
        agency: 'all',
        enabled: true
    });
    const [stats, setStats] = useState({
        activeCalls: 0,
        archivedCalls: 0
    });

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);

            if (user.role !== 'admin') {
                toast.error('Access denied - Admin only');
                window.location.href = createPageUrl('CADHome');
                return;
            }

            await loadStats();
            // Load saved rules from User entity custom field
            const savedRules = user.archive_rules || [];
            setRules(savedRules);
        } catch (error) {
            console.error('Error initializing:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const [activeCalls, archivedCalls] = await Promise.all([
                base44.entities.DispatchCall.list('-created_date', 1000),
                base44.entities.CallHistory.list('-created_date', 1000)
            ]);

            setStats({
                activeCalls: activeCalls?.length || 0,
                archivedCalls: archivedCalls?.length || 0
            });
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const addRule = async () => {
        if (!newRule.name) {
            toast.error('Rule name is required');
            return;
        }

        const updatedRules = [...rules, { ...newRule, id: Date.now().toString() }];
        setRules(updatedRules);

        try {
            await base44.auth.updateMe({ archive_rules: updatedRules });
            toast.success('Archive rule added');
            setNewRule({
                name: '',
                days_threshold: 90,
                source: 'all',
                priority: 'all',
                agency: 'all',
                enabled: true
            });
        } catch (error) {
            toast.error('Failed to save rule');
        }
    };

    const deleteRule = async (ruleId) => {
        const updatedRules = rules.filter(r => r.id !== ruleId);
        setRules(updatedRules);

        try {
            await base44.auth.updateMe({ archive_rules: updatedRules });
            toast.success('Rule deleted');
        } catch (error) {
            toast.error('Failed to delete rule');
        }
    };

    const toggleRule = async (ruleId) => {
        const updatedRules = rules.map(r => 
            r.id === ruleId ? { ...r, enabled: !r.enabled } : r
        );
        setRules(updatedRules);

        try {
            await base44.auth.updateMe({ archive_rules: updatedRules });
            toast.success('Rule updated');
        } catch (error) {
            toast.error('Failed to update rule');
        }
    };

    const runArchive = async () => {
        try {
            toast.info('Running archive process...');
            const response = await base44.functions.invoke('archiveOldCalls', {});
            toast.success(`Archived ${response.data?.archivedCount || 0} calls`);
            await loadStats();
        } catch (error) {
            toast.error('Archive process failed');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
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
                            <Archive className="w-6 h-6 text-purple-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">ARCHIVE MANAGER</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">ACTIVE CALLS</p>
                                <p className="text-3xl font-bold text-blue-400 font-mono">{stats.activeCalls}</p>
                            </div>
                            <Database className="w-8 h-8 text-blue-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">ARCHIVED CALLS</p>
                                <p className="text-3xl font-bold text-purple-400 font-mono">{stats.archivedCalls}</p>
                            </div>
                            <Archive className="w-8 h-8 text-purple-400" />
                        </div>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-mono text-slate-400 mb-1">ACTIVE RULES</p>
                                <p className="text-3xl font-bold text-green-400 font-mono">{rules.filter(r => r.enabled).length}</p>
                            </div>
                            <Filter className="w-8 h-8 text-green-400" />
                        </div>
                    </Card>
                </div>

                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <h2 className="text-lg font-bold text-white font-mono">CREATE ARCHIVE RULE</h2>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">RULE NAME</label>
                                <Input
                                    value={newRule.name}
                                    onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                                    placeholder="e.g., Auto-archive 911 calls"
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">DAYS THRESHOLD</label>
                                <Input
                                    type="number"
                                    value={newRule.days_threshold}
                                    onChange={(e) => setNewRule({...newRule, days_threshold: parseInt(e.target.value)})}
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">AGENCY</label>
                                <Select
                                    value={newRule.agency}
                                    onValueChange={(value) => setNewRule({...newRule, agency: value})}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="all">All Agencies</SelectItem>
                                        <SelectItem value="richmond">Richmond</SelectItem>
                                        <SelectItem value="henrico">Henrico</SelectItem>
                                        <SelectItem value="chesterfield">Chesterfield</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">PRIORITY</label>
                                <Select
                                    value={newRule.priority}
                                    onValueChange={(value) => setNewRule({...newRule, priority: value})}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="all">All Priorities</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-mono mb-2 block">SOURCE</label>
                                <Select
                                    value={newRule.source}
                                    onValueChange={(value) => setNewRule({...newRule, source: value})}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="all">All Sources</SelectItem>
                                        <SelectItem value="911">911</SelectItem>
                                        <SelectItem value="officer">Officer-Initiated</SelectItem>
                                        <SelectItem value="external">External Agency</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Button
                            onClick={addRule}
                            className="bg-blue-600 hover:bg-blue-700 font-mono"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            CREATE RULE
                        </Button>
                    </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white font-mono">ARCHIVE RULES</h2>
                            <Button
                                size="sm"
                                onClick={runArchive}
                                className="bg-purple-600 hover:bg-purple-700 font-mono text-xs"
                            >
                                <Play className="w-3 h-3 mr-2" />
                                RUN NOW
                            </Button>
                        </div>
                    </div>
                    <div className="p-4 space-y-2">
                        {rules.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 font-mono text-sm">
                                NO ARCHIVE RULES CONFIGURED
                            </div>
                        ) : (
                            rules.map((rule) => (
                                <div key={rule.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="text-white font-mono font-bold">{rule.name}</h3>
                                                <Badge className={rule.enabled 
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30 font-mono text-xs'
                                                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30 font-mono text-xs'
                                                }>
                                                    {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                                                <span><Clock className="w-3 h-3 inline mr-1" />{rule.days_threshold} days</span>
                                                <span>Agency: {rule.agency}</span>
                                                <span>Priority: {rule.priority}</span>
                                                <span>Source: {rule.source}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => toggleRule(rule.id)}
                                                className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600 font-mono text-xs"
                                            >
                                                {rule.enabled ? 'DISABLE' : 'ENABLE'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => deleteRule(rule.id)}
                                                className="bg-red-900 border-red-700 text-red-300 hover:bg-red-800 font-mono text-xs"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}