import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { completeReportTodo } from '@/lib/reportTodoApi';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserX, Plus, AlertTriangle, Printer, Eye, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { openTrespassNoticePrint, resolvePoliceDepartment } from "@/utils/trespassNoticePrint";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';

export default function TrespassingNotices() {
  const [showForm, setShowForm] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Changed: editingNoticeId to editingNotice (to store the full object when editing)
  const [editingNotice, setEditingNotice] = useState(null);
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [formData, setFormData] = useState({
    notice_date: new Date().toISOString().slice(0, 16),
    location: "",
    subject_name: "",
    subject_description: "",
    subject_id: "",
    vehicle_info: "",
    reason: "",
    duration: "Permanent",
    police_notified: false,
    police_report_number: "",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    photo_url: "",
  });
  const [uploading, setUploading] = useState(false);
  // Added: state to track if a save operation is in progress
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
  });

  // Helper to get officer's signature for display
  const getOfficerSignature = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (!officer) return String(officerRef || 'Unknown Officer');
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return officer.email || String(officerRef || 'Unknown Officer');
  };

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-clock_in',
        100
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  const { data: allNotices } = useQuery({
    queryKey: ['allTrespassingNotices'],
    queryFn: () => base44.entities.TrespassingNotice.list('-created_date'),
  });

  const noticesToDisplay = React.useMemo(() => {
    if (!allNotices) return { active: [], inactive: [] };

    let filtered = [];
    if (currentSiteName) {
      filtered = allNotices.filter(notice => notice.location === currentSiteName);
    } else if (isAdmin) {
      filtered = allNotices;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const active = [];
    const inactive = [];

    filtered.forEach(notice => {
      if (notice.expiration_date) {
        const expDate = new Date(notice.expiration_date);
        expDate.setHours(0, 0, 0, 0);

        if (now > expDate) {
          inactive.push(notice);
        } else {
          active.push(notice);
        }
      } else {
        active.push(notice);
      }
    });

    return { active, inactive };
  }, [allNotices, currentSiteName, isAdmin]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
  });

  const getOfficerIdentifier = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (officer?.last_name && officer?.unit_number) {
      return `${officer.last_name} - Unit ${officer.unit_number}`;
    }
    return officer?.email || String(officerRef || 'Unknown Officer');
  };

  useEffect(() => {
    // Updated: Check against editingNotice object instead of ID
    if (activeEntry?.location && locations?.length > 0 && !editingNotice) {
      const siteName = activeEntry.location.split(' - ')[0];
      const matchingLocation = locations.find(loc => loc.site_name === siteName);
      if (matchingLocation) {
        setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
      }
    }
  }, [activeEntry, locations, editingNotice]);

  const resetForm = () => {
    setShowForm(false);
    // Updated: set editingNotice to null
    setEditingNotice(null);
    setEditingTodoId(null);
    setFormData({
      notice_date: new Date().toISOString().slice(0, 16),
      location: currentSiteName || "",
      subject_name: "",
      subject_description: "",
      subject_id: "",
      vehicle_info: "",
      reason: "",
      duration: "Permanent",
      police_notified: false,
      police_report_number: "",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
      photo_url: "",
    });
  };

  const canSubmit = isAdmin || !!activeEntry;

  const saveNoticeMutation = useMutation({
    mutationFn: async (variables) => {
      const { data, isDraft } = variables || {};
      if (!data) throw new Error('Trespass notice data is required');
      // Get officer's IP address
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      let locationToSubmit = data.location;
      if (isAdmin && !data.location) {
        locationToSubmit = "Admin - Remote Submission";
      } else if (!isAdmin && !activeEntry?.location && !isDraft) {
        locationToSubmit = "Unknown Location";
      }

      if (editingNotice) { // Changed: Check editingNotice object
        const updated = await base44.entities.TrespassingNotice.update(editingNotice.id, {
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active", // Changed from 'approved'
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress, // Added officer_ip_address
        });

        if (!isDraft) {
          if (editingTodoId) {
            await completeReportTodo(editingTodoId);
          } else {
            const todos = await base44.entities.ReportTodo.filter({
              officer_email: user.email,
              report_type: 'trespass_notice',
              report_id: editingNotice.id, // Use editingNotice.id
              completed: false
            });
            for (const todo of todos) {
              await completeReportTodo(todo.id);
            }
          }
        }
        return updated;
      } else {
        const notice = await base44.entities.TrespassingNotice.create({
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active", // Changed from 'approved'
          officer_ip_address: ipAddress, // Added officer_ip_address
        });

        // Retained email sending logic, only if not a draft
        if (!isDraft) {
          const location = locations?.find(loc => loc.site_name === data.location);
          if (location?.assigned_client_email) {
            const officer = allUsers?.find(u => u.email === user?.email);
            const officerName = officer
              ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email
              : user?.email || 'Unknown Officer';
            const emailSubjectName = String(notice.subject_name || '')
              .replace(/^subject(?:\s+name)?\s*:\s*/i, '')
              .trim();
            const emailDuration = String(
              notice.expiration_date
                ? `Until ${format(new Date(notice.expiration_date), 'MMMM d, yyyy')}`
                : (notice.duration || 'Permanent')
            ).replace(/^duration\s*:\s*/i, '').trim();
            const emailReason = String(notice.reason || '')
              .replace(/^reason(?:\s+for\s+action)?\s*:\s*/i, '')
              .trim();

            try {
              await base44.integrations.Core.SendEmail({
                from_name: "Black Point Protection",
                to: location.assigned_client_email,
                subject: `🚫 New Trespass Notice - ${emailSubjectName} - ${location.site_name}`,
                body: `A new trespass notice has been issued for your location.\n\n` +
                     `Site: ${location.site_name}\n` +
                     `Date: ${format(new Date(notice.notice_date), 'MMMM d, yyyy h:mm a')}\n` +
                     `Officer: ${officerName}\n` +
                     `Subject: ${emailSubjectName}\n` +
                     `Duration: ${emailDuration}\n\n` +
                     `Reason for action:\n${emailReason}\n\n` +
                     `View and manage this notice in the Black Point Client Portal. ` +
                     `The expiration date can be updated from Trespass Management.`
              });
            } catch (error) {
              console.error('Error sending email to client:', error);
            }
          }
        }

        return notice;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['allTrespassingNotices'] }); // Kept existing query key
      // Outline suggested: queryClient.invalidateQueries({ queryKey: ['myNotices'] });
      // Outline suggested: queryClient.invalidateQueries({ queryKey: ['myReportTodos'] });

      // Reset form only if not a draft (as per outline)
      if (variables.isDraft) toast.success('Draft saved successfully.');
      resetForm();
      setSaving(false); // Set saving to false
    },
    onError: (error) => {
      console.error('Error saving report:', error);
      setSaving(false); // Ensure saving state is reset on error
      toast.error(error?.message || 'Failed to save report. Please try again.');
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, photo_url: result.file_url });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.reason.includes('-') || (formData.subject_description && formData.subject_description.includes('-'))) {
      alert('Please do not use dashes (-) in your reports. Use bullets (•) or write in full sentences instead.');
      return;
    }

    setSaving(true); // Set saving to true before mutation
    saveNoticeMutation.mutate({ data: formData, isDraft: false }); // Pass isDraft as false by default for standard submission
  };

  const viewNotice = (notice) => {
    setSelectedNotice(notice);
    setShowViewDialog(true);
  };

  const printNotice = (notice) => {
    const siteLocation = locations?.find(loc => loc.site_name === notice.location);
    const officer = allUsers?.find(u => String(u.id) === String(notice.created_by_id));
    const officerFullName = officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() : 'Officer';
    openTrespassNoticePrint(notice, {
      jurisdiction: 'VA',
      locationRecord: siteLocation || { site_name: notice.location, division: 'Virginia' },
      propertyName: siteLocation?.site_name || notice.location,
      propertyAddress: siteLocation?.address || notice.location,
      senderName: 'Black Point Protection',
      senderAddress: siteLocation?.address || notice.location,
      officerName: officerFullName,
      signatureName: getOfficerSignature(notice.created_by_id),
      timeZone: siteLocation?.time_zone || 'America/New_York',
      policeDepartment: resolvePoliceDepartment(siteLocation || { site_name: notice.location, division: 'Virginia' }),
    });
    return;
  };

  const filteredActiveNotices = noticesToDisplay.active?.filter(notice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      notice.subject_name?.toLowerCase().includes(query) ||
      notice.location?.toLowerCase().includes(query) ||
      notice.subject_id?.toLowerCase().includes(query) ||
      notice.vehicle_info?.toLowerCase().includes(query) ||
      notice.police_report_number?.toLowerCase().includes(query) ||
      getOfficerIdentifier(notice.created_by_id).toLowerCase().includes(query)
    );
  }) || [];

  const filteredInactiveNotices = noticesToDisplay.inactive?.filter(notice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      notice.subject_name?.toLowerCase().includes(query) ||
      notice.location?.toLowerCase().includes(query) ||
      notice.subject_id?.toLowerCase().includes(query) ||
      notice.vehicle_info?.toLowerCase().includes(query) ||
      notice.police_report_number?.toLowerCase().includes(query) ||
      getOfficerIdentifier(notice.created_by_id).toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Trespass Notices</h1>
            <p className="text-sm md:text-base text-slate-600">Issue and track trespass notices (auto-approved)</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-red-600 hover:bg-red-700"
            disabled={!canSubmit && !showForm}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Notice
          </Button>
        </div>

        {!canSubmit && !isAdmin && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must be clocked in to issue a trespass notice. Please clock in at your assigned location first.
            </AlertDescription>
          </Alert>
        )}

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
              <CardTitle className="flex items-center gap-2">
                {editingNotice ? ( // Changed: Check editingNotice object
                  <>
                    <Pencil className="w-5 h-5 text-orange-600" />
                    Edit Trespassing Notice
                  </>
                ) : (
                  <>
                    <UserX className="w-5 h-5 text-orange-600" />
                    New Trespassing Notice
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="notice_date">Date & Time *</Label>
                    <Input
                      id="notice_date"
                      type="datetime-local"
                      value={formData.notice_date.slice(0, 16)}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const newDate = new Date(dateValue);
                          if (!isNaN(newDate.getTime())) {
                            setFormData({...formData, notice_date: newDate.toISOString()});
                          }
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
                      required
                      disabled={!!editingNotice} // Changed: Disable if editing an existing notice
                    >
                      <SelectTrigger id="location">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map(loc => (
                          <SelectItem key={loc.id} value={loc.site_name}>
                            {loc.site_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject_name">Subject Name *</Label>
                  <Input
                    id="subject_name"
                    placeholder="Full name of trespasser"
                    value={formData.subject_name}
                    onChange={(e) => setFormData({...formData, subject_name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject_description">Physical Description</Label>
                  <Textarea
                    id="subject_description"
                    placeholder="Height, build, clothing, distinguishing features..."
                    value={formData.subject_description}
                    onChange={(e) => setFormData({...formData, subject_description: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject_id">ID Number</Label>
                    <Input
                      id="subject_id"
                      placeholder="Driver's license or ID #"
                      value={formData.subject_id}
                      onChange={(e) => setFormData({...formData, subject_id: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_info">Vehicle Info</Label>
                    <Input
                      id="vehicle_info"
                      placeholder="Make, model, license plate"
                      value={formData.vehicle_info}
                      onChange={(e) => setFormData({...formData, vehicle_info: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Notice *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Why is this trespass notice being issued?"
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    required
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Ban Duration</Label>
                  <Input
                    id="duration"
                    placeholder="Permanent (default)"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  />
                  <p className="text-xs text-slate-500">Leave as "Permanent" or specify duration (e.g., "Until January 1, 2026")</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Photo of Subject (Optional)</Label>
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
                      alt="Subject"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200 mt-2"
                    />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="police_notified"
                    checked={formData.police_notified}
                    onCheckedChange={(checked) => setFormData({...formData, police_notified: checked})}
                  />
                  <Label htmlFor="police_notified" className="cursor-pointer">
                    Police were notified
                  </Label>
                </div>

                {formData.police_notified && (
                  <div className="space-y-2">
                    <Label htmlFor="police_report_number">Police Report Number</Label>
                    <Input
                      id="police_report_number"
                      placeholder="Enter police department report number"
                      value={formData.police_report_number}
                      onChange={(e) => setFormData({...formData, police_report_number: e.target.value})}
                    />
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving || saveNoticeMutation.isPending} // Use saving state for disabled
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {editingNotice // Changed: Check editingNotice object
                      ? (saving ? 'Updating...' : 'Update Notice')
                      : (saving ? 'Submitting...' : 'Issue Notice')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <span className="text-lg md:text-xl">
                {currentSiteName
                  ? `Trespass Notices at ${currentSiteName}`
                  : 'Trespass Notices (Clock in to view site notices)'}
              </span>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Search className="w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by name, ID, vehicle, report #"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentSiteName && !isAdmin ? (
              <div className="text-center py-12">
                <p className="text-slate-600 text-lg">Clock in to a site to view trespass notices</p>
                <p className="text-slate-500 text-sm mt-2">You'll see all notices issued at your current site</p>
              </div>
            ) : (
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="active" className="text-xs sm:text-sm">
                    Active ({filteredActiveNotices.length})
                  </TabsTrigger>
                  <TabsTrigger value="inactive" className="text-xs sm:text-sm">
                    Expired ({filteredInactiveNotices.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                  <div className="space-y-4">
                    {filteredActiveNotices?.map((notice) => {
                      const durationDisplay = notice.expiration_date
                        ? `Expires: ${format(new Date(notice.expiration_date), 'MMM d, yyyy')}`
                        : 'Duration: Permanent';

                      return (
                        <Card key={notice.id} className="border-l-4 border-l-red-600">
                          <CardHeader>
                            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
                              <span className="text-lg font-bold text-slate-900">{notice.subject_name}</span>
                              <div className="flex gap-2 flex-wrap items-center">
                                <Badge className="bg-red-600 text-white">Active</Badge>
                                {notice.police_notified && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                    Police Notified
                                  </Badge>
                                )}
                                {notice.police_report_number && (
                                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                                    Report # {notice.police_report_number}
                                  </Badge>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => viewNotice(notice)}
                                  className="bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => printNotice(notice)}
                                  className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                                >
                                  <Printer className="w-4 h-4 mr-2" />
                                  Print
                                </Button>
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 p-5 pt-0">
                            <div className="text-sm space-y-1">
                              <p className="text-slate-600"><strong>Date:</strong> {format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</p>
                              <p className="text-slate-600"><strong>Location:</strong> {notice.location}</p>
                              <p className="text-slate-600"><strong>{durationDisplay}</strong></p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 font-medium mb-1">Reason:</p>
                              <p className="text-sm text-slate-700">{notice.reason}</p>
                            </div>
                            {notice.subject_description && (
                              <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Description:</p>
                                <p className="text-sm text-slate-700">{notice.subject_description}</p>
                              </div>
                            )}
                            {(notice.subject_id || notice.vehicle_info) && (
                              <div className="grid md:grid-cols-2 gap-3 mt-3">
                                {notice.subject_id && (
                                  <div className="p-2 bg-white rounded border border-slate-200">
                                    <p className="text-xs text-slate-500 font-medium">ID:</p>
                                    <p className="text-sm font-mono text-slate-700">{notice.subject_id}</p>
                                  </div>
                                )}
                                {notice.vehicle_info && (
                                  <div className="p-2 bg-white rounded border border-slate-200">
                                    <p className="text-xs text-slate-500 font-medium">Vehicle:</p>
                                    <p className="text-sm text-slate-700">{notice.vehicle_info}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Start of outline's added signature section */}
                            <div className="mt-4 pt-4 border-t-2 border-slate-300">
                              <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                              <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                                {getOfficerSignature(notice.created_by_id)}
                              </p>
                              {notice.officer_ip_address && notice.created_date && (
                                <p className="text-xs text-slate-400 mt-1">
                                  IP: {notice.officer_ip_address} | Signed: {format(new Date(notice.created_date), 'MMM d, yyyy h:mm a')}
                                </p>
                              )}
                            </div>
                            {/* End of outline's added signature section */}
                            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-medium">Issued by: {getOfficerIdentifier(notice.created_by_id)}</span>
                              <span>•</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {filteredActiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No active trespass notices</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="inactive" className="mt-4">
                  <div className="space-y-4">
                    {filteredInactiveNotices?.map((notice) => (
                      <div key={notice.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-slate-400 opacity-60">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-2 mb-2">
                              <Badge variant="outline" className="bg-slate-200 text-slate-700">
                                EXPIRED
                              </Badge>
                              {notice.expiration_date && (
                                <Badge variant="outline" className="bg-red-100 text-red-800">
                                  Expired: {format(new Date(notice.expiration_date), 'MMM d, yyyy')}
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold text-slate-700 mb-1">{notice.subject_name}</p>
                            <p className="text-sm text-slate-600">Issued: {format(new Date(notice.notice_date), 'MMM d, yyyy')}</p>
                            <p className="text-sm text-slate-600">Location: {notice.location}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredInactiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No expired trespass notices</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Official Trespass Notice</DialogTitle>
            {selectedNotice && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => printNotice(selectedNotice)}
                className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Notice
              </Button>
            )}
          </DialogHeader>
          {selectedNotice && (
            <div className="py-4">
              <div className="bg-white p-8 border-2 border-slate-300 rounded-lg">
                <div className="text-center border-b-4 border-black pb-6 mb-6">
                  <h2 className="text-3xl font-bold text-red-700 mb-2">OFFICIAL TRESPASS NOTICE</h2>
                  <p className="text-xl font-semibold">{selectedNotice.location}</p>
                  <p className="text-slate-600">{format(new Date(selectedNotice.notice_date), 'MMMM d, yyyy h:mm a')}</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-lg mb-2 uppercase">Subject Information:</h3>
                    <div className="ml-4 space-y-1">
                      <p><strong>Name:</strong> {selectedNotice.subject_name}</p>
                      {selectedNotice.subject_description && (
                        <p><strong>Description:</strong> {selectedNotice.subject_description}</p>
                      )}
                      {selectedNotice.subject_id && (
                        <p><strong>ID Number:</strong> {selectedNotice.subject_id}</p>
                      )}
                      {selectedNotice.vehicle_info && (
                        <p><strong>Vehicle:</strong> {selectedNotice.vehicle_info}</p>
                      )}
                      {selectedNotice.police_report_number && (
                        <p><strong>Police Report #:</strong> {selectedNotice.police_report_number}</p>
                      )}
                    </div>
                  </div>

                  {selectedNotice.photo_url && (
                    <div>
                      <h3 className="font-bold text-lg mb-2 uppercase">Subject Photo:</h3>
                      <img
                        src={selectedNotice.photo_url}
                        alt="Subject"
                        className="w-full max-w-md rounded border-2 border-slate-300"
                      />
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold text-lg mb-2 uppercase">Reason for Trespass Notice:</h3>
                    <p className="ml-4">{selectedNotice.reason}</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg mb-2 uppercase">Duration of Ban:</h3>
                    <p className="ml-4">
                      {selectedNotice.expiration_date
                        ? `Until ${format(new Date(selectedNotice.expiration_date), 'MMMM d, yyyy')}`
                        : (selectedNotice.duration ? `for a period of ${selectedNotice.duration}` : "indefinitely")}
                    </p>
                  </div>

                  <div className="bg-yellow-50 border-2 border-yellow-600 rounded-lg p-4 mt-8">
                    <h3 className="font-bold text-lg text-yellow-800 mb-2">LEGAL NOTICE</h3>
                    <p className="font-semibold mb-2">You are hereby notified that you are not permitted on this property
                      {selectedNotice.expiration_date
                        ? `until ${format(new Date(selectedNotice.expiration_date), 'MMMM d, yyyy')}`
                        : (selectedNotice.duration ? `for a period of ${selectedNotice.duration}` : "indefinitely")}.
                    </p>
                    <p className="mb-2">Violation of this notice may result in arrest and criminal prosecution for trespassing under Virginia Code § 18.2-119.</p>
                    <p className="mb-2">If you return to this property during the ban period, you will be subject to immediate arrest.</p>
                    {selectedNotice.police_notified && <p className="font-bold text-red-700 mt-2">Police have been notified of this trespass notice.</p>}
                  </div>

                  <div className="mt-8 pt-6 border-t-2 border-gray-300">
                    <p className="font-bold text-base mb-2">Issued by:</p>
                    <div className="relative border-b-2 border-gray-600 h-12 w-3/4 max-w-sm mb-2">
                      <p className="absolute bottom-1 left-0 text-3xl italic text-gray-800" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                        {getOfficerSignature(selectedNotice.created_by_id)}
                      </p>
                    </div>
                    <p><strong>Officer:</strong> {getOfficerSignature(selectedNotice.created_by_id)}</p>
                    <p><strong>Location:</strong> {selectedNotice.location}</p>
                    <p><strong>Date:</strong> {format(new Date(selectedNotice.notice_date), 'MMMM d, yyyy h:mm a')}</p>
                    {selectedNotice.officer_ip_address && selectedNotice.created_date && (
                      <p><strong>IP Address & Signed:</strong> {selectedNotice.officer_ip_address} at {format(new Date(selectedNotice.created_date), 'MMM d, yyyy h:mm a')}</p>
                    )}
                  </div>

                  <div className="mt-12 pt-4 border-t-2 border-gray-300 max-w-md">
                    <p className="font-bold text-base mb-2">Subject Signature</p>
                    <div className="relative border-b-2 border-gray-600 h-12 w-full mb-2">
                    </div>
                    <p className="text-sm text-gray-600">I acknowledge receipt of this notice and understand that I am prohibited from returning to this property.</p>
                  </div>

                  <div className="mt-10 pt-4 border-t-2 border-gray-300 text-center text-xs text-gray-500">
                    <p>Richmond, VA | Printed on {format(new Date(), 'MMM d, yyyy h:mm a')}</p>
                    <p className="mt-2 font-bold">THIS IS AN OFFICIAL LEGAL NOTICE - RETAIN FOR YOUR RECORDS</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}