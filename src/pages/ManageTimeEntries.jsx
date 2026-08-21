import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Briefcase, Plus, Trash2, Calendar, MapPin, Shield, Edit, X, Save } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { isInternalMember } from '@/lib/directoryUtils';

export default function ManageTimeEntries() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState("all");
  const [editingEntry, setEditingEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({
    clock_in: "",
    clock_out: "",
    location: "",
    notes: "",
  });
  const [newEntry, setNewEntry] = useState({
    officer_email: "",
    clock_in: "",
    clock_out: "",
    location: "",
    notes: "",
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isHR = roles.has('hr') || roles.has('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';
  const isAdmin = user?.role === 'admin';

  const { data: allUsers = [], isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['appDirectoryUsers', 'manageTimeEntries'],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    enabled: isAdmin || isHR,
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active);
    },
    enabled: isAdmin || isHR,
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['allTimeEntries', selectedOfficer],
    queryFn: async () => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      const entries = payload.entries || [];
      if (selectedOfficer === 'all') return entries;
      return entries.filter(e => e.officer_email === selectedOfficer);
    },
    enabled: isAdmin || isHR,
    refetchInterval: 30000,
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'create', data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      const entry = payload.entry;
      
      // Recalculate PTO for the officer if this is a completed shift
      if (data.clock_out && data.officer_email) {
        try {
          await base44.functions.invoke('calculatePTOForOfficer', {
            officer_email: data.officer_email
          });
        } catch (error) {
          console.error('Failed to recalculate PTO:', error);
        }
      }
      
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTimeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setShowAddForm(false);
      setNewEntry({
        officer_email: "",
        clock_in: "",
        clock_out: "",
        location: "",
        notes: "",
      });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'update', id, data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      const entry = payload.entry;
      
      // Recalculate PTO for the officer if this is a completed shift
      if (data.clock_out && data.officer_email) {
        try {
          await base44.functions.invoke('calculatePTOForOfficer', {
            officer_email: data.officer_email
          });
        } catch (error) {
          console.error('Failed to recalculate PTO:', error);
        }
      }
      
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTimeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setEditingEntry(null);
      setEditFormData({
        clock_in: "",
        clock_out: "",
        location: "",
        notes: "",
      });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id) => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'delete', id });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTimeEntries'] });
    },
  });

  const handleAddEntry = (e) => {
    e.preventDefault();

    if (!newEntry.officer_email || !newEntry.clock_in || !newEntry.location) {
      alert("Please fill in all required fields (Officer, Clock In, Location)");
      return;
    }

    createEntryMutation.mutate({
      officer_email: newEntry.officer_email,
      clock_in: new Date(newEntry.clock_in).toISOString(),
      clock_out: newEntry.clock_out ? new Date(newEntry.clock_out).toISOString() : null,
      location: newEntry.location,
      notes: newEntry.notes || "",
    });
  };

  const handleStartEdit = (entry) => {
    setEditingEntry(entry.id);
    setEditFormData({
      clock_in: format(parseISO(entry.clock_in), "yyyy-MM-dd'T'HH:mm"),
      clock_out: entry.clock_out ? format(parseISO(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : "",
      location: entry.location,
      notes: entry.notes || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setEditFormData({
      clock_in: "",
      clock_out: "",
      location: "",
      notes: "",
    });
  };

  const handleSaveEdit = (entry) => {
    if (!editFormData.clock_in || !editFormData.location) {
      alert("Clock In time and Location are required");
      return;
    }

    updateEntryMutation.mutate({
      id: entry.id,
      data: {
        officer_email: entry.officer_email,
        clock_in: new Date(editFormData.clock_in).toISOString(),
        clock_out: editFormData.clock_out ? new Date(editFormData.clock_out).toISOString() : null,
        location: editFormData.location,
        notes: editFormData.notes || "",
      }
    });
  };

  const calculateHours = (clockIn, clockOut) => {
    if (!clockOut) return "Active";
    const diff = parseISO(clockOut).getTime() - parseISO(clockIn).getTime();
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    return `${hours}h ${minutes}m`;
  };

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

  const groupByOfficer = (entries) => {
    const grouped = {};
    entries?.forEach(entry => {
      if (!grouped[entry.officer_email]) {
        grouped[entry.officer_email] = [];
      }
      grouped[entry.officer_email].push(entry);
    });
    return grouped;
  };

  if (!isAdmin && !isHR) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">You need Human Resources or Admin access to view this page.</p>
      </div>
    );
  }

  const groupedEntries = groupByOfficer(timeEntries);
  const activeOfficers = allUsers.filter(isInternalMember);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manage Time Entries</h1>
              <p className="text-slate-600">Add, edit, or remove officer time entries</p>
            </div>
          </div>
          <Button
            onClick={() => setShowAddForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        </div>

        {showAddForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add Time Entry Manually
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleAddEntry} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="officer_email">Officer *</Label>
                    <Select
                      value={newEntry.officer_email}
                      onValueChange={(value) => setNewEntry({...newEntry, officer_email: value})}
                      required
                      disabled={usersLoading || !!usersError}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={usersLoading ? "Loading officers..." : usersError ? "Officer directory unavailable" : activeOfficers.length ? "Select officer..." : "No officers found"} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeOfficers.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.first_name && u.last_name
                              ? `${u.first_name} ${u.last_name}`
                              : u.full_name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {usersError && <p className="text-xs text-red-600">Officer directory failed to load: {usersError.message}</p>}
                    {!usersLoading && !usersError && activeOfficers.length === 0 && <p className="text-xs text-amber-600">No officer records were returned by the company directory.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select
                      value={newEntry.location}
                      onValueChange={(value) => setNewEntry({...newEntry, location: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location..." />
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
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clock_in">Clock In *</Label>
                    <Input
                      id="clock_in"
                      type="datetime-local"
                      value={newEntry.clock_in}
                      onChange={(e) => setNewEntry({...newEntry, clock_in: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clock_out">Clock Out (Optional)</Label>
                    <Input
                      id="clock_out"
                      type="datetime-local"
                      value={newEntry.clock_out}
                      onChange={(e) => setNewEntry({...newEntry, clock_out: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any notes about this shift..."
                    value={newEntry.notes}
                    onChange={(e) => setNewEntry({...newEntry, notes: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEntryMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createEntryMutation.isPending ? 'Adding...' : 'Add Entry'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filter by Officer</CardTitle>
              <Select value={selectedOfficer} onValueChange={setSelectedOfficer} disabled={usersLoading || !!usersError}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select officer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Officers</SelectItem>
                  {activeOfficers.map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.first_name && u.last_name
                        ? `${u.first_name} ${u.last_name}`
                        : u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([officer, entries]) => (
            <Card key={officer} className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50">
                <CardTitle className="flex items-center justify-between">
                  <span>{getOfficerName(officer)}</span>
                  <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                    {entries.length} entries
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id}>
                      {editingEntry === entry.id ? (
                        <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-400">
                          <div className="space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`edit_clock_in_${entry.id}`} className="text-xs">Clock In *</Label>
                                <Input
                                  id={`edit_clock_in_${entry.id}`}
                                  type="datetime-local"
                                  value={editFormData.clock_in}
                                  onChange={(e) => setEditFormData({...editFormData, clock_in: e.target.value})}
                                  required
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`edit_clock_out_${entry.id}`} className="text-xs">Clock Out</Label>
                                <Input
                                  id={`edit_clock_out_${entry.id}`}
                                  type="datetime-local"
                                  value={editFormData.clock_out}
                                  onChange={(e) => setEditFormData({...editFormData, clock_out: e.target.value})}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`edit_location_${entry.id}`} className="text-xs">Location *</Label>
                              <Select
                                value={editFormData.location}
                                onValueChange={(value) => setEditFormData({...editFormData, location: value})}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
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
                            <div className="space-y-1">
                              <Label htmlFor={`edit_notes_${entry.id}`} className="text-xs">Notes</Label>
                              <Textarea
                                id={`edit_notes_${entry.id}`}
                                value={editFormData.notes}
                                onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCancelEdit}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleSaveEdit(entry)}
                                disabled={updateEntryMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Save className="w-4 h-4 mr-1" />
                                {updateEntryMutation.isPending ? 'Saving...' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Calendar className="w-4 h-4 text-slate-500" />
                              <p className="font-medium text-slate-900">
                                {format(parseISO(entry.clock_in), 'MMM d, yyyy')}
                              </p>
                              {!entry.clock_out && (
                                <Badge className="bg-green-100 text-green-800 border-green-200">
                                  On Duty
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(parseISO(entry.clock_in), 'h:mm a')}
                                {entry.clock_out && ` - ${format(parseISO(entry.clock_out), 'h:mm a')}`}
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {entry.location}
                              </div>
                            </div>
                            {entry.notes && (
                              <p className="text-xs text-slate-500 mt-2">{entry.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-2xl font-bold text-slate-900">
                                {calculateHours(entry.clock_in, entry.clock_out)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleStartEdit(entry)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon"
                                onClick={async () => {
                                  if (await confirmInApp("Are you sure you want to delete this time entry?")) {
                                    deleteEntryMutation.mutate(entry.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!timeEntries?.length && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Clock className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No time entries yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}