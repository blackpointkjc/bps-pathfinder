import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus, Mail, Phone, MapPin, Edit, Trash2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ManageClients() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    property_name: "",
    email: "",
    mobile_phone: "",
    role: "user",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin' || user?.additional_roles?.includes('full_access') || user?.additional_roles?.includes('hr');

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await base44.entities.Location.list('site_name');
      return allLocations.filter(loc => loc.active);
    },
    enabled: hasAccess,
  });

  const { data: clientUsers } = useQuery({
    queryKey: ['clientUsers'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.filter(u => u.additional_roles?.includes('client')).sort((a, b) => 
        (a.first_name || '').localeCompare(b.first_name || '')
      );
    },
    enabled: hasAccess,
  });

  const createClientMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('createPortalAccount', {
        accountType: 'client',
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        mobile_phone: data.mobile_phone,
        assigned_location: data.property_name,
      });
      if (response?.error) throw new Error(response.error);
      return response;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['clientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
      setShowDialog(false);
      resetForm();
      alert(result?.assignment_pending
        ? 'Invitation sent. The client will be assigned after accepting the invitation.'
        : 'Client invitation sent and Client Portal access assigned.');
    },
    onError: (error) => alert('Unable to create client account: ' + error.message),
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const updated = await base44.entities.User.update(id, {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        mobile_phone: data.mobile_phone,
        role: 'user',
        additional_roles: ['client'],
        assigned_location: data.property_name,
        assigned_locations: [data.property_name],
        assigned_sites: [data.property_name],
      });

      // Update old location to remove client assignment
      const oldLocation = locations?.find(loc => loc.assigned_client_email === editingClient.email);
      if (oldLocation && oldLocation.site_name !== data.property_name) {
        await base44.entities.Location.update(oldLocation.id, {
          assigned_client_email: null
        });
      }

      // Update new location with client assignment
      const newLocation = locations?.find(loc => loc.site_name === data.property_name);
      if (newLocation) {
        await base44.entities.Location.update(newLocation.id, {
          assigned_client_email: data.email
        });
      }

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
      setShowDialog(false);
      setEditingClient(null);
      resetForm();
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId) => {
      const client = clientUsers?.find(c => c.id === clientId);
      if (client) {
        // Remove client role
        const updatedRoles = client.additional_roles?.filter(r => r !== 'client') || [];
        await base44.entities.User.update(clientId, { 
          additional_roles: updatedRoles,
          assigned_location: null
        });

        // Remove from location assignment
        const location = locations?.find(loc => loc.assigned_client_email === client.email);
        if (location) {
          await base44.entities.Location.update(location.id, {
            assigned_client_email: null
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientUsers'] });
      queryClient.invalidateQueries({ queryKey: ['activeLocations'] });
    },
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      property_name: "",
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
      property_name: client.assigned_location || "",
      email: client.email || "",
      mobile_phone: client.mobile_phone || "",
      role: client.role || "user",
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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
              <p className="text-slate-600">Create and manage client portal accounts</p>
            </div>
          </div>
          <Button
            onClick={() => {
              setEditingClient(null);
              resetForm();
              setShowDialog(true);
            }}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
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
                        {client.assigned_location && (
                          <p className="text-sm text-slate-600 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-purple-600" />
                            <span className="font-medium">{client.assigned_location}</span>
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
                  <p>No client accounts yet. Add your first client to get started.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
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
              <Label htmlFor="property_name">Assigned Client Property *</Label>
              <Select
                value={formData.property_name}
                onValueChange={(value) => setFormData({...formData, property_name: value})}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select property..." />
                </SelectTrigger>
                <SelectContent>
                  {locations?.map((loc) => (
                    <SelectItem key={loc.id} value={loc.site_name}>
                      {loc.site_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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