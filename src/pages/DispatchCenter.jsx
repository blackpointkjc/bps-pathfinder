import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Shield, Radio, AlertCircle, Car } from 'lucide-react';
import { createPageUrl } from '../utils';
import ActiveCallsQueue from '@/components/dispatch/ActiveCallsQueue';
import CallDetailPanel from '@/components/dispatch/CallDetailPanel';
import UnitsPanel from '@/components/dispatch/UnitsPanel';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitScheduling from '@/components/dispatch/UnitScheduling';
import QuickActions from '@/components/dispatch/QuickActions';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';

export default function DispatchCenter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);

    useEffect(() => {
        init();
        
        // Real-time updates every 10 seconds
        const interval = setInterval(() => {
            loadActiveCalls();
            loadUnits();
        }, 10000);
        
        // Auto-close old calls every minute
        const autoCloseInterval = setInterval(async () => {
            try {
                await base44.functions.invoke('autoCloseOldCalls', {});
            } catch (error) {
                console.error('Error auto-closing calls:', error);
            }
        }, 60000); // Every minute
        
        return () => {
            clearInterval(interval);
            clearInterval(autoCloseInterval);
        };
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Check if user has dispatch access
            const hasDispatchAccess = user.role === 'admin' || user.dispatch_role === true;
            
            if (!hasDispatchAccess) {
                toast.error('Unauthorized - Dispatch access required');
                window.location.href = '/navigation';
                return;
            }

            await Promise.all([
                loadUnits(),
                loadActiveCalls()
            ]);
        } catch (error) {
            console.error('Error initializing:', error);
            toast.error('Failed to load dispatch center');
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async () => {
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const allUsers = response.data?.users || [];
            setUnits(allUsers);
        } catch (error) {
            console.error('Error loading units:', error);
        }
    };

    const loadActiveCalls = async () => {
        try {
            const calls = await base44.entities.DispatchCall.filter({
                status: { $in: ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'] },
                created_by: { $ne: 'system_scraper' }
            });
            setActiveCalls(calls || []);
        } catch (error) {
            console.error('Error loading active calls:', error);
        }
    };

    const handleSelectCall = (call) => {
        setSelectedCall(call);
    };

    const handleCallCreated = async () => {
        setShowCreateDialog(false);
        await loadActiveCalls();
        toast.success('Call created and dispatched');
    };

    const [quickCallType, setQuickCallType] = useState(null);
    
    const handleQuickDispatch = (callType) => {
        setQuickCallType(callType);
        setShowCreateDialog(true);
    };

    const handleUpdate = async () => {
        await loadActiveCalls();
        await loadUnits();
        
        // Refresh selected call if it exists
        if (selectedCall) {
            const updatedCall = activeCalls.find(c => c.id === selectedCall.id);
            if (updatedCall) {
                setSelectedCall(updatedCall);
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <div className="bg-slate-900 border-b-2 border-blue-500/30 shadow-lg">
                <div className="px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => window.location.href = createPageUrl('CADHome')}
                                className="text-slate-400 hover:text-white"
                            >
                                ← BACK
                            </Button>
                            <div className="h-6 w-px bg-slate-700" />
                            <Radio className="w-6 h-6 text-red-400" />
                            <h1 className="text-xl font-bold text-white tracking-tight font-mono">DISPATCH CENTER</h1>
                        </div>
                        
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowPriorCalls(!showPriorCalls)}
                                variant="outline"
                                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                <AlertCircle className="w-4 h-4 mr-2" />
                                {showPriorCalls ? 'ACTIVE' : 'PRIOR'}
                            </Button>
                            <Button
                                onClick={() => setShowMessaging(!showMessaging)}
                                variant="outline"
                                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                            >
                                MESSAGES
                            </Button>
                            <Button
                                onClick={() => setShowCreateDialog(true)}
                                className="bg-red-600 hover:bg-red-700 font-mono text-xs"
                            >
                                <Radio className="w-4 h-4 mr-2" />
                                NEW CALL
                            </Button>
                            {currentUser?.role === 'admin' && (
                                <Button
                                    variant="outline"
                                    className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                    onClick={() => window.location.href = createPageUrl('AdminPortal')}
                                >
                                    <Shield className="w-4 h-4 mr-2" />
                                    ADMIN
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 font-mono text-xs"
                                onClick={() => window.location.href = createPageUrl('Navigation')}
                            >
                                MAP
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4">

                {showPriorCalls ? (
                    <PriorCallsView currentUser={currentUser} units={units} />
                ) : (
                    <>
                    {/* Quick Actions Bar */}
                    <div className="mb-4">
                        <QuickActions onCreateCall={handleQuickDispatch} />
                    </div>
                    
                    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)]">
                        {/* Left: Active Calls Queue */}
                        <div className="col-span-3">
                            <ActiveCallsQueue
                                calls={activeCalls}
                                selectedCallId={selectedCall?.id}
                                onSelectCall={handleSelectCall}
                                units={units}
                                onUpdate={handleUpdate}
                            />
                        </div>

                        {/* Center: Call Detail */}
                        <div className="col-span-4">
                            <CallDetailPanel
                                call={selectedCall}
                                currentUser={currentUser}
                                onUpdate={handleUpdate}
                                units={units}
                            />
                        </div>

                        {/* Right: Unit Assignment & Units Panel */}
                        <div className="col-span-5 space-y-4">
                            <UnitAssignmentPanel
                                call={selectedCall}
                                units={units}
                                onUpdate={handleUpdate}
                            />
                            <UnitsPanel
                                units={units}
                                selectedCall={selectedCall}
                                currentUser={currentUser}
                                onUpdate={handleUpdate}
                            />
                        </div>
                    </div>
                    </>
                )}
            </div>

            {/* Messaging Panel */}
            <MessagingPanel
                currentUser={currentUser}
                units={units}
                isOpen={showMessaging}
                onClose={() => setShowMessaging(false)}
            />

            {/* Create Call Dialog */}
            {showCreateDialog && (
                <CreateCallDialog
                    units={units}
                    currentUser={currentUser}
                    onClose={() => {
                        setShowCreateDialog(false);
                        setQuickCallType(null);
                    }}
                    onCreated={handleCallCreated}
                    initialCallType={quickCallType?.type}
                    initialPriority={quickCallType?.priority}
                />
            )}
        </div>
    );
}