import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Edit, Trash2, Search, Eye, Settings } from "lucide-react";

export default function VendorTenants() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    vendor_id: "",
    slug: "",
    display_name: "",
    legal_name: "",
    status: "trial",
    subscription_tier: "basic",
    max_users: 10,
    max_officers: 50
  });

  const queryClient = useQueryClient();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    initialData: [],
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Tenant.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Tenant.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Tenant.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const resetForm = () => {
    setFormData({
      vendor_id: vendors[0]?.id || "",
      slug: "",
      display_name: "",
      legal_name: "",
      status: "trial",
      subscription_tier: "basic",
      max_users: 10,
      max_officers: 50
    });
    setEditingTenant(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      max_users: parseInt(formData.max_users),
      max_officers: parseInt(formData.max_officers)
    };

    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    setFormData({
      vendor_id: tenant.vendor_id,
      slug: tenant.slug,
      display_name: tenant.display_name,
      legal_name: tenant.legal_name || "",
      status: tenant.status,
      subscription_tier: tenant.subscription_tier,
      max_users: tenant.max_users || 10,
      max_officers: tenant.max_officers || 50
    });
    setShowDialog(true);
  };

  const handleDelete = (id) => {
    if (confirm('⚠️ WARNING: This will permanently delete the client company and ALL their data. This cannot be undone. Are you absolutely sure?')) {
      if (confirm('Type DELETE to confirm deletion (this is your last warning)')) {
        deleteMutation.mutate(id);
      }
    }
  };

  const filteredTenants = tenants.filter(t =>
    t.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'trial': return 'bg-amber-600';
      case 'suspended': return 'bg-red-600';
      default: return 'bg-slate-600';
    }
  };

  const getTierBadge = (tier) => {
    switch (tier) {
      case 'enterprise': return 'bg-purple-100 text-purple-700';
      case 'professional': return 'bg-blue-100 text-blue-700';
      case 'basic': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Client Companies</h1>
          <p className="text-slate-600">Manage all tenant organizations</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Client Company
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by company name or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredTenants.map((tenant) => (
          <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-2xl">
                    {tenant.display_name.charAt(0)}
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-1">{tenant.display_name}</CardTitle>
                    <p className="text-sm text-slate-600 font-mono">/c/{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(tenant)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tenant.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Badge className={getStatusColor(tenant.status)}>
                  {tenant.status}
                </Badge>
                <Badge className={getTierBadge(tenant.subscription_tier)}>
                  {tenant.subscription_tier}
                </Badge>
              </div>
              
              {tenant.legal_name && (
                <p className="text-sm text-slate-600">
                  <span className="font-semibold">Legal Name:</span> {tenant.legal_name}
                </p>
              )}
              
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div>
                  <p className="text-xs text-slate-500">Max Users</p>
                  <p className="text-lg font-bold text-slate-900">{tenant.max_users || 'Unlimited'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Max Officers</p>
                  <p className="text-lg font-bold text-slate-900">{tenant.max_officers || 'Unlimited'}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  View Portal
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="w-4 h-4 mr-2" />
                  Branding
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTenants.length === 0 && (
        <Card className="p-12 text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No Client Companies</h3>
          <p className="text-slate-500 mb-4">Create your first client company to get started</p>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Create Client Company
          </Button>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTenant ? 'Edit Client Company' : 'Create New Client Company'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingTenant && vendors.length > 0 && (
              <div>
                <Label>Vendor *</Label>
                <Select
                  value={formData.vendor_id}
                  onValueChange={(val) => setFormData({ ...formData, vendor_id: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Display Name *</Label>
                <Input
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Acme Security Corp"
                  required
                />
              </div>
              <div>
                <Label>URL Slug *</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="acme-security"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">/c/{formData.slug || 'slug'}</p>
              </div>
            </div>

            <div>
              <Label>Legal Name</Label>
              <Input
                value={formData.legal_name}
                onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                placeholder="Acme Security Corporation LLC"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subscription Tier *</Label>
                <Select
                  value={formData.subscription_tier}
                  onValueChange={(val) => setFormData({ ...formData, subscription_tier: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Max Users</Label>
                <Input
                  type="number"
                  value={formData.max_users}
                  onChange={(e) => setFormData({ ...formData, max_users: e.target.value })}
                  min="1"
                />
              </div>
              <div>
                <Label>Max Officers</Label>
                <Input
                  type="number"
                  value={formData.max_officers}
                  onChange={(e) => setFormData({ ...formData, max_officers: e.target.value })}
                  min="1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingTenant ? 'Update' : 'Create'} Company
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}