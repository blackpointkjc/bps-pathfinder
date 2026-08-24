import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Megaphone, Plus, AtSign, Paperclip, Download, Eye, CheckCheck, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { getTeamsSyncConfig, sendTeamChannelMessage } from '@/lib/teamsGraph';
import { toast } from 'sonner';
import { uploadInternalFile } from '@/lib/internalUpload';

export default function AdminAnnouncements() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    priority: "normal",
    photo_url: "",
    attachment_url: "",
    attachment_name: "",
    pinged_users: [],
    audience: "company",
    teams_destination: "general_alerts",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showReadReceiptsDialog, setShowReadReceiptsDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'adminAnnouncements'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: user?.role === 'admin',
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: announcementReceipts = [] } = useQuery({
    queryKey: ['allAnnouncementReceipts'],
    queryFn: () => base44.entities.AnnouncementReceipt.list('-read_at', 5000),
    enabled: user?.role === 'admin',
    refetchInterval: 30000,
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data) => {
      const destination = data.teams_destination || 'general_alerts';
      let teamsMessage = null;
      // Teams is the delivery source of truth for routed announcements. Do not
      // create a Pathfinder-only announcement if Microsoft delivery fails.
      if (destination !== 'none') {
        const config = await getTeamsSyncConfig(destination);
        if (!config?.enabled) throw new Error(destination === 'supervisor_updates' ? 'Microsoft Teams Updates channel is not configured.' : 'Microsoft Teams General Alerts channel is not configured.');
        const priority = String(data.priority || 'normal').toUpperCase();
        teamsMessage = await sendTeamChannelMessage(
          user?.id,
          `<strong>${data.title}</strong><br><em>${priority}</em><br><br>${String(data.message || '').replace(/\n/g, '<br>')}`,
          config,
          destination,
        );
        if (!teamsMessage?.id) throw new Error('Microsoft Teams did not confirm announcement delivery.');
      }

      const announcement = await base44.entities.Announcement.create({
        ...data,
        teams_message_id: teamsMessage?.id || '',
        teams_synced_at: teamsMessage?.id ? new Date().toISOString() : null,
        teams_delivery_error: '',
      });
      if (teamsMessage?.id) toast.success(destination === 'supervisor_updates' ? 'Supervisor update posted to Teams Updates.' : 'Announcement posted to Teams General Alerts.');
      return announcement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowForm(false);
      setFormData({
        title: "",
        message: "",
        priority: "normal",
        photo_url: "",
        attachment_url: "",
        attachment_name: "",
        pinged_users: [],
        audience: "company",
        teams_destination: "general_alerts",
      });
    },
    onError: error => {
      toast.error(`Announcement was not sent: ${error?.message || 'Microsoft Teams delivery failed.'}`, { duration: 14000 });
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await uploadInternalFile(file);
      setFormData({ ...formData, photo_url: file_url });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
    setUploading(false);
  };

  const handleAttachmentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      const { file_url } = await uploadInternalFile(file);
      setFormData({ ...formData, attachment_url: file_url, attachment_name: file.name });
    } catch (error) {
      console.error("Error uploading attachment:", error);
    }
    setUploadingAttachment(false);
  };

  const handleToggleUser = (userEmail) => {
    setFormData(prev => ({
      ...prev,
      pinged_users: prev.pinged_users.includes(userEmail)
        ? prev.pinged_users.filter(email => email !== userEmail)
        : [...prev.pinged_users, userEmail]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createAnnouncementMutation.mutate(formData);
  };

  const activeOfficers = directoryUsers.filter(hasOfficerAdditionalRole);

  const getUserName = (email) => {
    const userData = activeOfficers.find(u => u.email === email);
    if (userData?.first_name && userData?.last_name) {
      return `${userData.first_name} ${userData.last_name}`;
    }
    return email;
  };

  const getFileIcon = (filename) => {
    if (!filename) return null;
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      xls: '📊',
      xlsx: '📊',
      ppt: '📊',
      pptx: '📊',
      txt: '📄',
      zip: '🗜️',
      rar: '🗜️',
    };
    return iconMap[ext] || '📎';
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const priorityConfig = {
    urgent: "bg-red-100 text-red-800 border-red-300",
    important: "bg-amber-100 text-amber-800 border-amber-300",
    normal: "bg-blue-100 text-blue-800 border-blue-300",
  };

  const getReadStats = (announcement) => {
    const total = activeOfficers.length;
    const receiptEmails = new Set(announcementReceipts.filter(r => r.announcement_id === announcement.id).map(r => r.user_email));
    (announcement.read_by || []).forEach(email => receiptEmails.add(email));
    const read = receiptEmails.size;
    return { total, read, percentage: total > 0 ? Math.round((read / total) * 100) : 0, receiptEmails };
  };

  // Filter announcements based on age and priority
  const filteredAnnouncements = announcements?.filter(announcement => {
    const createdDate = new Date(announcement.created_date);
    const now = new Date();
    const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    
    if (announcement.priority === 'normal') return daysDiff <= 7;
    if (announcement.priority === 'important') return daysDiff <= 14;
    if (announcement.priority === 'urgent') return daysDiff <= 30;
    
    return true; // Default to showing if priority is unknown or not handled
  }) || [];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manage Announcements</h1>
              <p className="text-slate-600">Post company-wide announcements</p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Announcement
          </Button>
        </div>

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-600" />
                New Announcement
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Announcement title..."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal (visible 7 days)</SelectItem>
                      <SelectItem value="important">Important (visible 14 days)</SelectItem>
                      <SelectItem value="urgent">Urgent (visible 30 days)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Announcement Destination</Label>
                  <Select
                    value={formData.teams_destination}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      teams_destination: value,
                      audience: value === 'supervisor_updates' ? 'supervisors' : 'company',
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general_alerts">Company Announcement — Pathfinder + Teams General Alerts</SelectItem>
                      <SelectItem value="supervisor_updates">Supervisor Update — Supervisor Pathfinder + Teams Updates</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Supervisor Updates are hidden from the regular officer announcement feed and appear in the supervisor area.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    placeholder="Write your announcement message..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Photo (Optional)</Label>
                  <div className="flex gap-3">
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="flex-1"
                    />
                    {uploading && <span className="text-sm text-slate-500">Uploading...</span>}
                  </div>
                  {formData.photo_url && (
                    <img
                      src={formData.photo_url}
                      alt="Preview"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200 mt-2"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attachment" className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attach Document (PDF, Word, Excel, etc.)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      id="attachment"
                      type="file"
                      onChange={handleAttachmentUpload}
                      disabled={uploadingAttachment}
                      className="flex-1"
                    />
                    {uploadingAttachment && <span className="text-sm text-slate-500">Uploading...</span>}
                  </div>
                  {formData.attachment_url && (
                    <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{getFileIcon(formData.attachment_name)}</span>
                        <span className="text-sm text-slate-700">{formData.attachment_name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, attachment_url: "", attachment_name: "" })}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <AtSign className="w-4 h-4" />
                    Ping Specific Officers (Optional)
                  </Label>
                  <div className="border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                    {activeOfficers.map((officer) => (
                      <div key={officer.email} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={formData.pinged_users.includes(officer.email)}
                            onCheckedChange={() => handleToggleUser(officer.email)}
                          />
                          <label className="text-sm cursor-pointer font-medium">
                            {officer.first_name && officer.last_name 
                              ? `${officer.first_name} ${officer.last_name}` 
                              : officer.email}
                          </label>
                        </div>
                        <span className="text-xs text-slate-500">{officer.mobile_phone || 'No phone'}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Pinged officers will receive a special notification highlighting this announcement
                  </p>
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
                    disabled={createAnnouncementMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createAnnouncementMutation.isPending ? 'Posting...' : 'Post Announcement'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>All Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAnnouncements.map((announcement) => (
                <div key={announcement.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-slate-900 text-lg">{announcement.title}</p>
                        <Badge variant="outline" className={priorityConfig[announcement.priority]}>
                          {announcement.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {format(new Date(announcement.created_date), 'MMM d, yyyy h:mm a')}
                      </p>
                      {announcement.pinged_users && announcement.pinged_users.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <AtSign className="w-3 h-3 text-blue-600" />
                          <span className="text-xs text-blue-600 font-semibold">
                            Pinged: {announcement.pinged_users.map(email => getUserName(email)).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{announcement.message}</p>
                  {announcement.photo_url && (
                    <img
                      src={announcement.photo_url}
                      alt="Announcement"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200 mt-3"
                    />
                  )}
                  {announcement.attachment_url && (
                    <div className="mt-3 flex gap-2">
                      <a
                        href={announcement.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm font-medium">View Document</span>
                      </a>
                      <a
                        href={announcement.attachment_url}
                        download={announcement.attachment_name || 'document'}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-sm font-medium">Download</span>
                      </a>
                    </div>
                  )}
                  {/* Read Receipts */}
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedAnnouncement(announcement); setShowReadReceiptsDialog(true); }}
                      className="text-xs"
                    >
                      <CheckCheck className={`w-4 h-4 mr-1 ${getReadStats(announcement).percentage === 100 ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className={getReadStats(announcement).percentage === 100 ? 'text-green-600' : 'text-slate-500'}>
                        {getReadStats(announcement).read}/{getReadStats(announcement).total} officers read ({getReadStats(announcement).percentage}%)
                      </span>
                      <Eye className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
              {!filteredAnnouncements.length && (
                <p className="text-center text-slate-500 py-8">No announcements yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Read Receipts Dialog */}
      <Dialog open={showReadReceiptsDialog} onOpenChange={setShowReadReceiptsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Read Receipts
            </DialogTitle>
          </DialogHeader>
          {selectedAnnouncement && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-600 font-medium">{selectedAnnouncement.title}</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeOfficers.map(officer => {
                  const hasRead = getReadStats(selectedAnnouncement).receiptEmails.has(officer.email);
                  const name = officer.first_name && officer.last_name ? `${officer.first_name} ${officer.last_name}` : officer.email;
                  return (
                    <div key={officer.email} className={`p-3 rounded-lg flex items-center justify-between ${hasRead ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                      <span className="text-sm font-medium">{name}</span>
                      {hasRead ? (
                        <Badge className="bg-green-600 text-white text-xs">Read</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 text-xs">Unread</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 border-t text-xs text-slate-500">
                {getReadStats(selectedAnnouncement).read} of {activeOfficers.length} officers have read this announcement
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}