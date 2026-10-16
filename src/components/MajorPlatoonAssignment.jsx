import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invalidateAppDirectory } from '@/lib/appDirectory';
import { majorPlatoon } from '@/utils/commandReporting';
export default function MajorPlatoonAssignment({ person, onSaved }) {
  const [draft,setDraft]=useState(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const queryClient=useQueryClient();
  const value=draft ?? majorPlatoon(person);
  async function save() {
    setSaving(true); setError('');
    try {
      const result=await base44.functions.invoke('updateUser',{userId:person.id,updates:{platoon:value}});
      const payload=result?.data || result || {};
      if(!payload.success) throw new Error(payload.error || 'Unable to save platoon');
      invalidateAppDirectory();
      await queryClient.invalidateQueries({predicate:query=>/user|directory|rank/i.test(JSON.stringify(query.queryKey))});
      setDraft(null); onSaved?.();
    } catch (err) { setError(err.message || 'Unable to save platoon'); }
    finally { setSaving(false); }
  }
  return <div className="mt-3 space-y-2 text-xs">
    <label className="block">Major platoon oversight
      <select aria-label={`Platoon oversight for ${person.first_name || ''} ${person.last_name || ''}`} value={value} disabled={saving} onChange={event=>setDraft(event.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-white">
        <option value="">Unassigned — select A or B</option><option value="A">Platoon A</option><option value="B">Platoon B</option>
      </select>
    </label>
    <button type="button" onClick={save} disabled={saving || !value || value===majorPlatoon(person)} className="w-full rounded border border-amber-500 p-2 disabled:opacity-40">{saving?'Saving…':'Save platoon oversight'}</button>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </div>;
}
