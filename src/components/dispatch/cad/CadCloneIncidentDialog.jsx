import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cadReferenceValue } from '@/lib/cadOperationalStatus';
import { Copy } from 'lucide-react';
import './cad-upgrade.css';

const PRIORITIES = [
  { id: 'critical', label: 'P1 · Critical' },
  { id: 'high', label: 'P2 · High' },
  { id: 'medium', label: 'P3 · Standard' },
  { id: 'low', label: 'P4 · Low' },
];

const emptyForm = call => ({
  incident: call?.incident || '',
  location: call?.location || '',
  cross_street: call?.cross_street || '',
  agency: call?.agency || '',
  zone: call?.zone || '',
  hazards: call?.hazards || '',
  priority: String(call?.priority || 'medium').toLowerCase(),
  description: call?.description ? `Related to ${cadReferenceValue(call)} — ${call.description}` : `Related to ${cadReferenceValue(call)}.`,
});

/**
 * Incident cloning. A related incident starts from the call already on screen —
 * same address, agency and hazards — through the same createDispatchCall path
 * every other CAD call uses, so geocoding, references and alerts still run.
 */
export default function CadCloneIncidentDialog({ open, onOpenChange, call, onCloned }) {
  const [form, setForm] = useState(() => emptyForm(call));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(emptyForm(call));
      setError('');
    }
  }, [open, call?.id]);

  const field = (key, label, { textarea = false, required = false } = {}) => (
    <label key={key} className="cad-clone-field">
      <span>{label}{required ? ' *' : ''}</span>
      {textarea ? (
        <textarea rows={3} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
      ) : (
        <input value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
      )}
    </label>
  );

  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    if (!form.incident.trim() || !form.location.trim()) {
      setError('Incident type and location are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        incident: form.incident.trim(),
        location: form.location.trim(),
        priority: form.priority,
        description: form.description,
        source: 'CAD clone',
      };
      if (form.cross_street.trim()) data.cross_street = form.cross_street.trim();
      if (form.agency.trim()) data.agency = form.agency.trim();
      if (form.zone.trim()) data.zone = form.zone.trim();
      if (form.hazards.trim()) data.hazards = form.hazards.trim();
      const unchangedAddress = form.location.trim().toLowerCase() === String(call?.location || '').trim().toLowerCase();
      if (unchangedAddress && Number.isFinite(Number(call?.latitude)) && Number.isFinite(Number(call?.longitude))) {
        data.latitude = Number(call.latitude);
        data.longitude = Number(call.longitude);
      }
      const response = await base44.functions.invoke('createDispatchCall', { data, selected_units: [] });
      const payload = response?.data || {};
      if (payload.error) throw new Error(payload.error);
      window.dispatchEvent(new CustomEvent('bps-data-changed', {
        detail: { kind: 'entity', name: 'DispatchCall', method: 'create', at: Date.now() },
      }));
      onCloned?.(payload.call);
      onOpenChange?.(false);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || 'The incident could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cad-clone max-w-2xl border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle><Copy size={16} /> Clone incident</DialogTitle>
          <DialogDescription>
            Creates a new related call from {cadReferenceValue(call)}. The original incident is left untouched.
          </DialogDescription>
        </DialogHeader>
        <form className="cad-clone-form" onSubmit={submit}>
          <div className="cad-clone-grid">
            {field('incident', 'Incident type', { required: true })}
            {field('location', 'Location', { required: true })}
            {field('cross_street', 'Cross street')}
            {field('agency', 'Agency')}
            {field('zone', 'Zone / beat')}
            <label className="cad-clone-field">
              <span>Priority</span>
              <select value={form.priority} onChange={event => setForm(previous => ({ ...previous, priority: event.target.value }))}>
                {PRIORITIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          {field('hazards', 'Hazards')}
          {field('description', 'Narrative', { textarea: true })}
          {error && <p className="cad-clone-error" role="alert">{error}</p>}
          <footer>
            <button type="button" onClick={() => onOpenChange?.(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="cad-clone-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create related incident'}
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}