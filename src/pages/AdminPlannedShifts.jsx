import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Shield, Calendar, Plus, Trash2, Pencil, Clock, CalendarDays, Users, UserPlus, CheckCircle, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO, addDays, startOfWeek } from "date-fns";

const DAYS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" }
];

export default function AdminPlannedShifts() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [formData, setFormData] = useState({
    location: "",
    day_of_week: "",
    specific_date: "",
    shift_type: "recurring",
    start_time: "",
    end_time: "",
    preferred_officers: [],
    num_officers: 1,
    priority: 1,
    is_required: true,
    notes: "",
    active: true
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list('site_name');
      return locs.filter(l => l.active);
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const { data: plannedShifts } = useQuery({
    queryKey: ['plannedShifts'],
    queryFn: () => base44.entities.PlannedShift.list(),
    enabled: user?.role === 'admin',
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PlannedShift.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannedShifts'] });
      resetForm();
      setShowDialog(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PlannedShift.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannedShifts'] });
      resetForm();
      setShowDialog(false);
      setEditingShift(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PlannedShift.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannedShifts'] });
    },
  });

  const [postingShift, setPostingShift] = useState(null);
  const [postDate, setPostDate] = useState("");

  // Mutation to post shift to schedule
  const postToScheduleMutation = useMutation({
    mutationFn: async ({ shift, targetDate }) => {
      const locationObj = locations?.find(l => l.site_name === shift.location);
      const locationStr = locationObj ? `${locationObj.site_name}: ${locationObj.address}` : shift.location;
      
      // Determine if overnight shift
      const isOvernightShift = parseInt(shift.end_time.replace(':', '')) < parseInt(shift.start_time.replace(':', ''));
      
      // Create shifts for each officer needed
      const numOfficers = shift.num_officers || 1;
      const preferredOfficers = shift.preferred_officers || [];
      
      const shiftsToCreate = [];
      for (let i = 0; i < numOfficers; i++) {
        const officerEmail = preferredOfficers[i] || 'OPEN';
        shiftsToCreate.push({
          officer_email: officerEmail,
          shift_date: targetDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
          location: locationStr,
          is_open: officerEmail === 'OPEN',
          is_split_shift: isOvernightShift,
        });
      }
      
      // Create the shifts
      await base44.entities.Schedule.bulkCreate(shiftsToCreate);
      
      // Mark planned shift as inactive
      await base44.entities.PlannedShift.update(shift.id, { active: false });
      
      return shiftsToCreate.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['plannedShifts'] });
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      alert(`Posted ${count} shift(s) to schedule!`);
      setPostingShift(null);
      setPostDate("");
    },
  });

  const handlePostToSchedule = (shift) => {
    if (shift.shift_type === 'one_time' && shift.specific_date) {
      // For one-time events, use the specific date directly
      postToScheduleMutation.mutate({ shift, targetDate: shift.specific_date });
    } else {
      // For recurring, show dialog to select date
      setPostingShift(shift);
      // Pre-fill with next occurrence of that day
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 0 });
      const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(shift.day_of_week);
      let nextDate = addDays(weekStart, dayIndex);
      if (nextDate < today) {
        nextDate = addDays(nextDate, 7);
      }
      setPostDate(format(nextDate, 'yyyy-MM-dd'));
    }
  };

  const resetForm = () => {
    setFormData({
      location: "",
      day_of_week: "",
      specific_date: "",
      shift_type: "recurring",
      start_time: "",
      end_time: "",
      preferred_officers: [],
      num_officers: 1,
      priority: 1,
      is_required: true,
      notes: "",
      active: true
    });
  };

  const handleEdit = (shift) => {
    setEditingShift(shift);
    setFormData({
      location: shift.location,
      day_of_week: shift.day_of_week || "",
      specific_date: shift.specific_date || "",
      shift_type: shift.shift_type || "recurring",
      start_time: shift.start_time,
      end_time: shift.end_time,
      preferred_officers: shift.preferred_officers || [],
      num_officers: shift.num_officers || 1,
      priority: shift.priority || 1,
      is_required: shift.is_required ?? true,
      notes: shift.notes || "",
      active: shift.active ?? true
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.location || !formData.start_time || !formData.end_time) {
      alert('Please fill in location and time fields');
      return;
    }
    
    if (formData.shift_type === "recurring" && !formData.day_of_week) {
      alert('Please select a day of week for recurring shifts');
      return;
    }
    
    if (formData.shift_type === "one_time" && !formData.specific_date) {
      alert('Please select a specific date for one-time event shifts');
      return;
    }

    if (editingShift) {
      updateMutation.mutate({ id: editingShift.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id) => {
    if (confirm('Delete this planned shift?')) {
      deleteMutation.mutate(id);
    }
  };

  const activeShifts = plannedShifts?.filter(s => s.active) || [];
  const inactiveShifts = plannedShifts?.filter(s => !s.active) || [];
  
  const recurringShifts = activeShifts.filter(s => s.shift_type !== 'one_time');
  const eventShifts = activeShifts.filter(s => s.shift_type === 'one_time');

  const getOfficerName = (email) => {
    if (!email || email === 'OPEN') return "OPEN (for bidding)";
    const officer = allUsers?.find(u => u.email === email);
    return officer ? `${officer.first_name} ${officer.last_name}` : email;
  };

  const getPreferredOfficersDisplay = (preferredOfficers) => {
    if (!preferredOfficers || preferredOfficers.length === 0) return "OPEN shifts (for officer bidding)";
    return preferredOfficers.map(email => getOfficerName(email)).join(", ");
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-8 h-8 text-indigo-600" />
              Planned Shifts Template
            </h1>
            <p className="text-slate-600">Define shift templates and post them to the schedule</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setEditingShift(null);
              setShowDialog(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Planned Shift
          </Button>
        </div>

        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border-2 border-indigo-200">
          <h3 className="font-semibold text-indigo-900 mb-2">💡 How Planned Shifts Work:</h3>
          <ul className="text-sm text-indigo-800 space-y-1">
            <li>• <strong>Recurring Shifts:</strong> Define weekly shift templates that repeat every week</li>
            <li>• <strong>One-Time Events:</strong> Define specific date shifts for special events</li>
            <li>• Click <strong>"Post to Schedule"</strong> to add shifts to the actual schedule</li>
            <li>• After posting, the template moves to Inactive</li>
            <li>• Specify officers to assign or leave as OPEN for bidding</li>
          </ul>
        </div>

        <Tabs defaultValue="recurring" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1">
            <TabsTrigger value="recurring" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-900">
              <Calendar className="w-4 h-4 mr-2" />
              Recurring Weekly ({recurringShifts.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-900">
              <CalendarDays className="w-4 h-4 mr-2" />
              One-Time Events ({eventShifts.length})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              Inactive ({inactiveShifts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recurring">
            <Card className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50">
                <CardTitle>Recurring Weekly Shifts</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-4">
                  {recurringShifts.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No recurring planned shifts. Add your first template above.</p>
                  ) : (
                    recurringShifts
                      .sort((a, b) => {
                        if (a.location !== b.location) return a.location.localeCompare(b.location);
                        const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                        return dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week);
                      })
                      .map((shift) => (
                        <div key={shift.id} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-indigo-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className="bg-indigo-600 text-white">{shift.priority === 1 ? "High Priority" : `Priority ${shift.priority}`}</Badge>
                                {shift.is_required && <Badge className="bg-green-600 text-white">Required</Badge>}
                                {(shift.num_officers || 1) > 1 && (
                                  <Badge className="bg-blue-600 text-white">
                                    <Users className="w-3 h-3 mr-1" />
                                    {shift.num_officers} Officers
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold text-slate-900 text-lg mb-1">{shift.location}</p>
                              <p className="text-sm text-slate-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                {DAYS.find(d => d.value === shift.day_of_week)?.label}: {shift.start_time} - {shift.end_time}
                              </p>
                              <p className="text-xs text-slate-600 flex items-center gap-1 bg-slate-50 p-2 rounded">
                                <UserPlus className="w-3 h-3" />
                                {getPreferredOfficersDisplay(shift.preferred_officers)}
                              </p>
                              {shift.notes && (
                                <p className="text-xs text-slate-500 mt-2 italic">{shift.notes}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handlePostToSchedule(shift)}
                                disabled={postToScheduleMutation.isPending}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Post
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleEdit(shift)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(shift.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                <CardTitle>One-Time Event Shifts</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-4">
                  {eventShifts.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No one-time event shifts. Add special event coverage above.</p>
                  ) : (
                    eventShifts
                      .sort((a, b) => (a.specific_date || '').localeCompare(b.specific_date || ''))
                      .map((shift) => (
                        <div key={shift.id} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className="bg-purple-600 text-white">Event</Badge>
                                <Badge className="bg-indigo-600 text-white">{shift.priority === 1 ? "High Priority" : `Priority ${shift.priority}`}</Badge>
                                {shift.is_required && <Badge className="bg-green-600 text-white">Required</Badge>}
                                {(shift.num_officers || 1) > 1 && (
                                  <Badge className="bg-blue-600 text-white">
                                    <Users className="w-3 h-3 mr-1" />
                                    {shift.num_officers} Officers
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold text-slate-900 text-lg mb-1">{shift.location}</p>
                              <p className="text-sm text-slate-700 mb-2">
                                <CalendarDays className="w-4 h-4 inline mr-1" />
                                {shift.specific_date ? format(parseISO(shift.specific_date), 'EEEE, MMMM d, yyyy') : 'No date set'}
                              </p>
                              <p className="text-sm text-slate-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                {shift.start_time} - {shift.end_time}
                              </p>
                              <p className="text-xs text-slate-600 flex items-center gap-1 bg-slate-50 p-2 rounded">
                                <UserPlus className="w-3 h-3" />
                                {getPreferredOfficersDisplay(shift.preferred_officers)}
                              </p>
                              {shift.notes && (
                                <p className="text-xs text-slate-500 mt-2 italic">{shift.notes}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handlePostToSchedule(shift)}
                                disabled={postToScheduleMutation.isPending}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Post
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleEdit(shift)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(shift.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive">
            {inactiveShifts.length > 0 && (
              <Card className="border-none shadow-lg">
                <CardHeader className="bg-slate-100">
                  <CardTitle className="text-slate-600">Inactive Planned Shifts ({inactiveShifts.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-3">
                    {inactiveShifts.map((shift) => (
                      <div key={shift.id} className="p-3 bg-slate-50 rounded-lg border border-slate-300 opacity-60">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-700">{shift.location}</p>
                            <p className="text-sm text-slate-500">
                              {shift.shift_type === 'one_time' 
                                ? (shift.specific_date ? format(parseISO(shift.specific_date), 'MMM d, yyyy') : 'No date')
                                : DAYS.find(d => d.value === shift.day_of_week)?.label
                              }: {shift.start_time} - {shift.end_time}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleEdit(shift)}>
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit' : 'Add'} Planned Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                      <Label>Shift Type *</Label>
                      <Select value={formData.shift_type} onValueChange={(v) => setFormData({ ...formData, shift_type: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recurring">Recurring Weekly</SelectItem>
                          <SelectItem value="one_time">One-Time Event</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* For one-time events, show date first since it's critical */}
                    {formData.shift_type === "one_time" && (
                      <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <Label className="text-purple-900 font-semibold">Event Date *</Label>
                        <Input
                          type="date"
                          value={formData.specific_date}
                          onChange={(e) => setFormData({ ...formData, specific_date: e.target.value })}
                          className="border-purple-300"
                        />
                        <p className="text-xs text-purple-700">Select the specific date for this event coverage</p>
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Location *</Label>
                        <Select value={formData.location} onValueChange={(v) => setFormData({ ...formData, location: v })}>
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

                      {formData.shift_type === "recurring" && (
                        <div className="space-y-2">
                          <Label>Day of Week *</Label>
                          <Select value={formData.day_of_week} onValueChange={(v) => setFormData({ ...formData, day_of_week: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select day..." />
                            </SelectTrigger>
                            <SelectContent>
                              {DAYS.map((day) => (
                                <SelectItem key={day.value} value={day.value}>
                                  {day.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Number of Officers Needed</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formData.num_officers}
                onChange={(e) => setFormData({ ...formData, num_officers: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-slate-500">Number of shifts to create when posting</p>
            </div>

            <div className="space-y-2">
              <Label>Assigned Officers (Optional - Select up to 3)</Label>
              <p className="text-xs text-slate-500 mb-2">Select officers to assign. Leave empty to create OPEN shifts for bidding.</p>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2 bg-slate-50">
                {allUsers?.filter(u => !u.termination_date).sort((a, b) => {
                  const unitA = a.unit_number ? parseInt(a.unit_number) : 9999;
                  const unitB = b.unit_number ? parseInt(b.unit_number) : 9999;
                  if (unitA !== unitB) return unitA - unitB;
                  return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
                }).map((officer) => (
                  <div key={officer.email} className="flex items-center space-x-2">
                    <Checkbox
                      id={`officer-${officer.email}`}
                      checked={formData.preferred_officers?.includes(officer.email)}
                      disabled={!formData.preferred_officers?.includes(officer.email) && formData.preferred_officers?.length >= 3}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({ 
                            ...formData, 
                            preferred_officers: [...(formData.preferred_officers || []), officer.email].slice(0, 3)
                          });
                        } else {
                          setFormData({ 
                            ...formData, 
                            preferred_officers: (formData.preferred_officers || []).filter(e => e !== officer.email)
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`officer-${officer.email}`} className="text-sm cursor-pointer">
                      {officer.first_name} {officer.last_name} {officer.unit_number ? `(#${officer.unit_number})` : ''}
                    </Label>
                  </div>
                ))}
              </div>
              {formData.preferred_officers?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.preferred_officers.map(email => (
                    <Badge key={email} variant="secondary" className="text-xs">
                      {getOfficerName(email)}
                      <button 
                        type="button"
                        className="ml-1 hover:text-red-600"
                        onClick={() => setFormData({
                          ...formData,
                          preferred_officers: formData.preferred_officers.filter(e => e !== email)
                        })}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority (1 = Highest)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                />
                <Label>Required Shift</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional scheduling notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
              <Label>Active (available for posting to schedule)</Label>
            </div>

            {formData.shift_type === "one_time" && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-900">
                  <strong>💡 Event Shift:</strong> This shift will be posted for the specific date selected.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); setEditingShift(null); }}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {editingShift ? 'Update' : 'Create'} Planned Shift
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post to Schedule Dialog for Recurring Shifts */}
      <Dialog open={!!postingShift} onOpenChange={(open) => { if (!open) { setPostingShift(null); setPostDate(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post Shift to Schedule</DialogTitle>
          </DialogHeader>
          {postingShift && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="font-bold text-indigo-900">{postingShift.location}</p>
                <p className="text-sm text-indigo-700">{postingShift.start_time} - {postingShift.end_time}</p>
                <p className="text-sm text-indigo-700">{postingShift.num_officers || 1} officer(s)</p>
                {postingShift.preferred_officers?.length > 0 && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Assigned: {postingShift.preferred_officers.map(e => getOfficerName(e)).join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Select Date to Post *</Label>
                <Input
                  type="date"
                  value={postDate}
                  onChange={(e) => setPostDate(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Template day: {DAYS.find(d => d.value === postingShift.day_of_week)?.label}
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button variant="outline" onClick={() => { setPostingShift(null); setPostDate(""); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => postToScheduleMutation.mutate({ shift: postingShift, targetDate: postDate })}
                  disabled={!postDate || postToScheduleMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {postToScheduleMutation.isPending ? 'Posting...' : 'Post to Schedule'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}