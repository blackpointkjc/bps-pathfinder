import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Award, Plus, Shield, Star, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminCommendations() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    officer_email: "",
    commendation_type: "exceptional_service",
    description: "",
    witnesses: "",
    points_awarded: 1,
    visibility: "public"
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

  const { data: allCommendations } = useQuery({
    queryKey: ['allCommendations'],
    queryFn: () => base44.entities.Commendation.list('-commendation_date'),
  });

  const createCommendationMutation = useMutation({
    mutationFn: async (data) => {
      const officer = allUsers?.find(u => u.email === data.officer_email);
      const officerName = officer ? `${officer.first_name} ${officer.last_name}` : data.officer_email;

      await base44.entities.Commendation.create({
        ...data,
        officer_name: officerName,
        commendation_date: new Date().toISOString(),
        issued_by: user.email,
        issued_by_name: `${user.first_name} ${user.last_name}`,
      });

      await base44.integrations.Core.SendEmail({
        to: data.officer_email,
        subject: `🌟 Commendation Awarded - ${data.commendation_type.replace(/_/g, ' ')}`,
        body: `Congratulations! You have received a commendation for ${data.commendation_type.replace(/_/g, ' ')}.

Description: ${data.description}

Points Awarded: ${data.points_awarded}

Issued by: ${user.first_name} ${user.last_name}
Date: ${format(new Date(), 'MMMM d, yyyy')}

Keep up the excellent work!`
      });

      // Send notification to the officer
      await base44.entities.Notification.create({
        recipient_email: data.officer_email,
        type: 'training_reminder',
        title: '🌟 Commendation Awarded',
        message: `You received a commendation for ${data.commendation_type.replace(/_/g, ' ')} (+${data.points_awarded} points)`,
        priority: 'high',
      });

      // Create announcement visible to ALL officers
      await base44.entities.Announcement.create({
        title: `🌟 Officer Commendation - ${officerName}`,
        message: `${officerName} has been awarded a commendation for ${data.commendation_type.replace(/_/g, ' ')}.\n\n${data.description}\n\nCongratulations on the outstanding work!`,
        priority: 'important'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCommendations'] });
      setShowForm(false);
      setFormData({
        officer_email: "",
        commendation_type: "exceptional_service",
        description: "",
        witnesses: "",
        points_awarded: 1,
        visibility: "public"
      });
      alert('Commendation issued successfully!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.officer_email || !formData.description) {
      alert('Please fill in all required fields');
      return;
    }
    createCommendationMutation.mutate(formData);
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
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-8 h-8 text-green-600" />
              Officer Commendations
            </h1>
            <p className="text-slate-600">Issue and track officer commendations</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Issue Commendation
          </Button>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>All Commendations ({allCommendations?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {allCommendations && allCommendations.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {allCommendations.map((comm) => (
                    <div key={comm.id} className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="w-4 h-4 text-slate-600" />
                            <p className="font-bold text-slate-900">{comm.officer_name}</p>
                            <Badge className="bg-green-600 text-white">
                              {comm.commendation_type.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge variant="outline">
                              <Star className="w-3 h-3 mr-1 text-amber-500 fill-amber-500" />
                              {comm.points_awarded} pt{comm.points_awarded !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{comm.description}</p>
                          <div className="flex gap-2 text-xs text-slate-600">
                            <span>Issued by: {comm.issued_by_name}</span>
                            <span>•</span>
                            <span>{format(parseISO(comm.commendation_date), 'MMM d, yyyy')}</span>
                          </div>
                          {comm.witnesses && (
                            <p className="text-xs text-slate-600 mt-2">
                              <strong>Witnesses:</strong> {comm.witnesses}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <Award className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p>No commendations issued yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Issue Officer Commendation</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
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

              <div className="space-y-2">
                <Label>Commendation Type *</Label>
                <Select
                  value={formData.commendation_type}
                  onValueChange={(value) => setFormData({ ...formData, commendation_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exceptional_service">Exceptional Service</SelectItem>
                    <SelectItem value="life_saving">Life Saving</SelectItem>
                    <SelectItem value="arrest">Arrest</SelectItem>
                    <SelectItem value="professionalism">Professionalism</SelectItem>
                    <SelectItem value="teamwork">Teamwork</SelectItem>
                    <SelectItem value="problem_solving">Problem Solving</SelectItem>
                    <SelectItem value="client_praise">Client Praise</SelectItem>
                    <SelectItem value="innovation">Innovation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the commendable action or behavior..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Witnesses (Optional)</Label>
                <Input
                  value={formData.witnesses}
                  onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })}
                  placeholder="Names of witnesses..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Points Awarded</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.points_awarded}
                    onChange={(e) => setFormData({ ...formData, points_awarded: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select
                    value={formData.visibility}
                    onValueChange={(value) => setFormData({ ...formData, visibility: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public (Visible to Officer)</SelectItem>
                      <SelectItem value="supervisor_only">Supervisor Only</SelectItem>
                      <SelectItem value="admin_only">Admin Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createCommendationMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createCommendationMutation.isPending ? 'Issuing...' : 'Issue Commendation'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}