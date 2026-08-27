import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertOctagon, Plus, Search, Edit2, CheckCircle2, History, Radio, Clock3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import BOLOModal from '@/components/bolo/BOLOModal';
import { TYPE_CONFIG, PRIORITY_STYLE } from '@/lib/boloConfig';

const fmt = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const titleCase = value => String(value || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const primaryParty = bolo => bolo.parties?.[0] || (bolo.subject_name ? { name: bolo.subject_name } : null);
const primaryVehicle = bolo => bolo.vehicles?.[0] || ((bolo.vehicle_plate || bolo.vehicle_make) ? { year: bolo.vehicle_year, color: bolo.vehicle_color, make: bolo.vehicle_make, model: bolo.vehicle_model, plate: bolo.vehicle_plate } : null);

export default function BOLOAlerts() {
  const [bolos, setBolos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [user, setUser] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [resolutionDialog, setResolutionDialog] = useState(null);
  const [resolutionText, setResolutionText] = useState('');
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      const loadedBolos = await load();
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' && me) setModal({ mode: 'create', bolo: {
        alert_type: 'wanted_person', priority: 'medium', status: 'active',
        linked_call_id: params.get('call_id') || '',
        linked_call_number: params.get('call_number') || '',
      } });
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
  }, []);

  const load = async (attempt = 0) => {
    if (attempt === 0) setLoading(true);
    try {
      const data = await base44.entities.BOLOAlert.list('-created_date', 500);
      setBolos(data || []);
      setPageError('');
      return data || [];
    } catch (error) {
      const isRateLimit = String(error?.message || error || '').toLowerCase().includes('rate limit');
      if (isRateLimit && attempt < 3) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        return load(attempt + 1);
      }
      setBolos([]);
      setPageError(error?.message || 'BOLO records could not be loaded. Please retry.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const canCreate = Boolean(user && (user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true || roles.has('officer') || roles.has('full_access') || roles.has('dispatch') || roles.has('cad_access')));
  const isManager = Boolean(user && (user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true || roles.has('supervisor') || roles.has('full_access') || roles.has('dispatch')));

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
      await base44.functions.invoke('manageBolo', { action: 'resolve', id: bolo.id, resolution: resolutionText.trim() });
      setResolutionDialog(null);
      setResolutionText('');
      await load();
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
            <div><div className="text-sm font-black tracking-[0.16em]">BOLO / INTELLIGENCE BOARD</div><div className="text-[10px] tracking-[0.18em] text-slate-500">BE ON THE LOOKOUT · OFFICER SAFETY · WANTED / MISSING · VEHICLE INTELLIGENCE</div></div>
          </div>
          <div className="flex-1" />
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH BOLO, SUBJECT, PLATE, CASE..." className="h-8 w-full rounded border border-[#2b405a] bg-[#0f1928] pl-8 pr-3 text-[10px] text-white outline-none focus:border-blue-500" />
          </div>
          {canCreate && <button onClick={() => setModal({ mode: 'create', bolo: { alert_type: 'wanted_person', priority: 'medium', status: 'active' } })} className="flex h-9 w-full items-center justify-center gap-1.5 rounded border border-red-500 bg-red-700 px-3 text-[10px] font-black hover:bg-red-600 sm:h-8 sm:w-auto"><Plus className="h-3.5 w-3.5" />ISSUE BOLO</button>}
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

      <div className="hidden flex-none grid-cols-12 border-b border-[#24354c] bg-[#111a29] px-3 py-1.5 text-[10px] font-bold tracking-wide text-slate-400 md:grid">
        <div className="col-span-2">BOLO / PRIORITY</div><div className="col-span-3">SUBJECT / VEHICLE</div><div className="col-span-3">ALERT / LAST KNOWN</div><div className="col-span-2">ISSUED / STATUS</div><div className="col-span-2 text-right">ACTIONS</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="flex h-32 items-center justify-center text-xs text-slate-500">LOADING BOLO DATABASE...</div> : filtered.length === 0 ? <div className="flex h-32 flex-col items-center justify-center text-slate-600"><AlertOctagon className="mb-2 h-7 w-7" /><span className="text-xs">NO BOLOS MATCH CURRENT VIEW</span></div> : filtered.map(bolo => {
          const cfg = TYPE_CONFIG[bolo.alert_type] || TYPE_CONFIG.watch_notice;
          const Icon = cfg.icon;
          const party = primaryParty(bolo);
          const vehicle = primaryVehicle(bolo);
          const subject = party?.name ? titleCase(party.name) : vehicle ? [vehicle.year,titleCase(vehicle.color),titleCase(vehicle.make),titleCase(vehicle.model)].filter(Boolean).join(' ') : 'GENERAL INFORMATION';
          return <div key={bolo.id} onClick={() => setModal({ mode: bolo.status === 'draft' ? 'edit' : 'view', bolo })} className={`grid cursor-pointer grid-cols-1 gap-2 border-b border-[#18283a] px-3 py-3 hover:bg-[#0d1826] md:grid-cols-12 md:gap-0 ${bolo.priority === 'critical' && bolo.status === 'active' ? 'border-l-2 border-l-red-500 bg-red-950/10' : bolo.status === 'draft' ? 'border-l-2 border-l-amber-500 bg-amber-950/10' : ''}`}>
            <div className="md:col-span-2"><div className="text-[10px] font-black text-[#f5c451]">{bolo.bolo_number || 'BOLO-PENDING'}</div><div className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_STYLE[bolo.priority] || PRIORITY_STYLE.medium}`}>{(bolo.priority || 'medium').toUpperCase()}</div></div>
            <div className="md:col-span-3"><div className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><Icon className="h-3 w-3" />{cfg.label}</div><div className="mt-1 text-[11px] font-black text-white">{subject}</div>{vehicle?.plate && <div className="mt-1 inline-block rounded border border-yellow-500/50 bg-yellow-950/50 px-1.5 py-0.5 text-[11px] font-black text-yellow-300">PLATE {String(vehicle.plate).toUpperCase()}</div>}{(bolo.parties?.length || 0) > 1 && <div className="mt-1 text-[10px] text-blue-400">+{bolo.parties.length - 1} additional party</div>}{(bolo.vehicles?.length || 0) > 1 && <div className="mt-1 text-[10px] text-yellow-500">+{bolo.vehicles.length - 1} additional vehicle</div>}</div>
            <div className="md:col-span-3"><div className="text-[11px] font-black text-white">{titleCase(bolo.title)}</div><div className="mt-1 line-clamp-1 text-[11px] text-slate-400">{bolo.description || 'No narrative entered'}</div><div className="mt-1 text-[11px] text-blue-300">LAST: {titleCase(bolo.last_known_location || 'UNKNOWN')}</div>{bolo.linked_call_number && <div className="mt-1 text-[10px] text-cyan-400">CAD: {bolo.linked_call_number}</div>}</div>
            <div className="md:col-span-2"><div className="text-[11px] text-slate-300">{bolo.issued_by || 'Unknown issuer'}</div><div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 className="h-2.5 w-2.5" />{fmt(bolo.created_date)}</div><div className={`mt-1 text-[11px] font-black ${bolo.status === 'active' ? 'text-green-400' : bolo.status === 'resolved' ? 'text-blue-400' : 'text-slate-500'}`}>● {(bolo.status || '').toUpperCase()}</div></div>
            <div className="flex items-center justify-end gap-1 md:col-span-2">
              {canEditRecord(bolo) && bolo.status === 'active' && <button onClick={e => { e.stopPropagation(); setModal({ mode: 'edit', bolo: { ...bolo } }); }} className="rounded border border-slate-700 p-1.5 text-slate-400 hover:border-gold hover:text-gold" title="Edit BOLO"><Edit2 className="h-3.5 w-3.5" /></button>}
              {canEditRecord(bolo) && bolo.status === 'active' && <button onClick={e => openResolveDialog(bolo,e)} disabled={resolving === bolo.id} className="flex items-center gap-1 rounded border border-green-700 bg-green-950/30 px-2 py-1.5 text-[10px] font-black text-green-300 hover:bg-green-900/40 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{resolving === bolo.id ? 'RESOLVING' : 'RESOLVE'}</button>}
              {bolo.status !== 'active' && <span className="max-w-40 text-right text-[10px] text-slate-500">{bolo.resolution_notes || bolo.status}</span>}
            </div>
          </div>;
        })}
      </div>

      {modal && <BOLOModal mode={modal.mode} bolo={modal.bolo} user={user} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}

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