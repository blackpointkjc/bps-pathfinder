import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Plus, Send, Shield, AlertTriangle, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AdminNotifications() {
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    type: 'alert',
    priority: 'normal',
    title: '',
    message: '',
    action_url: '',
    recipient_type: 'all',
    specific_officers: [],
    specific_divisions: [],
    send_email: false,
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

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => base44.entities.Division.list('division_name'),
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (data) => {
      let recipients = [];
      
      if (data.recipient_type === 'all') {
        recipients = allUsers.filter(u => u.email && u.first_name);
      } else if (data.recipient_type === 'specific') {
        recipients = allUsers.filter(u => data.specific_officers.includes(u.email));
      } else if (data.recipient_type === 'division') {
        recipients = allUsers.filter(u => data.specific_divisions.includes(u.division));
      }
      
      const notificationPromises = recipients.map(recipient => 
        base44.entities.Notification.create({
          recipient_email: recipient.email,
          recipient_name: `${recipient.first_name} ${recipient.last_name}`,
          type: data.type,
          priority: data.priority,
          title: data.title,
          message: data.message,
          action_url: data.action_url || null,
          read: false,
        })
      );
      
      await Promise.all(notificationPromises);
      
      // Send emails if requested
      if (data.send_email) {
        const emailPromises = recipients.map(recipient =>
          base44.integrations.Core.SendEmail({
            to: recipient.email,
            subject: `[BPS Alert] ${data.title}`,
            body: `
              <h2>${data.title}</h2>
              <p>Dear ${recipient.first_name},</p>
              <p>${data.message.replace(/\n/g, '<br>')}</p>
              ${data.action_url ? `<p><a href="${data.action_url}">View in Portal →</a></p>` : ''}
              <p>Best regards,<br/>Black Point Protection</p>
            `
          }).catch(err => console.error('Email failed to:', recipient.email, err))
        );
        await Promise.all(emailPromises);
      }
      
      return recipients.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setShowDialog(false);
      resetForm();
      alert(`Notification sent to ${count} officer(s)!`);
    },
  });

  const resetForm = () => {
    setFormData({
      type: 'alert',
      priority: 'normal',
      title: '',
      message: '',
      action_url: '',
      recipient_type: 'all',
      specific_officers: [],
      specific_divisions: [],
      send_email: false,
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Bell className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Send Notifications</h1>
                <p className="text-slate-600 mt-1">Broadcast alerts to officers</p>
              </div>
            </div>
            <Button onClick={() => setShowDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              New Notification
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-950/50 to-purple-950/50 border-b border-white/10">
            <CardTitle>Quick Templates</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4"
                onClick={() => {
                  setFormData({
                    ...formData,
                    type: 'policy_update',
                    priority: 'high',
                    title: 'Policy Update',
                    message: '',
                  });
                  setShowDialog(true);
                }}
              >
                <div className="font-semibold text-left w-full">Policy Update</div>
                <div className="text-xs text-slate-500 text-left w-full">Important policy changes</div>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4"
                onClick={() => {
                  setFormData({
                    ...formData,
                    type: 'training_deadline',
                    priority: 'high',
                    title: 'Training Deadline Reminder',
                    message: '',
                  });
                  setShowDialog(true);
                }}
              >
                <div className="font-semibold text-left w-full">Training Reminder</div>
                <div className="text-xs text-slate-500 text-left w-full">Upcoming training deadlines</div>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4"
                onClick={() => {
                  setFormData({
                    ...formData,
                    type: 'alert',
                    priority: 'urgent',
                    title: 'Urgent Alert',
                    message: '',
                  });
                  setShowDialog(true);
                }}
              >
                <div className="font-semibold text-left w-full">Urgent Alert</div>
                <div className="text-xs text-slate-500 text-left w-full">Critical notifications</div>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4"
                onClick={() => {
                  setFormData({
                    ...formData,
                    type: 'success',
                    priority: 'normal',
                    title: 'General Announcement',
                    message: '',
                  });
                  setShowDialog(true);
                }}
              >
                <div className="font-semibold text-left w-full">General Message</div>
                <div className="text-xs text-slate-500 text-left w-full">Non-urgent updates</div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); setShowDialog(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); sendNotificationMutation.mutate(formData); }} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training_assigned">Training Assigned</SelectItem>
                    <SelectItem value="training_deadline">Training Deadline</SelectItem>
                    <SelectItem value="policy_update">Policy Update</SelectItem>
                    <SelectItem value="alert">Alert</SelectItem>
                    <SelectItem value="success">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(val) => setFormData({...formData, priority: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
                placeholder="Notification title..."
              />
            </div>

            <div className="space-y-2">
              <Label>Message *</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                rows={4}
                required
                placeholder="Notification message..."
              />
            </div>

            <div className="space-y-2">
              <Label>Action URL (Optional)</Label>
              <Input
                value={formData.action_url}
                onChange={(e) => setFormData({...formData, action_url: e.target.value})}
                placeholder="/page-name or external URL..."
              />
            </div>

            <div className="space-y-2">
              <Label>Recipients</Label>
              <Select value={formData.recipient_type} onValueChange={(val) => setFormData({...formData, recipient_type: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Officers</SelectItem>
                  <SelectItem value="specific">Specific Officers</SelectItem>
                  <SelectItem value="division">By Division</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.recipient_type === 'specific' && (
              <div className="space-y-2">
                <Label>Select Officers</Label>
                <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-2">
                  {allUsers?.filter(u => u.first_name && u.last_name).map(officer => (
                    <div key={officer.email} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.specific_officers.includes(officer.email)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({...formData, specific_officers: [...formData.specific_officers, officer.email]});
                          } else {
                            setFormData({...formData, specific_officers: formData.specific_officers.filter(e => e !== officer.email)});
                          }
                        }}
                      />
                      <Label className="cursor-pointer">{officer.first_name} {officer.last_name}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.recipient_type === 'division' && (
              <div className="space-y-2">
                <Label>Select Divisions</Label>
                <div className="space-y-2">
                  {divisions?.map(div => (
                    <div key={div.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.specific_divisions.includes(div.division_name)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({...formData, specific_divisions: [...formData.specific_divisions, div.division_name]});
                          } else {
                            setFormData({...formData, specific_divisions: formData.specific_divisions.filter(d => d !== div.division_name)});
                          }
                        }}
                      />
                      <Label className="cursor-pointer">{div.division_name}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Checkbox
                checked={formData.send_email}
                onCheckedChange={(checked) => setFormData({...formData, send_email: checked})}
              />
              <div className="flex-1">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Send Email Notification
                </Label>
                <p className="text-xs text-slate-600 mt-1">Officers will receive this notification via email</p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setShowDialog(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendNotificationMutation.isPending}>
                <Send className="w-4 h-4 mr-2" />
                {sendNotificationMutation.isPending ? 'Sending...' : 'Send Notification'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}