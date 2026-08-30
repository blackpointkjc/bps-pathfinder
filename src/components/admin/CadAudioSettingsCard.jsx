import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { announceVoice, setVoiceRuntimeConfig } from '@/utils/voiceAnnouncer';

const EVENT_TYPES = [
  ['new_call', 'New call'],
  ['priority_call', 'New priority call'],
  ['bolo_published', 'New BOLO'],
  ['unit_dispatched', 'Unit dispatched'],
  ['unit_enroute', 'Unit en route'],
  ['unit_on_scene', 'Unit on scene'],
  ['additional_unit', 'Additional unit'],
  ['unit_reassigned', 'Unit reassigned'],
  ['backup_requested', 'Backup requested'],
  ['officer_emergency', 'Officer emergency'],
  ['welfare_requested', 'Welfare requested'],
  ['welfare_overdue', 'Welfare overdue'],
  ['property_alert', 'Property alert'],
  ['priority_upgraded', 'Priority upgraded'],
  ['call_cancelled', 'Call cancelled'],
  ['call_cleared', 'Call cleared'],
  ['unit_available', 'Officer available'],
  ['no_eligible_unit', 'No eligible unit'],
];

const DEFAULTS = {
  settings_key: 'global',
  enabled: true,
  volume: 1,
  voice_profile: 'american_ai',
  cancelled_terminology: 'Return 10-8',
  enabled_event_types: EVENT_TYPES.map(([value]) => value),
};

export default function CadAudioSettingsCard({ user }) {
  const [recordId, setRecordId] = useState('');
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    base44.entities.CadAudioSettings.filter({ settings_key: 'global' }, '-updated_date', 1)
      .then(rows => {
        if (!active || !rows?.[0]) return;
        setRecordId(rows[0].id);
        setForm({ ...DEFAULTS, ...rows[0], enabled_event_types: rows[0].enabled_event_types || [] });
      })
      .catch(error => toast.error(error?.message || 'Unable to load CAD audio settings.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const toggleType = value => {
    setForm(current => ({
      ...current,
      enabled_event_types: current.enabled_event_types.includes(value)
        ? current.enabled_event_types.filter(item => item !== value)
        : [...current.enabled_event_types, value],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        settings_key: 'global',
        enabled: form.enabled,
        volume: Number(form.volume),
        voice_profile: form.voice_profile,
        cancelled_terminology: form.cancelled_terminology.trim() || 'Return 10-8',
        enabled_event_types: form.enabled_event_types,
        updated_by: user?.email || user?.id || 'admin',
        updated_at: new Date().toISOString(),
      };
      if (recordId) {
        await base44.entities.CadAudioSettings.update(recordId, payload);
      } else {
        const created = await base44.entities.CadAudioSettings.create(payload);
        setRecordId(created.id);
      }
      setVoiceRuntimeConfig({ volume: payload.volume, voiceProfile: payload.voice_profile });
      toast.success('CAD audio settings saved.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save CAD audio settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><CardContent className="p-6 text-sm text-slate-500">Loading CAD audio settings…</CardContent></Card>;

  return (
    <Card className="border-none shadow-xl">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
        <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5 text-blue-600" />CAD Audio Announcements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Checkbox id="cad-audio-enabled" checked={form.enabled} onCheckedChange={value => setForm({ ...form, enabled: value === true })} />
          <Label htmlFor="cad-audio-enabled">Enable operational audio announcements</Label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">Voice
            <select value={form.voice_profile} onChange={event => setForm({ ...form, voice_profile: event.target.value })} className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3">
              <option value="american_ai">American AI voice</option>
              <option value="system_default">Device system voice</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">Volume: {Math.round(Number(form.volume) * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={form.volume} onChange={event => setForm({ ...form, volume: Number(event.target.value) })} className="min-h-11 w-full" />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">Cancellation terminology
          <input value={form.cancelled_terminology} onChange={event => setForm({ ...form, cancelled_terminology: event.target.value })} maxLength={80} className="min-h-11 w-full rounded-md border border-slate-300 px-3" />
        </label>
        <div>
          <p className="mb-3 text-sm font-semibold">Enabled announcement types</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {EVENT_TYPES.map(([value, label]) => (
              <label key={value} className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <Checkbox checked={form.enabled_event_types.includes(value)} onCheckedChange={() => toggleType(value)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save CAD Audio Settings'}</Button>
          <Button type="button" variant="outline" onClick={() => {
            setVoiceRuntimeConfig({ volume: form.volume, voiceProfile: form.voice_profile });
            const accepted = announceVoice('CAD audio test. American public safety voice profile is ready.', { force: true, priority: 'low', dedupeMs: 250 });
            if (!accepted) toast.error('Audio test could not start. Check browser audio permissions.');
          }}><Volume2 className="mr-2 h-4 w-4" />Test Audio</Button>
        </div>
        <p className="text-xs text-slate-500">Testing audio does not create a CAD call, assignment, notification, or production event.</p>
      </CardContent>
    </Card>
  );
}
