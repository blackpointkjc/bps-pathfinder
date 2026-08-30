import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Radio, Eye, Hand, Power, Radar, Save, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const modeLabel = location => location?.auto_dispatch_enabled === true ? (location.auto_dispatch_mode || 'shadow') : 'disabled';

export default function AdminAutoDispatchControls() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const isAdmin = user?.role === 'admin' || (user?.additional_roles || []).includes('full_access');

  const { data: locations = [], isLoading, error, refetch } = useQuery({
    queryKey: ['autoDispatchManagedLocations'],
    queryFn: async () => {
      const response = await base44.functions.invoke('manageLocations', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return (payload.locations || []).filter(location => location.active !== false && location.property_monitoring_enabled === true);
    },
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['autoDispatchManagedLocations'] }),
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] }),
      queryClient.invalidateQueries({ queryKey: ['directoryLocations'] }),
    ]);
  };

  const modeMutation = useMutation({
    mutationFn: async ({ location, mode }) => {
      const data = mode === 'disabled'
        ? { auto_dispatch_enabled: false, auto_dispatch_mode: 'disabled' }
        : { auto_dispatch_enabled: true, auto_dispatch_mode: mode };
      const response = await base44.functions.invoke('manageLocations', { action: 'update', id: location.id, data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: async location => {
      await refreshAll();
      toast.success(`${location?.site_name || 'Property'} automatic dispatch updated.`);
    },
    onError: error => toast.error(error?.response?.data?.error || error?.message || 'Automatic dispatch mode could not be changed.'),
  });

  const settingsMutation = useMutation({
    mutationFn: async () => {
      if (!editingId || !form) throw new Error('Select a property first.');
      const response = await base44.functions.invoke('manageLocations', {
        action: 'update',
        id: editingId,
        data: {
          auto_dispatch_response_radius_miles: Number(form.auto_dispatch_response_radius_miles || 5),
          auto_dispatch_required_units: Math.max(1, Number(form.auto_dispatch_required_units || 1)),
          auto_dispatch_backup_required: form.auto_dispatch_backup_required === true,
          auto_dispatch_acknowledgement_seconds: Math.max(30, Number(form.auto_dispatch_acknowledgement_seconds || 120)),
          auto_dispatch_escalation_seconds: Math.max(60, Number(form.auto_dispatch_escalation_seconds || 300)),
          auto_dispatch_recheck_seconds: Math.max(30, Number(form.auto_dispatch_recheck_seconds || 60)),
        },
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: async location => {
      await refreshAll();
      toast.success(`${location?.site_name || 'Property'} automatic-dispatch settings saved.`);
    },
    onError: error => toast.error(error?.response?.data?.error || error?.message || 'Settings could not be saved.'),
  });

  const editProperty = location => {
    setEditingId(location.id);
    setForm({
      auto_dispatch_response_radius_miles: Number(location.auto_dispatch_response_radius_miles || 5),
      auto_dispatch_required_units: Number(location.auto_dispatch_required_units || 1),
      auto_dispatch_backup_required: location.auto_dispatch_backup_required === true,
      auto_dispatch_acknowledgement_seconds: Number(location.auto_dispatch_acknowledgement_seconds || 120),
      auto_dispatch_escalation_seconds: Number(location.auto_dispatch_escalation_seconds || 300),
      auto_dispatch_recheck_seconds: Number(location.auto_dispatch_recheck_seconds || 60),
    });
  };

  useEffect(() => {
    if (!editingId || !locations.some(location => location.id === editingId)) {
      if (locations[0]) editProperty(locations[0]);
      else { setEditingId(''); setForm(null); }
    }
  }, [locations, editingId]);

  if (!isAdmin) return <div className="p-8 text-center text-slate-400">Administrator access is required to change automatic-dispatch modes.</div>;

  return (
    <div className="bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.24em] text-cyan-300"><Radar className="h-4 w-4"/>Dispatch Automation</div><h1 className="mt-2 text-3xl font-black md:text-4xl">Automatic Dispatch Controls</h1><p className="mt-2 max-w-4xl text-sm text-slate-400">Separate from geofence alerts. Configure whether each monitored property runs Live assignment, Shadow recommendations, Manual Review, or Off.</p></div>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-sm font-semibold text-red-200"><AlertTriangle className="mr-2 inline h-4 w-4"/>{error.message}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl">
            <div className="mb-4"><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Monitored Properties</div><p className="mt-1 text-xs text-slate-500">Mode buttons save immediately. Select a property card to edit its Shadow/Live operating thresholds.</p></div>
            <div className="grid gap-3 lg:grid-cols-2">
              {locations.map(location => {
                const mode = modeLabel(location);
                const selected = editingId === location.id;
                return <Card key={location.id} className={`cursor-pointer border bg-[#09111d] text-white transition ${selected?'border-cyan-500/70 ring-1 ring-cyan-500/20':'border-slate-700 hover:border-slate-500'}`} onClick={() => editProperty(location)}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{location.site_name}</div><Badge className={`mt-2 ${mode==='live'?'bg-emerald-800 text-emerald-100':mode==='shadow'?'bg-cyan-900 text-cyan-100':mode==='manual_review'?'bg-amber-800 text-amber-100':'bg-red-900 text-red-100'}`}>{mode.replaceAll('_',' ').toUpperCase()}</Badge></div><div className="text-right text-[10px] text-slate-500">{location.auto_dispatch_required_units || 1} UNIT{Number(location.auto_dispatch_required_units || 1)===1?'':'S'}<br/>{location.auto_dispatch_response_radius_miles || 5} MI RADIUS</div></div><div className="mt-4 grid grid-cols-2 gap-2" onClick={event => event.stopPropagation()}><Button size="sm" type="button" disabled={modeMutation.isPending} onClick={() => modeMutation.mutate({location,mode:'live'})} className={mode==='live'?'bg-emerald-700 hover:bg-emerald-600':'bg-slate-800 hover:bg-slate-700'}><Radio className="mr-1 h-3.5 w-3.5"/>LIVE</Button><Button size="sm" type="button" disabled={modeMutation.isPending} onClick={() => modeMutation.mutate({location,mode:'shadow'})} className={mode==='shadow'?'bg-cyan-700 hover:bg-cyan-600':'bg-slate-800 hover:bg-slate-700'}><Eye className="mr-1 h-3.5 w-3.5"/>SHADOW</Button><Button size="sm" type="button" disabled={modeMutation.isPending} onClick={() => modeMutation.mutate({location,mode:'manual_review'})} className={mode==='manual_review'?'bg-amber-700 hover:bg-amber-600':'bg-slate-800 hover:bg-slate-700'}><Hand className="mr-1 h-3.5 w-3.5"/>MANUAL</Button><Button size="sm" type="button" disabled={modeMutation.isPending} onClick={() => modeMutation.mutate({location,mode:'disabled'})} className={mode==='disabled'?'bg-red-800 hover:bg-red-700':'bg-slate-800 hover:bg-slate-700'}><Power className="mr-1 h-3.5 w-3.5"/>OFF</Button></div></CardContent></Card>;
              })}
              {!isLoading && !locations.length && <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No active Property Monitoring locations are available.</div>}
            </div>
          </section>

          <aside className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl">
            <div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Shadow / Dispatch Settings</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">These thresholds are used by Shadow recommendations and Live automatic assignment for the selected property.</p>
            {form ? <div className="mt-5 space-y-4"><div><Label>Response Radius (miles)</Label><Input type="number" min="0.1" step="0.1" value={form.auto_dispatch_response_radius_miles} onChange={e=>setForm({...form,auto_dispatch_response_radius_miles:e.target.value})}/></div><div><Label>Required Units</Label><Input type="number" min="1" value={form.auto_dispatch_required_units} onChange={e=>setForm({...form,auto_dispatch_required_units:e.target.value})}/></div><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#09111d] p-3"><div><Label>Backup Required</Label><p className="text-[10px] text-slate-500">Require a backup recommendation/assignment.</p></div><Switch checked={form.auto_dispatch_backup_required} onCheckedChange={value=>setForm({...form,auto_dispatch_backup_required:value})}/></div><div><Label>Acknowledgement Timer (seconds)</Label><Input type="number" min="30" value={form.auto_dispatch_acknowledgement_seconds} onChange={e=>setForm({...form,auto_dispatch_acknowledgement_seconds:e.target.value})}/></div><div><Label>Escalation Timer (seconds)</Label><Input type="number" min="60" value={form.auto_dispatch_escalation_seconds} onChange={e=>setForm({...form,auto_dispatch_escalation_seconds:e.target.value})}/></div><div><Label>Recheck Interval (seconds)</Label><Input type="number" min="30" value={form.auto_dispatch_recheck_seconds} onChange={e=>setForm({...form,auto_dispatch_recheck_seconds:e.target.value})}/></div><Button className="w-full bg-cyan-700 hover:bg-cyan-600" disabled={settingsMutation.isPending} onClick={()=>settingsMutation.mutate()}><Save className="mr-2 h-4 w-4"/>{settingsMutation.isPending?'SAVING…':'SAVE DISPATCH SETTINGS'}</Button></div> : <div className="mt-8 text-center text-sm text-slate-500">Select a monitored property.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}
