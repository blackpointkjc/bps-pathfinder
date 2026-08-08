import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Eye, ShieldCheck, X } from 'lucide-react';
import { getClientPreviewId, setClientPreviewId } from '@/utils/clientPreview';

export default function AdminClientPreviewBar({ user, activeCenter }) {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(() => getClientPreviewId());

  useEffect(() => {
    if (user?.role !== 'admin' || activeCenter !== 'client') return;
    Promise.all([
      base44.entities.User.list('-last_updated', 500),
      base44.entities.Location.list('site_name', 500).catch(() => []),
    ]).then(([users, locations]) => {
      const clientUsers = (users || [])
        .filter(person => (person.additional_roles || []).includes('client') || person.user_type === 'client')
        .map(person => {
          const email = String(person.email || '').toLowerCase();
          const assignedLocations = [...new Set([
            ...(Array.isArray(person.assigned_locations) ? person.assigned_locations : []),
            ...(person.assigned_location ? [person.assigned_location] : []),
            ...(locations || []).filter(location => String(location.assigned_client_email || '').toLowerCase() === email).map(location => location.site_name),
          ].filter(Boolean))];
          return {
            ...person,
            assigned_locations: assignedLocations,
            assigned_location: person.assigned_location || assignedLocations[0] || '',
            __client_preview: true,
            __auth_admin_id: user.id,
          };
        });
      setClients(clientUsers);
    }).catch(() => setClients([]));
  }, [user?.role, user?.id, activeCenter]);

  if (user?.role !== 'admin' || activeCenter !== 'client') return null;

  const apply = id => {
    const profile = clients.find(client => client.id === id) || null;
    setSelected(id);
    setClientPreviewId(id, profile);
    window.location.reload();
  };

  const current = clients.find(client => client.id === selected);
  const clientDisplayName = client => [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim() || client?.email || 'Unnamed Client';

  return (
    <div className="border-b border-blue-500/30 bg-gradient-to-r from-[#0b1625] via-[#10233a] to-[#0b1625] px-3 py-2.5 text-white shadow-[0_6px_18px_rgba(2,8,23,.24)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-fit items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-blue-300" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">Administrator Tool</div>
            <div className="text-xs font-bold text-white">View as Client</div>
          </div>
        </div>

        <select value={selected} onChange={event => apply(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-[#07111f] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400 sm:max-w-xl">
          <option value="">Select a client to preview</option>
          {clients.map(client => <option key={client.id} value={client.id}>{clientDisplayName(client)} — {(client.assigned_locations || [client.assigned_location]).filter(Boolean).join(', ') || 'No property assigned'}</option>)}
        </select>

        {current && <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300"><Eye className="h-4 w-4 text-blue-300" /><span>Viewing portal as <strong className="text-white">{clientDisplayName(current)}</strong></span></div>}
        {selected && <button type="button" onClick={() => apply('')} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-100 hover:border-blue-400 hover:bg-slate-700"><X className="h-3.5 w-3.5" /> Exit Preview</button>}
      </div>
    </div>
  );
}
