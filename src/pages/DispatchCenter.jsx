import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Shield, Radio, AlertCircle } from 'lucide-react';
import ActiveCallsQueue from '@/components/dispatch/ActiveCallsQueue';
import CallDetailPanel from '@/components/dispatch/CallDetailPanel';
import UnitsPanel from '@/components/dispatch/UnitsPanel';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitScheduling from '@/components/dispatch/UnitScheduling';
import MaintenanceTracking from '@/components/dispatch/MaintenanceTracking';
import QuickActions from '@/components/dispatch/QuickActions';

export default function DispatchCenter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [showMaintenance, setShowMaintenance] = useState(false);

    useEffect(() => {
        init();
        
        // Real-time updates every 10 seconds
        const interval = setInterval(() => {
            loadActiveCalls();
            loadUnits();
        }, 10000);
        
        return () => clearInterval(interval);
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
                status: { $in: ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'] }
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="max-w-[1920px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg">
                            <Radio className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                                CAD / Dispatch Console
                            </h1>
                            <p className="text-slate-400 text-sm">
                                {currentUser?.rank && currentUser?.last_name ? `${currentUser.rank} ${currentUser.last_name}` : currentUser?.full_name} • {currentUser?.unit_number || 'Dispatcher'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setShowPriorCalls(!showPriorCalls)}
                            variant="outline"
                            className="border-slate-600 text-black bg-white hover:bg-slate-100"
                        >
                            <AlertCircle className="w-4 h-4 mr-2" />
                            {showPriorCalls ? 'Active' : 'Prior'}
                        </Button>

                        <Button
                            onClick={() => setShowMaintenance(!showMaintenance)}
                            variant="outline"
                            className="border-slate-600 text-black bg-white hover:bg-slate-100"
                        >
                            Maintenance
                        </Button>
                        <Button
                            onClick={() => setShowMessaging(!showMessaging)}
                            variant="outline"
                            className="border-slate-600 text-black bg-white hover:bg-slate-100"
                        >
                            Messages
                        </Button>
                        <Button
                            onClick={() => setShowCreateDialog(true)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            <Radio className="w-4 h-4 mr-2" />
                            Call
                        </Button>
                        {currentUser?.role === 'admin' && (
                            <Button
                                variant="outline"
                                className="border-slate-600 text-black bg-white hover:bg-slate-100"
                                onClick={() => window.location.href = '/adminportal'}
                            >
                                <Shield className="w-4 h-4 mr-2" />
                                Admin
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="border-slate-600 text-black bg-white hover:bg-slate-100"
                            onClick={() => window.location.href = '/navigation'}
                        >
                            Map
                        </Button>
                    </div>
                </div>

                {showPriorCalls ? (
                    <PriorCallsView currentUser={currentUser} units={units} />
                ) : showMaintenance ? (
                    <MaintenanceTracking units={units} />
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
                            />
                        </div>

                        {/* Center: Call Detail */}
                        <div className="col-span-5">
                            <CallDetailPanel
                                call={selectedCall}
                                currentUser={currentUser}
                                onUpdate={handleUpdate}
                                units={units}
                            />
                        </div>

                        {/* Right: Units */}
                        <div className="col-span-4">
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