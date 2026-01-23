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
            console.log('📋 Dispatch loaded units:', allUsers.length);
            console.log('📋 Units data:', allUsers);
            setUnits(allUsers);
        } catch (error) {
            console.error('Error loading units:', error);
            // Fallback: try to get users directly
            try {
                const directUsers = await base44.entities.User.list('-last_updated', 500);
                console.log('📋 Loaded users directly:', directUsers.length);
                setUnits(directUsers || []);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                setUnits([]);
            }
        }
    };

    const loadActiveCalls = async () => {
        try {
            const calls = await base44.entities.DispatchCall.list('-created_date', 200);
            
            // Archive calls older than 6 hours (EST time)
            const sixHoursAgo = new Date();
            sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);
            
            const recentCalls = [];
            for (const call of calls) {
                const callTime = new Date(call.created_date);
                if (callTime < sixHoursAgo) {
                    try {
                        await base44.entities.CallHistory.create({
                            time_received: call.time_received || call.created_date,
                            incident: call.incident,
                            location: call.location,
                            agency: call.agency,
                            status: call.status,
                            latitude: call.latitude,
                            longitude: call.longitude,
                            ai_summary: call.ai_summary,
                            archived_date: new Date().toISOString()
                        });
                        await base44.entities.DispatchCall.delete(call.id);
                    } catch (err) {
                        console.error('Archive error:', err);
                    }
                } else {
                    recentCalls.push(call);
                }
            }
            
            console.log('📞 Active calls:', recentCalls.length, '(archived old)');
            setActiveCalls(recentCalls);
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

                   <div className="grid grid-cols-3 gap-3 h-[calc(100vh-200px)]">
                       {/* Left: Active Calls - Split by Source */}
                       <div className="flex flex-col gap-2 h-full overflow-hidden">
                           <Card className="bg-slate-900 border-amber-500/30 flex-1 min-h-0 flex flex-col">
                               <div className="p-2 border-b border-amber-500/20">
                                   <h3 className="text-xs font-bold text-amber-400 font-mono">Active Police calls ({activeCalls.filter(c => c.source).length})</h3>
                               </div>
                               <div className="flex-1 overflow-y-auto p-2">
                                   {activeCalls.filter(c => c.source).length === 0 ? (
                                       <div className="text-xs text-slate-500 text-center mt-4">No scraper calls</div>
                                   ) : (
                                       activeCalls.filter(c => c.source).map(call => (
                                           <div 
                                               key={call.id}
                                               onClick={() => handleSelectCall(call)}
                                               className={`p-2 mb-1 rounded cursor-pointer border text-xs ${selectedCall?.id === call.id ? 'bg-blue-900/50 border-blue-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                                           >
                                               <div className="font-bold text-white truncate">{call.incident}</div>
                                               <div className="text-slate-400 truncate">{call.location}</div>
                                           </div>
                                       ))
                                   )}
                               </div>
                           </Card>
                           <Card className="bg-slate-900 border-red-500/30 flex-1 min-h-0 flex flex-col">
                               <div className="p-2 border-b border-red-500/20">
                                   <h3 className="text-xs font-bold text-red-400 font-mono">DISPATCH CALLS ({activeCalls.filter(c => !c.source).length})</h3>
                               </div>
                               <div className="flex-1 overflow-y-auto p-2">
                                   {activeCalls.filter(c => !c.source).length === 0 ? (
                                       <div className="text-xs text-slate-500 text-center mt-4">No dispatch calls</div>
                                   ) : (
                                       activeCalls.filter(c => !c.source).map(call => (
                                           <div 
                                               key={call.id}
                                               onClick={() => handleSelectCall(call)}
                                               className={`p-2 mb-1 rounded cursor-pointer border text-xs ${selectedCall?.id === call.id ? 'bg-blue-900/50 border-blue-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                                           >
                                               <div className="font-bold text-white truncate">{call.incident}</div>
                                               <div className="text-slate-400 truncate">{call.location}</div>
                                           </div>
                                       ))
                                   )}
                               </div>
                           </Card>
                       </div>

                       {/* Center: Call Detail */}
                       <div className="h-full overflow-hidden">
                           <CallDetailPanel
                               call={selectedCall}
                               currentUser={currentUser}
                               onUpdate={handleUpdate}
                               units={units}
                           />
                       </div>

                       {/* Right: Units & Assignment */}
                       <div className="flex flex-col gap-2 h-full overflow-hidden">
                           <Card className="bg-slate-900 border-blue-500/30 flex-1 min-h-0 flex flex-col">
                               <div className="p-2 border-b border-blue-500/20">
                                   <h3 className="text-xs font-bold text-blue-400 font-mono">UNIT ASSIGNMENT</h3>
                               </div>
                               <div className="flex-1 overflow-y-auto p-2">
                                   <UnitAssignmentPanel
                                       call={selectedCall}
                                       units={units}
                                       onUpdate={handleUpdate}
                                   />
                               </div>
                           </Card>
                           <Card className="bg-slate-900 border-green-500/30 flex-1 min-h-0 flex flex-col">
                               <div className="p-2 border-b border-green-500/20">
                                   <h3 className="text-xs font-bold text-green-400 font-mono">ACTIVE UNITS ({units.filter(u => u.status && u.status !== 'Out of Service').length})</h3>
                               </div>
                               <div className="flex-1 overflow-y-auto p-2">
                                   {units.length === 0 ? (
                                       <div className="text-xs text-slate-500 text-center mt-4">Loading units...</div>
                                   ) : units.filter(u => u.status && u.status !== 'Out of Service').length === 0 ? (
                                       <div className="text-xs text-slate-500 text-center mt-4">No active units</div>
                                   ) : (
                                       units.filter(u => u.status && u.status !== 'Out of Service').map(unit => (
                                           <div key={unit.id} className="p-2 mb-1 rounded bg-slate-800 border border-slate-700">
                                               <div className="flex items-center justify-between">
                                                   <div className="text-xs font-bold text-white truncate">{unit.unit_number || unit.full_name}</div>
                                                   <div className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                       unit.status === 'Available' ? 'bg-green-600' :
                                                       unit.status === 'Enroute' ? 'bg-yellow-600' :
                                                       unit.status === 'On Scene' ? 'bg-blue-600' :
                                                       'bg-gray-600'
                                                   } text-white`}>{unit.status}</div>
                                               </div>
                                               {unit.current_call_info && (
                                                   <div className="text-[10px] text-slate-400 mt-1 truncate">{unit.current_call_info}</div>
                                               )}
                                           </div>
                                       ))
                                   )}
                               </div>
                           </Card>
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