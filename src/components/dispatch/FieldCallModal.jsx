import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio } from 'lucide-react';
import FieldCallActions from './FieldCallActions';

export default function FieldCallModal({ call, onClose }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <AnimatePresence>
      {call && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`fixed inset-0 bg-black/60 z-[3000] ${isMobile ? 'flex items-end' : 'flex items-center justify-center p-4'}`}
          onClick={onClose}
        >
          <motion.div
            initial={isMobile ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
            exit={isMobile ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className={isMobile ? 'w-full rounded-t-lg' : 'w-full max-w-md'}
          >
            <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-gold" />
                  <span className="text-xs font-mono font-black tracking-widest text-gold">FIELD UNIT CONSOLE</span>
                </div>
                <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 max-h-[80vh] overflow-y-auto">
                <FieldCallActions call={call} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}