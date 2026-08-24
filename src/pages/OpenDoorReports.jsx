
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DoorOpen, Plus, Clock, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';
import { uploadInternalFile } from '@/lib/internalUpload';


export default function OpenDoorReports() {
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [formData, setFormData] = useState({
    report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    location: "",
    door_description: "",
    action_taken: "",
    notes: "",
    photo_url: "",
    status: "open"
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

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

  // Get current site name from active entry
  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  // Get ALL open door reports from all officers
  const { data: allReports } = useQuery({
    queryKey: ['allOpenDoorReports'],
    queryFn: () => base44.entities.OpenDoorReport.list('-created_date'),
    enabled: !!user,
    initialData: [], // Provide initial empty array
  });

  // Filter reports by current site
  const reportsToDisplay = React.useMemo(() => {
    if (!currentSiteName || !allReports) return [];
    return allReports.filter(report => report.location === currentSiteName);
  }, [currentSiteName, allReports]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
    initialData: [], // Provide initial empty array
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [], // Provide initial empty array
  });

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

  // Auto-select location when officer is clocked in and locations data is available
  useEffect(() => {
    if (activeEntry?.location && locations?.length > 0) {
      // The activeEntry.location is expected to be in the format "Site Name - Location Details"
      const siteName = activeEntry.location.split(' - ')[0];
      const matchingLocation = locations.find(loc => loc.site_name === siteName);
      // Only pre-fill if location is not already set AND we are NOT editing a report
      if (matchingLocation && formData.location === "" && !editingReport) {
        setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
      }
    }
  }, [activeEntry, locations, formData.location, editingReport]);

  const createReportMutation = useMutation({
    mutationFn: async (data) => {
      // Get officer's IP address
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      const report = await base44.entities.OpenDoorReport.create({
        ...data,
        officer_ip_address: ipAddress,
      });
      
      // Note: Cannot send emails to external site contacts due to platform limitations
      
      return report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allOpenDoorReports'] });
      setShowForm(false);
      setEditingReport(null);
      setFormData({
        report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
        location: "",
        door_description: "",
        action_taken: "",
        notes: "",
        photo_url: "",
        status: "open"
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async (data) => {
      if (!editingReport?.id) throw new Error("No report selected for update.");
      const report = await base44.entities.OpenDoorReport.update(editingReport.id, data);
      
      // Note: Cannot send emails to external site contacts due to platform limitations
      
      return report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allOpenDoorReports'] });
      setShowForm(false);
      setEditingReport(null);
      setFormData({
        report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
        location: "",
        door_description: "",
        action_taken: "",
        notes: "",
        photo_url: "",
        status: "open"
      });
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingReport) {
      // When resubmitting a rejected report, change its status to 'open'
      updateReportMutation.mutate({ ...formData, status: 'open' });
    } else {
      createReportMutation.mutate(formData);
    }
  };

  const editReport = (report) => {
    setEditingReport(report);
    // Pre-fill form data. report.report_date is expected to be an ISO string.
    setFormData({
      report_date: report.report_date, // Already an ISO string from backend
      location: report.location,
      door_description: report.door_description,
      action_taken: report.action_taken,
      notes: report.notes,
      photo_url: report.photo_url,
      status: report.status // Preserve current status, which will be 'rejected'
    });
    setShowForm(true);
  };

  const statusColors = {
    open: "bg-red-100 text-red-800 border-red-200",
    secured: "bg-green-100 text-green-800 border-green-200",
    referred: "bg-yellow-100 text-yellow-800 border-yellow-200",
    rejected: "bg-amber-100 text-amber-800 border-amber-200"
  };

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Removed the 🚪 emoji div */}
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Open Door Reports</h1>
              <p className="text-slate-600">Report and track unsecured doors</p>
            </div>
          </div>
          <Button
            onClick={() => {
              // If form is currently hidden and we are about to show it (for a new report)
              if (!showForm) {
                setEditingReport(null); // Ensure no report is being edited
                setFormData({ // Reset form for a new report
                  report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                  location: "",
                  door_description: "",
                  action_taken: "",
                  notes: "",
                  photo_url: "",
                  status: "open"
                });
                // Auto-fill location if clocked in (this replicates useEffect behavior for immediacy)
                if (activeEntry?.location && locations?.length > 0) {
                  const siteName = activeEntry.location.split(' - ')[0];
                  const matchingLocation = locations.find(loc => loc.site_name === siteName);
                  if (matchingLocation) {
                    setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
                  }
                }
              }
              setShowForm(!showForm); // Toggle form visibility last
            }}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50">
              <CardTitle className="flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-yellow-600" />
                {editingReport ? "Edit Open Door Report" : "New Open Door Report"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="report_date">Date & Time *</Label>
                    <Input
                      id="report_date"
                      type="datetime-local"
                      value={formData.report_date.slice(0, 16)}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const newDate = new Date(dateValue);
                          if (!isNaN(newDate.getTime())) {
                            setFormData({...formData, report_date: newDate.toISOString()});
                          }
                        }
                      }}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Select
                    value={formData.location}
                    onValueChange={(value) => setFormData({...formData, location: value})}
                    required
                  >
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label htmlFor="door_description">Door Description *</Label>
                  <Input
                    id="door_description"
                    placeholder="e.g., Main entrance, Unit 204, Rear exit"
                    value={formData.door_description}
                    onChange={(e) => setFormData({...formData, door_description: e.target.value})}
                    required
                  />
                </div>
                {/* Status field is editable even for rejected reports */}
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({...formData, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open/Unsecured</SelectItem>
                      <SelectItem value="secured">Secured by Officer</SelectItem>
                      <SelectItem value="referred">Referred to Management</SelectItem>
                      {/* 'rejected' status is primarily set by management, but officer can resubmit as 'open' */}
                      <SelectItem value="rejected" disabled>Rejected (Read-only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="action_taken">Action Taken *</Label>
                  <Textarea
                    id="action_taken"
                    placeholder="Describe what action you took..."
                    value={formData.action_taken}
                    onChange={(e) => setFormData({...formData, action_taken: e.target.value})}
                    required
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional information..."
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Photo (Optional)</Label>
                  <div className="flex gap-3 items-center">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingReport(null);
                      setFormData({
                        report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                        location: "",
                        door_description: "",
                        action_taken: "",
                        notes: "",
                        photo_url: "",
                        status: "open"
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <RequiredAIReportReview />
                  <Button
                    type="submit"
                    disabled={createReportMutation.isPending || updateReportMutation.isPending || uploading}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    {editingReport
                      ? (updateReportMutation.isPending ? 'Updating...' : 'Update Report')
                      : (createReportMutation.isPending ? 'Submitting...' : 'Submit Report')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>
              {currentSiteName
                ? `Open Door Reports at ${currentSiteName} (${reportsToDisplay.length})`
                : 'Open Door Reports (Clock in to view site reports)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentSiteName ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 text-lg">Clock in to a site to view open door reports</p>
                <p className="text-slate-500 text-sm mt-2">You'll see all reports filed at your current site</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reportsToDisplay?.map((report) => (
                  <div key={report.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-blue-500">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={statusColors[report.status]}>
                            {report.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="font-semibold text-slate-900 mb-1">{report.door_description}</p>
                        <p className="text-sm text-slate-600">
                          {report.report_date ? format(new Date(report.report_date), 'MMM d, yyyy h:mm a') : 'Date N/A'} - {report.location}
                        </p>
                      </div>
                    </div>
                    {report.action_taken && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-500 font-medium mb-1">Action Taken:</p>
                        <p className="text-sm text-slate-700">{report.action_taken}</p>
                      </div>
                    )}
                    {report.notes && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-500 font-medium mb-1">Notes:</p>
                        <p className="text-sm text-slate-700">{report.notes}</p>
                      </div>
                    )}
                    {report.photo_url && (
                      <img
                        src={report.photo_url}
                        alt="Open door"
                        className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200"
                      />
                    )}

                    <div className="mt-4 pt-4 border-t-2 border-slate-300">
                      <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                      <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                        {getOfficerSignature(report.created_by_id)}
                      </p>
                      {report.officer_ip_address && report.created_date && (
                        <p className="text-xs text-slate-400 mt-1">
                          IP: {report.officer_ip_address} | Signed: {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                    
                    {report.status === 'rejected' && String(report.created_by_id || '') === String(user?.id || '') && (
                      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                        <Button
                          onClick={() => editReport(report)}
                          size="sm"
                          variant="outline"
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit & Resubmit
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {reportsToDisplay.length === 0 && (
                  <p className="text-center text-slate-500 py-8">No open door reports at {currentSiteName} yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
