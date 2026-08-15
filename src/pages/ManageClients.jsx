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
import { listDirectoryUsers, listDirectoryLocations } from '@/lib/appDirectory';
import { isClientAccount } from '@/lib/directoryUtils';

export default function ManageClients() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    property_names: [],
    email: "",
    mobile_phone: "",
    role: "user",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isSystemAdmin = user?.role === 'admin';
  const hasAccess = isSystemAdmin || user?.additional_roles?.includes('full_access') || user?.additional_roles?.includes('hr');

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'manageClients'],
    queryFn: () => listDirectoryLocations('site_name', 1000),
    enabled: hasAccess,
    initialData: [],
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'manageClients'],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    initialData: [],
  });
  const clientUsers = directoryUsers.filter(isClientAccount);

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
        if (roleResult?.error) throw new Error(roleResult.error);
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
      role: "user",
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
      role: client.role || "user",
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

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to remove this client?')) {
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
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manage Clients</h1>
              <p className="text-slate-600">Manage clients assigned from Admin → Pending Users</p>
            </div>
          </div>
          <Badge className="border border-purple-500/40 bg-purple-950/40 text-purple-200">Assigned through Admin → Pending Users</Badge>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Client Accounts ({clientUsers?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clientUsers?.map((client) => (
                <div key={client.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-slate-900 text-lg">{client.first_name} {client.last_name}</h3>
                        <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200">
                          <Briefcase className="w-3 h-3 mr-1" />
                          Client
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {[...new Set([
                          ...(client.assigned_locations || []),
                          ...(client.assigned_sites || []),
                          client.assigned_location,
                        ].filter(Boolean))].length > 0 && (
                          <p className="text-sm text-slate-600 flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 text-purple-600 shrink-0" />
                            <span className="font-medium">{[...new Set([
                              ...(client.assigned_locations || []),
                              ...(client.assigned_sites || []),
                              client.assigned_location,
                            ].filter(Boolean))].join(', ')}</span>
                          </p>
                        )}
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {client.email}
                        </p>
                        {client.mobile_phone && (
                          <p className="text-sm text-slate-600 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {client.mobile_phone}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(client)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(client.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {!clientUsers?.length && (
                <div className="text-center py-12 text-slate-500">
                  <Briefcase className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p>No clients are assigned. Assign a pending user as Client from Admin → Pending Users.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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
                {locations.map((loc) => {
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
                {!locations.length && <p className="px-3 py-4 text-sm text-slate-400">No properties are available. Add a property in Admin Locations first.</p>}
              </div>
              <p className="text-xs text-slate-400">{formData.property_names.length} propert{formData.property_names.length === 1 ? 'y' : 'ies'} selected</p>
            </div>
            {editingClient && isSystemAdmin && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="client_system_admin"
                    checked={formData.role === 'admin'}
                    onCheckedChange={(checked) => setFormData({ ...formData, role: checked ? 'admin' : 'user' })}
                  />
                  <Label htmlFor="client_system_admin" className="cursor-pointer">
                    <div className="font-bold text-amber-300">System Administrator</div>
                    <div className="text-xs text-slate-400">Adds full administrative authority while retaining this client account assignment.</div>
                  </Label>
                </div>
              </div>
            )}
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