import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertOctagon, Plus, Search, Edit2, History, Radio } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import BOLOModal from '@/components/bolo/BOLOModal';
import { TYPE_CONFIG, PRIORITY_STYLE } from '@/lib/boloConfig';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { useAuth } from '@/lib/AuthContext';

const fmt = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const titleCase = value => String(value || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const primaryParty = bolo => bolo.parties?.[0] || (bolo.subject_name ? { name: bolo.subject_name } : null);
const primaryVehicle = bolo => bolo.vehicles?.[0] || ((bolo.vehicle_plate || bolo.vehicle_make) ? { year: bolo.vehicle_year, color: bolo.vehicle_color, make: bolo.vehicle_make, model: bolo.vehicle_model, plate: bolo.vehicle_plate } : null);
const BOLO_CACHE_KEY = 'bps:bolo:last-good:v2';
const readBoloCache = () => { try { const value = JSON.parse(localStorage.getItem(BOLO_CACHE_KEY) || 'null'); return Array.isArray(value?.rows) ? value.rows : []; } catch { return []; } };
const saveBoloCache = rows => { try { if (Array.isArray(rows)) localStorage.setItem(BOLO_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows })); } catch {} };

const mergeBoloRecord = (rows, record) => {
  if (!record?.id) return rows || [];
  const next = (rows || []).filter(item => String(item.id) !== String(record.id));
  next.push(record);
  return next.sort((a, b) => new Date(b.updated_date || b.created_date || 0).getTime() - new Date(a.updated_date || a.created_date || 0).getTime());
};

