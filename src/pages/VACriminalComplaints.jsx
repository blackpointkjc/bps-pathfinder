// This is the same as the existing CriminalComplaints page - renamed to VA Criminal Complaints
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Clock, Printer, AlertTriangle, Camera } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import IDScanner from "../components/IDScanner";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { openVirginiaCriminalComplaintPrint } from '@/utils/virginiaCriminalComplaintPrint';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';

export default function VACriminalComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showIDScanner, setShowIDScanner] = useState(false);
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
    queryFn: () => base44.auth.me(),
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

  const { data: allComplaints } = useQuery({
    queryKey: ['allCriminalComplaints'],
    queryFn: () => base44.entities.CriminalComplaint.list('-created_date'),
    enabled: !!user,
    initialData: [],
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
      : allComplaints.filter(complaint => String(complaint.created_by_id || '') === String(user.id));
    
    if (!searchQuery.trim()) return userComplaints;
    
    const query = searchQuery.toLowerCase();
    return userComplaints.filter(complaint => 
      complaint.accused_first_name?.toLowerCase().includes(query) ||
      complaint.accused_last_name?.toLowerCase().includes(query) ||
      complaint.accused_dob?.includes(query) ||
      complaint.accused_ssn?.includes(query) ||
      complaint.complaint_number?.toLowerCase().includes(query)
    );
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
      alert('✅ Criminal complaint filed successfully!');
      resetForm();
    },
    onError: (error) => {
      console.error('Error creating complaint:', error);
      alert('❌ Failed to file complaint. Please try again. Error: ' + error.message);
    },
  });

  const resetForm = () => {
    setShowForm(false);
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
      signatureName: getOfficerFullDisplay(officerInfo?.email),
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
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">VA Criminal Complaints</h1>
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
                    {createComplaintMutation.isPending ? 'Filing...' : 'File Complaint'}
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
                  placeholder="Search by name, DOB, SSN, or complaint #"
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
                  <div className="mt-4 pt-4 border-t-2 border-slate-300">
                    <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                    <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                      {getOfficerSignature(allUsers?.find(u => String(u.id) === String(complaint.created_by_id))?.email)}
                    </p>
                    {complaint.officer_ip_address && complaint.created_date && (
                      <p className="text-xs text-slate-400 mt-1">
                        IP: {complaint.officer_ip_address} | Signed (Zulu): {new Date(complaint.created_date).toISOString().replace('T', ' ').substring(0, 19)}Z
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
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
              {complaintsToDisplay.length === 0 && (
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