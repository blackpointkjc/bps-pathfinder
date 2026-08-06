import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Plus, UserCheck, CheckCircle, XCircle, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export default function SupervisorInspections() {
  const [showForm, setShowForm] = useState(false);
  const [editingInspectionId, setEditingInspectionId] = useState(null);
  const [formData, setFormData] = useState({
    inspection_date: new Date().toISOString().slice(0, 16),
    officer_inspected: "",
    officer_email: "",
    location: "",
    uniform_appearance: "satisfactory",
    equipment_condition: "satisfactory",
    post_knowledge: "satisfactory",
    professionalism: "satisfactory",
    observations: "",
    areas_of_concern: "",
    commendations: "",
    follow_up_required: false,
    inspection_result: "",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await base44.entities.Location.list('site_name');
      return allLocations.filter(loc => loc.active);
    },
    initialData: [], // Added initialData
  });

  // Added new query for all users
  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  // Rank hierarchy (lower number = higher rank)
  const rankOrder = {
    'Colonel (Operations Manager)': 1,
    'Lieutenant Colonel (Deputy Operations Manager)': 2,
    'Major (Division Commander)': 3,
    'Captain': 4,
    'Lieutenant': 5,
    'Sergeant': 6,
    'Corporal': 7,
    'Officer': 8,
  };

  const userRankOrder = rankOrder[user?.rank] || 99;
  const userUnitNumber = parseInt(user?.unit_number) || 0;

  const filteredUsers = (allUsers || []).filter(u => {
    if (!u.email || !u.first_name || !u.last_name) return false;
    
    // Admins see everyone
    if (user?.role === 'admin') return true;
    
    const officerRankOrder = rankOrder[u.rank] || 99;
    const officerUnitNumber = parseInt(u.unit_number) || 0;
    
    // Show officers with lower rank OR lower unit number
    return officerRankOrder > userRankOrder || (u.unit_number && officerUnitNumber < userUnitNumber);
  });

  const userRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasSupervisorAccess = user?.role === 'admin' || userRoles.has('full_access') || userRoles.has('supervisor');

  const { data: inspections = [], isLoading: inspectionsLoading, error: inspectionsError } = useQuery({
    queryKey: ['inspectionReports'],
    queryFn: () => base44.entities.InspectionReport.list('-created_date'),
    enabled: hasSupervisorAccess,
    initialData: [],
  });

  const saveInspectionMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? base44.functions.invoke('updateInspectionDraft', { inspection_id: id, inspection: data })
      : base44.entities.InspectionReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionReports'] });
      setShowForm(false);
      setEditingInspectionId(null);
      setFormData({
        inspection_date: new Date().toISOString().slice(0, 16),
        officer_inspected: "",
        officer_email: "",
        location: "",
        uniform_appearance: "satisfactory",
        equipment_condition: "satisfactory",
        post_knowledge: "satisfactory",
        professionalism: "satisfactory",
        observations: "",
        areas_of_concern: "",
        commendations: "",
        follow_up_required: false,
        inspection_result: "",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveInspectionMutation.mutate({ id: editingInspectionId, data: formData });
  };

  const startEditingDraft = (inspection) => {
    const date = inspection.inspection_date && !Number.isNaN(new Date(inspection.inspection_date).getTime())
      ? new Date(inspection.inspection_date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);
    setEditingInspectionId(inspection.id);
    setFormData({
      inspection_date: date,
      officer_inspected: inspection.officer_inspected || '',
      officer_email: inspection.officer_email || '',
      location: inspection.location || '',
      uniform_appearance: inspection.uniform_appearance || 'satisfactory',
      equipment_condition: inspection.equipment_condition || 'satisfactory',
      post_knowledge: inspection.post_knowledge || 'satisfactory',
      professionalism: inspection.professionalism || 'satisfactory',
      observations: inspection.observations || '',
      areas_of_concern: inspection.areas_of_concern || '',
      commendations: inspection.commendations || '',
      follow_up_required: Boolean(inspection.follow_up_required),
      inspection_result: inspection.inspection_result || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const normalizeRating = (rating) => String(rating || 'not_rated');
  const formatRating = (rating) => normalizeRating(rating).replaceAll('_', ' ');

  const getRatingColor = (rating) => {
    switch (normalizeRating(rating)) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'satisfactory': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'needs_improvement': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unsatisfactory': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-800 text-slate-200 border-slate-600';
    }
  };

  if (!hasSupervisorAccess) {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-[#0b1420] text-slate-100">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="mobile-page-header flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Officer Inspections</h1>
            <p className="text-slate-400">Conduct, complete, and track officer inspections</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Inspection
          </Button>
        </div>

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-green-600" />
                {editingInspectionId ? 'Complete Inspection Draft' : 'New Officer Inspection'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inspection_date">Inspection Date & Time *</Label>
                    <Input
                      id="inspection_date"
                      type="datetime-local"
                      value={formData.inspection_date}
                      onChange={(e) => setFormData({...formData, inspection_date: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
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
                    <Label htmlFor="officer_inspected">Officer *</Label>
                    <Select
                      value={formData.officer_email}
                      onValueChange={(value) => {
                        const officer = allUsers?.find(u => u.email === value);
                        const officerName = officer ? `${officer.first_name} ${officer.last_name}` : value;
                        setFormData({
                          ...formData, 
                          officer_inspected: officerName,
                          officer_email: value
                        });
                      }}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select officer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUsers.length === 0 ? (
                          <div className="p-2 text-sm text-slate-500">No officers found</div>
                        ) : (
                          filteredUsers.map((officer) => (
                            <SelectItem key={officer.email} value={officer.email}>
                              {officer.first_name} {officer.last_name} - {officer.rank || 'Officer'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officer_email_display">Officer Email</Label>
                    <Input
                      id="officer_email_display"
                      value={formData.officer_email || ''}
                      disabled
                      className="bg-slate-100"
                    />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Uniform & Appearance</Label>
                    <Select
                      value={formData.uniform_appearance}
                      onValueChange={(value) => setFormData({...formData, uniform_appearance: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                        <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Equipment Condition</Label>
                    <Select
                      value={formData.equipment_condition}
                      onValueChange={(value) => setFormData({...formData, equipment_condition: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                        <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Post Knowledge</Label>
                    <Select
                      value={formData.post_knowledge}
                      onValueChange={(value) => setFormData({...formData, post_knowledge: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                        <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Professionalism</Label>
                    <Select
                      value={formData.professionalism}
                      onValueChange={(value) => setFormData({...formData, professionalism: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                        <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observations">General Observations</Label>
                  <Textarea
                    id="observations"
                    placeholder="General observations during inspection..."
                    value={formData.observations}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commendations">Commendations</Label>
                  <Textarea
                    id="commendations"
                    placeholder="Positive performance notes..."
                    value={formData.commendations}
                    onChange={(e) => setFormData({...formData, commendations: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="areas_of_concern">Areas of Concern</Label>
                  <Textarea
                    id="areas_of_concern"
                    placeholder="Areas needing improvement..."
                    value={formData.areas_of_concern}
                    onChange={(e) => setFormData({...formData, areas_of_concern: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="follow_up"
                    checked={formData.follow_up_required}
                    onCheckedChange={(checked) => setFormData({...formData, follow_up_required: checked})}
                  />
                  <Label htmlFor="follow_up" className="cursor-pointer">
                    Follow-up inspection required
                  </Label>
                </div>

                <div className="p-4 bg-slate-100 rounded-lg border border-slate-300">
                  <Label className="font-semibold text-slate-900 mb-3 block">Inspection Result</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      type="button"
                      variant={formData.inspection_result === 'pass' ? 'default' : 'outline'}
                      className={`h-16 ${formData.inspection_result === 'pass' ? 'bg-green-600 hover:bg-green-700' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                      onClick={() => setFormData({...formData, inspection_result: 'pass'})}
                    >
                      <CheckCircle className="w-6 h-6 mr-2" />
                      PASS
                    </Button>
                    <Button
                      type="button"
                      variant={formData.inspection_result === 'fail' ? 'default' : 'outline'}
                      className={`h-16 ${formData.inspection_result === 'fail' ? 'bg-red-600 hover:bg-red-700' : 'border-red-300 text-red-700 hover:bg-red-50'}`}
                      onClick={() => setFormData({...formData, inspection_result: 'fail'})}
                    >
                      <XCircle className="w-6 h-6 mr-2" />
                      FAIL
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowForm(false); setEditingInspectionId(null); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveInspectionMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {saveInspectionMutation.isPending ? 'Saving...' : editingInspectionId ? 'Complete Draft' : 'Submit Inspection'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border border-slate-700 bg-[#111d2b] shadow-lg">
          <CardHeader className="border-b border-slate-700">
            <CardTitle className="text-white">Inspection History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {inspectionsLoading && <p className="py-8 text-center text-slate-400">Loading inspections...</p>}
              {inspectionsError && <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-200">Unable to load inspections: {inspectionsError.message}</div>}
              {!inspectionsLoading && !inspectionsError && inspections.map((inspection) => (
                <div key={inspection.id} className="rounded-lg border border-slate-700 bg-[#0d1825] p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-white text-lg">{inspection.officer_inspected || 'Officer not selected'}</p>
                      <p className="text-sm text-slate-300">
                        {inspection.inspection_date && !Number.isNaN(new Date(inspection.inspection_date).getTime()) ? format(new Date(inspection.inspection_date), 'MMM d, yyyy h:mm a') : 'Date pending'} - {inspection.location || 'Location pending'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Inspected by: {inspection.created_by || 'Draft from site check'}</p>
                    </div>
                    <div className="flex gap-2">
                      {inspection.inspection_result ? (
                        <Badge className={inspection.inspection_result === 'pass' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}>
                          {inspection.inspection_result === 'pass' ? <><CheckCircle className="w-3 h-3 mr-1" />PASS</> : <><XCircle className="w-3 h-3 mr-1" />FAIL</>}
                        </Badge>
                      ) : (
                        <>
                          <Badge className="border border-amber-600 bg-amber-950/40 text-amber-300">DRAFT — NEEDS COMPLETION</Badge>
                          <Button type="button" size="sm" onClick={() => startEditingDraft(inspection)} className="bg-blue-700 text-white hover:bg-blue-600">
                            <Pencil className="mr-1 h-3.5 w-3.5" /> EDIT DRAFT
                          </Button>
                        </>
                      )}
                      {inspection.follow_up_required && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                          Follow-up Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Uniform</p>
                      <Badge variant="outline" className={getRatingColor(inspection.uniform_appearance)}>
                        {formatRating(inspection.uniform_appearance)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Equipment</p>
                      <Badge variant="outline" className={getRatingColor(inspection.equipment_condition)}>
                        {formatRating(inspection.equipment_condition)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Post Knowledge</p>
                      <Badge variant="outline" className={getRatingColor(inspection.post_knowledge)}>
                        {formatRating(inspection.post_knowledge)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Professionalism</p>
                      <Badge variant="outline" className={getRatingColor(inspection.professionalism)}>
                        {formatRating(inspection.professionalism)}
                      </Badge>
                    </div>
                  </div>
                  {inspection.observations && (
                    <div className="mb-2">
                      <p className="text-xs text-slate-500 font-medium mb-1">Observations:</p>
                      <p className="text-sm text-slate-700">{inspection.observations}</p>
                    </div>
                  )}
                  {inspection.commendations && (
                    <div className="mb-2 p-2 bg-green-50 rounded border border-green-200">
                      <p className="text-xs text-green-700 font-medium mb-1">Commendations:</p>
                      <p className="text-sm text-green-900">{inspection.commendations}</p>
                    </div>
                  )}
                  {inspection.areas_of_concern && (
                    <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                      <p className="text-xs text-yellow-700 font-medium mb-1">Areas of Concern:</p>
                      <p className="text-sm text-yellow-900">{inspection.areas_of_concern}</p>
                    </div>
                  )}
                </div>
              ))}
              {!inspectionsLoading && !inspectionsError && inspections.length === 0 && (
                <p className="text-center text-slate-400 py-8">No inspections have been created yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}