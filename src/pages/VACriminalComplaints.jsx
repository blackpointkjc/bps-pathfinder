// This is the same as the existing CriminalComplaints page - renamed to VA Criminal Complaints
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser, recordBelongsToDirectoryUser } from '@/lib/appDirectory';
import { loadLegalRecordHistory, updateLegalRecord } from '@/lib/legalRecordHistory';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Clock, Printer, AlertTriangle, Camera, Gavel, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import IDScanner from "../components/IDScanner";
import SignaturePad from "../components/SignaturePad";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { openVirginiaCriminalComplaintPrint } from '@/utils/virginiaCriminalComplaintPrint';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';
import { formatReportDateTime, resolveReportTimeZone } from '@/lib/reportPrint';

export default function VACriminalComplaints({ sharedSearch, onSharedSearchChange }) {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showIDScanner, setShowIDScanner] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [dispositionComplaintId, setDispositionComplaintId] = useState(null);
  const [magistrateForm, setMagistrateForm] = useState({
    magistrate_disposition: 'pending',
    magistrate_decision_date: '',
    magistrate_name: '',
    granted_charge_code: '',
    granted_charge_description: '',
    magistrate_process_type: 'summons',
    magistrate_case_number: '',
    magistrate_notes: '',
  });
  const [formData, setFormData] = useState({
    complaint_date: new Date().toISOString(),
    offense_date: format(new Date(), 'yyyy-MM-dd'),
    offense_time: format(new Date(), 'HH:mm'),
    location: "",
    location_type: "city",
    accused_first_name: "",
    accused_last_name: "",
    accused_middle_name: "",
    accused_address: "",
    accused_race: "",
    accused_sex: "male",
    accused_dob: "",
    accused_height_ft: "",
    accused_height_in: "",
    accused_weight: "",
    accused_eyes: "",
    accused_hair: "",
    accused_ssn: "",
    accused_id_number: "",
    accused_id_state: "",
    accused_id_expiration: "",
    violation_code: "",
    violation_section: "",
    facts_basis: "",
    court_type: "general_district",
    complainant_name: "",
    complainant_signature_url: "",
    complainant_signed_at: "",
    is_law_enforcement: true,
    authorization_type: "law_enforcement",
    authorization_given_by: "",
    authorization_date: null,
    status: "draft",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const isAdmin = user?.role === 'admin';

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

  const canSubmit = isAdmin || !!activeEntry;

  const { data: allComplaints = [], isLoading: historyLoading } = useQuery({
    queryKey: ['allCriminalComplaints', user?.id],
    queryFn: () => loadLegalRecordHistory('complaint'),
    enabled: !!user,
    staleTime: 15000,
  });

  // Real-time sync across devices
  useEffect(() => {
    if (!user) return;
    const unsubscribe = base44.entities.CriminalComplaint.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['allCriminalComplaints'] });
    });
    return unsubscribe;
  }, [user, queryClient]);

  const complaintsToDisplay = React.useMemo(() => {
    if (!allComplaints || !user) return [];
    
    const userComplaints = isAdmin
      ? allComplaints
      : allComplaints.filter(complaint => recordBelongsToDirectoryUser(user, complaint));
    
    const query = searchQuery.trim().toLowerCase();
    if (!query) return userComplaints;
    const terms = query.split(/\s+/).filter(Boolean);
    return userComplaints.filter(complaint => {
      const searchable = [
        JSON.stringify(complaint || {}),
        complaint.accused_first_name,
        complaint.accused_middle_name,
        complaint.accused_last_name,
        complaint.accused_dob,
        complaint.accused_ssn,
        complaint.accused_id_number,
        complaint.accused_address,
        complaint.complaint_number,
        complaint.call_number,
        complaint.violation_code,
        complaint.violation_section,
        complaint.facts_basis,
        complaint.location,
        complaint.linked_call_number,
        complaint.warrant_number,
      ].filter(Boolean).join(' ').toLowerCase();
      return terms.every(term => searchable.includes(term));
    });
  }, [allComplaints, user, isAdmin, searchQuery]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations', 'vaCriminalComplaints', user?.division || 'all'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      const activeLocations = allLocations.filter(loc => loc.active !== false);
      
      // Filter by division if user has one
      if (user?.division) {
        return activeLocations.filter(loc => loc.division === user.division);
      }
      
      return activeLocations;
    },
    enabled: !!user,
    initialData: [],
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  useEffect(() => {
    if (!isAdmin && activeEntry?.location && locations) {
      const siteName = activeEntry.location.split(' - ')[0];
      const matchingLocation = locations.find(loc => loc.site_name === siteName);
      if (matchingLocation) {
        setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
      }
    }
  }, [activeEntry, locations, isAdmin]);

  useEffect(() => {
    if (user?.first_name && user?.last_name) {
      setFormData(prev => ({
        ...prev,
        complainant_name: `${user.first_name} ${user.last_name}`
      }));
    }
  }, [user]);

  const generateComplaintNumber = () => {
    const formDate = format(new Date(formData.offense_date), 'yyyyMMdd');
    const existingToday = allComplaints?.filter(c => c.complaint_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(4, '0');
    return `VCC-${formDate}-${nextNum}`;
  };

  const generateCallNumber = () => {
    const formDate = format(new Date(formData.offense_date), 'yyyyMMdd');
    const existingToday = allComplaints?.filter(c => c.call_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(3, '0');
    return `C-${formDate}-${nextNum}`;
  };

  const createComplaintMutation = useMutation({
    mutationFn: async (data) => {
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      if (editingComplaint?.id) {
        return await updateLegalRecord('complaint', editingComplaint.id, {
          ...data,
          complaint_number: editingComplaint.complaint_number,
          call_number: editingComplaint.call_number,
          status: editingComplaint.status === 'approved' ? 'approved' : 'submitted',
          officer_ip_address: ipAddress,
        });
      }
      const complaintNumber = generateComplaintNumber();
      const callNumber = generateCallNumber();
      const complaintWithNumbersAndIp = { 
        ...data, 
        complaint_number: complaintNumber, 
        call_number: callNumber,
        status: 'submitted',
        officer_ip_address: ipAddress,
      };
      return await base44.entities.CriminalComplaint.create(complaintWithNumbersAndIp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCriminalComplaints'] });
      alert(editingComplaint ? '✅ Criminal complaint updated successfully!' : '✅ Criminal complaint filed successfully!');
      resetForm();
    },
    onError: (error) => {
      console.error('Error creating complaint:', error);
      alert('❌ Failed to file complaint. Please try again. Error: ' + error.message);
    },
  });

  const magistrateMutation = useMutation({
    mutationFn: async ({ complaintId, values }) => {
      const decisionDate = values.magistrate_decision_date ? new Date(values.magistrate_decision_date).toISOString() : new Date().toISOString();
      const payload = {
        ...values,
        magistrate_decision_date: decisionDate,
        filed_at_court: true,
        court_filing_date: decisionDate.split('T')[0],
        warrant_issued: values.magistrate_disposition === 'granted' && values.magistrate_process_type === 'warrant',
        warrant_number: values.magistrate_disposition === 'granted' && values.magistrate_process_type === 'warrant' ? values.magistrate_case_number : '',
      };
      return base44.entities.CriminalComplaint.update(complaintId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCriminalComplaints'] });
      queryClient.invalidateQueries({ queryKey: ['legalCaseHistory'] });
      setDispositionComplaintId(null);
      alert('Magistrate result saved.');
    },
    onError: error => alert('Unable to save magistrate result: ' + (error?.message || 'Unknown error')),
  });

  const openMagistrateResult = complaint => {
    const value = complaint.magistrate_decision_date ? new Date(complaint.magistrate_decision_date) : new Date();
    const localDate = Number.isNaN(value.getTime()) ? '' : format(value, "yyyy-MM-dd'T'HH:mm");
    setMagistrateForm({
      magistrate_disposition: complaint.magistrate_disposition || 'pending',
      magistrate_decision_date: localDate,
      magistrate_name: complaint.magistrate_name || '',
      granted_charge_code: complaint.granted_charge_code || complaint.violation_code || '',
      granted_charge_description: complaint.granted_charge_description || complaint.violation_section || '',
      magistrate_process_type: complaint.magistrate_process_type || 'summons',
      magistrate_case_number: complaint.magistrate_case_number || complaint.warrant_number || '',
      magistrate_notes: complaint.magistrate_notes || '',
    });
    setDispositionComplaintId(complaint.id);
  };

  const editComplaint = (complaint) => {
    setEditingComplaint(complaint);
    setFormData(current => ({
      ...current,
      ...complaint,
      complaint_date: complaint.complaint_date || new Date().toISOString(),
      offense_date: complaint.offense_date ? String(complaint.offense_date).slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      offense_time: complaint.offense_time || format(new Date(), 'HH:mm'),
      linked_call_id: complaint.linked_call_id || '',
      linked_call_number: complaint.linked_call_number || '',
      linked_call_type: complaint.linked_call_type || '',
      linked_call_location: complaint.linked_call_location || '',
    }));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingComplaint(null);
    setFormData({
      complaint_date: new Date().toISOString(),
      offense_date: format(new Date(), 'yyyy-MM-dd'),
      offense_time: format(new Date(), 'HH:mm'),
      location: "",
      location_type: "city",
      accused_first_name: "",
      accused_last_name: "",
      accused_middle_name: "",
      accused_address: "",
      accused_race: "",
      accused_sex: "male",
      accused_dob: "",
      accused_height_ft: "",
      accused_height_in: "",
      accused_weight: "",
      accused_eyes: "",
      accused_hair: "",
      accused_ssn: "",
      violation_code: "",
      violation_section: "",
      facts_basis: "",
      court_type: "general_district",
      complainant_name: user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : "",
      complainant_signature_url: "",
      complainant_signed_at: "",
      is_law_enforcement: true,
      authorization_type: "law_enforcement",
      authorization_given_by: "",
      authorization_date: null,
      status: "draft",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.complainant_signature_url) {
      alert('A handwritten complainant signature is required before filing the complaint.');
      return;
    }
    
    const submissionData = {
      ...formData,
      accused_height_ft: formData.accused_height_ft ? parseFloat(formData.accused_height_ft) : undefined,
      accused_height_in: formData.accused_height_in ? parseFloat(formData.accused_height_in) : undefined,
      accused_weight: formData.accused_weight ? parseFloat(formData.accused_weight) : undefined,
    };
    
    createComplaintMutation.mutate(submissionData);
  };

  const getOfficerFullDisplay = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Officer';
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return 'Officer';
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return officer.full_name || 'Officer';
  };

  const getOfficerSignature = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Officer';
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return 'Officer';
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || 'Officer';
  };

  const printComplaint = (complaint) => {
    const siteLocation = locations?.find(loc => loc.site_name === complaint.location);
    const displayLocation = siteLocation?.address || complaint.location;
    const officerInfo = allUsers?.find(u => String(u.id) === String(complaint.created_by_id));
    const officerFullName = officerInfo ? `${officerInfo.first_name || ''} ${officerInfo.last_name || ''}`.trim() : 'Officer';
    const complainantPrintName = officerInfo?.last_name && officerInfo?.first_name
      ? `${officerInfo.last_name.toUpperCase()}, ${officerInfo.first_name}${officerInfo.middle_name ? ` ${officerInfo.middle_name}` : ''}`
      : (complaint.complainant_name || officerFullName);

    openVirginiaCriminalComplaintPrint(complaint, {
      displayLocation,
      officerName: getOfficerFullDisplay(officerInfo?.email),
      complainantName: complainantPrintName,
      signatureUrl: complaint.complainant_signature_url || '',
      timeZone: siteLocation?.time_zone || 'America/New_York',
    });
    return;
  };

  if (!canSubmit && !isAdmin) {
    return (
      <div className="p-8 text-center">
        <Clock className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Clock In Required</h2>
        <p className="text-slate-600">You must be clocked in to file a criminal complaint.</p>
      </div>
    );
  }

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-black text-white md:text-3xl">VA Criminal Complaints</h1>
            <p className="text-sm md:text-base text-slate-600">File criminal complaints for Virginia prosecution</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-red-600 hover:bg-red-700 w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Complaint
          </Button>
        </div>

        {!canSubmit && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must be clocked in to file a criminal complaint. Please clock in at your assigned location first.
            </AlertDescription>
          </Alert>
        )}

        {showForm && canSubmit && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                New Virginia Criminal Complaint
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-medium">
                    This form creates an official criminal complaint for Commonwealth of Virginia prosecution.
                    All fields marked with * are required.
                  </p>
                </div>

                {/* All form sections same as original CriminalComplaints */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Offense Information</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="offense_date">Offense Date *</Label>
                      <Input
                        id="offense_date"
                        type="date"
                        value={formData.offense_date}
                        onChange={(e) => setFormData({...formData, offense_date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="offense_time">Offense Time *</Label>
                      <Input
                        id="offense_time"
                        type="time"
                        value={formData.offense_time}
                        onChange={(e) => setFormData({...formData, offense_time: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location">Location (City/County/Town) *</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData({...formData, location: e.target.value})}
                        placeholder="Enter city, county, or town name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location_type">Location Type *</Label>
                      <Select
                        value={formData.location_type}
                        onValueChange={(value) => setFormData({...formData, location_type: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="city">City</SelectItem>
                          <SelectItem value="county">County</SelectItem>
                          <SelectItem value="town">Town</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Accused Information</h3>
                  
                  {showIDScanner && (
                    <IDScanner
                      onDataExtracted={(data) => {
                        const updates = {};
                        if (data.first_name) updates.accused_first_name = data.first_name;
                        if (data.last_name) updates.accused_last_name = data.last_name;
                        if (data.middle_name) updates.accused_middle_name = data.middle_name;
                        if (data.date_of_birth) updates.accused_dob = data.date_of_birth;
                        if (data.sex) updates.accused_sex = data.sex.toLowerCase();
                        if (data.address || data.city || data.state) {
                          const addrParts = [data.address, data.city, data.state, data.zip_code].filter(Boolean);
                          updates.accused_address = addrParts.join(', ');
                        }
                        if (data.height) {
                          const heightMatch = data.height.match(/(\d+)['\-]?(\d+)?/);
                          if (heightMatch) {
                            updates.accused_height_ft = heightMatch[1];
                            updates.accused_height_in = heightMatch[2] || '';
                          }
                        }
                        if (data.weight) updates.accused_weight = data.weight.replace(/[^\d]/g, '');
                        if (data.eyes) updates.accused_eyes = data.eyes;
                        if (data.hair) updates.accused_hair = data.hair;
                        if (data.race) updates.accused_race = data.race;
                        if (data.id_number) updates.accused_id_number = data.id_number;
                        if (data.state) updates.accused_id_state = data.state;
                        if (data.expiration_date) updates.accused_id_expiration = data.expiration_date;
                        updates.id_scanned_in_person = true;
                        updates.scan_type = data.scan_type || data.scan_source || 'id_scan';
                        updates.scan_raw = data.raw_scan || '';
                        updates.scan_parsed_json = JSON.stringify(data);
                        updates.scanned_at = data.scanned_at || new Date().toISOString();
                        updates.scanned_by = user?.email || '';
                        updates.device_id = data.device_id || navigator.userAgent;
                        if (data.id_photo) updates.id_photo = data.id_photo;
                        
                        setFormData(prev => ({ ...prev, ...updates }));
                        setShowIDScanner(false);
                      }}
                      onClose={() => setShowIDScanner(false)}
                    />
                  )}

                  <Button
                    type="button"
                    onClick={() => setShowIDScanner(!showIDScanner)}
                    variant="outline"
                    className="w-full bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {showIDScanner ? 'Close ID Scanner' : 'Scan Accused\'s ID'}
                  </Button>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accused_first_name">First Name *</Label>
                      <Input
                        id="accused_first_name"
                        value={formData.accused_first_name}
                        onChange={(e) => setFormData({...formData, accused_first_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_middle_name">Middle Name</Label>
                      <Input
                        id="accused_middle_name"
                        value={formData.accused_middle_name}
                        onChange={(e) => setFormData({...formData, accused_middle_name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_last_name">Last Name *</Label>
                      <Input
                        id="accused_last_name"
                        value={formData.accused_last_name}
                        onChange={(e) => setFormData({...formData, accused_last_name: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accused_address">Address</Label>
                    <Input
                      id="accused_address"
                      value={formData.accused_address}
                      onChange={(e) => setFormData({...formData, accused_address: e.target.value})}
                      placeholder="Street, City, State, Zip"
                    />
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accused_dob">Date of Birth (DOB)</Label>
                      <Input
                        id="accused_dob"
                        type="date"
                        value={formData.accused_dob}
                        onChange={(e) => setFormData({...formData, accused_dob: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_race">Race</Label>
                      <Input
                        id="accused_race"
                        value={formData.accused_race}
                        onChange={(e) => setFormData({...formData, accused_race: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_sex">Sex *</Label>
                      <Select
                        value={formData.accused_sex}
                        onValueChange={(value) => setFormData({...formData, accused_sex: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accused_height_ft">Height (ft)</Label>
                      <Input
                        id="accused_height_ft"
                        type="number"
                        value={formData.accused_height_ft}
                        onChange={(e) => setFormData({...formData, accused_height_ft: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_height_in">Height (in)</Label>
                      <Input
                        id="accused_height_in"
                        type="number"
                        value={formData.accused_height_in}
                        onChange={(e) => setFormData({...formData, accused_height_in: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_weight">Weight (lbs)</Label>
                      <Input
                        id="accused_weight"
                        type="number"
                        value={formData.accused_weight}
                        onChange={(e) => setFormData({...formData, accused_weight: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_eyes">Eyes</Label>
                      <Input
                        id="accused_eyes"
                        value={formData.accused_eyes}
                        onChange={(e) => setFormData({...formData, accused_eyes: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accused_id_number">Driver License / ID Number</Label>
                      <Input id="accused_id_number" value={formData.accused_id_number} onChange={(e) => setFormData({...formData, accused_id_number: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_id_state">Issuing State</Label>
                      <Input id="accused_id_state" value={formData.accused_id_state} onChange={(e) => setFormData({...formData, accused_id_state: e.target.value.toUpperCase()})} maxLength={2} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_id_expiration">ID Expiration</Label>
                      <Input id="accused_id_expiration" type="date" value={formData.accused_id_expiration} onChange={(e) => setFormData({...formData, accused_id_expiration: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accused_hair">Hair</Label>
                      <Input
                        id="accused_hair"
                        value={formData.accused_hair}
                        onChange={(e) => setFormData({...formData, accused_hair: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accused_ssn">SSN</Label>
                      <Input
                        id="accused_ssn"
                        value={formData.accused_ssn}
                        onChange={(e) => setFormData({...formData, accused_ssn: e.target.value})}
                        maxLength={11}
                        placeholder="XXX-XX-XXXX"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Charge Details</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="violation_code">Violation Code (e.g., 18.2-57)</Label>
                      <Input
                        id="violation_code"
                        value={formData.violation_code}
                        onChange={(e) => setFormData({...formData, violation_code: e.target.value})}
                        placeholder="e.g., 18.2-57"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="violation_section">Violation Section (e.g., Assault and Battery)</Label>
                      <Input
                        id="violation_section"
                        value={formData.violation_section}
                        onChange={(e) => setFormData({...formData, violation_section: e.target.value})}
                        placeholder="e.g., Assault and Battery"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="facts_basis">Facts/Basis for Belief *</Label>
                    <Textarea
                      id="facts_basis"
                      value={formData.facts_basis}
                      onChange={(e) => setFormData({...formData, facts_basis: e.target.value})}
                      placeholder="Clearly state the facts that lead to the belief a crime was committed."
                      rows={5}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="court_type">Court Type *</Label>
                    <Select
                      value={formData.court_type}
                      onValueChange={(value) => setFormData({...formData, court_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general_district">General District Court</SelectItem>
                        <SelectItem value="juvenile_domestic">Juvenile and Domestic Relations District Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Complainant Information</h3>
                  <div className="space-y-2">
                    <Label htmlFor="complainant_name">Complainant Name *</Label>
                    <Input
                      id="complainant_name"
                      value={formData.complainant_name}
                      onChange={(e) => setFormData({...formData, complainant_name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_law_enforcement"
                      checked={formData.is_law_enforcement}
                      onChange={(e) => setFormData({...formData, is_law_enforcement: e.target.checked})}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <Label htmlFor="is_law_enforcement" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Complainant is a law-enforcement officer.
                    </Label>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">Complainant Signature *</div>
                        <div className="text-xs text-slate-500">The signature line is not auto-filled with a name or unit number. The complainant must actually sign.</div>
                      </div>
                      <Button type="button" variant="outline" onClick={() => setShowSignaturePad(true)}>{formData.complainant_signature_url ? 'Replace Signature' : 'Sign Complaint'}</Button>
                    </div>
                    {formData.complainant_signature_url && <img src={formData.complainant_signature_url} alt="Complainant signature" className="mt-3 h-20 max-w-sm rounded border bg-white object-contain" />}
                  </div>
                  {showSignaturePad && <SignaturePad officerName={formData.complainant_name || 'Complainant'} onSignatureComplete={(url) => { setFormData(prev => ({ ...prev, complainant_signature_url:url, complainant_signed_at:'' })); setShowSignaturePad(false); }} onClose={() => setShowSignaturePad(false)} />}
                  {!formData.is_law_enforcement && (
                    <div className="space-y-4 border rounded-md p-4 bg-yellow-50">
                      <p className="text-sm font-medium text-yellow-800">
                        Authorization for felony arrest warrant required if not law enforcement.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="authorization_type">Authorization Type *</Label>
                        <Select
                          value={formData.authorization_type}
                          onValueChange={(value) => setFormData({...formData, authorization_type: value})}
                          required={!formData.is_law_enforcement}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="commonwealth_attorney">Commonwealth's Attorney</SelectItem>
                            <SelectItem value="law_enforcement">Law-enforcement agency having jurisdiction</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="authorization_given_by">Name of Person Authorizing Issuance of Warrant *</Label>
                        <Input
                          id="authorization_given_by"
                          value={formData.authorization_given_by}
                          onChange={(e) => setFormData({...formData, authorization_given_by: e.target.value})}
                          required={!formData.is_law_enforcement}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="authorization_date">Date and Time Authorization Given *</Label>
                        <Input
                          id="authorization_date"
                          type="datetime-local"
                          value={formData.authorization_date ? format(new Date(formData.authorization_date), "yyyy-MM-dd'T'HH:mm") : ''}
                          onChange={(e) => setFormData({...formData, authorization_date: e.target.value ? new Date(e.target.value).toISOString() : null})}
                          required={!formData.is_law_enforcement}
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <RequiredAIReportReview />
                  <Button
                    type="submit"
                    disabled={createComplaintMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {createComplaintMutation.isPending ? (editingComplaint ? 'Updating...' : 'Filing...') : (editingComplaint ? 'Update Complaint' : 'File Complaint')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <span>My Complaints ({complaintsToDisplay.length})</span>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search any complaint field: name, DOB, SSN, ID, code, facts, complaint, warrant or CAD #"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-80"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {complaintsToDisplay.map((complaint) => (
                <div key={complaint.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-red-500">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {complaint.complaint_number && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 font-mono">
                            {complaint.complaint_number}
                          </Badge>
                        )}
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          CRIMINAL COMPLAINT
                        </Badge>
                        {complaint.magistrate_disposition && (
                          <Badge className={complaint.magistrate_disposition === 'granted' ? 'bg-emerald-600' : complaint.magistrate_disposition === 'denied' ? 'bg-red-700' : 'bg-amber-600'}>
                            <Gavel className="mr-1 h-3 w-3" />MAGISTRATE {complaint.magistrate_disposition.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 mb-1">
                        Accused: {complaint.accused_first_name} {complaint.accused_last_name}
                      </p>
                      <p className="text-sm text-slate-600">
                        Offense Date: {complaint.offense_date ? format(new Date(complaint.offense_date), 'MMMM d, yyyy') : 'N/A'}
                      </p>
                      <p className="text-sm text-slate-600">
                        Violation: {complaint.violation_code}{complaint.violation_section ? ' ' + complaint.violation_section : ''}
                      </p>
                      <p className="text-sm text-slate-600">
                        Filed by: {getOfficerFullDisplay(allUsers?.find(u => String(u.id) === String(complaint.created_by_id))?.email)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mb-3 line-clamp-2">{complaint.facts_basis}</p>
                  {complaint.magistrate_disposition && (
                    <div className="mb-4 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-700">
                      <div className="font-bold text-slate-900">Magistrate disposition</div>
                      <div>{complaint.magistrate_name ? `Reviewed by ${complaint.magistrate_name}` : 'Magistrate name not entered'}{complaint.magistrate_decision_date ? ` · ${format(new Date(complaint.magistrate_decision_date), 'MMM d, yyyy h:mm a')}` : ''}</div>
                      {complaint.magistrate_disposition === 'granted' && <div className="mt-1 font-semibold text-emerald-700">Granted: {[complaint.granted_charge_code, complaint.granted_charge_description].filter(Boolean).join(' — ') || 'Charge not entered'}{complaint.magistrate_process_type ? ` · ${complaint.magistrate_process_type.toUpperCase()}` : ''}</div>}
                      {complaint.magistrate_case_number && <div>Court/process number: {complaint.magistrate_case_number}</div>}
                      {complaint.magistrate_notes && <div className="mt-1 whitespace-pre-wrap text-slate-600">{complaint.magistrate_notes}</div>}
                    </div>
                  )}
                  {dispositionComplaintId === complaint.id && (
                    <div className="mb-4 space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-slate-900">
                      <div className="flex items-center gap-2 font-bold"><Gavel className="h-5 w-5 text-amber-700" />Record Magistrate Result</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div><Label>Decision</Label><Select value={magistrateForm.magistrate_disposition} onValueChange={value => setMagistrateForm(current => ({ ...current, magistrate_disposition:value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="granted">Granted</SelectItem><SelectItem value="denied">Denied</SelectItem><SelectItem value="withdrawn">Withdrawn</SelectItem></SelectContent></Select></div>
                        <div><Label>Decision date and time</Label><Input type="datetime-local" value={magistrateForm.magistrate_decision_date} onChange={event => setMagistrateForm(current => ({ ...current, magistrate_decision_date:event.target.value }))} /></div>
                        <div><Label>Magistrate name</Label><Input value={magistrateForm.magistrate_name} onChange={event => setMagistrateForm(current => ({ ...current, magistrate_name:event.target.value }))} /></div>
                        <div><Label>Process granted</Label><Select value={magistrateForm.magistrate_process_type} onValueChange={value => setMagistrateForm(current => ({ ...current, magistrate_process_type:value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="summons">Summons</SelectItem><SelectItem value="warrant">Warrant</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                        <div><Label>Granted charge code</Label><Input value={magistrateForm.granted_charge_code} onChange={event => setMagistrateForm(current => ({ ...current, granted_charge_code:event.target.value }))} /></div>
                        <div><Label>Granted charge description</Label><Input value={magistrateForm.granted_charge_description} onChange={event => setMagistrateForm(current => ({ ...current, granted_charge_description:event.target.value }))} /></div>
                        <div className="md:col-span-2"><Label>Court, warrant or summons number</Label><Input value={magistrateForm.magistrate_case_number} onChange={event => setMagistrateForm(current => ({ ...current, magistrate_case_number:event.target.value }))} /></div>
                        <div className="md:col-span-2"><Label>Notes</Label><Textarea value={magistrateForm.magistrate_notes} onChange={event => setMagistrateForm(current => ({ ...current, magistrate_notes:event.target.value }))} rows={3} /></div>
                      </div>
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDispositionComplaintId(null)}>Cancel</Button><Button type="button" className="bg-amber-700 hover:bg-amber-800" disabled={magistrateMutation.isPending} onClick={() => magistrateMutation.mutate({ complaintId:complaint.id, values:magistrateForm })}>{magistrateMutation.isPending ? 'Saving…' : 'Save Magistrate Result'}</Button></div>
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t-2 border-slate-300">
                    <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                    <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                      {getOfficerSignature(allUsers?.find(u => String(u.id) === String(complaint.created_by_id))?.email)}
                    </p>
                    {complaint.officer_ip_address && complaint.created_date && (
                      <p className="text-xs text-slate-400 mt-1">
                        IP: {complaint.officer_ip_address} | Signed: {formatReportDateTime(complaint.created_date, resolveReportTimeZone(locations?.find(location => location.site_name === complaint.location)))}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {(isAdmin || recordBelongsToDirectoryUser(user, complaint)) && complaint.status !== 'approved' && (
                      <Button type="button" size="sm" variant="outline" onClick={() => editComplaint(complaint)}><Pencil className="w-4 h-4 mr-2" />Edit Complaint</Button>
                    )}
                    <Button type="button" size="sm" className="bg-amber-700 hover:bg-amber-800" onClick={() => openMagistrateResult(complaint)}>
                      <Gavel className="w-4 h-4 mr-2" />Record Magistrate Result
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printComplaint(complaint)}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print
                    </Button>
                  </div>
                </div>
              ))}
              {historyLoading && <p className="text-center text-slate-500 py-8">Loading complaint history…</p>}
              {!historyLoading && complaintsToDisplay.length === 0 && (
                <p className="text-center text-slate-500 py-8">
                  {searchQuery ? 'No complaints found matching your search.' : 'No complaints filed yet.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}