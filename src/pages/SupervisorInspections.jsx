import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Plus, UserCheck, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export default function SupervisorInspections() {
  const [showForm, setShowForm] = useState(false);
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

  const { data: inspections } = useQuery({
    queryKey: ['inspectionReports'],
    queryFn: () => base44.entities.InspectionReport.list('-created_date'),
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  const createInspectionMutation = useMutation({
    mutationFn: (data) => base44.entities.InspectionReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionReports'] });
      setShowForm(false);
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
    createInspectionMutation.mutate(formData);
  };

  const getRatingColor = (rating) => {
    switch (rating) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'satisfactory': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'needs_improvement': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unsatisfactory': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (!user?.additional_roles?.includes('supervisor')) {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Officer Inspections</h1>
            <p className="text-slate-600">Conduct and track security officer inspections</p>
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
                New Officer Inspection
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
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createInspectionMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {createInspectionMutation.isPending ? 'Submitting...' : 'Submit Inspection'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Inspection History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {inspections?.map((inspection) => (
                <div key={inspection.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-slate-900 text-lg">{inspection.officer_inspected}</p>
                      <p className="text-sm text-slate-600">
                        {format(new Date(inspection.inspection_date), 'MMM d, yyyy h:mm a')} - {inspection.location}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Inspected by: {inspection.created_by}</p>
                    </div>
                    <div className="flex gap-2">
                      {inspection.inspection_result && (
                        <Badge className={inspection.inspection_result === 'pass' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>
                          {inspection.inspection_result === 'pass' ? <><CheckCircle className="w-3 h-3 mr-1" />PASS</> : <><XCircle className="w-3 h-3 mr-1" />FAIL</>}
                        </Badge>
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
                        {inspection.uniform_appearance.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Equipment</p>
                      <Badge variant="outline" className={getRatingColor(inspection.equipment_condition)}>
                        {inspection.equipment_condition.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Post Knowledge</p>
                      <Badge variant="outline" className={getRatingColor(inspection.post_knowledge)}>
                        {inspection.post_knowledge.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Professionalism</p>
                      <Badge variant="outline" className={getRatingColor(inspection.professionalism)}>
                        {inspection.professionalism.replace('_', ' ')}
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
              {!inspections?.length && (
                <p className="text-center text-slate-500 py-8">No inspections yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}