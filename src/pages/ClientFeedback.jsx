import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Plus, MessageSquare, Award, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";

export default function ClientFeedback() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    officer_email: "",
    location: "",
    shift_date: "",
    rating: 5,
    professionalism: 5,
    punctuality: 5,
    communication: 5,
    comments: "",
    commendation: false,
    complaint: false,
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  const { data: officers = [] } = useQuery({
    queryKey: ['clientFeedbackOfficerDirectory'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getClientOfficerDirectory', { officerEmails: [] });
      return response?.data?.officers || response?.officers || [];
    },
    enabled: !!user,
  });

  const { data: feedback } = useQuery({
    queryKey: ['clientFeedback', user?.email],
    queryFn: async () => {
      const all = await base44.entities.ClientFeedback.list('-created_date');
      return all.filter(f => f.created_by === user?.email);
    },
    enabled: !!user,
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedback.create({
      ...data,
      feedback_date: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedback'] });
      setShowForm(false);
      setFormData({
        officer_email: "",
        location: "",
        shift_date: "",
        rating: 5,
        professionalism: 5,
        punctuality: 5,
        communication: 5,
        comments: "",
        commendation: false,
        complaint: false,
      });
      alert('✅ Feedback submitted successfully!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submitFeedbackMutation.mutate(formData);
  };

  const StarRating = ({ value, onChange, label }) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="focus:outline-none"
          >
            <Star
              className={`w-6 h-6 ${star <= value ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  const getOfficerName = (email) => {
    const officer = officers?.find(o => o.email === email);
    if (!officer) return email;
    
    return `${officer.rank || 'Officer'} ${officer.last_name || ''}`.trim();
  };

  return (
    <div className="client-feedback-page p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Feedback</h1>
              <p className="text-slate-600">Review and provide feedback on security performance</p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Submit Feedback
          </Button>
        </div>

        {showForm && (
          <Card className="shadow-lg border-purple-200">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
              <CardTitle>Submit Feedback</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="officer_email">Officer *</Label>
                    <select
                      id="officer_email"
                      value={formData.officer_email}
                      onChange={(e) => setFormData({...formData, officer_email: e.target.value})}
                      required
                      className="w-full p-2 border rounded-lg"
                    >
                      <option value="">Select officer...</option>
                      {officers.map((officer) => (
                        <option key={officer.email} value={officer.email}>{getOfficerName(officer.email)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="location">Location *</Label>
                    <select
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      required
                      className="w-full p-2 border rounded-lg"
                    >
                      <option value="">Select location...</option>
                      {clientLocations.map((loc, idx) => (
                        <option key={idx} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shift_date">Shift Date *</Label>
                    <input
                      id="shift_date"
                      type="date"
                      value={formData.shift_date}
                      onChange={(e) => setFormData({...formData, shift_date: e.target.value})}
                      required
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <StarRating
                    label="Overall Rating"
                    value={formData.rating}
                    onChange={(val) => setFormData({...formData, rating: val})}
                  />
                  <StarRating
                    label="Professionalism"
                    value={formData.professionalism}
                    onChange={(val) => setFormData({...formData, professionalism: val})}
                  />
                  <StarRating
                    label="Punctuality"
                    value={formData.punctuality}
                    onChange={(val) => setFormData({...formData, punctuality: val})}
                  />
                  <StarRating
                    label="Communication"
                    value={formData.communication}
                    onChange={(val) => setFormData({...formData, communication: val})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">Additional Comments</Label>
                  <Textarea
                    id="comments"
                    value={formData.comments}
                    onChange={(e) => setFormData({...formData, comments: e.target.value})}
                    placeholder="Share your feedback about this officer's performance..."
                    rows={4}
                  />
                </div>

                <div className="flex gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="commendation"
                      checked={formData.commendation}
                      onCheckedChange={(checked) => setFormData({...formData, commendation: checked, complaint: false})}
                    />
                    <Label htmlFor="commendation" className="cursor-pointer flex items-center gap-2">
                      <Award className="w-4 h-4 text-green-600" />
                      <span>Submit as Commendation</span>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="complaint"
                      checked={formData.complaint}
                      onCheckedChange={(checked) => setFormData({...formData, complaint: checked, commendation: false})}
                    />
                    <Label htmlFor="complaint" className="cursor-pointer flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span>Submit as Complaint</span>
                    </Label>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                    Submit Feedback
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Your Feedback History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {feedback?.map((fb) => (
                <div key={fb.id} className="p-4 border rounded-lg bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{fb.location}</h3>
                      <p className="text-sm text-slate-600">{format(new Date(fb.shift_date), 'MMM d, yyyy')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge className="bg-yellow-100 text-yellow-800">
                        {fb.rating} ⭐
                      </Badge>
                      {fb.commendation && (
                        <Badge className="bg-green-100 text-green-800">
                          <Award className="w-3 h-3 mr-1" />
                          Commendation
                        </Badge>
                      )}
                      {fb.complaint && (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Complaint
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                    <div>
                      <span className="text-slate-500">Professionalism:</span>
                      <span className="ml-1 font-semibold">{fb.professionalism}/5</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Punctuality:</span>
                      <span className="ml-1 font-semibold">{fb.punctuality}/5</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Communication:</span>
                      <span className="ml-1 font-semibold">{fb.communication}/5</span>
                    </div>
                  </div>

                  {fb.comments && (
                    <div className="p-3 bg-slate-50 rounded text-sm text-slate-700">
                      {fb.comments}
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mt-2">
                    Submitted: {format(new Date(fb.created_date), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              ))}

              {feedback?.length === 0 && (
                <p className="text-center text-slate-500 py-8">No feedback submitted yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}