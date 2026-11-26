import {CadTerminalHeader,CadRefresh,CadPanelBar,CadMetricStrip,CadStatus} from '@/components/dispatch/CadTerminal';
import '@/components/dispatch/cad-center-terminal.css';
import AIRewriteField from '@/components/AIRewriteField';
import { useNavigate } from 'react-router-dom';
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
  const navigate=useNavigate();
  const [bolos, setBolos] = useState(() => readBoloCache());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [selectedId,setSelectedId]=useState(null);
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
      if(params.get('new')==='1'&&user){
        params.delete('new');
        navigate({pathname:window.location.pathname,search:params.toString()?'?'+params.toString():''},{replace:true});
      }
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

  const selected=filtered.find(b=>b.id===selectedId);
  const party=selected?primaryParty(selected):null,vehicle=selected?primaryVehicle(selected):null;
  const switchView=(next,type='all')=>{setView(next);setTypeFilter(type);setSelectedId(null);};
  return (
    <div className="tac-console cad-terminal-page cad-bolo-terminal">
      <CadTerminalHeader title="BOLO / intelligence" icon={AlertOctagon} subtitle="Officer safety, subjects, vehicles and watch notices"><CadRefresh busy={loading} onClick={load}/>{canCreate&&<button className="tac-primary" onClick={()=>setModal({mode:'create',bolo:{alert_type:'wanted_person',priority:'medium',status:'active'}})}><Plus size={15}/> New BOLO</button>}</CadTerminalHeader>
      <CadMetricStrip items={[{label:'Active',value:activeCount,tone:'ready',selected:view==='active'&&typeFilter==='all',onClick:()=>switchView('active')},{label:'Drafts',value:draftCount,tone:'warning',selected:view==='drafts',onClick:()=>switchView('drafts')},{label:'Officer safety / critical',value:criticalSafetyCount,tone:'danger',selected:typeFilter==='critical_safety',onClick:()=>switchView('active','critical_safety')},{label:'Resolved / past',value:historyCount,selected:view==='history',onClick:()=>switchView('history')}]}/>
      {pageError&&<p className="tac-warning" role="alert">{pageError} <button onClick={load}>Retry</button></p>}
      <div className="cad-terminal-filter"><label><Search size={15}/><input aria-label="Find intelligence record" value={search} onChange={e=>setSearch(e.target.value)} placeholder="BOLO / subject / plate / case"/></label><select aria-label="Alert type" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option><option value="critical_safety">Critical / officer safety</option>{Object.entries(TYPE_CONFIG).map(([key,cfg])=><option key={key} value={key}>{cfg.label}</option>)}</select><button onClick={()=>{setSearch('');setTypeFilter('all')}}>Reset</button></div>
      <div className="cad-terminal-split cad-bolo-split" data-detail={!!selected}>
       <section className="cad-terminal-panel"><CadPanelBar title={'Intelligence queue · '+filtered.length}/><div className="cad-terminal-scroll">{filtered.map(bolo=>{const cfg=TYPE_CONFIG[bolo.alert_type]||TYPE_CONFIG.watch_notice;return <button key={bolo.id} className="cad-bolo-strip" data-priority={bolo.priority} aria-pressed={selectedId===bolo.id} onClick={()=>setSelectedId(bolo.id)}><div><small>{bolo.bolo_number||'Reference pending'}</small><span className={'cad-status-chip '+(PRIORITY_STYLE[bolo.priority]||PRIORITY_STYLE.medium)}>{String(bolo.priority||'medium').toUpperCase()}</span></div><strong>{titleCase(bolo.title)||'Untitled notice'}</strong><p>{cfg.label} · {primaryParty(bolo)?.name||primaryVehicle(bolo)?.plate||'General information'}</p><div><CadStatus value={bolo.status}/><small>{fmt(bolo.created_date)}</small></div></button>})}{!filtered.length&&<p className="tac-empty">{loading?'Loading intelligence records…':'No records match this view.'}</p>}</div></section>
       <section className="cad-terminal-panel cad-bolo-detail"><CadPanelBar title="Selected intelligence record">{selected&&<button onClick={()=>setSelectedId(null)}>Close</button>}</CadPanelBar><div className="cad-terminal-scroll">{selected?<><div className="cad-terminal-record-title"><small>{selected.bolo_number||'Reference pending'}</small><h2>{titleCase(selected.title)}</h2><CadStatus value={selected.status}/><p>{(TYPE_CONFIG[selected.alert_type]||TYPE_CONFIG.watch_notice).label}</p></div>{selected.photo_urls?.length>0&&<div className="cad-bolo-photos">{selected.photo_urls.map(url=><img key={url} src={url} alt="Recorded BOLO reference"/>)}</div>}<dl className="cad-terminal-fields">{[['Subject',party?.name],['Vehicle',vehicle&&[vehicle.year,vehicle.color,vehicle.make,vehicle.model].filter(Boolean).join(' ')],['Plate',vehicle?.plate],['Last known location',selected.last_known_location],['Linked CAD',selected.linked_call_number],['Case number',selected.case_number],['Issued by',selected.issued_by],['Recorded',fmt(selected.created_date)],['Resolution',selected.resolution]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'Not recorded'}</dd></div>)}</dl><div className="tac-detail-block"><h3>Intelligence narrative</h3><p>{selected.description||'No narrative recorded.'}</p></div></>:<p className="tac-empty">Select a BOLO to inspect recorded intelligence.</p>}</div>{selected&&<footer className="cad-terminal-actions"><button onClick={()=>setModal({mode:selected.status==='draft'?'edit':'view',bolo:selected})}>{selected.status==='draft'?'Continue draft':'Open complete record'}</button>{canEditRecord(selected)&&selected.status==='active'&&<><button onClick={()=>setModal({mode:'edit',bolo:{...selected}})}>Edit</button><button className="tac-primary" disabled={resolving===selected.id} onClick={e=>openResolveDialog(selected,e)}>Resolve notice</button></>}</footer>}</section>
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
            <AIRewriteField id="bolo-resolution" autoFocus value={resolutionText} onChange={e => setResolutionText(e.target.value)} placeholder="Enter the disposition or resolution..." className="min-h-28 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500" />
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