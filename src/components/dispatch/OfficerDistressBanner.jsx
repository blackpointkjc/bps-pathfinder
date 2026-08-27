import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, MapPin, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function timeStr(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        const a = data.address || {};
        return [
            a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || '',
            a.city || a.town || a.village || a.county || ''
        ].filter(Boolean).join(', ') || data.display_name?.split(',').slice(0,2).join(',') || null;
    } catch { return null; }
}

export default function OfficerDistressBanner({ currentUser, isDispatchOrAdmin = false }) {
    const [alerts, setAlerts] = useState([]);
    const [dismissed, setDismissed] = useState(new Set());
    const [addresses, setAddresses] = useState({});  // alertId -> address string
    const geocodedRef = useRef(new Set());

    const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'acknowledged' || a.status === 'responders_enroute');
    const visible = activeAlerts.filter(a => !dismissed.has(a.id));
    // Spoken emergency traffic is handled once by the durable CallStatusLog
    // announcement path. The distress banner stays visual-only so it never
    // starts a repeating siren or a second AudioContext.

    const fetchAlerts = () => {
        base44.entities.OfficerDistress.list('-activated_at', 20)
            .then(all => {
                const active = all.filter(a => ['active', 'acknowledged', 'responders_enroute'].includes(a.status));
                setAlerts(active);
                // Reverse geocode any alert we haven't geocoded yet
                active.forEach(alert => {
                    const lat = alert.current_latitude || alert.latitude;
                    const lon = alert.current_longitude || alert.longitude;
                    if (lat && lon && !geocodedRef.current.has(alert.id)) {
                        geocodedRef.current.add(alert.id);
                        reverseGeocode(lat, lon).then(addr => {
                            if (addr) setAddresses(prev => ({ ...prev, [alert.id]: addr }));
                        });
                    }
                });
            })
            .catch(() => {});
    };

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 30000);
        // Also listen for immediate local events
        const handler = () => fetchAlerts();
        window.addEventListener('officer-distress-activated', handler);
        return () => {
            clearInterval(interval);
            window.removeEventListener('officer-distress-activated', handler);
        };
    }, []);

    const handleAcknowledge = async (alert) => {
        if (!currentUser || !isDispatchOrAdmin) return;
        try {
            await base44.entities.OfficerDistress.update(alert.id, {
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString(),
                acknowledged_by: currentUser.id,
                acknowledged_by_name: `${currentUser.rank ? `${currentUser.rank} ` : ''}${currentUser.last_name || currentUser.full_name || 'Dispatch'}`.trim(),
            });
            fetchAlerts();
        } catch (e) {}
    };

    const handleResponders = async (alert) => {
        if (!currentUser || !isDispatchOrAdmin) return;
        try {
            await base44.entities.OfficerDistress.update(alert.id, { status: 'responders_enroute' });
            fetchAlerts();
        } catch (e) {}
    };

    const handleClear = async (alert) => {
        if (!currentUser || !isDispatchOrAdmin) return;
        try {
            await base44.functions.invoke('manageOfficerDistress', { action: 'clear', officer_id: alert.officer_id });
            fetchAlerts();
        } catch (e) {}
    };

    if (visible.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[99999] pointer-events-none flex flex-col">
            <AnimatePresence>
                {visible.map((alert) => (
                    <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, y: -60 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -60 }}
                        className="pointer-events-auto"
                    >
                        {/* Full-width flashing emergency banner */}
                        <div className={`relative overflow-hidden border-b-4 border-red-500 px-4 py-3 ${
                            alert.status === 'active' ? 'bg-red-950' : 
                            alert.status === 'acknowledged' ? 'bg-orange-950' : 'bg-amber-950'
                        }`}
                            style={{ animation: alert.status === 'active' ? 'distress-flash 1s ease-in-out infinite' : 'none' }}
                        >
                            {/* Animated background pulse */}
                            {alert.status === 'active' && (
                                <div className="absolute inset-0 bg-red-500/10 animate-ping" style={{ animationDuration: '1.5s' }} />
                            )}

                            <div className="relative flex items-start gap-4 max-w-6xl mx-auto">
                                {/* Icon */}
                                <div className="flex-shrink-0 mt-0.5">
                                    <AlertTriangle className={`w-7 h-7 text-red-400 ${alert.status === 'active' ? 'animate-bounce' : ''}`} />
                                </div>

                                {/* Main content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-red-300 font-mono font-black text-lg tracking-widest">
                                            🚨 OFFICER IN DISTRESS
                                        </span>
                                        <span className={`text-xs font-mono px-2 py-0.5 rounded font-bold border ${
                                            alert.status === 'active' ? 'bg-red-500/30 border-red-500 text-red-200' :
                                            alert.status === 'acknowledged' ? 'bg-orange-500/30 border-orange-500 text-orange-200' :
                                            'bg-amber-500/30 border-amber-500 text-amber-200'
                                        }`}>
                                            {alert.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="text-white font-mono font-bold text-base mt-1">
                                        UNIT {alert.unit_number || '???'} — {alert.rank ? `${String(alert.rank).toUpperCase()} ` : ''}{String(alert.last_name || alert.officer_name || '').toUpperCase()}
                                    </div>

                                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5">
                                        {(alert.latitude || alert.current_latitude) && (
                                            <span className="text-red-300 text-xs font-mono flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {addresses[alert.id]
                                                    ? addresses[alert.id]
                                                    : `${(alert.current_latitude ?? alert.latitude ?? 0).toFixed(4)}, ${(alert.current_longitude ?? alert.longitude ?? 0).toFixed(4)}`
                                                }
                                            </span>
                                        )}
                                        <span className="text-red-400 text-xs font-mono flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            ACTIVATED: {timeStr(alert.activated_at)}
                                        </span>
                                        {alert.acknowledged_by_name && (
                                            <span className="text-orange-400 text-xs font-mono">
                                                ACK BY: {alert.acknowledged_by_name} @ {timeStr(alert.acknowledged_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action buttons (dispatch/admin only) */}
                                {isDispatchOrAdmin && (
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {alert.status === 'active' && (
                                            <button
                                                onClick={() => handleAcknowledge(alert)}
                                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-mono font-bold text-xs rounded-lg border border-orange-400"
                                            >
                                                ACKNOWLEDGE
                                            </button>
                                        )}
                                        {(alert.status === 'active' || alert.status === 'acknowledged') && (
                                            <button
                                                onClick={() => handleResponders(alert)}
                                                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white font-mono font-bold text-xs rounded-lg border border-blue-500"
                                            >
                                                RESPONDERS EN ROUTE
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleClear(alert)}
                                            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white font-mono font-bold text-xs rounded-lg border border-green-500"
                                        >
                                            CLEAR
                                        </button>
                                        <button
                                            onClick={() => setDismissed(d => new Set([...d, alert.id]))}
                                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-600"
                                            title="Dismiss from view (alert stays active)"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            <style>{`
                @keyframes distress-flash {
                    0%, 100% { background-color: rgb(69 10 10); }
                    50% { background-color: rgb(127 29 29); }
                }
            `}</style>
        </div>
    );
}