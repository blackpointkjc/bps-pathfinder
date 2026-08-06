import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, Shield, Clock, Users, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { getClientPortalUser } from '@/utils/clientPreview';

export default function ClientSpecialRequests() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    location: "",
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
    shift_times: "",
    officers_needed: 1,
    preferred_officer_email: "",
    preferred_officer_display: "",
    special_requirements: "",
    reason: "",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getClientPortalUser,
  });

  const { data: officerDirectory = [] } = useQuery({
    queryKey: ['clientRequestOfficerDirectory'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getClientOfficerDirectory', { officerEmails: [] });
      return response?.data?.officers || response?.officers || [];
    },
    enabled: !!user,
  });

  const { data: locations } = useQuery({
    queryKey: ['clientLocations'],
    queryFn: async () => {
      const allLocs = await base44.entities.Location.list();
      const clientLocs = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);
      return allLocs.filter(loc => clientLocs.includes(loc.site_name));
    },
    enabled: !!user,
  });

  const { data: requests } = useQuery({
    queryKey: ['specialRequests', user?.email],
    queryFn: async () => {
      const all = await base44.entities.SpecialCoverageRequest.list('-created_date');
      return all.filter(r => r.created_by_id === user?.id || r.client_email === user?.email);
    },
    enabled: !!user,
  });

  const createRequestMutation = useMutation({
    mutationFn: (data) => base44.entities.SpecialCoverageRequest.create({
      ...data,
      client_email: user?.email,
      request_date: new Date().toISOString(),
      status: "pending",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialRequests'] });
      setShowForm(false);
      setFormData({
        location: "",
        start_date: "",
        end_date: "",
        start_time: "",
    end_time: "",
    shift_times: "",
        officers_needed: 1,
        preferred_officer_email: "",
        preferred_officer_display: "",
        special_requirements: "",
        reason: "",
      });
      alert('✅ Special coverage request submitted successfully!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createRequestMutation.mutate({
      ...formData,
      shift_times: `${formData.start_time} - ${formData.end_time}`,
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Special Coverage Requests</h1>
              <p className="text-slate-600">Request additional security coverage for special events or situations</p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        </div>

        {showForm && (
          <Card className="shadow-lg border-purple-200">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
              <CardTitle>Submit Special Coverage Request</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select value={formData.location || undefined} onValueChange={(value) => setFormData({...formData, location: value})} required>
                      <SelectTrigger id="location" className="h-11 w-full">
                        <SelectValue placeholder="Select location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map((loc) => (
                          <SelectItem key={loc.id} value={loc.site_name}>{loc.site_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="officers_needed">Officers Needed *</Label>
                    <Input
                      id="officers_needed"
                      type="number"
                      min="1"
                      value={formData.officers_needed}
                      onChange={(e) => setFormData({...formData, officers_needed: parseInt(e.target.value)})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date *</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date *</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferred_officer_email">Preferred Officer (Optional)</Label>
                  <Select
                    value={formData.preferred_officer_email || 'none'}
                    onValueChange={(value) => {
                      const email = value === 'none' ? '' : value;
                      const officer = officerDirectory.find(item => item.email === email);
                      const display = officer ? `${officer.rank || 'Officer'} ${officer.last_name || ''}`.trim() : '';
                      setFormData({...formData, preferred_officer_email: email, preferred_officer_display: display});
                    }}
                  >
                    <SelectTrigger id="preferred_officer_email" className="h-11 w-full">
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {officerDirectory.map((officer) => (
                        <SelectItem key={officer.email} value={officer.email}>
                          {`${officer.rank || 'Officer'} ${officer.last_name || ''}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Requests are not guaranteed and remain subject to availability.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Coverage Start Time *</Label>
                    <Input id="start_time" type="time" value={formData.start_time} onChange={(e) => setFormData({...formData, start_time: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">Coverage End Time *</Label>
                    <Input id="end_time" type="time" value={formData.end_time} onChange={(e) => setFormData({...formData, end_time: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="special_requirements">Special Requirements</Label>
                  <Input
                    id="special_requirements"
                    placeholder="e.g., Armed officers, bilingual, K-9 unit"
                    value={formData.special_requirements}
                    onChange={(e) => setFormData({...formData, special_requirements: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Request *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Describe why you need special coverage..."
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    rows={4}
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                    Submit Request
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Your Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests?.map((req) => (
                <div key={req.id} className="p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{req.location}</h3>
                      <p className="text-sm text-slate-600">{req.reason}</p>
                    </div>
                    <Badge className={getStatusColor(req.status)}>
                      {req.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(req.start_date), 'MMM d')} - {format(new Date(req.end_date), 'MMM d')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="w-4 h-4" />
                      <span>{req.shift_times}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users className="w-4 h-4" />
                      <span>{req.officers_needed} officer{req.officers_needed > 1 ? 's' : ''}</span>
                    </div>
                    {req.preferred_officer_display && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Shield className="w-4 h-4" />
                        <span>{req.preferred_officer_display}</span>
                      </div>
                    )}
                    {req.special_requirements && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs">{req.special_requirements}</span>
                      </div>
                    )}
                  </div>

                  {req.admin_notes && (
                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs font-semibold text-blue-900">Admin Notes:</p>
                      <p className="text-sm text-blue-700">{req.admin_notes}</p>
                    </div>
                  )}
                </div>
              ))}

              {requests?.length === 0 && (
                <p className="text-center text-slate-500 py-8">No requests yet. Submit your first special coverage request!</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
