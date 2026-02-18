import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Shield, Radio, AlertCircle, Car, Map as MapIcon, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { createPageUrl } from '../utils';
import { MapContainer, TileLayer } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import ActiveCallsQueue from '@/components/dispatch/ActiveCallsQueue';
import CallDetailPanel from '@/components/dispatch/CallDetailPanel';
import UnitsPanel from '@/components/dispatch/UnitsPanel';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitScheduling from '@/components/dispatch/UnitScheduling';
import QuickActions from '@/components/dispatch/QuickActions';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';
import 'leaflet/dist/leaflet.css';

// Play a dispatch alert tone using Web Audio API
function playDispatchAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const tones = [
            { freq: 880, start: 0, duration: 0.12 },
            { freq: 1100, start: 0.15, duration: 0.12 },
            { freq: 880, start: 0.30, duration: 0.12 },
            { freq: 1100, start: 0.45, duration: 0.18 },
        ];
        tones.forEach(({ freq, start, duration }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
            gain.gain.setValueAtTime(0, ctx.currentTime + start);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + duration + 0.05);
        });
    } catch (e) {
        // silently fail if audio not available
    }
}

export default function DispatchCenter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [sortOrder, setSortOrder] = useState('desc');
    const [showMap, setShowMap] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const knownCallIdsRef = React.useRef(null);

    useEffect(() => {
        init();
        
        // Real-time updates every 60 seconds
        const interval = setInterval(() => {
            loadActiveCalls();
            loadUnits();
        }, 60000);
        
        // Auto-scrape every 60 seconds for real-time feed
        const scrapeInterval = setInterval(async () => {
            try {
                const result = await base44.functions.invoke('scrapeActiveCalls', {});
                console.log('✅ Auto-scraped:', result.data?.saved || 0, 'calls');
            } catch (error) {
                console.error('Auto-scrape failed:', error);
            }
        }, 60000);
        
        return () => {
            clearInterval(interval);
            clearInterval(scrapeInterval);
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
            const allUsers = await base44.entities.User.list('-last_updated', 500);
            console.log('📋 Dispatch loaded units:', allUsers.length);
            console.log('📋 Units data:', allUsers);
            setUnits(allUsers || []);
        } catch (error) {
            console.error('Error loading units:', error);
            setUnits([]);
        }
    };

    const loadActiveCalls = async () => {
       try {
            const calls = await base44.entities.DispatchCall.list('-created_date', 200);

            const sixHoursAgo = new Date();
            sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

            const recentCalls = calls.filter(call => {
                const callTime = new Date(call.time_received || call.created_date);
                const isRecent = callTime >= sixHoursAgo;
                const isActive = call.status && !['Closed', 'Cleared', 'Cancelled'].includes(call.status);
                return isRecent && isActive;
            });

            recentCalls.sort((a, b) => {
                const timeA = new Date(a.time_received || a.created_date);
                const timeB = new Date(b.time_received || b.created_date);
                return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });

            // Detect new calls and play alert
            const currentIds = new Set(recentCalls.map(c => c.id));
            if (knownCallIdsRef.current === null) {
                // First load — just record IDs, don't alert
                knownCallIdsRef.current = currentIds;
            } else {
                const newCallIds = [...currentIds].filter(id => !knownCallIdsRef.current.has(id));
                if (newCallIds.length > 0 && soundEnabled) {
                    playDispatchAlert();
                    toast.info(`${newCallIds.length} new call${newCallIds.length > 1 ? 's' : ''} received`, {
                        duration: 4000,
                        style: { background: '#1e3a5f', color: 'white', border: '1px solid #3b82f6' }
                    });
                }
                knownCallIdsRef.current = currentIds;
            }

            console.log('📞 Dispatch active calls:', recentCalls.length);
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

    // Re-sort calls when sortOrder changes
    useEffect(() => {
        const sorted = [...activeCalls].sort((a, b) => {
            const timeA = new Date(a.time_received || a.created_date);
            const timeB = new Date(b.time_received || b.created_date);
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
        setActiveCalls(sorted);
    }, [sortOrder]);

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
                             <div className="flex gap-2 ml-4">
                                 <Button 
                                     size="sm"
                                     className={`font-mono text-xs ${sortOrder === 'desc' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                                     onClick={() => setSortOrder('desc')}
                                 >
                                     NEWEST
                                 </Button>
                                 <Button 
                                     size="sm"
                                     className={`font-mono text-xs ${sortOrder === 'asc' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                                     onClick={() => setSortOrder('asc')}
                                 >
                                     OLDEST
                                 </Button>
                             </div>
                         </div>
                        
                        <div className="flex gap-2">
                          <Button
                              onClick={() => setSoundEnabled(!soundEnabled)}
                              variant="outline"
                              className={`border-slate-700 font-mono text-xs ${soundEnabled ? 'text-green-400 bg-slate-800 hover:bg-slate-700' : 'text-slate-500 bg-slate-800 hover:bg-slate-700'}`}
                              title={soundEnabled ? 'Mute alerts' : 'Unmute alerts'}
                          >
                              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          </Button>
                          <Button
                              onClick={() => setShowMap(!showMap)}
                               variant="outline"
                               className={`border-slate-700 font-mono text-xs ${showMap ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-slate-300 bg-slate-800 hover:bg-slate-700'}`}
                           >
                               <MapIcon className="w-4 h-4 mr-2" />
                               MAP
                           </Button>
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

                   <div className={`grid ${showMap ? 'grid-cols-4' : 'grid-cols-3'} gap-3 h-[calc(100vh-200px)]`}>
                       {/* Map View */}
                       {showMap && (
                           <div className="h-full overflow-hidden col-span-2">
                               <Card className="bg-slate-900 border-emerald-500/30 h-full flex flex-col">
                                   <div className="p-2 border-b border-emerald-500/20">
                                       <h3 className="text-xs font-bold text-emerald-400 font-mono">LIVE TACTICAL MAP</h3>
                                   </div>
                                   <div className="flex-1 relative">
                                       <MapContainer
                                           center={[37.5407, -77.4360]}
                                           zoom={11}
                                           className="h-full w-full"
                                           zoomControl={true}
                                       >
                                           <TileLayer
                                               url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                               attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                                           />
                                           <ActiveCallMarkers 
                                               calls={activeCalls} 
                                               onCallClick={handleSelectCall}
                                           />
                                       </MapContainer>
                                   </div>
                               </Card>
                           </div>
                       )}
                       
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
                                               <div className="text-slate-500 font-mono mt-0.5">
                                                   {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} EST
                                               </div>
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
                                               <div className="text-slate-500 font-mono mt-0.5">
                                                   {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} EST
                                               </div>
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