export default function BOLOAlerts() {
  const [bolos, setBolos] = useState(() => readBoloCache());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const { user, isLoadingAuth } = useAuth();
  const [resolving, setResolving] = useState(null);
  const [resolutionDialog, setResolutionDialog] = useState(null);
  const [resolutionText, setResolutionText] = useState('');
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (isLoadingAuth) return;
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' && user) setModal({ mode: 'create', bolo: {
        alert_type: 'wanted_person', priority: 'medium', status: 'active',
        linked_call_id: params.get('call_id') || '',
        linked_call_number: params.get('call_number') || '',
      } });
      const loadedBolos = await load();
      const openId = params.get('open');
      if (openId) {
        const target = (loadedBolos || []).find(item => String(item.id) === String(openId));
        if (target) {
          setView(target.status === 'active' ? 'active' : 'history');
          setModal({ mode: 'view', bolo: target });
        }
      }
    };
    init();
  }, [isLoadingAuth, user?.id]);

  // Keep the board synchronized with edits made by any authorized device without
  // re-listing hundreds of BOLO rows after every realtime event.
  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = base44.entities.BOLOAlert.subscribe(event => {
        const record = event?.data;
        if (!record?.id) return;
        if (event.type === 'delete') {
          setBolos(current => current.filter(item => String(item.id) !== String(record.id)));
          return;
        }
        setBolos(current => { const next = mergeBoloRecord(current, record); saveBoloCache(next); return next; });
        setModal(current => current?.bolo?.id === record.id ? { ...current, bolo: record } : current);
      });
    } catch {}
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      let data = [];
      try {
        const response = await withRequestTimeout(base44.functions.invoke('manageBolo', { action: 'list' }), 18000, 'BOLO records request');
        const payload = response?.data || response || {};
        if (payload.error) throw new Error(payload.error);
        data = Array.isArray(payload.rows) ? payload.rows : [];
      } catch {
        data = await withRequestTimeout(base44.entities.BOLOAlert.list('-updated_date', 100), 10000, 'BOLO direct fallback');
      }
      if (Array.isArray(data) && data.length) saveBoloCache(data);
      setBolos(Array.isArray(data) ? data : readBoloCache());
      setPageError('');
      return data;
    } catch (error) {
      const isRateLimit = /rate limit|too many requests|\b429\b/i.test(String(error?.message || error || ''));
      setPageError(isRateLimit
        ? 'BOLO records are temporarily busy. Wait a moment, then use Retry; the list already on screen has been preserved.'
        : (error?.message || 'BOLO records could not be loaded. Please retry.'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const canCreate = Boolean(user && (user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true || roles.has('officer') || roles.has('full_access') || roles.has('dispatch') || roles.has('cad_access')));
  const isManager = Boolean(user && (user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true || hasSupervisorAccess(user) || roles.has('full_access') || roles.has('dispatch')));

  const activeCount = bolos.filter(b => b.status === 'active').length;
  const draftCount = bolos.filter(b => b.status === 'draft' && (isManager || b.issued_by_id === user?.id || b.created_by_id === user?.id)).length;
  const historyCount = bolos.filter(b => !['active', 'draft'].includes(b.status)).length;
  const criticalSafetyCount = bolos.filter(b => b.status === 'active' && (b.priority === 'critical' || b.alert_type === 'officer_safety')).length;

  const filtered = useMemo(() => bolos.filter(b => {
    if (view === 'active' && b.status !== 'active') return false;
    if (view === 'drafts' && (b.status !== 'draft' || (!isManager && b.issued_by_id !== user?.id && b.created_by_id !== user?.id))) return false;
    if (view === 'history' && ['active', 'draft'].includes(b.status)) return false;
    if (typeFilter === 'critical_safety' && !(b.priority === 'critical' || b.alert_type === 'officer_safety')) return false;
    if (!['all', 'critical_safety'].includes(typeFilter) && b.alert_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [b.bolo_number,b.title,b.description,b.subject_name,b.vehicle_plate,b.case_number,b.last_known_location,b.issued_by,JSON.stringify(b.parties || []),JSON.stringify(b.vehicles || [])].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [bolos, view, typeFilter, search, isManager, user?.id]);

  const canEditRecord = bolo => isManager || bolo.issued_by_id === user?.id || bolo.created_by_id === user?.id;

  const openResolveDialog = (bolo, e) => {
    e?.stopPropagation();
    setResolutionText('');
    setResolutionDialog(bolo);
  };

  const resolveBolo = async () => {
    if (!resolutionDialog || !resolutionText.trim()) return;
    const bolo = resolutionDialog;
    setResolving(bolo.id);
    try {
      const response = await base44.functions.invoke('manageBolo', { action: 'resolve', id: bolo.id, resolution: resolutionText.trim() });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      if (payload.record) setBolos(current => mergeBoloRecord(current, payload.record));
      setResolutionDialog(null);
      setResolutionText('');
    } catch (error) {
      setPageError(error?.response?.data?.error || error?.message || 'Unable to resolve BOLO. Please retry.');
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050a11] font-sans text-white">
      <div className="flex-none border-b border-[#24354c] bg-[#0a1220] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-red-400" />
            <div><div className="text-xl font-bold tracking-tight">BOLO / INTELLIGENCE BOARD</div><div className="mt-1 text-xs text-slate-400">BE ON THE LOOKOUT · OFFICER SAFETY · WANTED / MISSING · VEHICLE INTELLIGENCE</div></div>
          </div>
          <div className="flex-1" />
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH BOLO, SUBJECT, PLATE, CASE..." className="h-10 w-full rounded-lg border border-[#2b405a] bg-[#0f1928] pl-8 pr-3 text-sm text-white outline-none focus:border-blue-500" />
          </div>
          {canCreate && <button onClick={() => setModal({ mode: 'create', bolo: { alert_type: 'wanted_person', priority: 'medium', status: 'active' } })} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-red-400 bg-red-700 px-4 text-[10px] font-black shadow-[0_0_18px_rgba(220,38,38,.25)] hover:bg-red-600 sm:h-9 sm:w-auto"><Plus className="h-4 w-4" />NEW BOLO</button>}
        </div>
      </div>

      {pageError && <div role="alert" className="flex flex-none items-center justify-between gap-3 border-b border-red-700 bg-red-950/60 px-4 py-3 text-sm text-red-100"><span>{pageError}</span><button type="button" onClick={() => load()} className="rounded border border-red-500 px-3 py-1.5 text-xs font-semibold hover:bg-red-900">Retry</button></div>}

      <div className="grid flex-none grid-cols-2 border-b border-[#24354c] bg-[#08111c] sm:grid-cols-4">
        <button type="button" onClick={() => { setView('active'); setTypeFilter('all'); }} className="min-h-20 border-r border-[#24354c] px-4 py-3 text-left hover:bg-[#101b2b]" aria-pressed={view === 'active' && typeFilter === 'all'}><div className="text-2xl font-bold text-green-400">{activeCount}</div><div className="mt-1 text-[11px] font-semibold tracking-wide text-slate-300">Active BOLOs</div></button>
        <button type="button" onClick={() => { setView('drafts'); setTypeFilter('all'); }} className="min-h-20 border-r border-[#24354c] px-4 py-3 text-left hover:bg-[#101b2b]" aria-pressed={view === 'drafts'}><div className="text-2xl font-bold text-amber-300">{draftCount}</div><div className="mt-1 text-[11px] font-semibold tracking-wide text-slate-300">Saved drafts</div></button>
        <button type="button" onClick={() => { setView('active'); setTypeFilter('critical_safety'); }} className="min-h-20 border-r border-[#24354c] px-4 py-3 text-left hover:bg-[#101b2b]" aria-pressed={view === 'active' && typeFilter === 'critical_safety'}><div className="text-2xl font-bold text-red-400">{criticalSafetyCount}</div><div className="mt-1 text-[11px] font-semibold tracking-wide text-slate-300">Critical / officer safety</div></button>
        <button type="button" onClick={() => { setView('history'); setTypeFilter('all'); }} className="min-h-20 px-4 py-3 text-left hover:bg-[#101b2b]" aria-pressed={view === 'history'}><div className="text-2xl font-bold text-blue-300">{historyCount}</div><div className="mt-1 text-[11px] font-semibold tracking-wide text-slate-300">Past / resolved</div></button>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-[#24354c] bg-[#0b1320] px-3 py-2">
        <button type="button" aria-pressed={view === 'active'} onClick={() => { setView('active'); setTypeFilter('all'); }} className={`flex items-center gap-1.5 rounded border px-3 py-1 text-[11px] font-black ${view === 'active' ? 'border-green-500/60 bg-green-950/40 text-green-300' : 'border-slate-700 text-slate-500'}`}><Radio className="h-3 w-3" />ACTIVE ({activeCount})</button>
        <button type="button" aria-pressed={view === 'drafts'} onClick={() => { setView('drafts'); setTypeFilter('all'); }} className={`flex items-center gap-1.5 rounded border px-3 py-1 text-[11px] font-black ${view === 'drafts' ? 'border-amber-500/60 bg-amber-950/40 text-amber-200' : 'border-slate-700 text-slate-500'}`}><Edit2 className="h-3 w-3" />DRAFTS ({draftCount})</button>
        <button type="button" aria-pressed={view === 'history'} onClick={() => { setView('history'); setTypeFilter('all'); }} className={`flex items-center gap-1.5 rounded border px-3 py-1 text-[11px] font-black ${view === 'history' ? 'border-blue-500/60 bg-blue-950/40 text-blue-300' : 'border-slate-700 text-slate-500'}`}><History className="h-3 w-3" />PAST / RESOLVED ({historyCount})</button>
        <div className="h-5 w-px bg-slate-700" />
        <button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')} className={`rounded px-2 py-1 text-[11px] ${typeFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>ALL TYPES</button>
        {Object.entries(TYPE_CONFIG).map(([key,cfg]) => <button type="button" aria-pressed={typeFilter === key} key={key} onClick={() => setTypeFilter(typeFilter === key ? 'all' : key)} className={`rounded px-2 py-1 text-[11px] ${typeFilter === key ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{cfg.label}</button>)}
      </div>

      <div className="flex flex-none items-center justify-between border-b border-[#24354c] bg-[#0a1220] px-3 py-2 text-xs text-slate-400"><span>Showing {filtered.length} of {bolos.length} BOLO records</span>{typeFilter !== 'all' && <button type="button" onClick={() => setTypeFilter('all')} className="rounded border border-slate-600 px-2 py-1 font-semibold text-slate-200 hover:bg-slate-800">Clear type filter</button>}</div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? <div role="status" className="p-10 text-center text-sm text-slate-400">Loading intelligence records…</div> : filtered.length===0 ? <div className="rounded-xl border border-dashed border-slate-600 p-12 text-center text-slate-400"><AlertOctagon className="mx-auto mb-3 h-8 w-8"/><p>No records match this view.</p></div> :
        <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map(bolo=>{
          const cfg=TYPE_CONFIG[bolo.alert_type]||TYPE_CONFIG.watch_notice,Icon=cfg.icon;
          const party=primaryParty(bolo),vehicle=primaryVehicle(bolo);
          const subject=party?.name?titleCase(party.name):vehicle?[vehicle.year,titleCase(vehicle.color),titleCase(vehicle.make),titleCase(vehicle.model)].filter(Boolean).join(' '):'General information';
          return <article key={bolo.id} className={'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-slate-900 shadow-lg '+(bolo.priority==='critical'&&bolo.status==='active'?'border-red-500':'border-slate-700')}>
            <button type="button" onClick={()=>setModal({mode:bolo.status==='draft'?'edit':'view',bolo})} className="flex-1 p-5 text-left hover:bg-slate-800/60">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-amber-300">{bolo.bolo_number||'BOLO pending'}</span><span className={'rounded border px-2 py-1 text-xs font-bold '+(PRIORITY_STYLE[bolo.priority]||PRIORITY_STYLE.medium)}>{String(bolo.priority||'medium').toUpperCase()}</span></div>
              <div className="mt-4 flex gap-4">{bolo.photo_urls?.[0]&&<img src={bolo.photo_urls[0]} alt="BOLO subject" className="h-24 w-24 shrink-0 rounded-lg border border-slate-600 object-cover"/>}<div className="min-w-0"><div className="flex items-center gap-2 text-xs text-cyan-300"><Icon className="h-4 w-4"/>{cfg.label}</div><h2 className="mt-2 break-words text-lg font-semibold text-white">{titleCase(bolo.title)}</h2><p className="mt-1 break-words text-sm text-slate-300">{subject}</p></div></div>
              {vehicle?.plate&&<span className="mt-3 inline-block rounded border border-amber-500/50 bg-amber-950 px-3 py-1 font-mono text-sm font-bold text-amber-200">{String(vehicle.plate).toUpperCase()}</span>}
              <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-300">{bolo.description||'Open record for full intelligence details.'}</p>
              <dl className="mt-4 grid gap-2 border-t border-slate-700 pt-3 text-xs"><div><dt className="text-slate-500">Last known location</dt><dd className="mt-1 text-slate-200">{titleCase(bolo.last_known_location||'Unknown')}</dd></div>{bolo.linked_call_number&&<div><dt className="text-slate-500">Linked CAD call</dt><dd className="mt-1 text-cyan-200">{bolo.linked_call_number}</dd></div>}</dl>
            </button>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-950/60 px-5 py-3"><div className="text-xs"><span className={bolo.status==='active'?'text-emerald-300':'text-slate-300'}>{String(bolo.status||'').toUpperCase()}</span><p className="mt-1 text-slate-500">{fmt(bolo.created_date)}</p></div><div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={()=>setModal({mode:bolo.status==='draft'?'edit':'view',bolo})}>{bolo.status==='draft'?'Continue draft':'Open record'}</Button>
              {canEditRecord(bolo)&&bolo.status==='active'&&<><button type="button" aria-label={'Edit '+bolo.bolo_number} onClick={()=>setModal({mode:'edit',bolo:{...bolo}})} className="rounded border border-slate-600 px-2 text-slate-300"><Edit2 className="h-4 w-4"/></button><Button size="sm" disabled={resolving===bolo.id} onClick={e=>openResolveDialog(bolo,e)} className="bg-emerald-800 hover:bg-emerald-700">{resolving===bolo.id?'Resolving…':'Resolve'}</Button></>}
            </div></footer>
          </article>;
        })}</div>}
      </div>

      {modal && <BOLOModal mode={modal.mode} bolo={modal.bolo} user={user} onClose={() => setModal(null)} onEdit={modal.mode === 'view' && canEditRecord(modal.bolo) ? () => setModal({ mode: 'edit', bolo: { ...modal.bolo } }) : null} onSaved={payload => { if (payload?.record) setBolos(current => mergeBoloRecord(current, payload.record)); setModal(null); }} />}

      <Dialog open={!!resolutionDialog} onOpenChange={open => { if (!open && !resolving) { setResolutionDialog(null); setResolutionText(''); } }}>
        <DialogContent className="max-w-lg border-slate-700 bg-[#0b1320] text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-wide">Resolve BOLO</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">BOLO</div>
              <div className="mt-1 font-black text-amber-300">{resolutionDialog?.bolo_number || resolutionDialog?.title}</div>
            </div>
            <label className="block text-sm font-semibold text-slate-200" htmlFor="bolo-resolution">Disposition / resolution</label>
            <textarea id="bolo-resolution" autoFocus value={resolutionText} onChange={e => setResolutionText(e.target.value)} placeholder="Enter the disposition or resolution..." className="min-h-28 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!!resolving} onClick={() => { setResolutionDialog(null); setResolutionText(''); }}>Cancel</Button>
            <Button disabled={!resolutionText.trim() || !!resolving} onClick={resolveBolo}>{resolving ? 'Resolving…' : 'Resolve BOLO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}