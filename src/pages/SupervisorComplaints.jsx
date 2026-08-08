import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Plus, UserCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SupervisorComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    officer_email: "",
    incident_date: "",
    complaint_type: "unprofessional_conduct",
    complainant_name: "",
    complainant_contact: "",
    complainant_type: "supervisor",
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
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  const { data: myComplaints } = useQuery({
    queryKey: ['myComplaints', user?.id],
    queryFn: () => base44.entities.Complaint.filter({ created_by_id: user.id }),
    enabled: !!user?.id && user?.additional_roles?.includes('supervisor'),
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
        subject: `Complaint Filed - Investigation Required`,
        body: `A formal complaint has been filed regarding an incident on ${format(parseISO(data.incident_date), 'MMMM d, yyyy')}.

Complaint Type: ${data.complaint_type.replace(/_/g, ' ')}
Location: ${data.location}

You will be contacted by management to provide your statement. Please be prepared to discuss this matter.

This is a formal notification and will be part of your personnel file pending investigation.`
      });

      await base44.entities.Notification.create({
        recipient_email: data.officer_email,
        type: 'training_reminder',
        title: '⚠️ Complaint Filed - Investigation Required',
        message: `A complaint has been filed regarding incident on ${format(parseISO(data.incident_date), 'MMM d, yyyy')}`,
        priority: 'critical',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myComplaints'] });
      setShowForm(false);
      setFormData({
        officer_email: "",
        incident_date: "",
        complaint_type: "unprofessional_conduct",
        complainant_name: "",
        complainant_contact: "",
        complainant_type: "supervisor",
        location: "",
        description: "",
        severity: "moderate",
      });
      alert('Complaint submitted for admin investigation!');
    },
  });

  const activeOfficers = allUsers?.filter(u => !u.termination_date) || [];

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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              File Officer Complaints
            </h1>
            <p className="text-slate-600">Submit complaints for admin investigation</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            File Complaint
          </Button>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>My Filed Complaints ({myComplaints?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {myComplaints && myComplaints.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {myComplaints.map((comp) => (
                    <div key={comp.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
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
                          </div>
                          {comp.location && (
                            <p className="text-xs text-slate-600 mt-1">Location: {comp.location}</p>
                          )}
                          {comp.investigation_notes && (
                            <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                              <p className="text-xs font-semibold text-slate-700 mb-1">Investigation Update:</p>
                              <p className="text-sm text-slate-600">{comp.investigation_notes}</p>
                              {comp.investigation_completed_date && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Completed: {format(parseISO(comp.investigation_completed_date), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <AlertTriangle className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p>No complaints filed yet</p>
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
                    placeholder="Your name or complainant name..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Information</Label>
                  <Input
                    value={formData.complainant_contact}
                    onChange={(e) => setFormData({ ...formData, complainant_contact: e.target.value })}
                    placeholder="Phone/email..."
                  />
                </div>
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

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-900">
                  <strong>Note:</strong> This complaint will be submitted to administration for investigation. You will be notified of the investigation outcome.
                </p>
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
                  {createComplaintMutation.isPending ? 'Submitting...' : 'Submit Complaint'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}