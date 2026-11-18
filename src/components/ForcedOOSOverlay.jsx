import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PhoneCall, ShieldAlert, LogOut } from 'lucide-react';

// Company office number — sourced from PayrollConfig (855-827-7911).
// Kept as a constant so the overlay renders even during a network-dropout logout.
const OFFICE_PHONE = '855-827-7911';
const OFFICE_PHONE_TEL = OFFICE_PHONE.replace(/[^0-9]/g, '');

export default function ForcedOOSOverlay() {
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const handler = (event) => {
      setNotice({
        reason: event.detail?.reason || 'An authorized user has placed you Out of Service.',
        issuedBy: event.detail?.issuedBy || null,
      });
    };
    window.addEventListener('bps:forced-oos', handler);
    return () => window.removeEventListener('bps:forced-oos', handler);
  }, []);

  const acknowledge = () => {
    window.dispatchEvent(new CustomEvent('bps:forced-oos-acknowledged'));
    setNotice(null);
  };

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 12, opacity: 0 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-red-600/70 bg-[#0b1523] shadow-[0_0_60px_rgba(239,68,68,.4)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-red-700/60 bg-red-950/70 px-5 py-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-red-400 bg-red-600/20">
                <ShieldAlert className="h-7 w-7 animate-pulse text-red-300" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-red-300">Duty Status Override</div>
                <div className="text-lg font-black leading-tight text-white">Placed Out of Service</div>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed text-slate-200">
                Your duty status has been changed to <span className="font-bold text-red-300">Out of Service</span> by an
                authorized supervisor or dispatcher. You are being signed out of Pathfinder and cannot return until the
                override is released.
              </p>

              {notice.reason && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Reason</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-100">{notice.reason}</p>
                </div>
              )}

              {/* Call-to-action: call the office */}
              <div className="rounded-xl border border-amber-500/50 bg-amber-950/25 p-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-amber-300">
                  <PhoneCall className="h-4 w-4" /> Contact the Office
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                  Please call the office immediately for instructions before your next shift.
                </p>
                <a
                  href={`tel:${OFFICE_PHONE_TEL}`}
                  className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-amber-400/60 bg-amber-600 px-4 py-3 text-base font-black text-white shadow-lg hover:bg-amber-500"
                >
                  <PhoneCall className="h-5 w-5" />
                  {OFFICE_PHONE}
                </a>
              </div>

              {/* Acknowledge */}
              <button
                type="button"
                onClick={acknowledge}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-black text-slate-100 hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" /> Acknowledge & Sign Out
              </button>
              <p className="text-center text-[10px] text-slate-500">
                Acknowledging will sign you out of Pathfinder.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}