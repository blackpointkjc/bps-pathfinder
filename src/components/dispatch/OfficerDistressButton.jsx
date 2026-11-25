import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { getLiveLocation, subscribeLiveLocation } from '@/lib/liveLocationService';

// Hold for 2 seconds to activate
const HOLD_MS = 2000;

export default function OfficerDistressButton({ currentUser, className = '', compact = false }) {
    const [holding, setHolding] = useState(false);
    const [progress, setProgress] = useState(0);
    const [activated, setActivated] = useState(false);
    const holdTimer = useRef(null);
    const progressTimer = useRef(null);
    const startTime = useRef(null);
    const activeAlertIdRef = useRef(null);
    const sending = useRef(false);

    // Check if user already has an active distress alert on mount
    useEffect(() => {
        if (!currentUser?.id) return;
        base44.entities.OfficerDistress.filter({ officer_id: currentUser.id })
            .then(results => {
                const active=(results||[]).find(row=>['active','acknowledged','responders_enroute'].includes(row.status));
                if (active) {
                    activeAlertIdRef.current = active.id;
                    setActivated(true);
                }
            })
            .catch(() => {});
        const sub=base44.entities.OfficerDistress.subscribe(event=>{
            const row=event?.data;
            if(row?.officer_id!==currentUser.id)return;
            const active=['active','acknowledged','responders_enroute'].includes(row.status)&&event.type!=='delete';
            activeAlertIdRef.current=active?row.id:null;setActivated(active);
        });
        return()=>{sub?.();clearTimeout(holdTimer.current);clearInterval(progressTimer.current);};
    }, [currentUser?.id]);

    useEffect(() => {
        if (!activated) return undefined;
        let lastWrite = 0;
        return subscribeLiveLocation((fix) => {
            if (!activeAlertIdRef.current || Date.now()-fix.timestamp>15000 || Date.now() - lastWrite < 5000) return;
            lastWrite = Date.now();
            base44.functions.invoke('manageOfficerDistress',{action:'location',distress_id:activeAlertIdRef.current,location:{lat:fix.latitude,lon:fix.longitude}}).then(res=>{
                const data=res?.data||res||{};
                if(data.active===false){activeAlertIdRef.current=null;setActivated(false);}
            }).catch(()=>{});
        });
    }, [activated]);

    const startHold = (e) => {
        if (activated || holding || sending.current) return;
        e.preventDefault();
        e.currentTarget?.setPointerCapture?.(e.pointerId);
        setHolding(true);
        startTime.current = Date.now();

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
        setHolding(false);
        setProgress(0);
    };

    const triggerDistress = async () => {
        clearInterval(progressTimer.current);
        setHolding(false);
        setProgress(0);

        if(sending.current)return;
        sending.current=true;
        const liveFix=getLiveLocation(15000);
        const location=liveFix?{lat:liveFix.latitude,lon:liveFix.longitude}:null;

        try {
            const res = await base44.functions.invoke('manageOfficerDistress', { action: 'activate', location });
            const payload = res?.data || res || {};
            if (!payload.success || payload.error) throw new Error(payload.error || 'Distress not confirmed');
            activeAlertIdRef.current = payload.distress_id || null;
            setActivated(true);
            toast.error('🚨 OFFICER DISTRESS ACTIVATED — Help is being notified', { duration: 10000 });
            window.dispatchEvent(new CustomEvent('officer-distress-activated', { detail: { officer_id: currentUser.id, location, alert:payload.alert } }));
            // Ongoing distress coordinates are fed by the one app-wide live-location
            // service; this component never starts a second GPS watcher.
        } catch (err) {
            toast.error('Failed to send distress signal — try again');
            console.error(err);
        } finally {sending.current=false;}
    };

    const cancelDistress = async () => {
        if (!currentUser?.id || sending.current) return;
        sending.current=true;
        try {
            const res = await base44.functions.invoke('manageOfficerDistress', { action: 'clear' });
            const payload = res?.data || res || {};
            if (payload.error) throw new Error(payload.error);
            activeAlertIdRef.current = null;
            setActivated(false);
            window.dispatchEvent(new CustomEvent('officer-distress-cleared',{detail:{officer_id:currentUser.id}}));
            toast.success(payload.next_call_number?'Distress cleared. Next call: '+payload.next_call_number:'Distress alert cleared');
        } catch (err) {
            toast.error('Failed to cancel distress alert');
        } finally {sending.current=false;}
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
        <div className={`relative select-none ${compact?'pf-emergency-compact':''} ${className}`}>
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
                    {holding ? `HOLD... ${Math.round(progress)}%` : (compact?'SOS':'OFFICER DISTRESS')}
                </span>
            </button>
        </div>
    );
}