import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Mail, Phone, MapPin, Edit, Trash2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invalidateAppDirectory, listDirectoryUsers, listDirectoryLocations } from '@/lib/appDirectory';
import { isClientAccount } from '@/lib/directoryUtils';

export default function ManageClients() {
  const [clientSearch,setClientSearch]=useState("");
  const [propertyFilter,setPropertyFilter]=useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    property_names: [],
    email: "",
    mobile_phone: "",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isSystemAdmin = user?.role === 'admin';
  const hasAccess = isSystemAdmin || user?.additional_roles?.includes('full_access');

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'manageClients'],
    queryFn: () => listDirectoryLocations('site_name', 1000),
    enabled: hasAccess,
    initialData: [],
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'manageClients'],
    queryFn: () => listDirectoryUsers('last_name', 1000, true),
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    initialData: [],
  });
  const clientUsers = directoryUsers.filter(isClientAccount);
  const availableLocations = locations.filter(location => location.active !== false);

  const createClientMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('createPortalAccount', {
        accountType: 'client',
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        mobile_phone: data.mobile_phone,
        assigned_location: data.property_names[0] || '',
        assigned_locations: data.property_names,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hrClientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
      setShowDialog(false);
      resetForm();
      const accountMessage = result?.invitation_pending
        ? 'The client account setup was saved, but the platform invitation provider is still processing. The Black Point setup email was sent so the client can use Forgot Password once the account appears.'
        : result?.assignment_pending
          ? 'Client invitation sent. Client Portal access will attach when the pending account becomes available.'
          : 'Client invitation sent and Client Portal access assigned.';
      alert(result?.email_sent === false
        ? `${accountMessage} The Black Point welcome email could not be delivered: ${result?.email_error || 'verify the email address.'}`
        : `${accountMessage} The Black Point account-created email was sent.`);
    },
    onError: (error) => alert('Unable to create client account: ' + error.message),
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const requestedRole = data.role || 'user';
      if (editingClient?.role !== requestedRole) {
        if (!isSystemAdmin) throw new Error('Only a current system administrator can grant or remove administrator status.');
        const roleResult = await base44.functions.invoke('updateUser', {
          userId: id,
          updates: { role: requestedRole },
        });
        const rolePayload = roleResult?.data || roleResult || {};
        if (rolePayload.error) throw new Error(rolePayload.error);
      }
      const result = await base44.functions.invoke('manageClientAssignments', {
        action: 'update',
        client_id: id,
        data,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });
      queryClient.invalidateQueries({ queryKey: ['directoryLocations'] });
      queryClient.invalidateQueries({ queryKey: ['hrClientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
      setShowDialog(false);
      setEditingClient(null);
      resetForm();
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId) => {
      const result = await base44.functions.invoke('manageClientAssignments', { action: 'remove', client_id: clientId });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });
      queryClient.invalidateQueries({ queryKey: ['directoryLocations'] });
      queryClient.invalidateQueries({ queryKey: ['hrClientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
    },
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      property_names: [],
      email: "",
      mobile_phone: "",
    });
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      first_name: client.first_name || "",
      last_name: client.last_name || "",
      property_names: [...new Set([
        ...(client.assigned_locations || []),
        ...(client.assigned_sites || []),
        client.assigned_location,
      ].filter(Boolean))],
      email: client.email || "",
      mobile_phone: client.mobile_phone || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.property_names.length) {
      alert('Select at least one client property.');
      return;
    }
    if (editingClient) {
      updateClientMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createClientMutation.mutate(formData);
    }
  };

  const handleDelete = async (id) => {
    if (await confirmInApp('Are you sure you want to remove this client?')) {
      deleteClientMutation.mutate(id);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <WorkspaceHeader eyebrow="Administration / Client services" title="Manage Clients" description="Client contacts, portfolio access and property assignments." metrics={[
          {label:'Client accounts',value:clientUsers?.length||0},
          {label:'Properties assigned',value:new Set((clientUsers||[]).flatMap(c=>[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean))).size}
        ]}/>
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <Input aria-label="Search client accounts" placeholder="Search client name, email or phone" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} className="min-w-48 flex-1 border-slate-600 bg-slate-950 text-white"/>
          <select aria-label="Filter clients by property" value={propertyFilter} onChange={e=>setPropertyFilter(e.target.value)} className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="all">All properties</option>{[...new Set((clientUsers||[]).flatMap(c=>[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean)))].sort().map(site=><option key={site}>{site}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
          <table className="w-full text-left text-sm"><thead className="border-b border-slate-700 bg-slate-950 text-xs uppercase text-slate-400"><tr><th className="p-4">Client contact</th><th className="p-4">Portfolio access</th><th className="p-4">Contact details</th><th className="p-4 text-right">Manage</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{(clientUsers||[]).filter(c=>{
            const sites=[...(c.assigned_locations||[]),...(c.assigned_sites||[]),c.assigned_location].filter(Boolean);
            return (propertyFilter==='all'||sites.includes(propertyFilter))&&[c.first_name,c.last_name,c.email,c.mobile_phone].join(' ').toLowerCase().includes(clientSearch.toLowerCase());
          }).map(client=><tr key={client.id} className="align-top hover:bg-slate-800/60">
            <td className="p-4"><div className="font-semibold text-white">{[client.first_name,client.last_name].filter(Boolean).join(' ')||client.email}</div><div className="mt-1 text-xs text-cyan-300">Client</div></td>
            <td className="p-4"><div className="flex max-w-md flex-wrap gap-1">{[...new Set([...(client.assigned_locations||[]),...(client.assigned_sites||[]),client.assigned_location].filter(Boolean))].map(site=><span key={site} className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200">{site}</span>)}</div></td>
            <td className="p-4 text-slate-300"><a className="block break-all text-cyan-200 hover:underline" href={'mailto:'+client.email}>{client.email}</a>{client.mobile_phone&&<a className="mt-1 block hover:underline" href={'tel:'+client.mobile_phone}>{client.mobile_phone}</a>}</td>
            <td className="p-4"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>handleEdit(client)}>Edit access</Button><Button aria-label={'Remove '+client.email} variant="ghost" size="sm" onClick={()=>handleDelete(client.id)} className="text-red-300"><Trash2 className="h-4 w-4"/></Button></div></td>
          </tr>)}</tbody></table>
          {!(clientUsers||[]).length&&<p className="p-10 text-center text-slate-400">No client accounts yet. Assign a pending account to the Client role in Accounts & Access.</p>}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  placeholder="e.g., John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  placeholder="e.g., Smith"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assigned Client Properties *</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border border-slate-600 bg-slate-950/30 p-2 space-y-1">
                {availableLocations.map((loc) => {
                  const checked = formData.property_names.includes(loc.site_name);
                  return (
                    <label key={loc.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-800/70">
                      <Checkbox checked={checked} onCheckedChange={(nextChecked) => setFormData((current) => ({
                        ...current,
                        property_names: nextChecked ? [...new Set([...current.property_names, loc.site_name])] : current.property_names.filter((name) => name !== loc.site_name),
                      }))} />
                      <span className="text-sm">{loc.site_name}</span>
                    </label>
                  );
                })}
                {!availableLocations.length && <p className="px-3 py-4 text-sm text-slate-400">No active properties are available. Check Admin Locations or reload the directory.</p>}
              </div>
              <p className="text-xs text-slate-400">{formData.property_names.length} propert{formData.property_names.length === 1 ? 'y' : 'ies'} selected</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="manager@property.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile_phone">Phone Number *</Label>
              <Input
                id="mobile_phone"
                type="tel"
                value={formData.mobile_phone}
                onChange={(e) => setFormData({...formData, mobile_phone: e.target.value})}
                placeholder="(555) 123-4567"
                required
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createClientMutation.isPending || updateClientMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {createClientMutation.isPending || updateClientMutation.isPending
                  ? 'Saving...'
                  : editingClient
                  ? 'Update Client'
                  : 'Create Client'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}