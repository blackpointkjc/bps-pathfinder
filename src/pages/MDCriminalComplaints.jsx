import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus, Clock, Printer, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function MDCriminalComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    district_court_city_county: "",
    court_address: "",
    related_cases: "",
    cc_number: "",
    complainant_printed_name: "",
    complainant_address: "",
    complainant_city_state_zip: "",
    complainant_telephone: "",
    complainant_agency_sub_agency_id: "",
    defendant_printed_name: "",
    defendant_address: "",
    defendant_city_state_zip: "",
    defendant_telephone: "",
    defendant_cc_number: "",
    defendant_dl_number: "",
    defendant_sex: "",
    defendant_race: "",
    defendant_height: "",
    defendant_weight: "",
    defendant_hair: "",
    defendant_eyes: "",
    defendant_complexion: "",
    defendant_other: "",
    defendant_dob: "",
    defendant_id: "",
    offense_date: format(new Date(), 'yyyy-MM-dd'),
    offense_time: format(new Date(), 'HH:mm'),
    offense_place: "",
    statement_of_facts: "",
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
    queryKey: ['allMDCriminalComplaints'],
    queryFn: () => base44.entities.MDCriminalComplaint.list('-created_date'),
    enabled: !!user,
    initialData: [],
  });

  const complaintsToDisplay = React.useMemo(() => {
    if (!allComplaints || !user) return [];
    
    const userComplaints = isAdmin 
      ? allComplaints 
      : allComplaints.filter(complaint => String(complaint.created_by_id || '') === String(user.id));
    
    if (!searchQuery.trim()) return userComplaints;
    
    const query = searchQuery.toLowerCase();
    return userComplaints.filter(complaint => 
      complaint.defendant_printed_name?.toLowerCase().includes(query) ||
      complaint.defendant_dob?.includes(query) ||
      complaint.complaint_number?.toLowerCase().includes(query) ||
      complaint.cc_number?.toLowerCase().includes(query)
    );
  }, [allComplaints, user, isAdmin, searchQuery]);

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations', 'mdCriminalComplaints', user?.division || 'all'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      const activeLocations = allLocations.filter(loc => loc.active);
      
      // Filter by division if user has one
      if (user?.division) {
        return activeLocations.filter(loc => loc.division === user.division);
      }
      
      return activeLocations;
    },
    enabled: !!user,
    initialData: [],
  });

  const agencyId = user ? `Black Point Protection - ${user.unit_number || user.badge_number || ''}` : "";

  useEffect(() => {
    if (user) {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      setFormData(prev => ({
        ...prev,
        complainant_printed_name: fullName,
        complainant_agency_sub_agency_id: agencyId
      }));
    }
  }, [user]);

  const generateComplaintNumber = () => {
    const formDate = format(new Date(formData.offense_date), 'yyyyMMdd');
    const existingToday = allComplaints?.filter(c => c.complaint_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(4, '0');
    return `MDCC-${formDate}-${nextNum}`;
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
      
      const complaintData = { 
        ...data, 
        complaint_number: complaintNumber,
        status: 'submitted',
        officer_ip_address: ipAddress,
      };
      return await base44.entities.MDCriminalComplaint.create(complaintData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMDCriminalComplaints'] });
      alert('✅ Maryland criminal complaint filed successfully!');
      resetForm();
    },
    onError: (error) => {
      console.error('Error creating complaint:', error);
      alert('❌ Failed to file complaint. Please try again.');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    const fullName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : "";
    
    setFormData({
      district_court_city_county: "",
      court_address: "",
      related_cases: "",
      cc_number: "",
      complainant_printed_name: fullName,
      complainant_address: "",
      complainant_city_state_zip: "",
      complainant_telephone: "",
      complainant_agency_sub_agency_id: agencyId,
      defendant_printed_name: "",
      defendant_address: "",
      defendant_city_state_zip: "",
      defendant_telephone: "",
      defendant_cc_number: "",
      defendant_dl_number: "",
      defendant_sex: "",
      defendant_race: "",
      defendant_height: "",
      defendant_weight: "",
      defendant_hair: "",
      defendant_eyes: "",
      defendant_complexion: "",
      defendant_other: "",
      defendant_dob: "",
      defendant_id: "",
      offense_date: format(new Date(), 'yyyy-MM-dd'),
      offense_time: format(new Date(), 'HH:mm'),
      offense_place: "",
      statement_of_facts: "",
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createComplaintMutation.mutate(formData);
  };

  const getOfficerSignature = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
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
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const offenseFormatted = complaint.offense_date ? format(new Date(complaint.offense_date), 'MM/dd/yyyy') : '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MD Criminal Complaint - ${complaint.complaint_number}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.15; color: #000; }
          
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
          
          .form-container { border: 3px solid #000; padding: 15px; }
          .header-row { display: grid; grid-template-columns: 3fr 2fr 2fr; gap: 10px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .header-cell { font-size: 9pt; font-weight: bold; }
          .gray-box { background: #d3d3d3; padding: 8px; text-align: center; font-weight: bold; border: 1px solid #000; }
          
          .two-section { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
          .section-header { font-weight: bold; font-size: 11pt; text-align: center; padding: 5px 0; }
          
          .field { margin: 4px 0; }
          .field-label { font-size: 8pt; font-weight: bold; }
          .field-value { border-bottom: 1px solid #000; padding: 3px 0; min-height: 18px; font-size: 9pt; }
          
          .description-row { margin: 6px 0; font-size: 8pt; }
          .description-value { border-bottom: 1px solid #000; padding: 2px 0; display: inline-block; min-width: 100px; }
          
          .statement-section { margin: 15px 0; }
          .statement-title { font-size: 10pt; font-weight: bold; margin-bottom: 8px; }
          .statement-box { border: 2px solid #000; min-height: 180px; padding: 10px; white-space: pre-wrap; }
          
          .affirmation { margin: 12px 0; font-size: 9pt; }
          .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 10px 0; }
          .sig-line { border-bottom: 2px solid #000; min-height: 30px; padding-top: 5px; }
          .sig-label { font-size: 7pt; }
          
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 2px solid #000; font-size: 8pt; }
          .tracking { text-align: center; background: #f0f0f0; border: 2px solid #000; padding: 8px; margin-top: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="form-container">
          <div class="header-row">
            <div>
              <div class="header-cell">DISTRICT COURT OF MARYLAND FOR</div>
              <div class="field-value">${complaint.district_court_city_county || ''}</div>
              <div class="header-cell" style="margin-top: 5px;">LOCATED AT (COURT ADDRESS)</div>
              <div class="field-value">${complaint.court_address || ''}</div>
            </div>
            <div class="gray-box">
              DISTRICT COURT<br/>CASE NUMBER<br/>
              <div style="min-height: 25px; margin-top: 5px;"></div>
            </div>
            <div>
              <div class="header-cell">RELATED CASES:</div>
              <div class="field-value">${complaint.related_cases || ''}</div>
            </div>
          </div>
          
          <div class="two-section">
            <div>
              <div class="section-header">COMPLAINANT</div>
              <div class="field">
                <div class="field-label">Printed Name</div>
                <div class="field-value">${complaint.complainant_printed_name || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">Address</div>
                <div class="field-value">${complaint.complainant_address || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">City, State, Zip</div>
                <div class="field-value">${complaint.complainant_city_state_zip || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">Telephone</div>
                <div class="field-value">${complaint.complainant_telephone || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">Agency, Sub-agency, and I.D. # (Officer Only)</div>
                <div class="field-value">${complaint.complainant_agency_sub_agency_id || ''}</div>
              </div>
            </div>
            
            <div>
              <div class="section-header">DEFENDANT</div>
              <div class="field">
                <div class="field-label">Printed Name</div>
                <div class="field-value">${complaint.defendant_printed_name || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">Address</div>
                <div class="field-value">${complaint.defendant_address || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">City, State, Zip</div>
                <div class="field-value">${complaint.defendant_city_state_zip || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">Telephone</div>
                <div class="field-value">${complaint.defendant_telephone || ''}</div>
              </div>
              <div class="field">
                <div class="field-label">CC#</div>
                <div class="field-value">${complaint.defendant_cc_number || ''}</div>
              </div>
            </div>
          </div>
          
          <div class="description-row">
            <strong>DEFENDANT'S DESCRIPTION:</strong> 
            Driver's License # <span class="description-value">${complaint.defendant_dl_number || ''}</span>
            Sex <span class="description-value">${complaint.defendant_sex || ''}</span>
            Race <span class="description-value">${complaint.defendant_race || ''}</span>
            Ht <span class="description-value">${complaint.defendant_height || ''}</span>
            Wt <span class="description-value">${complaint.defendant_weight || ''}</span>
          </div>
          <div class="description-row">
            Hair <span class="description-value">${complaint.defendant_hair || ''}</span>
            Eyes <span class="description-value">${complaint.defendant_eyes || ''}</span>
            Complexion <span class="description-value">${complaint.defendant_complexion || ''}</span>
            Other <span class="description-value">${complaint.defendant_other || ''}</span>
            DOB <span class="description-value">${complaint.defendant_dob || ''}</span>
            ID <span class="description-value">${complaint.defendant_id || ''}</span>
          </div>
          
          <div class="statement-section">
            <div class="statement-title">APPLICATION FOR STATEMENT OF CHARGES</div>
            <p style="font-size: 8pt; margin-bottom: 8px;">
              (Include a statement of facts within your personal knowledge showing that there is probable cause to believe that a crime has been committed and that the defendant has committed it.)
            </p>
            <p style="font-size: 8pt; margin-bottom: 8px;">
              <strong>NOTICE: DO NOT INCLUDE ANY IDENTIFYING INFORMATION OF A MINOR VICTIM WITHIN THIS FORM.</strong>
            </p>
            <p style="font-size: 9pt; margin-bottom: 8px;">
              I, the undersigned, apply for a statement of charges and a summons or warrant which may lead to the arrest of the above-named defendant because on or about
              <span style="border-bottom: 1px solid #000; display: inline-block; min-width: 120px; padding: 0 5px;"> ${offenseFormatted} </span>
              <span style="font-size: 7pt;">Date</span>
              at <span style="border-bottom: 1px solid #000; display: inline-block; min-width: 200px; padding: 0 5px;"> ${complaint.offense_place || ''} </span>
              <span style="font-size: 7pt;">Place</span>
              , the above-named defendant
            </p>
            <div class="statement-box">${complaint.statement_of_facts || ''}</div>
            <p style="font-size: 7pt; margin-top: 5px;">(Continued on attached pages) (DC-CR-001A)</p>
          </div>
          
          <div class="affirmation">
            <p><strong>I solemnly affirm under the penalties of perjury that the contents of this document are true to the best of my knowledge, information, and belief.</strong></p>
          </div>
          
          <div class="signature-grid">
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Date</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Officer's Signature</div>
              <div class="field-value" style="border: none; padding-top: 5px;">${complaint.complainant_printed_name || ''}</div>
              <div class="sig-label">Printed Name</div>
            </div>
          </div>
          
          <p style="font-size: 9pt; margin: 10px 0;">I have read or had read to me and I understand the notice on the back of this form.</p>
          
          <div class="signature-grid">
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Date</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Applicant's Signature</div>
              <div class="field-value" style="border: none;"></div>
              <div class="sig-label">Printed Name</div>
            </div>
          </div>
          
          <div style="margin: 12px 0; font-size: 9pt;">
            Subscribed and sworn to before me at 
            <span style="margin-left: 20px;">☐ AM ☐ PM</span>
          </div>
          
          <div class="signature-grid">
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Date</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div class="sig-label">Time</div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 10px;">
            <div class="sig-line" style="width: 60%; margin: 0 auto;"></div>
            <div class="sig-label">Judge/Commissioner</div>
            <div style="font-size: 7pt; margin-top: 5px;">I.D. Number _________________</div>
          </div>
          
          <div class="tracking">
            <div>TRACKING NUMBER</div>
            <div style="min-height: 20px; margin-top: 5px;">${complaint.tracking_number || ''}</div>
          </div>
          
          <div class="footer">
            <p style="margin-top: 3px; color: #666;">DC-CR-001 (Rev. 10/2024) | Complaint #: ${complaint.complaint_number || ''}</p>
            ${complaint.officer_ip_address ? `<p style="color: #666;">Officer IP: ${complaint.officer_ip_address}</p>` : ''}
          </div>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
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
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">MD Criminal Complaints</h1>
            <p className="text-sm md:text-base text-slate-600">File Maryland criminal complaints (DC-CR-001)</p>
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
              You must be clocked in to file a criminal complaint.
            </AlertDescription>
          </Alert>
        )}

        {showForm && canSubmit && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                New Maryland Criminal Complaint (DC-CR-001)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-medium">
                    This form creates an official Maryland criminal complaint. All fields marked with * are required.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Court Information</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="district_court">District Court of Maryland For (City/County) *</Label>
                      <Input
                        id="district_court"
                        value={formData.district_court_city_county}
                        onChange={(e) => setFormData({...formData, district_court_city_county: e.target.value})}
                        placeholder="e.g., Baltimore City"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="court_address">Court Address *</Label>
                      <Input
                        id="court_address"
                        value={formData.court_address}
                        onChange={(e) => setFormData({...formData, court_address: e.target.value})}
                        placeholder="Court location address"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cc_number">CC# (if known)</Label>
                      <Input
                        id="cc_number"
                        value={formData.cc_number}
                        onChange={(e) => setFormData({...formData, cc_number: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="related_cases">Related Cases</Label>
                      <Input
                        id="related_cases"
                        value={formData.related_cases}
                        onChange={(e) => setFormData({...formData, related_cases: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Complainant Information</h3>
                  <div className="space-y-2">
                    <Label htmlFor="comp_name">Printed Name *</Label>
                    <Input
                      id="comp_name"
                      value={formData.complainant_printed_name}
                      onChange={(e) => setFormData({...formData, complainant_printed_name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="comp_address">Address</Label>
                      <Input
                        id="comp_address"
                        value={formData.complainant_address}
                        onChange={(e) => setFormData({...formData, complainant_address: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comp_city">City, State, Zip</Label>
                      <Input
                        id="comp_city"
                        value={formData.complainant_city_state_zip}
                        onChange={(e) => setFormData({...formData, complainant_city_state_zip: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="comp_phone">Telephone</Label>
                      <Input
                        id="comp_phone"
                        value={formData.complainant_telephone}
                        onChange={(e) => setFormData({...formData, complainant_telephone: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comp_agency">Agency, Sub-agency, and I.D. #</Label>
                      <Input
                        id="comp_agency"
                        value={formData.complainant_agency_sub_agency_id}
                        onChange={(e) => setFormData({...formData, complainant_agency_sub_agency_id: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Defendant Information</h3>
                  <div className="space-y-2">
                    <Label htmlFor="def_name">Defendant's Printed Name *</Label>
                    <Input
                      id="def_name"
                      value={formData.defendant_printed_name}
                      onChange={(e) => setFormData({...formData, defendant_printed_name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="def_address">Address</Label>
                      <Input
                        id="def_address"
                        value={formData.defendant_address}
                        onChange={(e) => setFormData({...formData, defendant_address: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_city">City, State, Zip</Label>
                      <Input
                        id="def_city"
                        value={formData.defendant_city_state_zip}
                        onChange={(e) => setFormData({...formData, defendant_city_state_zip: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="def_phone">Telephone</Label>
                      <Input
                        id="def_phone"
                        value={formData.defendant_telephone}
                        onChange={(e) => setFormData({...formData, defendant_telephone: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_cc">CC#</Label>
                      <Input
                        id="def_cc"
                        value={formData.defendant_cc_number}
                        onChange={(e) => setFormData({...formData, defendant_cc_number: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Defendant Description</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="def_dl">Driver's License #</Label>
                      <Input
                        id="def_dl"
                        value={formData.defendant_dl_number}
                        onChange={(e) => setFormData({...formData, defendant_dl_number: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_sex">Sex</Label>
                      <Input
                        id="def_sex"
                        value={formData.defendant_sex}
                        onChange={(e) => setFormData({...formData, defendant_sex: e.target.value})}
                        placeholder="M/F"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_race">Race</Label>
                      <Input
                        id="def_race"
                        value={formData.defendant_race}
                        onChange={(e) => setFormData({...formData, defendant_race: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="def_height">Height</Label>
                      <Input
                        id="def_height"
                        value={formData.defendant_height}
                        onChange={(e) => setFormData({...formData, defendant_height: e.target.value})}
                        placeholder="5'10&quot;"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_weight">Weight</Label>
                      <Input
                        id="def_weight"
                        value={formData.defendant_weight}
                        onChange={(e) => setFormData({...formData, defendant_weight: e.target.value})}
                        placeholder="lbs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_hair">Hair</Label>
                      <Input
                        id="def_hair"
                        value={formData.defendant_hair}
                        onChange={(e) => setFormData({...formData, defendant_hair: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_eyes">Eyes</Label>
                      <Input
                        id="def_eyes"
                        value={formData.defendant_eyes}
                        onChange={(e) => setFormData({...formData, defendant_eyes: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="def_complexion">Complexion</Label>
                      <Input
                        id="def_complexion"
                        value={formData.defendant_complexion}
                        onChange={(e) => setFormData({...formData, defendant_complexion: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_dob">Date of Birth</Label>
                      <Input
                        id="def_dob"
                        type="date"
                        value={formData.defendant_dob}
                        onChange={(e) => setFormData({...formData, defendant_dob: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="def_id">ID Number</Label>
                      <Input
                        id="def_id"
                        value={formData.defendant_id}
                        onChange={(e) => setFormData({...formData, defendant_id: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="def_other">Other Identifying Information</Label>
                    <Input
                      id="def_other"
                      value={formData.defendant_other}
                      onChange={(e) => setFormData({...formData, defendant_other: e.target.value})}
                      placeholder="Tattoos, scars, etc."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Offense Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="offense_date">Date of Offense *</Label>
                      <Input
                        id="offense_date"
                        type="date"
                        value={formData.offense_date}
                        onChange={(e) => setFormData({...formData, offense_date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="offense_time">Time of Offense</Label>
                      <Input
                        id="offense_time"
                        type="time"
                        value={formData.offense_time}
                        onChange={(e) => setFormData({...formData, offense_time: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="offense_place">Place of Offense *</Label>
                      <Input
                        id="offense_place"
                        value={formData.offense_place}
                        onChange={(e) => setFormData({...formData, offense_place: e.target.value})}
                        placeholder="Specific location"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statement_of_facts">Statement of Facts (Probable Cause) *</Label>
                    <Textarea
                      id="statement_of_facts"
                      value={formData.statement_of_facts}
                      onChange={(e) => setFormData({...formData, statement_of_facts: e.target.value})}
                      placeholder="Include a statement of facts within your personal knowledge (what you saw or heard, what someone said to you, etc.) showing that there is probable cause to believe that a crime has been committed and that the defendant has committed it."
                      rows={8}
                      required
                    />
                    <p className="text-xs text-red-600 font-medium">
                      NOTICE: DO NOT INCLUDE ANY IDENTIFYING INFORMATION OF A MINOR VICTIM WITHIN THIS FORM.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
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
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <span>My MD Complaints ({complaintsToDisplay.length})</span>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name, DOB, or complaint #"
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
                        {complaint.cc_number && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 font-mono">
                            CC# {complaint.cc_number}
                          </Badge>
                        )}
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          MD CRIMINAL COMPLAINT
                        </Badge>
                      </div>
                      <p className="font-semibold text-slate-900 mb-1">
                        Defendant: {complaint.defendant_printed_name}
                      </p>
                      <p className="text-sm text-slate-600">
                        Offense Date: {complaint.offense_date ? format(new Date(complaint.offense_date), 'MMMM d, yyyy') : 'N/A'}
                      </p>
                      <p className="text-sm text-slate-600">
                        Filed by: {getOfficerSignature(complaint.created_by_id || complaint.created_by)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mb-3 line-clamp-2">{complaint.statement_of_facts}</p>
                  <div className="mt-4 pt-4 border-t-2 border-slate-300">
                    <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                    <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                      {getOfficerSignature(complaint.created_by_id || complaint.created_by)}
                    </p>
                    {complaint.officer_ip_address && complaint.created_date && (
                      <p className="text-xs text-slate-400 mt-1">
                        IP: {complaint.officer_ip_address} | Signed: {format(new Date(complaint.created_date), 'MMM d, yyyy h:mm a')}
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