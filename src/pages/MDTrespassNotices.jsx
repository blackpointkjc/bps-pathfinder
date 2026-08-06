import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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

export default function MDTrespassNotices() {
  const [showForm, setShowForm] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    photo_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const getOfficerSignature = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (!officer) return email;
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return email;
  };

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-created_date',
        1
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  const { data: allNotices } = useQuery({
    queryKey: ['allMDTrespassNotices'],
    queryFn: () => base44.entities.MDTrespassNotice.list('-created_date'),
    initialData: [],
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
      const allLocations = await base44.entities.Location.list('site_name');
      return allLocations.filter(loc => loc.active);
    },
    enabled: !!user,
    initialData: [],
  });

  const getOfficerIdentifier = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.last_name && officer?.unit_number) {
      return `${officer.last_name} - Unit ${officer.unit_number}`;
    }
    return email;
  };

  useEffect(() => {
    if (!editingNotice && !isAdmin && activeEntry?.location && locations?.length > 0) {
      const siteName = activeEntry.location.split(' - ')[0];
      const matchingLocation = locations.find(loc => loc.site_name === siteName);
      if (matchingLocation) {
        setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
      }
    }
  }, [activeEntry, locations, editingNotice, isAdmin]);

  const resetForm = () => {
    setShowForm(false);
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
      photo_url: "",
    });
  };

  const canSubmit = isAdmin || !!activeEntry;

  const saveNoticeMutation = useMutation({
    mutationFn: async ({ data, isDraft }) => {
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

      if (editingNotice) {
        const updated = await base44.entities.MDTrespassNotice.update(editingNotice.id, {
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active",
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress,
        });

        if (!isDraft) {
          if (editingTodoId) {
            await base44.entities.ReportTodo.update(editingTodoId, { completed: true });
          }
        }
        return updated;
      } else {
        const notice = await base44.entities.MDTrespassNotice.create({
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active",
          officer_ip_address: ipAddress,
        });

        if (!isDraft) {
          const location = locations?.find(loc => loc.site_name === data.location);
          if (location?.assigned_client_email) {
            const officer = allUsers?.find(u => u.email === user?.email);
            const officerName = officer
              ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email
              : user?.email || 'Unknown Officer';

            try {
              await base44.integrations.Core.SendEmail({
                from_name: "Black Point Protection",
                to: location.assigned_client_email,
                subject: `🚫 New MD Trespass Notice - ${notice.subject_name} - ${location.site_name}`,
                body: `NEW MD TRESPASS NOTICE ISSUED\n\n` +
                     `Site: ${location.site_name}\n` +
                     `Date: ${format(new Date(notice.notice_date), 'MMMM d, yyyy h:mm a')}\n` +
                     `Officer: ${officerName}\n` +
                     `Subject: ${notice.subject_name}\n` +
                     `Duration: ${notice.expiration_date ? `Until ${format(new Date(notice.expiration_date), 'MMMM d, yyyy')}` : (notice.duration || 'Permanent')}\n\n` +
                     `REASON:\n${notice.reason}\n\n` +
                     `View and manage this notice in your Black Point Portal Client Portal.`
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
      queryClient.invalidateQueries({ queryKey: ['allMDTrespassNotices'] });
      if (!variables.isDraft) {
        resetForm();
      } else {
        toast.success('Draft saved successfully.');
      }
      setSaving(false);
    },
    onError: (error) => {
      console.error('Error saving report:', error);
      setSaving(false);
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
    setSaving(true);
    saveNoticeMutation.mutate({ data: formData, isDraft: false });
  };

  const printNotice = (notice) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const siteLocation = locations?.find(loc => loc.site_name === notice.location);
    const displayLocation = siteLocation ? `${siteLocation.site_name}: ${siteLocation.address}` : notice.location;
    const officer = allUsers?.find(u => u.email === notice.created_by);
    const officerFullName = officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() : 'Officer';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MD Trespass Notice - ${notice.subject_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 8.5pt; line-height: 1.2; color: #000; }
          
          .back-button {
            position: fixed;
            top: 10px;
            left: 10px;
            padding: 8px 16px;
            background: #1e40af;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover { background: #1e3a8a; }
          
          .notice-container { border: 4px double #000; padding: 20px; }
          .header { text-align: center; border-bottom: 4px double #000; padding-bottom: 12px; margin-bottom: 15px; }
          .title { font-size: 22pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
          .subtitle { font-size: 14pt; font-weight: bold; color: #d32f2f; }
          .section { margin: 12px 0; }
          .section-title { font-weight: bold; font-size: 12pt; margin-bottom: 5px; background: #f5f5f5; padding: 5px; border-left: 4px solid #000; }
          .field-row { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 5px 0; }
          .field-label { font-weight: bold; }
          .field-value { border-bottom: 1px dotted #000; padding: 2px 5px; min-height: 20px; }
          .warning-box { border: 3px solid #d32f2f; background: #ffebee; padding: 15px; margin: 15px 0; }
          .warning-title { font-size: 14pt; font-weight: bold; color: #d32f2f; margin-bottom: 8px; }
          .legal-text { font-size: 9pt; line-height: 1.4; margin: 10px 0; }
          .signature-section { margin-top: 20px; border-top: 2px solid #000; padding-top: 15px; }
          .sig-box { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .sig-line { border-bottom: 2px solid #000; min-height: 40px; margin: 8px 0; font-family: 'Brush Script MT', cursive; font-size: 18pt; padding: 5px; }
          .sig-label { font-size: 8pt; font-weight: bold; margin-bottom: 3px; }
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 2px solid #000; font-size: 8pt; font-weight: bold; }
          .photo-section { margin: 15px 0; border: 2px solid #000; padding: 10px; text-align: center; }
          .photo-section img { max-width: 100%; max-height: 300px; object-fit: contain; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="notice-container">
          <div class="header">
            <div class="title">MARYLAND TRESPASS NOTICE</div>
            <div class="subtitle">NO TRESPASSING WARNING</div>
          </div>
          
          <div class="section">
            <div class="section-title">NOTICE INFORMATION</div>
            <div class="field-row">
              <div class="field-label">Date Issued:</div>
              <div class="field-value">${format(new Date(notice.notice_date), 'MMMM d, yyyy h:mm a')}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Location:</div>
              <div class="field-value">${displayLocation}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Duration:</div>
              <div class="field-value">${notice.duration}${notice.expiration_date ? ` (Expires: ${format(new Date(notice.expiration_date), 'MMM d, yyyy')})` : ''}</div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">SUBJECT INFORMATION</div>
            <div class="field-row">
              <div class="field-label">Name:</div>
              <div class="field-value">${notice.subject_name}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Description:</div>
              <div class="field-value">${notice.subject_description || 'N/A'}</div>
            </div>
            ${notice.subject_id ? `
              <div class="field-row">
                <div class="field-label">ID Number:</div>
                <div class="field-value">${notice.subject_id}</div>
              </div>
            ` : ''}
            ${notice.vehicle_info ? `
              <div class="field-row">
                <div class="field-label">Vehicle:</div>
                <div class="field-value">${notice.vehicle_info}</div>
              </div>
            ` : ''}
          </div>
          
          <div class="section">
            <div class="section-title">REASON FOR TRESPASS NOTICE</div>
            <div style="border: 1px solid #000; padding: 10px; min-height: 80px; white-space: pre-wrap;">
              ${notice.reason}
            </div>
          </div>

          ${notice.photo_url ? `
            <div class="photo-section">
              <div class="section-title">SUBJECT PHOTO</div>
              <img src="${notice.photo_url}" alt="Subject photo" />
            </div>
          ` : ''}

          ${notice.police_notified ? `
            <div class="section">
              <div class="section-title">LAW ENFORCEMENT NOTIFICATION</div>
              <div class="field-row">
                <div class="field-label">Police Notified:</div>
                <div class="field-value">YES</div>
              </div>
              ${notice.police_report_number ? `
                <div class="field-row">
                  <div class="field-label">Report Number:</div>
                  <div class="field-value">${notice.police_report_number}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="warning-box">
            <div class="warning-title">⚠️ LEGAL WARNING</div>
            <div class="legal-text">
              <p><strong>YOU ARE HEREBY NOTIFIED</strong> that you are not permitted to enter or remain on the above-described property.</p>
              <p style="margin-top: 8px;">
                <strong>Maryland Criminal Law § 6-402</strong> - A person may not enter or remain on private property after the person has been notified by the owner or the owner's agent not to trespass on the property.
              </p>
              <p style="margin-top: 8px;">
                <strong>VIOLATION OF THIS NOTICE MAY RESULT IN:</strong>
              </p>
              <ul style="margin-left: 20px; margin-top: 5px;">
                <li>Arrest and criminal prosecution</li>
                <li>Imprisonment up to 90 days and/or fine up to $500</li>
                <li>Civil liability for damages</li>
              </ul>
            </div>
          </div>
          
          <div class="signature-section">
            <div class="sig-box">
              <div>
                <div class="sig-label">SUBJECT ACKNOWLEDGMENT (if present):</div>
                <div class="sig-line"></div>
                <div style="font-size: 8pt; text-align: center;">Signature of Subject</div>
              </div>
              <div>
                <div class="sig-label">ISSUING OFFICER:</div>
                <div class="sig-line"></div>
                <div style="font-size: 8pt; text-align: center;">Date: ____________________</div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin-top: 3px;">THIS IS AN OFFICIAL TRESPASS NOTICE - RETAIN FOR YOUR RECORDS</p>
          </div>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
  };

  const filteredActiveNotices = noticesToDisplay.active?.filter(notice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      notice.subject_name?.toLowerCase().includes(query) ||
      notice.location?.toLowerCase().includes(query) ||
      notice.subject_id?.toLowerCase().includes(query) ||
      notice.vehicle_info?.toLowerCase().includes(query) ||
      getOfficerIdentifier(notice.created_by).toLowerCase().includes(query)
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
      getOfficerIdentifier(notice.created_by).toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">MD Trespass Notices</h1>
            <p className="text-sm md:text-base text-slate-600">Issue and track Maryland trespass notices</p>
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
              You must be clocked in to issue a trespass notice.
            </AlertDescription>
          </Alert>
        )}

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
              <CardTitle className="flex items-center gap-2">
                {editingNotice ? (
                  <>
                    <Pencil className="w-5 h-5 text-orange-600" />
                    Edit MD Trespassing Notice
                  </>
                ) : (
                  <>
                    <UserX className="w-5 h-5 text-orange-600" />
                    New MD Trespassing Notice
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
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
                      disabled={!isAdmin && !!activeEntry?.location}
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
                    disabled={saving || saveNoticeMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {editingNotice
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
                  ? `MD Trespass Notices at ${currentSiteName}`
                  : 'MD Trespass Notices (Clock in to view)'}
              </span>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Search className="w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by name, ID, vehicle"
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
              </div>
            ) : (
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="active">Active ({filteredActiveNotices.length})</TabsTrigger>
                  <TabsTrigger value="inactive">Expired ({filteredInactiveNotices.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                  <div className="space-y-4">
                    {filteredActiveNotices?.map((notice) => (
                      <Card key={notice.id} className="border-l-4 border-l-red-600">
                        <CardHeader>
                          <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-lg font-bold">{notice.subject_name}</span>
                            <div className="flex gap-2">
                              <Badge className="bg-red-600 text-white">Active</Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => printNotice(notice)}
                                className="bg-blue-50 text-blue-800 border-blue-200"
                              >
                                <Printer className="w-4 h-4 mr-2" />
                                Print
                              </Button>
                            </div>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 p-5 pt-0">
                          <p className="text-sm"><strong>Date:</strong> {format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</p>
                          <p className="text-sm"><strong>Location:</strong> {notice.location}</p>
                          <p className="text-sm text-slate-700">{notice.reason}</p>
                          <div className="mt-4 pt-4 border-t-2 border-slate-300">
                            <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                            <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                              {getOfficerSignature(notice.created_by)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {filteredActiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No active trespass notices</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="inactive" className="mt-4">
                  <div className="space-y-4">
                    {filteredInactiveNotices?.map((notice) => (
                      <div key={notice.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-slate-400 opacity-60">
                        <Badge className="bg-slate-200 text-slate-700 mb-2">EXPIRED</Badge>
                        <p className="font-semibold text-slate-700">{notice.subject_name}</p>
                        <p className="text-sm text-slate-600">Issued: {format(new Date(notice.notice_date), 'MMM d, yyyy')}</p>
                      </div>
                    ))}
                    {filteredInactiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No expired notices</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}