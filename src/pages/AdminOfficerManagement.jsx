import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, Save, Check, Shield, User, Search, Plus, Trash2, Pencil, Users } from "lucide-react";

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};

export default function AdminOfficerManagement() {
  const queryClient = useQueryClient();
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [availability, setAvailability] = useState({});
  const [maxHours, setMaxHours] = useState(40);
  const [preferredShiftLength, setPreferredShiftLength] = useState("8");
  const [canSplitSites, setCanSplitSites] = useState(false);
  const [daysOff, setDaysOff] = useState([]);
  const [newDayOff, setNewDayOff] = useState("");
  const [preferredLocations, setPreferredLocations] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    site_name: "", shift_type: "evening", default_start_time: "18:00",
    default_end_time: "04:00", is_primary: true, active: true,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const { data: allAvailability } = useQuery({
    queryKey: ['allAvailability'],
    queryFn: () => base44.entities.OfficerAvailability.list(),
    enabled: user?.role === 'admin',
  });



  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list('site_name');
      return locs.filter(l => l.active);
    },
  });

  // Show all users including admins for profile viewing
  const activeOfficers = allUsers?.filter(u => !u.termination_date) || [];
  const filteredOfficers = activeOfficers.filter(o => {
    const name = `${o.first_name || ''} ${o.last_name || ''}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase()) || o.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    if (selectedOfficer && allAvailability) {
      const officerAvail = allAvailability.filter(a => a.officer_email === selectedOfficer);
      if (officerAvail.length > 0) {
        const avail = {};
        officerAvail.forEach(a => {
          avail[a.day_of_week] = {
            id: a.id, available: a.available,
            preferred_start_time: a.preferred_start_time || '07:00',
            preferred_end_time: a.preferred_end_time || '23:00',
          };
        });
        setAvailability(avail);
        setMaxHours(officerAvail[0]?.max_hours_per_week || 40);
        setPreferredShiftLength(officerAvail[0]?.preferred_shift_length || "8");
        setCanSplitSites(officerAvail[0]?.can_split_sites || false);
        setDaysOff(officerAvail[0]?.days_off || []);
        setPreferredLocations(officerAvail[0]?.preferred_locations || []);
        setNotes(officerAvail[0]?.notes || "");
      } else {
        const defaultAvail = {};
        DAYS.forEach(day => {
          defaultAvail[day] = { available: true, preferred_start_time: '07:00', preferred_end_time: '23:00' };
        });
        setAvailability(defaultAvail);
        setMaxHours(40);
        setPreferredShiftLength("8");
        setCanSplitSites(false);
        setDaysOff([]);
        setPreferredLocations([]);
        setNotes("");
      }
    }
  }, [selectedOfficer, allAvailability]);

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      setSaving(true);
      const existingAvailability = allAvailability?.filter(a => a.officer_email === selectedOfficer) || [];
      for (const day of DAYS) {
        const dayData = availability[day];
        const existingDay = existingAvailability.find(a => a.day_of_week === day);
        const data = {
          officer_email: selectedOfficer, day_of_week: day,
          available: dayData?.available ?? true,
          preferred_start_time: dayData?.preferred_start_time || '07:00',
          preferred_end_time: dayData?.preferred_end_time || '23:00',
          max_hours_per_week: maxHours,
          preferred_shift_length: preferredShiftLength,
          can_split_sites: canSplitSites,
          days_off: daysOff,
          preferred_locations: preferredLocations,
          notes: notes,
        };
        if (existingDay?.id) {
          await base44.entities.OfficerAvailability.update(existingDay.id, data);
        } else {
          await base44.entities.OfficerAvailability.create(data);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allAvailability'] });
      setSaving(false);
      alert('✅ Availability & preferences saved!');
    },
    onError: () => { setSaving(false); alert('Failed to save.'); }
  });

  const updateDay = (day, field, value) => {
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const toggleLocation = (locName) => {
    setPreferredLocations(prev => 
      prev.includes(locName) ? prev.filter(l => l !== locName) : [...prev, locName]
    );
  };

  const addDayOff = () => {
    if (newDayOff && !daysOff.includes(newDayOff)) {
      setDaysOff([...daysOff, newDayOff]);
      setNewDayOff("");
    }
  };

  const removeDayOff = (date) => setDaysOff(daysOff.filter(d => d !== date));

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    return officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || email : email;
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-8 h-8 text-amber-600" />
              Officer Availability & Assignments
            </h1>
            <p className="text-slate-600">Manage officer schedules, preferences, and site assignments</p>
          </div>
          {selectedOfficer && (
            <Button onClick={() => saveAvailabilityMutation.mutate()} disabled={saving} className="bg-green-600 hover:bg-green-700">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save All Changes'}
            </Button>
          )}
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-amber-600" />
              Select Officer
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search officers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                <SelectTrigger><SelectValue placeholder="Select an officer..." /></SelectTrigger>
                <SelectContent>
                  {filteredOfficers.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(officer => (
                    <SelectItem key={officer.email} value={officer.email}>
                      <div className="flex items-center gap-2">
                        {officer.unit_number && <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">#{officer.unit_number}</span>}
                        <span>{officer.first_name} {officer.last_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedOfficer && (
          <div className="space-y-4">
              <Card className="border-none shadow-lg border-2 border-amber-200">
                <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
                  <div className="flex items-center justify-between">
                    <CardTitle>Editing: {getOfficerName(selectedOfficer)}</CardTitle>
                    <Badge className="bg-amber-600 text-white">Admin Edit Mode</Badge>
                  </div>
                </CardHeader>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-none shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock className="w-5 h-5 text-blue-600" />
                      Schedule Preferences
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <Label>Max hours/week:</Label>
                      <Input type="number" value={maxHours} onChange={(e) => setMaxHours(parseInt(e.target.value) || 40)} className="w-20" min={8} max={60} />
                    </div>
                    <div className="flex items-center gap-4">
                      <Label>Preferred shift:</Label>
                      <Select value={preferredShiftLength} onValueChange={setPreferredShiftLength}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 hours</SelectItem>
                          <SelectItem value="8">8 hours</SelectItem>
                          <SelectItem value="10">10 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={canSplitSites} onCheckedChange={setCanSplitSites} />
                      <Label>Can work split shifts between sites</Label>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="w-5 h-5 text-red-600" />
                      Days Off (Blocked Dates)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <Input type="date" value={newDayOff} onChange={(e) => setNewDayOff(e.target.value)} className="flex-1" />
                      <Button onClick={addDayOff} size="sm"><Plus className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {daysOff.map(date => (
                        <Badge key={date} variant="outline" className="flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
                          {date}
                          <button onClick={() => removeDayOff(date)} className="ml-1 hover:text-red-900"><Trash2 className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                      {daysOff.length === 0 && <p className="text-sm text-slate-500">No blocked dates</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-600" />
                    Weekly Availability
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS.map(day => (
                      <div key={day} className={`p-3 rounded-lg border text-center ${availability[day]?.available ? 'bg-green-50 border-green-200' : 'bg-slate-100 border-slate-200'}`}>
                        <div className="flex flex-col items-center gap-2">
                          <Switch checked={availability[day]?.available ?? true} onCheckedChange={(checked) => updateDay(day, 'available', checked)} />
                          <span className={`font-semibold text-sm ${availability[day]?.available ? 'text-green-700' : 'text-slate-400'}`}>{DAY_LABELS[day]}</span>
                        </div>
                        {availability[day]?.available && (
                          <div className="mt-2 space-y-1">
                            <Input type="time" value={availability[day]?.preferred_start_time || '07:00'} onChange={(e) => updateDay(day, 'preferred_start_time', e.target.value)} className="text-xs h-7" />
                            <Input type="time" value={availability[day]?.preferred_end_time || '23:00'} onChange={(e) => updateDay(day, 'preferred_end_time', e.target.value)} className="text-xs h-7" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-purple-600" />
                    Preferred Locations
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-2">
                    {locations?.map(loc => (
                      <button key={loc.id} onClick={() => toggleLocation(loc.site_name)}
                        className={`px-3 py-2 rounded-lg border transition-all text-sm ${preferredLocations.includes(loc.site_name) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-300 hover:border-purple-300'}`}>
                        {preferredLocations.includes(loc.site_name) && <Check className="w-3 h-3 inline mr-1" />}
                        {loc.site_name}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
                <CardContent className="p-4">
                  <Textarea placeholder="Additional scheduling notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </CardContent>
                  </Card>
                  </div>
                  )}
                  </div>
                  </div>
                  );
                  }