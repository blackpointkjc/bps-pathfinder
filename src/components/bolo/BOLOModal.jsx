import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TYPE_CONFIG, PRIORITY_STYLE } from '@/pages/BOLOAlerts';

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-mono text-slate-400 block mb-1 tracking-widest">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, className = '' }) {
  return (
    <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-gold ${className}`} />
  );
}

function Textarea({ value, onChange, rows = 3 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-gold resize-none" />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-gold">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DetailView({ bolo }) {
  const cfg = TYPE_CONFIG[bolo.alert_type] || TYPE_CONFIG.watch_notice;
  const Icon = cfg.icon;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-mono font-bold border ${cfg.badge}`}><Icon className="w-3.5 h-3.5" />{cfg.label}</span>
        <span className={`text-xs font-mono font-bold px-3 py-1 rounded border ${PRIORITY_STYLE[bolo.priority] || PRIORITY_STYLE.medium}`}>{(bolo.priority || 'medium').toUpperCase()} PRIORITY</span>
        <span className={`text-xs font-mono font-bold ${bolo.status === 'active' ? 'text-green-400' : bolo.status === 'located' ? 'text-blue-400' : 'text-slate-500'}`}>● {(bolo.status || '').toUpperCase()}</span>
        {bolo.bolo_number && <span className="text-xs font-mono text-slate-500">#{bolo.bolo_number}</span>}
      </div>
      <div>
        <h2 className="text-lg font-bold font-mono text-white">{bolo.title}</h2>
        {bolo.case_number && <p className="text-xs font-mono text-slate-500">Case: {bolo.case_number}</p>}
      </div>
      {bolo.description && <p className="text-slate-300 text-sm font-mono leading-relaxed">{bolo.description}</p>}
      {bolo.subject_name && (
        <div className="border border-slate-700 rounded p-3 space-y-1">
          <p className="text-[10px] font-mono text-slate-500 font-bold tracking-widest">SUBJECT</p>
          <p className="font-mono text-white font-bold">{bolo.subject_name}</p>
          <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-400">
            {bolo.subject_dob && <span>DOB: {bolo.subject_dob}</span>}
            {bolo.subject_race && <span>Race: {bolo.subject_race}</span>}
            {bolo.subject_sex && <span>Sex: {bolo.subject_sex}</span>}
            {bolo.subject_height && <span>Ht: {bolo.subject_height}</span>}
            {bolo.subject_weight && <span>Wt: {bolo.subject_weight}</span>}
          </div>
          {bolo.subject_description && <p className="text-xs font-mono text-slate-400 mt-1">{bolo.subject_description}</p>}
        </div>
      )}
      {bolo.vehicle_plate && (
        <div className="border border-yellow-700/50 rounded p-3 bg-yellow-900/10">
          <p className="text-[10px] font-mono text-yellow-500 font-bold tracking-widest mb-1">VEHICLE</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-white">{[bolo.vehicle_year, bolo.vehicle_color, bolo.vehicle_make, bolo.vehicle_model].filter(Boolean).join(' ')}</p>
            <span className="px-2 py-0.5 bg-yellow-900/70 border border-yellow-500/70 rounded font-mono text-yellow-200 text-xs font-bold">{bolo.vehicle_plate}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {bolo.last_known_location && <div><span className="text-slate-500">LAST SEEN: </span><span className="text-slate-200">{bolo.last_known_location}</span></div>}
        {bolo.jurisdiction && <div><span className="text-slate-500">JURISDICTION: </span><span className="text-slate-200">{bolo.jurisdiction}</span></div>}
        {bolo.issued_by && <div><span className="text-slate-500">ISSUED BY: </span><span className="text-slate-200">{bolo.issued_by}</span></div>}
        {bolo.contact_info && <div><span className="text-slate-500">CONTACT: </span><span className="text-slate-200">{bolo.contact_info}</span></div>}
        {bolo.expires_at && <div><span className="text-slate-500">EXPIRES: </span><span className="text-slate-200">{new Date(bolo.expires_at).toLocaleString()}</span></div>}
      </div>
      {bolo.notes && (
        <div className="border border-slate-700 rounded p-3">
          <p className="text-[10px] font-mono text-slate-500 mb-1 font-bold tracking-widest">NOTES</p>
          <p className="text-sm font-mono text-slate-300">{bolo.notes}</p>
        </div>
      )}
    </div>
  );
}

function FormView({ data, onChange }) {
  const set = (field, val) => onChange(prev => ({ ...prev, [field]: val }));
  const isPerson  = ['wanted_person', 'missing_person'].includes(data.alert_type);
  const isVehicle = data.alert_type === 'stolen_vehicle';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="ALERT TYPE *">
          <Select value={data.alert_type} onChange={v => set('alert_type', v)} options={[
            { value: 'wanted_person', label: 'Wanted Person' },
            { value: 'missing_person', label: 'Missing Person' },
            { value: 'stolen_vehicle', label: 'Stolen Vehicle' },
            { value: 'officer_safety', label: 'Officer Safety' },
            { value: 'special_instruction', label: 'Special Instruction' },
            { value: 'property_alert', label: 'Property Alert' },
            { value: 'watch_notice', label: 'Watch Notice' },
          ]} />
        </Field>
        <Field label="PRIORITY *">
          <Select value={data.priority} onChange={v => set('priority', v)} options={[
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]} />
        </Field>
      </div>
      <Field label="TITLE / HEADLINE *">
        <Input value={data.title} onChange={v => set('title', v)} placeholder="Brief description..." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CASE NUMBER"><Input value={data.case_number} onChange={v => set('case_number', v)} /></Field>
        <Field label="JURISDICTION"><Input value={data.jurisdiction} onChange={v => set('jurisdiction', v)} /></Field>
      </div>

      {isPerson && (
        <div className="border border-slate-700 rounded p-3 space-y-3">
          <p className="text-[10px] font-mono text-slate-400 font-bold tracking-widest">SUBJECT INFORMATION</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="FULL NAME"><Input value={data.subject_name} onChange={v => set('subject_name', v)} /></Field>
            <Field label="DATE OF BIRTH"><Input value={data.subject_dob} onChange={v => set('subject_dob', v)} placeholder="MM/DD/YYYY" /></Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="RACE"><Input value={data.subject_race} onChange={v => set('subject_race', v)} /></Field>
            <Field label="SEX"><Input value={data.subject_sex} onChange={v => set('subject_sex', v)} /></Field>
            <Field label="HEIGHT"><Input value={data.subject_height} onChange={v => set('subject_height', v)} placeholder='5&apos;10"' /></Field>
            <Field label="WEIGHT"><Input value={data.subject_weight} onChange={v => set('subject_weight', v)} placeholder="180 lbs" /></Field>
          </div>
          <Field label="PHYSICAL DESCRIPTION"><Textarea value={data.subject_description} onChange={v => set('subject_description', v)} rows={2} /></Field>
        </div>
      )}

      {isVehicle && (
        <div className="border border-slate-700 rounded p-3 space-y-3">
          <p className="text-[10px] font-mono text-slate-400 font-bold tracking-widest">VEHICLE INFORMATION</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="MAKE"><Input value={data.vehicle_make} onChange={v => set('vehicle_make', v)} /></Field>
            <Field label="MODEL"><Input value={data.vehicle_model} onChange={v => set('vehicle_model', v)} /></Field>
            <Field label="YEAR"><Input value={data.vehicle_year} onChange={v => set('vehicle_year', v)} /></Field>
            <Field label="COLOR"><Input value={data.vehicle_color} onChange={v => set('vehicle_color', v)} /></Field>
          </div>
          <Field label="LICENSE PLATE">
            <Input value={data.vehicle_plate} onChange={v => set('vehicle_plate', v.toUpperCase())} placeholder="ABC-1234" className="uppercase" />
          </Field>
        </div>
      )}

      <Field label="LAST KNOWN LOCATION"><Input value={data.last_known_location} onChange={v => set('last_known_location', v)} /></Field>
      <Field label="FULL DESCRIPTION / NARRATIVE"><Textarea value={data.description} onChange={v => set('description', v)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CONTACT INFO"><Input value={data.contact_info} onChange={v => set('contact_info', v)} placeholder="Unit / phone" /></Field>
        <Field label="EXPIRES AT">
          <input type="datetime-local" value={data.expires_at ? data.expires_at.slice(0, 16) : ''}
            onChange={e => set('expires_at', e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-gold" />
        </Field>
      </div>
      <Field label="NOTES"><Textarea value={data.notes} onChange={v => set('notes', v)} rows={2} /></Field>
      {data.id && (
        <Field label="STATUS">
          <Select value={data.status} onChange={v => set('status', v)} options={[
            { value: 'active', label: 'Active' },
            { value: 'located', label: 'Located' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'expired', label: 'Expired' },
          ]} />
        </Field>
      )}
    </div>
  );
}

export default function BOLOModal({ mode, bolo, user, onClose, onSaved }) {
  const [formData, setFormData] = useState(bolo || {});
  const [saving, setSaving] = useState(false);
  const isEditing = mode === 'create' || mode === 'edit';

  const handleSave = async () => {
    if (!formData.title || !formData.alert_type) return;
    setSaving(true);
    if (formData.id) {
      await base44.entities.BOLOAlert.update(formData.id, formData);
    } else {
      await base44.entities.BOLOAlert.create({
        ...formData,
        bolo_number: `BOLO-${Date.now().toString().slice(-6)}`,
        issued_by: user?.full_name || 'Dispatch',
        issued_by_id: user?.id,
      });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-gold tracking-widest">
            {mode === 'create' ? 'ISSUE NEW BOLO' : mode === 'edit' ? 'EDIT BOLO' : 'BOLO DETAIL'}
          </DialogTitle>
        </DialogHeader>
        {isEditing ? <FormView data={formData} onChange={setFormData} /> : <DetailView bolo={bolo} />}
        {isEditing && (
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 mt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-mono text-slate-400 hover:text-white transition-colors">CANCEL</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-mono font-bold rounded border border-red-500 transition-colors">
              {saving ? 'SAVING...' : formData.id ? 'SAVE CHANGES' : 'ISSUE BOLO'}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}