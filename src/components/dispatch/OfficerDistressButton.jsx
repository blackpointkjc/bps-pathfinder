import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { getLiveLocation, subscribeLiveLocation, waitForLiveLocation } from '@/lib/liveLocationService';

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
    const activeAlertIdRef = useRef(null);

    // Check if user already has an active distress alert on mount
    useEffect(() => {
        if (!currentUser?.id) return;
        base44.entities.OfficerDistress.filter({ officer_id: currentUser.id, status: 'active' })
            .then(results => {
                if (Array.isArray(results) && results.length > 0) {
                    activeAlertIdRef.current = results[0].id;
                    setActivated(true);
                }
            })
            .catch(() => {});
    }, [currentUser?.id]);

    useEffect(() => {
        if (!activated) return undefined;
        let lastWrite = 0;
        return subscribeLiveLocation((fix) => {
            if (!activeAlertIdRef.current || Date.now() - lastWrite < 3000) return;
            lastWrite = Date.now();
            base44.entities.OfficerDistress.update(activeAlertIdRef.current, {
                current_latitude: fix.latitude,
                current_longitude: fix.longitude,
                location_description: `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`,
            }).catch(() => {});
        });
    }, [activated]);

    const startHold = (e) => {
        if (activated || holding) return;
        e.preventDefault();
        e.currentTarget?.setPointerCapture?.(e.pointerId);
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

    const cancelHold = (e) => {
        if (e?.currentTarget && e?.pointerId !== undefined) {
            try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch (_) {}
        }
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

        let liveFix = getLiveLocation(10000);
        if (!liveFix) {
            try { liveFix = await waitForLiveLocation({ maxAgeMs: 10000, timeoutMs: 5000 }); } catch (_) {}
        }
        const coords = liveFix ? { lat: liveFix.latitude, lon: liveFix.longitude } : null;

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

            // Ongoing distress coordinates are fed by the one app-wide live-location
            // service; this component never starts a second GPS watcher.
        } catch (err) {
            toast.error('Failed to send distress signal — try again');
            console.error(err);
        }
    };

    const cancelDistress = async () => {
        if (!currentUser?.id) return;
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
                type="button"
                onPointerDown={startHold}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onLostPointerCapture={cancelHold}
                onContextMenu={e => e.preventDefault()}
                style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', pointerEvents: 'auto' }}
                className={`relative z-10 overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-mono font-bold text-xs transition-all cursor-pointer
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