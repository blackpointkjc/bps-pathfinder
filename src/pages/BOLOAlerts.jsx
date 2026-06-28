import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertOctagon, Plus, Search, Edit2, CheckCircle, XCircle, User, Car, Shield, Bell, Eye, FileWarning } from 'lucide-react';
import BOLOModal from '@/components/bolo/BOLOModal';

export const TYPE_CONFIG = {
  wanted_person:      { label: 'WANTED',         icon: User,        border: 'border-red-500/60',    badge: 'bg-red-900/60 text-red-300 border-red-500/60' },
  missing_person:     { label: 'MISSING',         icon: User,        border: 'border-orange-500/60', badge: 'bg-orange-900/60 text-orange-300 border-orange-500/60' },
  stolen_vehicle:     { label: 'STOLEN VEH',      icon: Car,         border: 'border-yellow-500/60', badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-500/60' },
  officer_safety:     { label: 'OFFICER SAFETY',  icon: Shield,      border: 'border-red-500',       badge: 'bg-red-900 text-red-200 border-red-400' },
  special_instruction:{ label: 'SPECIAL',         icon: Bell,        border: 'border-blue-500/60',   badge: 'bg-blue-900/60 text-blue-300 border-blue-500/60' },
  property_alert:     { label: 'PROPERTY',        icon: FileWarning, border: 'border-purple-500/60', badge: 'bg-purple-900/60 text-purple-300 border-purple-500/60' },
  watch_notice:       { label: 'WATCH',           icon: Eye,         border: 'border-teal-500/60',   badge: 'bg-teal-900/60 text-teal-300 border-teal-500/60' },
};

export const PRIORITY_STYLE = {
  critical: 'bg-red-900/70 text-red-200 border-red-500',
  high:     'bg-orange-900/70 text-orange-200 border-orange-500',
  medium:   'bg-yellow-900/70 text-yellow-200 border-yellow-500',
  low:      'bg-slate-700 text-slate-300 border-slate-500',
};

export default function BOLOAlerts() {
  const [bolos, setBolos]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeFilter, setType]   = useState('all');
  const [statusFilter, setStatus] = useState('active');
  const [modal, setModal]       = useState(null);
  const [user, setUser]         = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.BOLOAlert.list('-created_date', 200);
    setBolos(data || []);
    setLoading(false);
  };

  const canEdit = user?.role === 'admin' || user?.role === 'dispatch';

  const filtered = bolos.filter(b => {
    if (typeFilter !== 'all' && b.alert_type !== typeFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [b.title, b.description, b.subject_name, b.vehicle_plate, b.case_number].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  const updateStatus = async (bolo, status, e) => {
    e?.stopPropagation();
    await base44.entities.BOLOAlert.update(bolo.id, { status });
    load();
  };

  const counts = Object.keys(TYPE_CONFIG).reduce((a, t) => {
    a[t] = bolos.filter(b => b.alert_type === t && b.status === 'active').length;
    return a;
  }, {});

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-slate-800 px-6 py-3 flex items-center gap-4">
        <AlertOctagon className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-black font-mono tracking-widest">BOLO / ALERTS BOARD</h1>
          <p className="text-[9px] text-slate-500 font-mono tracking-widest">BE ON THE LOOKOUT — ACTIVE NOTICES</p>
        </div>
        <div className="flex-1" />
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, plate, case #..."
            className="pl-8 pr-4 h-8 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-gold w-56" />
        </div>
        {canEdit && (
          <button onClick={() => setModal({ mode: 'create', bolo: { alert_type: 'wanted_person', priority: 'medium', status: 'active' } })}
            className="flex items-center gap-1.5 px-3 h-8 bg-red-700 hover:bg-red-600 text-white text-xs font-mono font-bold rounded border border-red-500 transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> NEW BOLO
          </button>
        )}
      </div>

      {/* Type Filters */}
      <div className="flex-none border-b border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
        <button onClick={() => setType('all')}
          className={`px-2.5 h-6 text-[10px] font-mono font-bold rounded border transition-colors whitespace-nowrap ${typeFilter === 'all' ? 'bg-gold/20 text-gold border-gold/50' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}>
          ALL ({bolos.filter(b => b.status === 'active').length})
        </button>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setType(typeFilter === key ? 'all' : key)}
            className={`px-2.5 h-6 text-[10px] font-mono font-bold rounded border transition-colors whitespace-nowrap ${typeFilter === key ? 'bg-white/10 text-white border-white/30' : 'text-slate-500 border-slate-800 hover:border-slate-600'}`}>
            {cfg.label}{counts[key] > 0 ? ` (${counts[key]})` : ''}
          </button>
        ))}
        <div className="ml-auto flex gap-1 flex-shrink-0">
          {['active', 'all', 'located', 'cancelled', 'expired'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-2 h-6 text-[10px] font-mono rounded transition-colors ${statusFilter === s ? 'text-white bg-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-gold rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600">
            <AlertOctagon className="w-8 h-8 mb-2" />
            <p className="font-mono text-sm">No alerts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(bolo => {
              const cfg = TYPE_CONFIG[bolo.alert_type] || TYPE_CONFIG.watch_notice;
              const Icon = cfg.icon;
              return (
                <div key={bolo.id} onClick={() => setModal({ mode: 'view', bolo })}
                  className={`bg-slate-900 border rounded-lg p-4 cursor-pointer hover:bg-slate-800/80 transition-all ${cfg.border} ${bolo.status !== 'active' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 h-5 rounded text-[9px] font-mono font-bold border ${cfg.badge}`}>
                        <Icon className="w-2.5 h-2.5" />{cfg.label}
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-2 h-5 flex items-center rounded border ${PRIORITY_STYLE[bolo.priority] || PRIORITY_STYLE.medium}`}>
                        {(bolo.priority || 'med').toUpperCase()}
                      </span>
                    </div>
                    <span className={`text-[9px] font-mono font-bold flex-shrink-0 ${bolo.status === 'active' ? 'text-green-400' : bolo.status === 'located' ? 'text-blue-400' : 'text-slate-500'}`}>
                      ● {(bolo.status || '').toUpperCase()}
                    </span>
                  </div>

                  <p className="text-white font-mono font-bold text-sm mb-1">{bolo.title}</p>
                  {bolo.bolo_number && <p className="text-slate-500 font-mono text-[9px] mb-2">#{bolo.bolo_number}</p>}
                  {bolo.subject_name && (
                    <p className="text-xs font-mono mb-1"><span className="text-slate-500">SUBJ: </span><span className="text-slate-200">{bolo.subject_name}</span>{bolo.subject_sex ? <span className="text-slate-400"> · {bolo.subject_sex}</span> : null}</p>
                  )}
                  {bolo.vehicle_plate && (
                    <p className="text-xs font-mono mb-1">
                      <span className="text-slate-500">VEH: </span>
                      <span className="text-slate-200">{[bolo.vehicle_year, bolo.vehicle_color, bolo.vehicle_make].filter(Boolean).join(' ')} </span>
                      <span className="px-1.5 py-0.5 bg-yellow-900/50 border border-yellow-500/50 rounded text-yellow-300 text-[9px] font-bold">{bolo.vehicle_plate}</span>
                    </p>
                  )}
                  {bolo.description && <p className="text-slate-400 text-[11px] font-mono line-clamp-2 mb-2">{bolo.description}</p>}
                  {bolo.last_known_location && <p className="text-xs font-mono"><span className="text-slate-500">LAST: </span><span className="text-slate-300">{bolo.last_known_location}</span></p>}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                    <span className="text-[9px] font-mono text-slate-500">By: {bolo.issued_by || 'Unknown'}</span>
                    {canEdit && bolo.status === 'active' && (
                      <div className="flex gap-1">
                        <button onClick={e => { e.stopPropagation(); setModal({ mode: 'edit', bolo: { ...bolo } }); }} className="p-1 text-slate-500 hover:text-gold transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={e => updateStatus(bolo, 'located', e)} className="p-1 text-slate-500 hover:text-green-400 transition-colors" title="Located"><CheckCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={e => updateStatus(bolo, 'cancelled', e)} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Cancel"><XCircle className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <BOLOModal mode={modal.mode} bolo={modal.bolo} user={user}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}