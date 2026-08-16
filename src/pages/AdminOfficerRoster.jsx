import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus, Edit, Trash, Users, Copy, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { listDirectoryUsers } from '@/lib/appDirectory';

export default function AdminOfficerRoster() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    rank: "",
    unit_number: "",
    badge_number: "",
    mobile_phone: "",
    email: "",
    division: "",
    hire_date: "",
    status: "active",
    notes: "",
  });
  const [selectedUserToCopy, setSelectedUserToCopy] = useState("");
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: rosterEntries } = useQuery({
    queryKey: ['officerRoster'],
    queryFn: () => base44.entities.OfficerRoster.list('-created_date'),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
  });

  const saveEntryMutation = useMutation({
    mutationFn: (data) => {
      if (editingEntry) {
        return base44.entities.OfficerRoster.update(editingEntry.id, data);
      }
      return base44.entities.OfficerRoster.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officerRoster'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id) => base44.entities.OfficerRoster.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officerRoster'] });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (entries) => base44.entities.OfficerRoster.bulkCreate(entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officerRoster'] });
    },
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      rank: "",
      unit_number: "",
      badge_number: "",
      mobile_phone: "",
      email: "",
      division: "",
      hire_date: "",
      status: "active",
      notes: "",
    });
    setEditingEntry(null);
    setSelectedUserToCopy("");
  };

  const handleCopyFromUser = () => {
    const selectedUser = allUsers?.find(u => u.email === selectedUserToCopy);
    if (selectedUser) {
      setFormData({
        first_name: selectedUser.first_name || "",
        last_name: selectedUser.last_name || "",
        rank: selectedUser.rank || "",
        unit_number: selectedUser.unit_number || "",
        badge_number: selectedUser.badge_number || "",
        mobile_phone: selectedUser.mobile_phone || "",
        email: selectedUser.email || "",
        division: selectedUser.division || "",
        hire_date: selectedUser.hire_date || "",
        status: selectedUser.termination_date ? "inactive" : "active",
        notes: "",
      });
    }
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormData(entry);
    setShowDialog(true);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this roster entry?')) {
      deleteEntryMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveEntryMutation.mutate(formData);
  };

  const handleAutoSync = async () => {
    if (!confirm('Auto-sync all active officers from Manage Officers? This will update existing entries, add new ones, and remove terminated/client-only users.')) {
      return;
    }

    setSyncing(true);
    try {
      const existingRosterMap = new Map(rosterEntries?.map(r => [r.email, r]) || []);
      const newEntries = [];
      const updates = [];
      const toRemove = [];
      const activeOfficerEmails = new Set();

      allUsers?.forEach(u => {
        // Skip if they don't have basic info
        if (!u.first_name || !u.last_name || !u.email) return;

        // Skip if user has client role
        if (u.additional_roles?.includes('client')) return;

        // Skip if user has termination_date
        if (u.termination_date) return;

        activeOfficerEmails.add(u.email);

        const rosterData = {
          first_name: u.first_name,
          last_name: u.last_name,
          rank: u.rank || "",
          unit_number: u.unit_number || "",
          badge_number: u.badge_number || "",
          mobile_phone: u.mobile_phone || "",
          email: u.email,
          division: u.division || "",
          hire_date: u.hire_date || "",
          status: "active",
        };

        if (existingRosterMap.has(u.email)) {
          const existingEntry = existingRosterMap.get(u.email);
          updates.push({ id: existingEntry.id, data: rosterData });
        } else {
          newEntries.push({ ...rosterData, notes: "" });
        }
      });

      // Find roster entries to remove (terminated or client-only users)
      rosterEntries?.forEach(entry => {
        if (!activeOfficerEmails.has(entry.email)) {
          toRemove.push(entry.id);
        }
      });

      // Execute updates, creates, and deletes
      for (const update of updates) {
        await base44.entities.OfficerRoster.update(update.id, update.data);
      }

      if (newEntries.length > 0) {
        await bulkCreateMutation.mutateAsync(newEntries);
      }

      for (const id of toRemove) {
        await base44.entities.OfficerRoster.delete(id);
      }

      alert(`✅ Successfully synced: ${newEntries.length} new, ${updates.length} updated, ${toRemove.length} removed!`);
    } catch (error) {
      console.error('Auto-sync error:', error);
      alert('Failed to auto-sync officers');
    } finally {
      setSyncing(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Officer Roster</h1>
            <p className="text-slate-600">Manage public officer directory (not linked to system accounts)</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleAutoSync} disabled={syncing} variant="outline" className="bg-green-50 hover:bg-green-100">
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Auto-Sync from Manage Officers'}
            </Button>
            <Button onClick={() => { resetForm(); setShowDialog(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Officer
            </Button>
          </div>
        </div>

        {(() => {
          const grouped = {};
          rosterEntries?.forEach(entry => {
            // Skip inactive status entries
            if (entry.status !== 'active') return;

            // Skip entries without division
            if (!entry.division) return;

            const div = entry.division;
            if (!grouped[div]) grouped[div] = [];
            grouped[div].push(entry);
          });

          // Sort each division's entries by unit number
          Object.keys(grouped).forEach(div => {
            grouped[div].sort((a, b) => {
              const unitA = parseInt(a.unit_number) || 999999;
              const unitB = parseInt(b.unit_number) || 999999;
              return unitA - unitB;
            });
          });

          // Sort divisions to put Headquarters first
          const sortedDivisions = Object.entries(grouped).sort(([divA], [divB]) => {
            if (divA.toLowerCase().includes('headquarters')) return -1;
            if (divB.toLowerCase().includes('headquarters')) return 1;
            return divA.localeCompare(divB);
          });

          return sortedDivisions.map(([division, entries]) => (
            <div key={division} className="space-y-4">
              <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {division}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {entries.map((entry) => (
                  <Card key={entry.id} className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span className="text-lg">{entry.first_name} {entry.last_name}</span>
                  </div>
                  <Badge className={entry.status === 'active' ? 'bg-green-600' : 'bg-gray-600'}>
                    {entry.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {entry.rank && <p className="text-sm"><strong>Rank:</strong> {entry.rank}</p>}
                {entry.unit_number && <p className="text-sm"><strong>Unit:</strong> #{entry.unit_number}</p>}
                {entry.badge_number && <p className="text-sm"><strong>Badge:</strong> {entry.badge_number}</p>}
                {entry.division && <p className="text-sm"><strong>Division:</strong> {entry.division}</p>}
                {entry.mobile_phone && <p className="text-sm"><strong>Phone:</strong> {entry.mobile_phone}</p>}
                {entry.email && <p className="text-sm text-slate-600">{entry.email}</p>}
                <div className="flex gap-2 pt-3">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(entry)}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(entry.id)} className="text-red-600">
                    <Trash className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
                ))}
              </div>
            </div>
          ));
        })()}
        {!rosterEntries?.length && (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No roster entries yet</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Officer' : 'Add Officer to Roster'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingEntry && (
              <div className="space-y-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Label>Copy from Manage Officers</Label>
                <div className="flex gap-2">
                  <Select value={selectedUserToCopy} onValueChange={setSelectedUserToCopy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an officer to copy..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers?.map((u) => (
                        <SelectItem key={u.email} value={u.email}>
                          {u.first_name} {u.last_name} - {u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={handleCopyFromUser} disabled={!selectedUserToCopy}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-blue-700">This will copy data but won't create a link - you can edit freely after copying</p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rank</Label>
                <Input
                  value={formData.rank}
                  onChange={(e) => setFormData({...formData, rank: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Number</Label>
                <Input
                  value={formData.unit_number}
                  onChange={(e) => setFormData({...formData, unit_number: e.target.value})}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Badge Number</Label>
                <Input
                  value={formData.badge_number}
                  onChange={(e) => setFormData({...formData, badge_number: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Phone</Label>
                <Input
                  value={formData.mobile_phone}
                  onChange={(e) => setFormData({...formData, mobile_phone: e.target.value})}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Division</Label>
                <Input
                  value={formData.division}
                  onChange={(e) => setFormData({...formData, division: e.target.value})}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hire Date</Label>
                <Input
                  type="date"
                  value={formData.hire_date}
                  onChange={(e) => setFormData({...formData, hire_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveEntryMutation.isPending}>
                {saveEntryMutation.isPending ? 'Saving...' : editingEntry ? 'Update' : 'Add to Roster'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}