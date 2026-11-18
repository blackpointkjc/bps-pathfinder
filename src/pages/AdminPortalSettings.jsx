import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { canAccessAccounting } from '@/lib/accountingAccess';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Shield, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import CadAudioSettingsCard from "@/components/admin/CadAudioSettingsCard";

export default function AdminPortalSettings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const [hiddenPortals, setHiddenPortals] = useState(user?.hidden_portals || []);

  useEffect(()=>{setHiddenPortals(user?.hidden_portals || []);},[user?.id,JSON.stringify(user?.hidden_portals || [])]);

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('Portal visibility settings saved.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to save portal visibility settings.'),
  });

  const handleTogglePortal = (portal) => {
    const newHidden = hiddenPortals.includes(portal)
      ? hiddenPortals.filter(p => p !== portal)
      : [...hiddenPortals, portal];
    setHiddenPortals(newHidden);
  };

  const handleSave = () => {
    updateSettingsMutation.mutate({ hidden_portals: hiddenPortals });
  };

  const isAdmin = user?.role === 'admin' || user?.additional_roles?.includes('full_access');
  const isSupervisor = hasSupervisorAccess(user);
  const isHR = user?.additional_roles?.includes('hr');
  const isClient = user?.additional_roles?.includes('client');

  const portals = [];
  
  if (!isClient) {
    portals.push({ id: 'officer', name: 'Officer Tools', available: true });
  }
  
  if (isSupervisor) {
    portals.push({ id: 'supervisor', name: 'Supervisor Portal', available: true });
  }
  
  if (isAdmin && !isClient) {
    portals.push({ id: 'admin', name: 'Admin Portal', available: true });
  }
  
  if (isHR || isAdmin) {
    portals.push({ id: 'hr', name: 'Human Resources', available: true });
  }
  
  if (isClient) {
    portals.push({ id: 'client', name: 'Client Portal', available: true });
  }

  if(canAccessAccounting(user)) portals.push({id:'accounting',name:'Accounting',available:true});
  if(user?.additional_roles?.includes('trainer')) portals.push({id:'training',name:'Training',available:true});

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <WorkspaceHeader eyebrow="Administration / Preferences" title="Portal Visibility Settings" description="Choose the workspaces shown in your navigation. These preferences apply to your account." metrics={[
          {label:'Available workspaces',value:portals.length},
          {label:'Visible',value:portals.filter(p=>!hiddenPortals.includes(p.id)).length}
        ]}>
          <Button onClick={handleSave} disabled={updateSettingsMutation.isPending} className="bg-cyan-700 hover:bg-cyan-600">{updateSettingsMutation.isPending?'Saving…':'Save preferences'}</Button>
        </WorkspaceHeader>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            <div className="border-b border-slate-700 p-5"><h2 className="font-bold text-white">Navigation workspaces</h2><p className="mt-1 text-sm text-slate-400">Select a workspace to keep it visible.</p></div>
            <div className="divide-y divide-slate-700">{portals.map(portal=>{
              const visible=!hiddenPortals.includes(portal.id);
              return <label key={portal.id} className="flex cursor-pointer items-center justify-between gap-4 p-5 hover:bg-slate-800">
                <div className="flex items-center gap-3"><Checkbox id={portal.id} checked={visible} onCheckedChange={()=>handleTogglePortal(portal.id)}/><span className="font-medium text-white">{portal.name}</span></div>
                <span className={'flex items-center gap-2 text-xs '+(visible?'text-emerald-300':'text-slate-400')}>{visible?<Eye className="h-4 w-4"/>:<EyeOff className="h-4 w-4"/>}{visible?'Visible':'Hidden'}</span>
              </label>;
            })}</div>
            <p className="border-t border-slate-700 p-5 text-xs leading-relaxed text-slate-400">Visibility changes your navigation. Account permissions continue to control which tools you can open.</p>
          </section>
          <section className="min-w-0"><div className="mb-3"><h2 className="font-bold text-white">CAD audio</h2><p className="mt-1 text-sm text-slate-400">Configure alert playback for this device.</p></div><CadAudioSettingsCard user={user}/></section>
        </div>
      </div>
    </div>
  );
}
