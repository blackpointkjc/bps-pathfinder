import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Plus, Shield, User, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [formData, setFormData] = useState({
    officer_email: "",
    incident_date: "",
    complaint_type: "unprofessional_conduct",
    complainant_name: "",
    complainant_contact: "",
    complainant_type: "client",
    location: "",
    description: "",
    severity: "moderate",
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const { data: allComplaints } = useQuery({
    queryKey: ['allComplaints'],
    queryFn: () => base44.entities.Complaint.list('-complaint_date'),
  });

  const createComplaintMutation = useMutation({
    mutationFn: async (data) => {
      const officer = allUsers?.find(u => u.email === data.officer_email);
      const officerName = officer ? `${officer.first_name} ${officer.last_name}` : data.officer_email;

      await base44.entities.Complaint.create({
        ...data,
        officer_name: officerName,
        complaint_date: new Date().toISOString(),
      });

      await base44.integrations.Core.SendEmail({
        to: data.officer_email,
        subject: `Complaint Filed - Action Required`,
        body: `A formal complaint has been filed regarding an incident on ${format(parseISO(data.incident_date), 'MMMM d, yyyy')}.

Complaint Type: ${data.complaint_type.replace(/_/g, ' ')}
Location: ${data.location}

You will be contacted by management to provide your statement. Please be prepared to discuss this matter.

This is a formal notification and will be part of your personnel file pending investigation.`
      });

      await base44.entities.Notification.create({
        recipient_email: data.officer_email,
        type: 'training_reminder',
        title: '⚠️ Complaint Filed',
        message: `A complaint has been filed regarding incident on ${format(parseISO(data.incident_date), 'MMM d, yyyy')}`,
        priority: 'critical',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allComplaints'] });
      setShowForm(false);
      setFormData({
        officer_email: "",
        incident_date: "",
        complaint_type: "unprofessional_conduct",
        complainant_name: "",
        complainant_contact: "",
        complainant_type: "client",
        location: "",
        description: "",
        severity: "moderate",
      });
      alert('Complaint filed successfully!');
    },
  });

  const updateComplaintMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Complaint.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allComplaints'] });
      setEditingComplaint(null);
      alert('Investigation updated!');
    },
  });

  const handleUpdateInvestigation = (complaint, status, notes) => {
    updateComplaintMutation.mutate({
      id: complaint.id,
      data: {
        investigation_status: status,
        investigation_notes: notes,
        investigated_by: user.email,
        investigation_completed_date: new Date().toISOString(),
      }
    });
  };

  const activeOfficers = allUsers?.filter(u => !u.termination_date) || [];

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              Officer Complaints & Investigations
            </h1>
            <p className="text-slate-600">File and manage officer complaints</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            File Complaint
          </Button>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">
                {allComplaints?.filter(c => c.investigation_status === 'pending' || c.investigation_status === 'under_investigation').length || 0}
              </p>
              <p className="text-xs text-slate-600">Pending Investigation</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-100">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-600">
                {allComplaints?.filter(c => c.investigation_status === 'sustained').length || 0}
              </p>
              <p className="text-xs text-slate-600">Sustained</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">
                {allComplaints?.filter(c => c.investigation_status === 'not_sustained' || c.investigation_status === 'unfounded' || c.investigation_status === 'exonerated').length || 0}
              </p>
              <p className="text-xs text-slate-600">Cleared</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-slate-50 to-slate-100">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-slate-600">
                {allComplaints?.length || 0}
              </p>
              <p className="text-xs text-slate-600">Total Complaints</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>All Complaints</CardTitle>
          </CardHeader>
          <CardContent>
            {allComplaints && allComplaints.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {allComplaints.map((comp) => (
                    <div key={comp.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="w-4 h-4 text-slate-600" />
                            <p className="font-bold text-slate-900">{comp.officer_name}</p>
                            <Badge className="bg-red-600 text-white">
                              {comp.complaint_type.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge className={
                              comp.investigation_status === 'not_sustained' || comp.investigation_status === 'unfounded' || comp.investigation_status === 'exonerated' 
                                ? 'bg-green-600' 
                                : comp.investigation_status === 'sustained' 
                                ? 'bg-red-700' 
                                : 'bg-amber-600'
                            }>
                              {comp.investigation_status.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className={
                              comp.severity === 'critical' ? 'border-red-600 text-red-600' :
                              comp.severity === 'serious' ? 'border-orange-600 text-orange-600' :
                              comp.severity === 'moderate' ? 'border-amber-600 text-amber-600' :
                              'border-slate-400 text-slate-600'
                            }>
                              {comp.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{comp.description}</p>
                          <div className="flex gap-2 text-xs text-slate-600">
                            <span>Filed: {format(parseISO(comp.complaint_date), 'MMM d, yyyy')}</span>
                            <span>•</span>
                            <span>Incident: {format(parseISO(comp.incident_date), 'MMM d, yyyy')}</span>
                            <span>•</span>
                            <span>By: {comp.complainant_name} ({comp.complainant_type})</span>
                          </div>
                          {comp.location && (
                            <p className="text-xs text-slate-600 mt-1">Location: {comp.location}</p>
                          )}
                          {comp.investigation_notes && (
                            <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                              <p className="text-xs font-semibold text-slate-700 mb-1">Investigation Notes:</p>
                              <p className="text-sm text-slate-600">{comp.investigation_notes}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-2">
                        {comp.investigation_status === 'pending' || comp.investigation_status === 'under_investigation' ? (
                          <Button
                            size="sm"
                            onClick={() => setEditingComplaint(comp)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Update Investigation
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await base44.entities.Complaint.update(comp.id, {
                              exclude_from_performance_review: !comp.exclude_from_performance_review
                            });
                            queryClient.invalidateQueries({ queryKey: ['allComplaints'] });
                          }}
                          className={comp.exclude_from_performance_review ? 'bg-green-50' : ''}
                        >
                          {comp.exclude_from_performance_review ? '✓ Excluded' : 'Exclude from Review'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <AlertTriangle className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p>No complaints on record</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>File Officer Complaint</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createComplaintMutation.mutate(formData); }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Officer *</Label>
                <Select
                  value={formData.officer_email}
                  onValueChange={(value) => setFormData({ ...formData, officer_email: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeOfficers.map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name && officer.last_name 
                          ? `${officer.first_name} ${officer.last_name}` 
                          : officer.full_name || officer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Incident Date *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.incident_date}
                    onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Where incident occurred..."
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Complaint Type *</Label>
                  <Select
                    value={formData.complaint_type}
                    onValueChange={(value) => setFormData({ ...formData, complaint_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unprofessional_conduct">Unprofessional Conduct</SelectItem>
                      <SelectItem value="policy_violation">Policy Violation</SelectItem>
                      <SelectItem value="excessive_force">Excessive Force</SelectItem>
                      <SelectItem value="discourtesy">Discourtesy</SelectItem>
                      <SelectItem value="neglect_of_duty">Neglect of Duty</SelectItem>
                      <SelectItem value="tardiness">Tardiness</SelectItem>
                      <SelectItem value="uniform_violation">Uniform Violation</SelectItem>
                      <SelectItem value="client_complaint">Client Complaint</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Severity *</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => setFormData({ ...formData, severity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="serious">Serious</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Complainant Name *</Label>
                  <Input
                    value={formData.complainant_name}
                    onChange={(e) => setFormData({ ...formData, complainant_name: e.target.value })}
                    placeholder="Name of person filing complaint..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Complainant Type *</Label>
                  <Select
                    value={formData.complainant_type}
                    onValueChange={(value) => setFormData({ ...formData, complainant_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="public">Public/Resident</SelectItem>
                      <SelectItem value="coworker">Coworker</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Contact Information</Label>
                <Input
                  value={formData.complainant_contact}
                  onChange={(e) => setFormData({ ...formData, complainant_contact: e.target.value })}
                  placeholder="Phone/email of complainant..."
                />
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the complaint..."
                  rows={4}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createComplaintMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {createComplaintMutation.isPending ? 'Filing...' : 'File Complaint'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingComplaint} onOpenChange={() => setEditingComplaint(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Update Investigation - {editingComplaint?.officer_name}</DialogTitle>
            </DialogHeader>
            {editingComplaint && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-slate-50 rounded border">
                  <p className="text-sm"><strong>Complaint:</strong> {editingComplaint.complaint_type.replace(/_/g, ' ')}</p>
                  <p className="text-sm"><strong>Incident:</strong> {format(parseISO(editingComplaint.incident_date), 'MMM d, yyyy')}</p>
                  <p className="text-sm mt-2">{editingComplaint.description}</p>
                </div>

                <div className="space-y-2">
                  <Label>Investigation Status *</Label>
                  <Select
                    defaultValue={editingComplaint.investigation_status}
                    onValueChange={(value) => setEditingComplaint({ ...editingComplaint, investigation_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="under_investigation">Under Investigation</SelectItem>
                      <SelectItem value="sustained">Sustained (Complaint Valid)</SelectItem>
                      <SelectItem value="not_sustained">Not Sustained (Inconclusive)</SelectItem>
                      <SelectItem value="unfounded">Unfounded (False)</SelectItem>
                      <SelectItem value="exonerated">Exonerated (Proper Conduct)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Investigation Notes *</Label>
                  <Textarea
                    defaultValue={editingComplaint.investigation_notes}
                    onChange={(e) => setEditingComplaint({ ...editingComplaint, investigation_notes: e.target.value })}
                    placeholder="Enter investigation findings and notes..."
                    rows={4}
                  />
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditingComplaint(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleUpdateInvestigation(
                      editingComplaint,
                      editingComplaint.investigation_status,
                      editingComplaint.investigation_notes
                    )}
                    disabled={updateComplaintMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {updateComplaintMutation.isPending ? 'Updating...' : 'Update Investigation'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}