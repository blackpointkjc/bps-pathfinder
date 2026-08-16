import { listDirectoryUsers } from '@/lib/appDirectory';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Star, Award, AlertTriangle, UserCheck, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminClientFeedback() {
  const [assignDialog, setAssignDialog] = useState(null); // feedback record
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [assignAction, setAssignAction] = useState(""); // "commendation" | "complaint" | "regular"
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: feedback } = useQuery({
    queryKey: ['allClientFeedback'],
    queryFn: () => base44.entities.ClientFeedback.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    enabled: user?.role === 'admin',
  });

  const officers = allUsers?.filter(u => u.role === 'user' && !u.termination_date) || [];

  const assignMutation = useMutation({
    mutationFn: async ({ fb, officerEmail, action }) => {
      // Update the ClientFeedback record
      const updates = {
        officer_email: officerEmail,
        commendation: action === 'commendation',
        complaint: action === 'complaint',
      };
      await base44.entities.ClientFeedback.update(fb.id, updates);

      // File as Commendation record
      if (action === 'commendation') {
        await base44.entities.Commendation.create({
          officer_email: officerEmail,
          officer_name: getOfficerDisplayName(officerEmail),
          commendation_type: 'client_praise',
          description: fb.comments || `Client commendation for service at ${fb.location}`,
          commendation_date: fb.feedback_date || fb.created_date,
          issued_by: user?.email,
          issued_by_name: user?.full_name || 'Admin',
        });
      }

      // File as Complaint record
      if (action === 'complaint') {
        await base44.entities.Complaint.create({
          officer_email: officerEmail,
          officer_name: getOfficerDisplayName(officerEmail),
          complaint_type: 'client_complaint',
          complainant_type: 'client',
          description: fb.comments || `Client complaint regarding service at ${fb.location}`,
          location: fb.location,
          complaint_date: fb.feedback_date || fb.created_date,
          incident_date: fb.feedback_date || fb.created_date,
          investigation_status: 'pending',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allClientFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['commendations'] });
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      setAssignDialog(null);
      setSelectedOfficer("");
      setAssignAction("");
    },
  });

  const getOfficerDisplayName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (!officer) return email;
    const lastName = officer.last_name || '';
    const rank = officer.rank || '';
    if (rank && lastName) return `${rank} ${lastName}`;
    if (lastName) return lastName;
    return email;
  };

  const getClientName = (email) => {
    const client = allUsers?.find(u => u.email === email);
    return client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() || email : email;
  };

  const handleOpenAssign = (fb) => {
    setAssignDialog(fb);
    setSelectedOfficer(fb.officer_email || "");
    // Pre-select action based on current type
    if (fb.commendation) setAssignAction("commendation");
    else if (fb.complaint) setAssignAction("complaint");
    else setAssignAction("regular");
  };

  const handleConfirmAssign = () => {
    if (!selectedOfficer || !assignAction) return;
    assignMutation.mutate({ fb: assignDialog, officerEmail: selectedOfficer, action: assignAction });
  };

  const commendations = feedback?.filter(f => f.commendation) || [];
  const complaints = feedback?.filter(f => f.complaint) || [];
  const regularFeedback = feedback?.filter(f => !f.commendation && !f.complaint) || [];

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  const FeedbackCard = ({ fb }) => (
    <div className="p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {fb.officer_email ? (
            <h3 className="font-bold text-slate-900">{getOfficerDisplayName(fb.officer_email)}</h3>
          ) : (
            <h3 className="font-semibold text-slate-400 italic">No officer assigned</h3>
          )}
          <p className="text-sm text-slate-600">{fb.location} • {fb.shift_date ? format(new Date(fb.shift_date), 'MMM d, yyyy') : 'N/A'}</p>
          <p className="text-xs text-slate-500 mt-1">Client: {getClientName(fb.created_by)}</p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <Badge className="bg-yellow-100 text-yellow-800">{fb.rating} ⭐</Badge>
          {fb.commendation && (
            <Badge className="bg-green-100 text-green-800"><Award className="w-3 h-3 mr-1" />Commendation</Badge>
          )}
          {fb.complaint && (
            <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Complaint</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <div><span className="text-slate-500">Professionalism:</span><span className="ml-1 font-semibold">{fb.professionalism}/5</span></div>
        <div><span className="text-slate-500">Punctuality:</span><span className="ml-1 font-semibold">{fb.punctuality}/5</span></div>
        <div><span className="text-slate-500">Communication:</span><span className="ml-1 font-semibold">{fb.communication}/5</span></div>
      </div>

      {fb.comments && (
        <div className="p-3 bg-slate-50 rounded text-sm text-slate-700 mb-3">{fb.comments}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Submitted: {format(new Date(fb.created_date), 'MMM d, yyyy h:mm a')}</p>
        <Button size="sm" variant="outline" onClick={() => handleOpenAssign(fb)} className="text-amber-700 border-amber-300 hover:bg-amber-50">
          <UserCheck className="w-3 h-3 mr-1" />
          Assign & File
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Client Feedback</h1>
            <p className="text-slate-600">Review and assign client feedback to officers</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="shadow-lg border-green-200">
            <CardHeader className="bg-green-50">
              <CardTitle className="text-green-700 flex items-center gap-2">
                <Award className="w-5 h-5" />Commendations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-green-600">{commendations.length}</div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-red-200">
            <CardHeader className="bg-red-50">
              <CardTitle className="text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />Complaints
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-red-600">{complaints.length}</div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-700 flex items-center gap-2">
                <Star className="w-5 h-5" />Total Reviews
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-blue-600">{feedback?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Unassigned */}
        {feedback?.filter(f => !f.officer_email).length > 0 && (
          <Card className="shadow-lg border-amber-200">
            <CardHeader className="bg-amber-50">
              <CardTitle className="text-amber-700 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Unassigned Feedback ({feedback.filter(f => !f.officer_email).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {feedback.filter(f => !f.officer_email).map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-green-700 flex items-center gap-2">
              <Award className="w-5 h-5" />Commendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {commendations.map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
              {commendations.length === 0 && <p className="text-center text-slate-500 py-8">No commendations yet</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />Complaints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {complaints.map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
              {complaints.length === 0 && <p className="text-center text-slate-500 py-8">No complaints</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Regular Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {regularFeedback.filter(f => f.officer_email).map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
              {regularFeedback.filter(f => f.officer_email).length === 0 && (
                <p className="text-center text-slate-500 py-8">No regular feedback yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assign & File Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Feedback to Officer</DialogTitle>
          </DialogHeader>
          {assignDialog && (
            <div className="space-y-5 py-2">
              <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700">
                <p><strong>Location:</strong> {assignDialog.location}</p>
                <p><strong>Client:</strong> {getClientName(assignDialog.created_by)}</p>
                {assignDialog.comments && <p className="mt-1 italic">"{assignDialog.comments}"</p>}
              </div>

              <div className="space-y-2">
                <Label>Assign to Officer *</Label>
                <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {officers.map(o => {
                      const name = getOfficerDisplayName(o.email);
                      return (
                        <SelectItem key={o.id} value={o.email}>
                          {name} {o.unit_number ? `(#${o.unit_number})` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>File As *</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignAction("commendation")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${assignAction === 'commendation' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-green-300'}`}
                  >
                    <Award className="w-4 h-4 mx-auto mb-1 text-green-600" />
                    Commendation
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignAction("complaint")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${assignAction === 'complaint' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-red-300'}`}
                  >
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-red-600" />
                    Complaint
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignAction("regular")}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${assignAction === 'regular' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
                  >
                    <Star className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                    Regular
                  </button>
                </div>
              </div>

              {assignAction === 'commendation' && (
                <p className="text-xs text-green-700 bg-green-50 p-2 rounded">
                  ✅ A Commendation record will be filed for this officer.
                </p>
              )}
              {assignAction === 'complaint' && (
                <p className="text-xs text-red-700 bg-red-50 p-2 rounded">
                  ⚠️ A Complaint record will be filed for this officer.
                </p>
              )}
              {assignAction === 'regular' && (
                <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                  ℹ️ This will be saved as regular feedback only.
                </p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
                <Button
                  onClick={handleConfirmAssign}
                  disabled={!selectedOfficer || !assignAction || assignMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {assignMutation.isPending ? 'Filing...' : 'Confirm & File'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}