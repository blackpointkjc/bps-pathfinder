import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

// Hold for 2 seconds to activate
const HOLD_MS = 2000;

// Police-style yelp/warble tone during hold
function startYelpTone() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.5, ctx.currentTime);

        // Yelp: rapid sweep 600Hz → 1400Hz → 600Hz repeating
        const duration = HOLD_MS / 1000; // 2 seconds
        const sweepRate = 6; // sweeps per second
        const sweepCount = Math.floor(duration * sweepRate);
        for (let i = 0; i < sweepCount; i++) {
            const t = ctx.currentTime + (i / sweepRate);
            const half = 1 / sweepRate / 2;
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.linearRampToValueAtTime(1400, t + half);
            osc.frequency.linearRampToValueAtTime(600, t + half * 2);
        }
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
        osc.onended = () => ctx.close();
        return ctx;
    } catch (e) {
        return null;
    }
}

export default function OfficerDistressButton({ currentUser, className = '' }) {
    const [holding, setHolding] = useState(false);
    const [progress, setProgress] = useState(0);
    const [activated, setActivated] = useState(false);
    const holdTimer = useRef(null);
    const progressTimer = useRef(null);
    const startTime = useRef(null);
    const audioCtxRef = useRef(null);
    const watchIdRef = useRef(null);
    const activeAlertIdRef = useRef(null);

    // Check if user already has an active distress alert on mount
    useEffect(() => {
        if (!currentUser?.id) return;
        base44.entities.OfficerDistress.filter({ officer_id: currentUser.id, status: 'active' })
            .then(results => { if (Array.isArray(results) && results.length > 0) setActivated(true); })
            .catch(() => {});
    }, [currentUser?.id]);

    const startHold = (e) => {
        e.preventDefault();
        if (activated) return;
        setHolding(true);
        startTime.current = Date.now();

        // Start police yelp tone immediately on hold
        audioCtxRef.current = startYelpTone();

        progressTimer.current = setInterval(() => {
            const elapsed = Date.now() - startTime.current;
            setProgress(Math.min((elapsed / HOLD_MS) * 100, 100));
        }, 30);

        holdTimer.current = setTimeout(() => {
            triggerDistress();
        }, HOLD_MS);
    };

    const cancelHold = () => {
        clearTimeout(holdTimer.current);
        clearInterval(progressTimer.current);
        try { audioCtxRef.current?.close(); } catch(e) {}
        audioCtxRef.current = null;
        setHolding(false);
        setProgress(0);
    };

    const triggerDistress = async () => {
        clearInterval(progressTimer.current);
        setHolding(false);
        setProgress(0);

        // Get GPS
        const getCoords = () => new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        });

        const coords = await getCoords();

        const distressData = {
            officer_id: currentUser.id,
            officer_name: currentUser.full_name || 'Unknown Officer',
            unit_number: currentUser.unit_number || '???',
            rank: currentUser.rank || '',
            last_name: currentUser.last_name || currentUser.full_name?.split(' ').pop() || '',
            latitude: coords?.lat || null,
            longitude: coords?.lon || null,
            current_latitude: coords?.lat || null,
            current_longitude: coords?.lon || null,
            location_description: coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : 'Location unavailable',
            status: 'active',
            activated_at: new Date().toISOString(),
        };

        try {
            const created = await base44.entities.OfficerDistress.create(distressData);
            activeAlertIdRef.current = created.id;
            setActivated(true);
            toast.error('🚨 OFFICER DISTRESS ACTIVATED — Help is being notified', { duration: 10000 });
            window.dispatchEvent(new CustomEvent('officer-distress-activated', { detail: distressData }));

            // Start live GPS tracking — update record continuously
            if (navigator.geolocation) {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    (pos) => {
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        if (activeAlertIdRef.current) {
                            base44.entities.OfficerDistress.update(activeAlertIdRef.current, {
                                current_latitude: lat,
                                current_longitude: lon,
                                location_description: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                            }).catch(() => {});
                        }
                        // Also update user's own location so they appear on the map for everyone
                        base44.auth.updateMe({
                            latitude: lat, longitude: lon,
                            last_updated: new Date().toISOString()
                        }).catch(() => {});
                    },
                    () => {},
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            }
        } catch (err) {
            toast.error('Failed to send distress signal — try again');
            console.error(err);
        }
    };

    const cancelDistress = async () => {
        if (!currentUser?.id) return;
        // Stop live GPS watch
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        try {
            const alerts = await base44.entities.OfficerDistress.filter({ officer_id: currentUser.id, status: 'active' });
            for (const alert of alerts) {
                await base44.entities.OfficerDistress.update(alert.id, {
                    status: 'cleared',
                    cleared_at: new Date().toISOString(),
                    cleared_by: currentUser.id,
                    cleared_by_name: currentUser.full_name,
                    notes: 'Officer self-cancelled'
                });
            }
            activeAlertIdRef.current = null;
            setActivated(false);
            toast.success('Distress alert cancelled');
        } catch (err) {
            toast.error('Failed to cancel distress alert');
        }
    };

    if (!currentUser) return null;

    if (activated) {
        return (
            <button
                onClick={cancelDistress}
                className={`flex items-center gap-2 px-4 py-2 bg-red-600 border-2 border-red-400 rounded-xl text-white font-mono font-bold text-xs animate-pulse shadow-lg shadow-red-900/60 ${className}`}
            >
                <AlertTriangle className="w-4 h-4 animate-bounce" />
                DISTRESS ACTIVE — TAP TO CANCEL
            </button>
        );
    }

    return (
        <div className={`relative select-none ${className}`}>
            <button
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
                className={`relative overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-mono font-bold text-xs transition-all
                    ${holding
                        ? 'bg-red-700 border-red-400 text-white scale-95'
                        : 'bg-red-950/60 border-red-600/60 text-red-400 hover:bg-red-900/60 hover:border-red-500 hover:text-red-300'
                    }`}
                title="Hold 2 seconds to activate Officer Distress"
            >
                {/* Progress bar fill */}
                {holding && (
                    <div
                        className="absolute inset-0 bg-red-500/40 transition-none"
                        style={{ width: `${progress}%` }}
                    />
                )}
                <AlertTriangle className={`w-4 h-4 relative z-10 ${holding ? 'animate-pulse' : ''}`} />
                <span className="relative z-10">
                    {holding ? `HOLD... ${Math.round(progress)}%` : 'OFFICER DISTRESS'}
                </span>
            </button>
        </div>
    );
}