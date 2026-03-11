import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Radio, RefreshCw, Shield, Filter, Search, X, Settings, WifiOff, Volume2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function NavigationRightControls({
    showActiveCalls, setShowActiveCalls, activeCalls,
    fetchActiveCalls, fetchOtherUnits, isLoadingCalls,
    setShowCallFilterPanel, setShowLayerFilters, setShowAddressLookup,
    setShowCallsList, setShowUnitSettingsPanel, setShowOfflineManager,
    voiceEnabled, setVoiceEnabled, mapTheme, setMapTheme, isOnline
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-1/2 translate-y-1/2 right-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
        >
            <Button
                onClick={() => {
                    const newState = !showActiveCalls;
                    setShowActiveCalls(newState);
                    if (newState && activeCalls.length === 0) fetchActiveCalls();
                    toast.success(newState ? 'Active calls visible' : 'Active calls hidden');
                }}
                size="sm"
                className={`${showActiveCalls ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 hover:bg-gray-500'} text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg flex items-center gap-1`}
            >
                <Radio className="w-3 h-3" />
                <span>{showActiveCalls ? 'ON' : 'OFF'}</span>
            </Button>
            <Button
                onClick={() => { fetchActiveCalls(false); fetchOtherUnits(); toast.success('Refreshed calls and units'); }}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg"
                disabled={isLoadingCalls}
            >
                <RefreshCw className={`w-3 h-3 ${isLoadingCalls ? 'animate-spin' : ''}`} />
            </Button>
            <Button
                onClick={() => setShowCallFilterPanel(true)}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg flex items-center gap-1"
                title="Filter by Agency"
            >
                <Shield className="w-3 h-3" />
            </Button>
            {activeCalls.length > 0 && showActiveCalls && (
                <Button
                    onClick={() => setShowCallsList(true)}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white text-[9px] px-2 py-1.5 rounded-lg shadow-lg"
                >
                    ({activeCalls.length})
                </Button>
            )}
            <Button onClick={() => setShowLayerFilters(true)} size="icon" className="h-8 w-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg" title="Layer Filters & Search">
                <Filter className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowAddressLookup(true)} size="icon" className="h-8 w-8 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-lg" title="AI Address Lookup">
                <Search className="w-4 h-4" />
            </Button>
            <Button
                onClick={() => { if (confirm('Are you sure you want to logout?')) base44.auth.logout(); }}
                size="sm"
                className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-lg flex items-center gap-2"
                title="Logout"
            >
                <X className="w-3 h-3" />
                <span className="text-xs font-semibold">Log Out</span>
            </Button>
            <Button
                onClick={() => {
                    const newTheme = mapTheme === 'day' ? 'night' : 'day';
                    setMapTheme(newTheme);
                    localStorage.setItem('mapTheme', newTheme);
                    toast.success(`${newTheme === 'day' ? '☀️ Day' : '🌙 Night'} mode`);
                }}
                size="icon"
                className={`h-8 w-8 rounded-lg shadow-lg ${mapTheme === 'night' ? 'bg-slate-800 hover:bg-slate-900 text-yellow-400' : 'bg-white hover:bg-gray-100 text-blue-600'}`}
                title="Toggle Day/Night Mode"
            >
                {mapTheme === 'night' ? '🌙' : '☀️'}
            </Button>
            <Button
                onClick={() => {
                    const newState = !voiceEnabled;
                    setVoiceEnabled(newState);
                    localStorage.setItem('voiceEnabled', newState);
                    toast.success(newState ? 'Voice guidance enabled' : 'Voice guidance disabled');
                }}
                size="icon"
                className={`h-8 w-8 rounded-lg backdrop-blur-xl shadow-lg border-white/20 ${voiceEnabled ? 'bg-[#007AFF] hover:bg-[#0056CC] text-white' : 'bg-white/95 hover:bg-white text-gray-600'}`}
            >
                <Volume2 className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowUnitSettingsPanel(true)} size="icon" className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white shadow-lg" title="Unit Settings">
                <Settings className="w-4 h-4" />
            </Button>
            <Button
                onClick={() => setShowOfflineManager(true)}
                size="icon"
                className={`h-8 w-8 rounded-lg shadow-lg ${!isOnline ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-700 hover:bg-slate-600'} text-white`}
                title="Offline Map Cache"
            >
                <WifiOff className="w-4 h-4" />
            </Button>
        </motion.div>
    );
}