import { confirmInApp } from '@/lib/inAppDialog';
import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Briefcase, Plus, Trash2, Calendar, MapPin, Shield, Edit, X, Save, BadgeDollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { isInternalMember } from '@/lib/directoryUtils';
import { calculatePaidHours } from '@/lib/payrollCalculations';
import { createPageUrl } from '@/utils';

export default function ManageTimeEntries() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedEntryId = new URLSearchParams(location.search).get('entry_id') || '';
  const queueKind = new URLSearchParams(location.search).get('queue_kind') || '';
  const queueTaskId = new URLSearchParams(location.search).get('queue_task') || '';
  const openedEntryRef = useRef('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState("all");
  const [editingEntry, setEditingEntry] = useState(null);
  const [payrollEntryId, setPayrollEntryId] = useState(null);
  const [payrollForm, setPayrollForm] = useState({
    decision: 'relief_delay_approved',
    approved_hours: '',
    reason: '',
    relief_officer_email: 'none',
  });
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

  const invalidatePayrollViews = () => {
    queryClient.invalidateQueries({ queryKey: ['accountingData'] });
    queryClient.invalidateQueries({ queryKey: ['payrollEntries'] });
    queryClient.invalidateQueries({ queryKey: ['payrollTimeEntries'] });
  };

  const clearTaskDeepLink = () => {
    const params = new URLSearchParams(location.search);
    const before = params.toString();
    ['entry_id', 'record_id', 'queue_task', 'queue_kind'].forEach(param => params.delete(param));
    const after = params.toString();
    if (after !== before) {
      navigate({ pathname: location.pathname, search: after ? `?${after}` : '' }, { replace: true });
    }
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isHR = roles.has('hr') || roles.has('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';
  const isAdmin = user?.role === 'admin';
  const hasPayrollAuthority = isAdmin || isHR;

  const returnToRoleCenter = () => {
    if (!queueTaskId) {
      clearTaskDeepLink();
      return;
    }
    const destination = isAdmin
      ? `${createPageUrl('AdminCenter')}?admin_center=admin&admin_ops_section=command&admin_ops_tool=dashboard`
      : `${createPageUrl('HRCenter')}?section=overview&tool=overview`;
    navigate(destination, { replace: true });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const { data: allUsers = [], isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['appDirectoryUsers', 'manageTimeEntries'],
    queryFn: () => listDirectoryUsers('last_name', 1000, true),
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
      return allLocations.filter(loc => loc.active !== false);
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
      invalidatePayrollViews();
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
      invalidatePayrollViews();
      setEditingEntry(null);
      returnToRoleCenter();
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
      invalidatePayrollViews();
    },
  });

  const payrollDecisionMutation = useMutation({
    mutationFn: async ({ id, ...decisionData }) => {
      const result = await base44.functions.invoke('manageHRTimeEntries', {
        action: 'payroll_decision',
        id,
        ...decisionData,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTimeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['roleWorkQueue'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardWorkQueue'] });
      queryClient.invalidateQueries({ queryKey: ['hrOverviewSnapshot'] });
      invalidatePayrollViews();
      setPayrollEntryId(null);
      returnToRoleCenter();
    },
    onError: (error) => {
      alert(error?.message || 'Unable to save the payroll decision');
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
    clearTaskDeepLink();
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

  const payrollDecisionLabel = (decision) => ({
    relief_delay_approved: 'Relief delay approved — paid, performance exempt',
    pay_overage_with_performance: 'Overage paid — counted toward performance',
    deny_overage_pay: 'Payroll hours limited — counted toward performance',
  }[decision] || 'Payroll decision recorded');

  const openPayrollDecision = (entry) => {
    const actualHours = calculatePaidHours(entry);
    setPayrollEntryId(entry.id);
    setPayrollForm({
      decision: entry.payroll_adjustment_decision || 'relief_delay_approved',
      approved_hours: String(entry.approved_hours_snapshot ?? actualHours.toFixed(2)),
      reason: entry.payroll_adjustment_reason || '',
      relief_officer_email: entry.relief_officer_email || 'none',
    });
  };

  useEffect(() => {
    if (!requestedEntryId) {
      openedEntryRef.current = '';
      return;
    }
    if (!Array.isArray(timeEntries)) return;
    if (selectedOfficer !== 'all') {
      setSelectedOfficer('all');
      return;
    }
    const entry = timeEntries.find(item => String(item.id) === String(requestedEntryId));
    if (!entry) return;
    const openKey = `${location.search}:${entry.id}`;
    if (openedEntryRef.current === openKey) return;
    openedEntryRef.current = openKey;
    if (hasPayrollAuthority && entry.clock_out) openPayrollDecision(entry);
    window.requestAnimationFrame(() => {
      document.getElementById(`time-entry-${entry.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [requestedEntryId, location.search, timeEntries, selectedOfficer, hasPayrollAuthority]);

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
                    <div key={entry.id} id={`time-entry-${entry.id}`} className={String(entry.id) === String(requestedEntryId) ? "scroll-mt-24 rounded-xl ring-2 ring-amber-400 ring-offset-2" : ""}>
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
                        <>
                        <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 lg:flex-row lg:items-center lg:justify-between">
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
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
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
                            {entry.payroll_adjustment_decision && (
                              <div className="mt-3 space-y-1">
                                <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                                  {payrollDecisionLabel(entry.payroll_adjustment_decision)}
                                </Badge>
                                <p className="text-xs text-slate-600">
                                  Actual {Number(entry.actual_hours_snapshot ?? calculatePaidHours(entry)).toFixed(2)}h · Payroll {Number(entry.approved_hours_snapshot ?? calculatePaidHours(entry)).toFixed(2)}h
                                </p>
                                {entry.payroll_adjustment_reason && (
                                  <p className="text-xs text-slate-500">Reason: {entry.payroll_adjustment_reason}</p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="text-right">
                              <p className="text-2xl font-bold text-slate-900">
                                {calculateHours(entry.clock_in, entry.clock_out)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              {hasPayrollAuthority && entry.clock_out && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title="Review payroll and performance handling"
                                  onClick={() => openPayrollDecision(entry)}
                                  className="border-amber-400 bg-amber-100 font-bold text-amber-950 hover:bg-amber-200"
                                >
                                  <BadgeDollarSign className="mr-1.5 h-4 w-4" />
                                  Review Pay
                                </Button>
                              )}
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
                        {hasPayrollAuthority && entry.clock_out && payrollEntryId === entry.id && (
                          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="space-y-3 lg:col-span-2">
                                <div>
                                  <Label className="text-base font-bold text-slate-950">Choose the payroll and performance decision</Label>
                                  {queueKind === 'late_clock_out' && String(entry.id) === String(requestedEntryId) && (
                                    <p className="mt-1 text-sm font-medium text-amber-900">This is the late clock-out from the work queue. Saving a decision closes that task automatically.</p>
                                  )}
                                </div>
                                <div className="grid gap-2 md:grid-cols-3">
                                  {[
                                    ['relief_delay_approved', 'Approve late relief', 'Pay all actual hours and do not count the overage against performance.'],
                                    ['pay_overage_with_performance', 'Reject relief — pay and count', 'Pay all actual hours and count the late clock-out in performance.'],
                                    ['deny_overage_pay', 'Limit payroll hours', 'Set the hours payroll will pay; preserve the true clock-in and clock-out record.'],
                                  ].map(([decision, label, detail]) => (
                                    <button
                                      key={decision}
                                      type="button"
                                      onClick={() => setPayrollForm({ ...payrollForm, decision })}
                                      className={`rounded-xl border-2 p-3 text-left transition ${payrollForm.decision === decision ? 'border-amber-500 bg-amber-100 shadow-sm' : 'border-slate-200 bg-white hover:border-amber-300'}`}
                                    >
                                      <span className="block text-sm font-black text-slate-950">{label}</span>
                                      <span className="mt-1 block text-xs leading-5 text-slate-600">{detail}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">True clock record</p>
                                <p className="mt-1 font-semibold text-slate-900">
                                  {format(parseISO(entry.clock_in), 'MMM d, yyyy h:mm a')} – {format(parseISO(entry.clock_out), 'MMM d, yyyy h:mm a')}
                                </p>
                                <p className="text-sm text-slate-600">{calculatePaidHours(entry).toFixed(2)} actual paid hours</p>
                              </div>

                              {payrollForm.decision === 'deny_overage_pay' && (
                                <div className="space-y-2">
                                  <Label htmlFor={`approved_hours_${entry.id}`}>Approved payroll hours</Label>
                                  <Input
                                    id={`approved_hours_${entry.id}`}
                                    type="number"
                                    min="0"
                                    max={calculatePaidHours(entry)}
                                    step="0.01"
                                    value={payrollForm.approved_hours}
                                    onChange={(event) => setPayrollForm({ ...payrollForm, approved_hours: event.target.value })}
                                  />
                                  <p className="text-xs text-slate-500">Payroll uses this value; the true punches above stay unchanged.</p>
                                </div>
                              )}

                              {payrollForm.decision === 'relief_delay_approved' && (
                                <div className="space-y-2">
                                  <Label>Late relief officer (optional)</Label>
                                  <Select
                                    value={payrollForm.relief_officer_email}
                                    onValueChange={(relief_officer_email) => setPayrollForm({ ...payrollForm, relief_officer_email })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select relief officer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Not specified</SelectItem>
                                      {activeOfficers
                                        .filter((officer) => officer.email !== entry.officer_email)
                                        .map((officer) => (
                                          <SelectItem key={officer.email} value={officer.email}>
                                            {officer.first_name && officer.last_name
                                              ? `${officer.first_name} ${officer.last_name}`
                                              : officer.full_name || officer.email}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor={`payroll_reason_${entry.id}`}>Decision reason *</Label>
                                <Textarea
                                  id={`payroll_reason_${entry.id}`}
                                  rows={3}
                                  placeholder="Explain the relief delay, paid overage, or payroll-hour limit..."
                                  value={payrollForm.reason}
                                  onChange={(event) => setPayrollForm({ ...payrollForm, reason: event.target.value })}
                                />
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                              <Button type="button" variant="outline" onClick={() => { setPayrollEntryId(null); clearTaskDeepLink(); }}>
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                disabled={payrollDecisionMutation.isPending || !payrollForm.reason.trim()}
                                onClick={() => payrollDecisionMutation.mutate({
                                  id: entry.id,
                                  decision: payrollForm.decision,
                                  approved_hours: payrollForm.approved_hours,
                                  reason: payrollForm.reason,
                                  relief_officer_email: payrollForm.relief_officer_email === 'none' ? '' : payrollForm.relief_officer_email,
                                })}
                                className="bg-amber-600 hover:bg-amber-700"
                              >
                                {payrollDecisionMutation.isPending ? 'Saving decision...' : 'Apply decision'}
                              </Button>
                            </div>
                          </div>
                        )}
                        </>
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