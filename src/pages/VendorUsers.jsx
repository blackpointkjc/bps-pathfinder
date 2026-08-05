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
import { Users, Plus, Edit, Trash2, Shield, UserX } from "lucide-react";

export default function VendorUsers() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState({
    vendor_id: "",
    user_email: "",
    role: "vendor_staff",
    status: "active"
  });

  const queryClient = useQueryClient();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    initialData: [],
  });

  const { data: members } = useQuery({
    queryKey: ['vendorMembers'],
    queryFn: () => base44.entities.VendorMember.list(),
    initialData: [],
  });

  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VendorMember.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorMembers'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.VendorMember.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorMembers'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VendorMember.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorMembers'] });
    },
  });

  const resetForm = () => {
    setFormData({
      vendor_id: vendors[0]?.id || "",
      user_email: "",
      role: "vendor_staff",
      status: "active"
    });
    setEditingMember(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setFormData({
      vendor_id: member.vendor_id,
      user_email: member.user_email,
      role: member.role,
      status: member.status
    });
    setShowDialog(true);
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'vendor_owner': return 'bg-purple-100 text-purple-700';
      case 'vendor_admin': return 'bg-blue-100 text-blue-700';
      case 'vendor_staff': return 'bg-green-100 text-green-700';
      case 'vendor_viewer': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getRoleIcon = (role) => {
    if (role === 'vendor_owner' || role === 'vendor_admin') return Shield;
    if (role === 'vendor_viewer') return UserX;
    return Users;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Vendor Staff</h1>
          <p className="text-slate-600">Manage internal team members</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Team Member
        </Button>
      </div>

      <div className="grid gap-4">
        {members.map((member) => {
          const user = allUsers.find(u => u.email === member.user_email);
          const RoleIcon = getRoleIcon(member.role);
          
          return (
            <Card key={member.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center text-white font-bold">
                      {user?.first_name?.charAt(0) || member.user_email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {user?.first_name && user?.last_name 
                          ? `${user.first_name} ${user.last_name}`
                          : member.user_email}
                      </p>
                      <p className="text-sm text-slate-600">{member.user_email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <RoleIcon className="w-4 h-4 text-slate-600" />
                      <Badge className={getRoleBadge(member.role)}>
                        {member.role.replace('vendor_', '')}
                      </Badge>
                    </div>
                    
                    <Badge className={member.status === 'active' ? 'bg-green-600' : 'bg-slate-600'}>
                      {member.status}
                    </Badge>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(member)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Remove this team member?')) {
                          deleteMutation.mutate(member.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {members.length === 0 && (
        <Card className="p-12 text-center">
          <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No Team Members</h3>
          <p className="text-slate-500 mb-4">Add your first vendor staff member</p>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMember ? 'Edit Team Member' : 'Add Team Member'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingMember && vendors.length > 0 && (
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

            <div>
              <Label>Email Address *</Label>
              <Input
                type="email"
                value={formData.user_email}
                onChange={(e) => setFormData({ ...formData, user_email: e.target.value })}
                placeholder="user@company.com"
                required
                disabled={!!editingMember}
              />
            </div>

            <div>
              <Label>Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(val) => setFormData({ ...formData, role: val })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor_owner">Owner (Full Control)</SelectItem>
                  <SelectItem value="vendor_admin">Admin (Manage All)</SelectItem>
                  <SelectItem value="vendor_staff">Staff (Standard Access)</SelectItem>
                  <SelectItem value="vendor_viewer">Viewer (Read Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                {editingMember ? 'Update' : 'Add'} Member
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}