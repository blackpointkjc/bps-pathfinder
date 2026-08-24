import { uploadInternalFile } from '@/lib/internalUpload';
import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TYPE_CONFIG, PRIORITY_STYLE } from '@/lib/boloConfig';
import { Plus, Trash2, Upload, Link as LinkIcon, User, Car, Image as ImageIcon, FileWarning, Printer, Mail } from 'lucide-react';

const titleCase = (value = '') => String(value).toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const upper = (value = '') => String(value).toUpperCase();
const sentenceCase = (value = '') => {
  const clean = String(value).trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

function Field({ label, children }) {
  return <div><label className="mb-1 block text-[10px] font-mono tracking-widest text-slate-400">{label}</label>{children}</div>;
}
function Input({ value, onChange, placeholder, normalize, className = '' }) {
  return <input value={value || ''} onChange={e => onChange(e.target.value)} onBlur={e => normalize && onChange(normalize(e.target.value))} placeholder={placeholder}
    className={`w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:border-gold focus:outline-none ${className}`} />;
}
function Textarea({ value, onChange, rows = 3, normalize }) {
  return <textarea value={value || ''} onChange={e => onChange(e.target.value)} onBlur={e => normalize && onChange(normalize(e.target.value))} rows={rows}
    className="w-full resize-none rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-gold focus:outline-none" />;
}
function Select({ value, onChange, options }) {
  return <select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-gold focus:outline-none">
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

const legacyParty = (bolo) => bolo?.subject_name ? [{
  role: 'Subject', name: bolo.subject_name, dob: bolo.subject_dob || '', race: bolo.subject_race || '', sex: bolo.subject_sex || '', height: bolo.subject_height || '', weight: bolo.subject_weight || '', description: bolo.subject_description || ''
}] : [];
const legacyVehicle = (bolo) => bolo?.vehicle_plate || bolo?.vehicle_make ? [{
  role: 'Vehicle', year: bolo.vehicle_year || '', color: bolo.vehicle_color || '', make: bolo.vehicle_make || '', model: bolo.vehicle_model || '', plate: bolo.vehicle_plate || '', state: '', description: ''
}] : [];

function DetailView({ bolo }) {
 const parties=bolo.parties?.length?bolo.parties:legacyParty(bolo), vehicles=bolo.vehicles?.length?bolo.vehicles:legacyVehicle(bolo), photos=bolo.photo_urls||[]; const description=[...parties.map(p=>p.description),...vehicles.map(v=>v.description),bolo.description].filter(Boolean).map(sentenceCase).filter((v,i,a)=>a.indexOf(v)===i).join(' ');
 return <div id="bolo-print-sheet" className="font-mono"><div className="rounded-xl border-2 border-red-700/70 bg-red-950/20 p-5 print:border-red-700 print:bg-white print:text-black"><div className="mb-4 flex items-center gap-2 text-lg font-black tracking-[.16em] text-red-300 print:text-red-700"><FileWarning className="h-5 w-5"/>BE ON THE LOOKOUT</div><div className="mb-4 grid gap-3 border-b border-red-800/50 pb-4 text-xs md:grid-cols-3 print:grid-cols-3"><div><b className="text-red-400">BOLO / CASE</b><div className="text-white print:text-black">{bolo.bolo_number||'BOLO'}{bolo.case_number?` · ${upper(bolo.case_number)}`:''}</div></div><div><b className="text-red-400">JURISDICTION</b><div className="text-white print:text-black">{titleCase(bolo.jurisdiction||'Not listed')}</div></div><div><b className="text-red-400">ISSUED BY</b><div className="text-white print:text-black">{titleCase(bolo.issued_by||'Black Point Protection')}</div></div></div><h2 className="mb-4 text-2xl font-black text-white print:text-black">{titleCase(bolo.title||'BOLO')}</h2><div className="grid gap-4 text-xs md:grid-cols-2 print:grid-cols-2"><div><b className="text-red-400">PERSON / SUBJECT</b><div className="text-white print:text-black">{parties.length?parties.map(p=>titleCase(p.name)).filter(Boolean).join(' · ')||'SEE PERSON DETAILS':'NO PERSON IDENTIFIED'}</div></div><div><b className="text-red-400">VEHICLE</b><div className="text-white print:text-black">{vehicles.length?vehicles.map(v=>[v.year,titleCase(v.color),titleCase(v.make),titleCase(v.model),v.plate?`PLATE ${upper(v.plate)}${v.state?`/${upper(v.state)}`:''}`:''].filter(Boolean).join(' · ')).join(' | '):'NO VEHICLE INFORMATION'}</div></div><div><b className="text-red-400">LAST KNOWN / LAST SEEN</b><div className="text-white print:text-black">{titleCase(bolo.last_known_location||'UNKNOWN')}</div></div><div><b className="text-red-400">TRAVEL / DIRECTION</b><div className="text-white print:text-black">{titleCase(bolo.last_known_direction||'UNKNOWN')}</div></div></div>{description&&<div className="mt-4 border-t border-red-800/50 pt-4 text-sm leading-relaxed text-red-100 print:text-black"><b className="text-red-300 print:text-red-700">DESCRIPTION / NARRATIVE: </b>{description}</div>}{parties.some(p=>p.dob||p.race||p.sex||p.height||p.weight)&&<div className="mt-4 border-t border-red-800/50 pt-4">{parties.map((p,i)=><div key={i} className="mb-2 text-xs text-red-100 print:text-black"><b className="text-red-300 print:text-red-700">{upper(p.role||`PARTY ${i+1}`)}: </b>{titleCase(p.name)} {[p.dob&&`DOB ${p.dob}`,p.race&&`RACE ${titleCase(p.race)}`,p.sex&&`SEX ${titleCase(p.sex)}`,p.height&&`HT ${p.height}`,p.weight&&`WT ${p.weight}`].filter(Boolean).join(' · ')}</div>)}</div>}{(bolo.contact_info||bolo.linked_call_number||bolo.linked_incident_report_number)&&<div className="mt-4 border-t border-red-800/50 pt-4 text-xs text-red-100 print:text-black">{bolo.contact_info&&<div><b>CONTACT: </b>{titleCase(bolo.contact_info)}</div>}{bolo.linked_call_number&&<div><b>CAD: </b>{bolo.linked_call_number}</div>}{bolo.linked_incident_report_number&&<div><b>INCIDENT REPORT: </b>{bolo.linked_incident_report_number}</div>}</div>}{photos.length>0&&<div className="mt-5 border-t border-red-800/50 pt-4"><b className="text-xs text-red-400">PHOTOS / IDENTIFIERS</b><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">{photos.map((url,i)=><div key={url+i} className="flex min-h-56 items-center justify-center rounded border border-red-900/60 bg-black/50 p-2 print:bg-white"><img src={url} alt={`BOLO attachment ${i+1}`} className="max-h-[32rem] w-full object-contain print:max-h-[4.25in]"/></div>)}</div></div>}</div></div>;
}
function FormView({ data, onChange }) {
  const [calls, setCalls] = useState([]);
  const [reports, setReports] = useState([]);
  const [linkLoading, setLinkLoading] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const photoInputRef = useRef(null);
  const set = (field, val) => onChange(prev => ({ ...prev, [field]: val }));
  const parties = data.parties || [];
  const vehicles = data.vehicles || [];

  useEffect(() => {
    let active = true;
    setLinkLoading(true);
    setLinkError('');
    base44.functions.invoke('getBoloLinkOptions', {})
      .then(result => {
        const payload = result?.data || result || {};
        if (payload.error) throw new Error(payload.error);
        if (!active) return;
        setCalls(payload.calls || []);
        setReports(payload.reports || []);
      })
      .catch(error => {
        if (!active) return;
        setCalls([]);
        setReports([]);
        setLinkError(error?.message || 'CAD/report links could not be loaded.');
      })
      .finally(() => { if (active) setLinkLoading(false); });
    return () => { active = false; };
  }, []);

  const addParty = () => set('parties', [...parties, { role: 'Subject', name: '', dob: '', race: '', sex: '', height: '', weight: '', description: '' }]);
  const updateParty = (idx, field, value) => set('parties', parties.map((p,i) => i === idx ? { ...p, [field]: value } : p));
  const removeParty = idx => set('parties', parties.filter((_,i) => i !== idx));
  const addVehicle = () => set('vehicles', [...vehicles, { role: 'Vehicle', year: '', color: '', make: '', model: '', plate: '', state: '', description: '' }]);
  const updateVehicle = (idx, field, value) => set('vehicles', vehicles.map((v,i) => i === idx ? { ...v, [field]: value } : v));
  const removeVehicle = idx => set('vehicles', vehicles.filter((_,i) => i !== idx));

  const uploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadError('');
    const remaining = Math.max(0, 8 - (data.photo_urls || []).length);
    if (!remaining) {
      setUploadError('A BOLO can contain up to 8 photos. Remove one before adding another.');
      e.target.value = '';
      return;
    }
    const selected = files.slice(0, remaining);
    const invalid = selected.find(file => !String(file.type || '').startsWith('image/'));
    if (invalid) {
      setUploadError(`${invalid.name} is not a supported image file.`);
      e.target.value = '';
      return;
    }
    const oversized = selected.find(file => file.size > 15 * 1024 * 1024);
    if (oversized) {
      setUploadError(`${oversized.name} is larger than 15 MB. Choose a smaller image.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const urls = [];
      for (const file of selected) {
        const result = await uploadInternalFile(file);
        if (!result?.file_url) throw new Error(`Upload did not return a file URL for ${file.name}`);
        urls.push(result.file_url);
      }
      set('photo_urls', [...(data.photo_urls || []), ...urls].slice(0, 8));
    } catch (error) {
      console.error('BOLO photo upload failed:', error);
      setUploadError(error?.message || 'Photo upload failed. Please try the image again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const callLabel = c => c.agency_cad_number || c.bps_reference || c.call_id || c.id;
  const reportLabel = r => r.report_number || r.incident_report_number || r.id;

  return <div className="space-y-4 font-mono">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="ALERT TYPE *"><Select value={data.alert_type} onChange={v => set('alert_type', v)} options={[
        {value:'wanted_person',label:'Wanted Person'},{value:'missing_person',label:'Missing Person'},{value:'stolen_vehicle',label:'Stolen Vehicle'},{value:'officer_safety',label:'Officer Safety'},{value:'special_instruction',label:'Special Instruction'},{value:'property_alert',label:'Property Alert'},{value:'watch_notice',label:'Watch Notice'}]} /></Field>
      <Field label="PRIORITY *"><Select value={data.priority} onChange={v => set('priority', v)} options={[{value:'critical',label:'Critical'},{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}]} /></Field>
    </div>
    <Field label="TITLE / HEADLINE *"><Input value={data.title} onChange={v => set('title', v)} normalize={titleCase} placeholder="Wanted Person, Stolen Vehicle, Officer Safety Alert..." /></Field>
    <div className="grid gap-3 md:grid-cols-2"><Field label="CASE NUMBER"><Input value={data.case_number} onChange={v => set('case_number', v)} normalize={upper} /></Field><Field label="JURISDICTION"><Input value={data.jurisdiction} onChange={v => set('jurisdiction', v)} normalize={titleCase} /></Field></div>

    <div className="rounded border border-cyan-900/60 bg-cyan-950/10 p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-black tracking-widest text-cyan-300"><LinkIcon className="h-3 w-3" />LINK TO CAD / REPORT</div>
      {linkLoading && <div className="mb-3 rounded border border-cyan-900 bg-cyan-950/30 px-3 py-2 text-[10px] text-cyan-200">Loading CAD calls and incident reports…</div>}
      {linkError && <div className="mb-3 rounded border border-red-800 bg-red-950/30 px-3 py-2 text-[10px] text-red-300">{linkError}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="DISPATCH CALL"><select value={data.linked_call_id || ''} onChange={e => { const c = calls.find(x => x.id === e.target.value); set('linked_call_id', e.target.value); set('linked_call_number', c ? callLabel(c) : ''); }} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"><option value="">No linked call</option>{calls.map(c => <option key={c.id} value={c.id}>{callLabel(c)} — {titleCase(c.incident || '')} — {titleCase(c.location || '')}</option>)}</select></Field>
        <Field label="INCIDENT REPORT"><select value={data.linked_incident_report_id || ''} onChange={e => { const r = reports.find(x => x.id === e.target.value); set('linked_incident_report_id', e.target.value); set('linked_incident_report_number', r ? reportLabel(r) : ''); }} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"><option value="">No linked incident report</option>{reports.map(r => <option key={r.id} value={r.id}>{reportLabel(r)} — {titleCase(r.incident_type || r.report_type || r.location || '')}</option>)}</select></Field>
      </div>
    </div>

    <div className="rounded border border-slate-700 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-slate-300"><ImageIcon className="h-3 w-3" />PHOTOS / IMAGES</div>
        <div>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={uploadPhotos} disabled={uploading} />
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploading || (data.photo_urls || []).length >= 8} className="rounded border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-[9px] font-bold text-blue-300 hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="mr-1 inline h-3 w-3" />{uploading ? 'UPLOADING...' : 'ADD PHOTOS'}</button>
        </div>
      </div>
      {uploadError && <div className="mb-3 rounded border border-red-700/60 bg-red-950/30 px-3 py-2 text-[10px] font-bold text-red-300">{uploadError}</div>}
      {(data.photo_urls || []).length === 0 ? <div className="text-[10px] text-slate-600">No images attached. Add up to 8 JPG, PNG, WEBP, HEIC, or HEIF images.</div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{data.photo_urls.map((url,i) => <div key={url+i} className="relative flex min-h-28 items-center justify-center overflow-hidden rounded border border-slate-700 bg-black/70 p-1"><img src={url} alt={`BOLO photo ${i + 1}`} className="max-h-40 w-full object-contain" /><button type="button" onClick={() => set('photo_urls', data.photo_urls.filter((_,x) => x !== i))} className="absolute right-1 top-1 rounded bg-black/80 p-1 text-red-300"><Trash2 className="h-3 w-3" /></button></div>)}</div>}
    </div>

    <div className="rounded border border-blue-900/70 bg-blue-950/10 p-3">
      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-blue-300"><User className="h-3 w-3" />PARTIES / PERSONS</div><button type="button" onClick={addParty} className="rounded border border-blue-700 px-2 py-1 text-[9px] font-bold text-blue-300"><Plus className="mr-1 inline h-3 w-3" />ADD PARTY</button></div>
      {parties.length === 0 && <div className="text-[10px] text-slate-600">Add each subject, missing person, victim, witness, or other party separately.</div>}
      <div className="space-y-3">{parties.map((p,i) => <div key={i} className="rounded border border-slate-700 bg-slate-900/60 p-3"><div className="mb-2 flex items-center gap-2"><span className="text-[9px] font-black text-blue-400">PARTY {i+1}</span><button type="button" onClick={() => removeParty(i)} className="ml-auto text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="grid gap-2 md:grid-cols-3"><Input value={p.role} onChange={v => updateParty(i,'role',v)} normalize={titleCase} placeholder="Role: Subject" /><Input value={p.name} onChange={v => updateParty(i,'name',v)} normalize={titleCase} placeholder="Full Name" /><Input value={p.dob} onChange={v => updateParty(i,'dob',v)} placeholder="DOB MM/DD/YYYY" /><Input value={p.race} onChange={v => updateParty(i,'race',v)} normalize={titleCase} placeholder="Race" /><Input value={p.sex} onChange={v => updateParty(i,'sex',v)} normalize={titleCase} placeholder="Sex" /><div className="grid grid-cols-2 gap-2"><Input value={p.height} onChange={v => updateParty(i,'height',v)} placeholder="Height" /><Input value={p.weight} onChange={v => updateParty(i,'weight',v)} placeholder="Weight" /></div></div><div className="mt-2"><Textarea value={p.description} onChange={v => updateParty(i,'description',v)} normalize={sentenceCase} rows={2} /></div></div>)}</div>
    </div>

    <div className="rounded border border-yellow-900/70 bg-yellow-950/10 p-3">
      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-yellow-300"><Car className="h-3 w-3" />VEHICLES</div><button type="button" onClick={addVehicle} className="rounded border border-yellow-700 px-2 py-1 text-[9px] font-bold text-yellow-300"><Plus className="mr-1 inline h-3 w-3" />ADD VEHICLE</button></div>
      {vehicles.length === 0 && <div className="text-[10px] text-slate-600">Add each associated vehicle separately.</div>}
      <div className="space-y-3">{vehicles.map((v,i) => <div key={i} className="rounded border border-slate-700 bg-slate-900/60 p-3"><div className="mb-2 flex items-center"><span className="text-[9px] font-black text-yellow-400">VEHICLE {i+1}</span><button type="button" onClick={() => removeVehicle(i)} className="ml-auto text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="grid gap-2 md:grid-cols-4"><Input value={v.role} onChange={x => updateVehicle(i,'role',x)} normalize={titleCase} placeholder="Role" /><Input value={v.year} onChange={x => updateVehicle(i,'year',x)} placeholder="Year" /><Input value={v.color} onChange={x => updateVehicle(i,'color',x)} normalize={titleCase} placeholder="Color" /><Input value={v.make} onChange={x => updateVehicle(i,'make',x)} normalize={titleCase} placeholder="Make" /><Input value={v.model} onChange={x => updateVehicle(i,'model',x)} normalize={titleCase} placeholder="Model" /><Input value={v.plate} onChange={x => updateVehicle(i,'plate',upper(x))} placeholder="Plate" /><Input value={v.state} onChange={x => updateVehicle(i,'state',upper(x))} placeholder="State" /></div><div className="mt-2"><Textarea value={v.description} onChange={x => updateVehicle(i,'description',x)} normalize={sentenceCase} rows={2} /></div></div>)}</div>
    </div>

    <div className="grid gap-3 md:grid-cols-2"><Field label="LAST KNOWN / LAST SEEN LOCATION"><Input value={data.last_known_location} onChange={v => set('last_known_location', v)} normalize={titleCase} placeholder="Address / area / landmark" /></Field><Field label="LAST KNOWN TRAVEL / DIRECTION"><Input value={data.last_known_direction} onChange={v => set('last_known_direction', v)} normalize={titleCase} placeholder="Northbound on Broad St / toward downtown" /></Field></div>
    <Field label="FULL BOLO NARRATIVE"><Textarea value={data.description} onChange={v => set('description', v)} normalize={sentenceCase} rows={4} /></Field>
    <div className="grid gap-3 md:grid-cols-2"><Field label="CONTACT INFO"><Input value={data.contact_info} onChange={v => set('contact_info', v)} normalize={titleCase} placeholder="Unit / phone / agency" /></Field><Field label="EXPIRES AT"><input type="datetime-local" value={data.expires_at ? data.expires_at.slice(0,16) : ''} onChange={e => set('expires_at', e.target.value ? new Date(e.target.value).toISOString() : '')} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" /></Field></div>
    <Field label="INTERNAL NOTES"><Textarea value={data.notes} onChange={v => set('notes', v)} normalize={sentenceCase} rows={2} /></Field>
  </div>;
}

export default function BOLOModal({ mode, bolo, user, onClose, onSaved }) {
  const draftKey = useMemo(() => `bps-bolo-draft:${user?.id || user?.email || 'user'}:${mode}:${bolo?.id || 'new'}`, [user?.id, user?.email, mode, bolo?.id]);
  const initial = useMemo(() => {
    const base = { ...bolo, parties: bolo?.parties?.length ? bolo.parties : legacyParty(bolo), vehicles: bolo?.vehicles?.length ? bolo.vehicles : legacyVehicle(bolo), photo_urls: bolo?.photo_urls || [] };
    if (mode !== 'create' && mode !== 'edit') return base;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return base;
      const parsed = JSON.parse(saved);
      return { ...base, ...(parsed?.data || {}) };
    } catch {
      return base;
    }
  }, [bolo, mode, draftKey]);
  const [formData, setFormData] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [emailing, setEmailing] = useState(false);
  const isEditing = mode === 'create' || mode === 'edit';
  const isServerDraft = formData?.status === 'draft' || bolo?.status === 'draft';

  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ saved_at: new Date().toISOString(), data: formData }));
      } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [formData, draftKey, isEditing]);

  const normalizedData = () => ({
    ...formData,
    title: titleCase(formData.title),
    jurisdiction: titleCase(formData.jurisdiction),
    last_known_location: titleCase(formData.last_known_location),
    last_known_direction: titleCase(formData.last_known_direction),
    case_number: upper(formData.case_number),
    description: sentenceCase(formData.description),
    notes: sentenceCase(formData.notes),
    parties: (formData.parties || []).map(p => ({ ...p, role: titleCase(p.role), name: titleCase(p.name), race: titleCase(p.race), sex: titleCase(p.sex), description: sentenceCase(p.description) })),
    vehicles: (formData.vehicles || []).map(v => ({ ...v, role: titleCase(v.role), color: titleCase(v.color), make: titleCase(v.make), model: titleCase(v.model), plate: upper(v.plate), state: upper(v.state), description: sentenceCase(v.description) })),
  });

  const saveToServer = async (action) => {
    setSaveError('');
    if (!formData.alert_type) {
      setSaveError('Select an alert type before saving.');
      return;
    }
    if ((action === 'create' || action === 'release') && !String(formData.title || '').trim()) {
      setSaveError('Enter a BOLO title before release.');
      return;
    }
    setSaving(true);
    try {
      const response = await base44.functions.invoke('manageBolo', {
        action,
        id: formData.id || bolo?.id || undefined,
        data: normalizedData(),
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      // Issuing/releasing a BOLO automatically sends the same HTML bulletin to
      // every active internal user. Drafts and ordinary edits do not create a
      // second blast; the view screen keeps a manual RESEND option when needed.
      if (action === 'create' || action === 'release') {
        let releasedBolo = payload.record || null;
        const releasedId = releasedBolo?.id || formData.id || bolo?.id;
        if (!releasedBolo && releasedId) releasedBolo = await base44.entities.BOLOAlert.get(releasedId).catch(() => null);
        if (releasedBolo?.id) {
          const mailResponse = await base44.functions.invoke('sendBoloEmail', { bolo: releasedBolo });
          const mailPayload = mailResponse?.data || mailResponse || {};
          payload.email_delivery = mailPayload;
          if (mailPayload.error) console.error('Automatic BOLO email failed:', mailPayload.error);
        }
      }
      localStorage.removeItem(draftKey);
      onSaved(payload);
    } catch (error) {
      setSaveError(error?.response?.data?.error || error?.message || 'Unable to save BOLO.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => saveToServer(isServerDraft ? 'release' : (formData.id ? 'edit' : 'create'));
  const handleSaveDraft = () => saveToServer('save_draft');
  const printBolo = () => {
    const sheet = document.getElementById('bolo-print-sheet');
    if (!sheet) return;
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      setSaveError('Allow pop-ups for Pathfinder to print the BOLO.');
      return;
    }
    const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map(node => node.outerHTML).join('\n');
    printWindow.document.write(`<!doctype html><html><head><title>${String(bolo?.bolo_number || 'BOLO')} - Print</title>${styles}<style>
      @page{size:Letter portrait;margin:.18in}html,body{margin:0!important;padding:0!important;background:#fff!important;width:8.14in!important}body{overflow:visible!important}#print-page{width:8.14in;box-sizing:border-box;transform-origin:top left}.print-hide{display:none!important}#print-page>div{margin:0!important;box-shadow:none!important;padding:.16in!important;border-width:2px!important}#print-page h2{font-size:17px!important;margin:.08in 0!important}#print-page .text-lg{font-size:15px!important}#print-page .text-sm{font-size:10px!important;line-height:1.25!important}#print-page .text-xs{font-size:8.5px!important;line-height:1.2!important}#print-page .mt-5,#print-page .mt-4{margin-top:.09in!important}#print-page .pt-4{padding-top:.07in!important}#print-page .gap-4,#print-page .gap-3{gap:.08in!important}#print-page .min-h-56{min-height:0!important}#print-page img{max-height:2.55in!important;object-fit:contain!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@media print{html,body{height:auto!important}#print-page{page-break-inside:avoid!important;break-inside:avoid-page!important}}
    </style></head><body><div id="print-page">${sheet.innerHTML}</div><script>
      const root=document.getElementById('print-page');
      const imgs=[...document.images];
      const ready=Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})));
      ready.then(()=>{requestAnimationFrame(()=>{const maxH=10.55*96,maxW=8.14*96;const naturalH=root.scrollHeight,naturalW=root.scrollWidth;const scale=Math.min(1,maxH/naturalH,maxW/naturalW);root.style.zoom=String(Math.max(.58,scale));setTimeout(()=>window.print(),180);});});
    <\/script></body></html>`);
    printWindow.document.close();
  };
  const emailBolo = async () => {
    setSaveError(''); setEmailing(true);
    try { const response = await base44.functions.invoke('sendBoloEmail', { bolo }); const payload=response?.data||response||{}; if(payload.error) throw new Error(payload.error); setSaveError(`BOLO HTML emailed to ${payload.sent} active users from ${payload.sender}.`); }
    catch(error){ setSaveError(error?.message||'Unable to email BOLO.'); }
    finally { setEmailing(false); }
  };

  return <Dialog open onOpenChange={v => !v && onClose()}><DialogContent className="max-h-[94dvh] w-[calc(100vw-1rem)] max-w-4xl overflow-x-hidden overflow-y-auto border-slate-700 bg-slate-950 p-3 text-white sm:p-6"><DialogHeader><DialogTitle className="font-mono tracking-widest text-gold">{mode === 'create' ? 'NEW BOLO' : mode === 'edit' && isServerDraft ? 'CONTINUE BOLO DRAFT' : mode === 'edit' ? 'EDIT BOLO' : 'BOLO DETAIL'}</DialogTitle></DialogHeader>{isEditing ? <FormView data={formData} onChange={setFormData} /> : <DetailView bolo={bolo} />}{!isEditing && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3 print:hidden"><button onClick={printBolo} className="rounded border border-slate-600 px-4 py-2 text-xs font-bold text-white"><Printer className="mr-2 inline h-4 w-4"/>PRINT HTML BOLO</button><button onClick={emailBolo} disabled={emailing} className="rounded border border-red-600 bg-red-950/40 px-4 py-2 text-xs font-bold text-red-200 disabled:opacity-50"><Mail className="mr-2 inline h-4 w-4"/>{emailing?'SENDING...':'EMAIL HTML TO ALL USERS'}</button>{saveError&&<div className="w-full text-right text-xs text-amber-300">{saveError}</div>}</div>}{isEditing && <div className="mt-2 border-t border-slate-800 pt-3">{saveError && <div className="mb-3 rounded border border-red-700/60 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-200">{saveError}</div>}<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="text-[10px] font-mono text-emerald-400">CHANGES AUTO-SAVE LOCALLY · USE SAVE DRAFT TO KEEP IT IN PATHFINDER FOR LATER RELEASE</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><button onClick={onClose} className="w-full px-4 py-2 text-sm font-mono text-slate-400 hover:text-white sm:w-auto">CLOSE</button><button onClick={handleSaveDraft} disabled={saving} className="w-full rounded border border-amber-500 bg-amber-950/50 px-5 py-2 text-sm font-mono font-bold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50 sm:w-auto">{saving ? 'SAVING...' : 'SAVE DRAFT'}</button><button onClick={handleSave} disabled={saving} className="w-full rounded border border-red-500 bg-red-700 px-6 py-2 text-sm font-mono font-bold text-white hover:bg-red-600 disabled:opacity-50 sm:w-auto">{saving ? 'SAVING...' : isServerDraft ? 'RELEASE BOLO' : formData.id ? 'SAVE CHANGES' : 'ISSUE BOLO'}</button></div></div></div>}</DialogContent></Dialog>;
}
