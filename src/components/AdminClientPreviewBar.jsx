import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Eye, X } from 'lucide-react';
import { getClientPreviewId, setClientPreviewId } from '@/utils/clientPreview';

export default function AdminClientPreviewBar({ user, activeCenter }) {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(() => getClientPreviewId());

  useEffect(() => {
    if (user?.role !== 'admin' || activeCenter !== 'client') return;
    base44.entities.User.list('-last_updated', 500).then(users => {
      setClients((users || []).filter(person => (person.additional_roles || []).includes('client') || person.user_type === 'client'));
    }).catch(() => setClients([]));
  }, [user?.role, activeCenter]);

  if (user?.role !== 'admin' || activeCenter !== 'client') return null;

  const apply = id => {
    setSelected(id);
    setClientPreviewId(id);
    window.location.reload();
  };

  const current = clients.find(client => client.id === selected);

  return (
    <div className="flex flex-col gap-2 border-b border-amber-500/40 bg-amber-950/90 px-3 py-2 text-amber-50 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
        <Eye className="h-4 w-4" /> Admin Client Preview
      </div>
      <select value={selected} onChange={event => apply(event.target.value)} className="min-w-0 flex-1 rounded border border-amber-500/50 bg-slate-950 px-3 py-2 text-xs text-white sm:max-w-md">
        <option value="">Select a client account to preview</option>
        {clients.map(client => <option key={client.id} value={client.id}>{client.full_name || client.email} — {(client.assigned_locations || [client.assigned_location]).filter(Boolean).join(', ') || 'No property assigned'}</option>)}
      </select>
      {current && <div className="text-xs text-amber-200">Viewing exactly what {current.full_name || current.email} can see</div>}
      {selected && <button type="button" onClick={() => apply('')} className="flex items-center justify-center gap-1 rounded border border-amber-500/50 px-3 py-2 text-xs font-bold hover:bg-amber-900"><X className="h-3 w-3" /> Exit Preview</button>}
    </div>
  );
}
