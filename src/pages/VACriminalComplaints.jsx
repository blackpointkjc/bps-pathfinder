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

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/c29aab328_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

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
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { created_by: user.email },
        '-created_date',
        1
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user,
  });

  const canSubmit = isAdmin || !!activeEntry;
  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  const { data: allComplaints } = useQuery({
    queryKey: ['allCriminalComplaints'],
    queryFn: () => base44.entities.CriminalComplaint.list('-created_date'),
    enabled: !!user,
    initialData: [],
  });

  // Real-time sync across devices
  useEffect(() => {
    if (!user) return;
    const unsubscribe = base44.entities.CriminalComplaint.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['allCriminalComplaints'] });
    });
    return unsubscribe;
  }, [user, queryClient]);

  const complaintsToDisplay = React.useMemo(() => {
    if (!allComplaints || !user) return [];
    
    const userComplaints = isAdmin 
      ? allComplaints 
      : allComplaints.filter(complaint => complaint.created_by === user.email);
    
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
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await base44.entities.Location.list('site_name');
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

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
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
    const printWindow = window.open('', '', 'width=1100,height=850');
    
    const siteLocation = locations?.find(loc => loc.site_name === complaint.location);
    const displayLocation = siteLocation?.address || complaint.location;
    const officerInfo = allUsers?.find(u => u.email === complaint.created_by);
    const officerFullName = officerInfo ? `${officerInfo.first_name || ''} ${officerInfo.last_name || ''}`.trim() : 'Officer';
    
    // Convert to Zulu time
    const toZulu = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
    };
    
    const dobFormatted = complaint.accused_dob ? format(new Date(complaint.accused_dob), 'MM/dd/yyyy') : '';
    const offenseFormatted = complaint.offense_date ? format(new Date(complaint.offense_date), 'MM/dd/yyyy') : '';
    const offenseTimeZulu = complaint.offense_time ? complaint.offense_time + 'Z' : '';
    const generatedZulu = toZulu(new Date());
    const authDateZulu = complaint.authorization_date ? toZulu(complaint.authorization_date) : '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>FORM DC-31 Criminal Complaint - ${complaint.complaint_number}</title>
        <style>
          @page { size: 11in 8.5in landscape; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 7.5pt; line-height: 1.15; color: #000; }
          
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
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover { background: #1e3a8a; }
          
          .page-container { display: grid; grid-template-columns: 2.2fr 1fr; gap: 12px; border: 3px solid #000; padding: 12px; }
          .left-column { border-right: 2px solid #000; padding-right: 12px; }
          .right-column { padding-left: 12px; }
          
          .form-number { text-align: right; font-size: 7pt; margin-bottom: 3px; }
          .form-title { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 3px; }
          .form-subtitle { text-align: center; font-size: 8pt; margin-bottom: 8px; }
          .cw-header { font-weight: bold; font-size: 9pt; margin-bottom: 8px; }
          
          .court-checkboxes { margin: 8px 0; }
          .checkbox { display: inline-block; width: 14px; height: 14px; border: 2px solid #000; margin-right: 5px; text-align: center; line-height: 12px; font-weight: bold; vertical-align: middle; }
          
          .field-group { margin: 8px 0; }
          .underline { border-bottom: 1px dotted #000; display: inline-block; min-width: 150px; padding: 2px 5px; }
          
          .facts-section { margin: 12px 0; }
          .facts-box { border: 2px solid #000; min-height: 140px; padding: 8px; margin: 8px 0; white-space: pre-wrap; font-size: 8.5pt; }
          
          .notice-text { font-size: 8.5pt; margin: 10px 0; line-height: 1.4; }
          .bullet-item { margin-left: 20px; margin-top: 3px; }
          
          .signature-area { margin-top: 12px; border-top: 1px solid #000; padding-top: 10px; }
          .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 8px; }
          .sig-box { }
          .sig-label { font-size: 7pt; font-weight: bold; margin-bottom: 3px; }
          .sig-line { border-bottom: 2px solid #000; min-height: 35px; padding-top: 8px; }
          
          .sworn-section { margin-top: 15px; font-size: 8.5pt; }
          .sworn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 8px; }
          
          .right-box { border: 3px double #000; padding: 8px; margin-bottom: 12px; }
          .right-title { text-align: center; font-weight: bold; font-size: 11pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
          
          .accused-section { margin: 8px 0; }
          .accused-name { border-bottom: 1px dotted #000; padding: 5px 0; font-size: 9pt; font-weight: bold; min-height: 20px; }
          .accused-address { border-bottom: 1px dotted #000; padding: 5px 0; font-size: 8pt; min-height: 35px; }
          
          .data-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 7pt; }
          .data-table td { border: 1px solid #000; padding: 2px 4px; text-align: center; }
          .data-table .label-row { background: #f0f0f0; font-weight: bold; }
          
          .auth-section { margin-top: 12px; font-size: 7.5pt; line-height: 1.3; }
          .auth-checkbox-row { margin: 5px 0; margin-left: 20px; }
          .auth-field { border-bottom: 1px dotted #000; margin-top: 8px; padding: 3px 0; min-height: 18px; }
          
          .footer { text-align: center; margin-top: 8px; font-size: 7pt; border-top: 2px solid #000; padding-top: 4px; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="form-number">FORM DC-311 REVISED 07/11</div>
        
        <div class="page-container">
          <div class="left-column">
            <div class="form-title">CRIMINAL COMPLAINT</div>
            <div class="form-subtitle">RULES 3A:3 AND 7C:3</div>
            
            <div class="cw-header">Commonwealth of Virginia</div>
            
            <div class="court-checkboxes">
              <div>
                <span class="checkbox">${complaint.court_type === 'general_district' ? '✓' : ''}</span>
                General District Court
              </div>
              <div style="margin-top: 3px;">
                <span class="checkbox">${complaint.court_type === 'juvenile_domestic' ? '✓' : ''}</span>
                Juvenile and Domestic Relations District Court
              </div>
            </div>
            
            <div class="field-group">
              <span style="font-size: 7pt; font-weight: bold;">CITY OR COUNTY</span>
              <div style="border-bottom: 1px dotted #000; padding: 3px 0;">${complaint.location?.toUpperCase() || ''}</div>
            </div>
            
            <div style="margin: 12px 0; font-size: 8.5pt; line-height: 1.4;">
              <p>Under penalty of perjury, I, the undersigned Complainant swear or affirm that I have reason to believe that the Accused committed a criminal offense, on or about</p>
            </div>
            
            <div style="margin: 8px 0; text-align: center;">
              <span style="border-bottom: 1px dotted #000; display: inline-block; min-width: 180px; padding: 3px 10px;">${offenseFormatted}</span>
            </div>
            
            <div style="font-size: 7pt; font-weight: bold; text-align: center; margin: 5px 0;">DATE OFFENSE OCCURRED</div>
            
            <div style="margin: 8px 0; font-size: 8.5pt;">
              in the 
              <span class="checkbox">${complaint.location_type === 'city' ? '✓' : ''}</span> City
              <span class="checkbox">${complaint.location_type === 'county' ? '✓' : ''}</span> County
              <span class="checkbox">${complaint.location_type === 'town' ? '✓' : ''}</span> Town
            </div>
            
            <div style="margin: 8px 0;">
              <span style="font-size: 8.5pt;">of </span>
              <span style="border-bottom: 1px dotted #000; display: inline-block; min-width: 500px; padding: 3px 5px;">${displayLocation}</span>
            </div>
            
            <div class="facts-section">
              <p style="font-size: 8.5pt; font-weight: bold; margin-bottom: 5px;">I base my belief on the following facts: (Print ALL information clearly.)</p>
              <div class="facts-box">${complaint.facts_basis || ''}</div>
            </div>
            
            <div class="notice-text">
              <p><strong>The statements above are true and accurate to the best of my knowledge and belief.</strong></p>
              <p style="margin-top: 6px;">In making this complaint, I have read and fully understand the following:</p>
              <div class="bullet-item">• By swearing to these facts, I agree to appear in court and testify if a warrant or summons is issued.</div>
              <div class="bullet-item">• The charge in this warrant cannot be dismissed except by the court, even at my request.</div>
            </div>
            
            <div class="signature-area">
              <div class="sig-grid">
              <div class="sig-box">
                <div class="sig-label">NAME OF COMPLAINANT (LAST, FIRST, MIDDLE)</div>
                <div class="sig-label">(PRINT CLEARLY)</div>
                <div style="border-bottom: 1px solid #000; padding: 8px 0; font-weight: bold; font-size: 10pt; min-height: 30px;">
                  ${(() => {
                    const officer = allUsers?.find(u => u.email === complaint.created_by);
                    if (officer?.last_name && officer?.first_name) {
                      return `${officer.last_name.toUpperCase()}, ${officer.first_name}${officer.middle_name ? ' ' + officer.middle_name : ''}`;
                    }
                    return complaint.complainant_name || 'Officer';
                  })()}
                </div>
              </div>
                <div class="sig-box">
                  <div class="sig-label">SIGNATURE OF COMPLAINANT</div>
                  <div class="sig-line"></div>
                </div>
              </div>
            </div>
            
            <div class="sworn-section">
              <p>Subscribed and sworn to before me this day.</p>
              <div class="sworn-grid">
                <div>
                  <div class="sig-label">DATE AND TIME</div>
                  <div style="border-bottom: 1px solid #000; padding: 5px 0; min-height: 25px;"></div>
                </div>
                <div>
                  <div style="border-bottom: 1px solid #000; padding: 5px 0; min-height: 25px;"></div>
                  <div style="text-align: right; margin-top: 3px; font-size: 7pt;">
                    <span class="checkbox"></span> CLERK
                    <span class="checkbox"></span> MAGISTRATE
                    <span class="checkbox"></span> JUDGE
                  </div>
                </div>
              </div>
            </div>
            
            <div style="margin-top: 8px; font-size: 7pt;">FORM DC-311 REVISED 07/11</div>
          </div>
          
          <div class="right-column">
            <div class="right-box">
              <div class="right-title">CRIMINAL COMPLAINT</div>
              
              <div class="accused-section">
                <div style="font-size: 7pt; font-weight: bold; margin-bottom: 3px;">ACCUSED: Name, Description, Address/Location</div>
                <div class="accused-name">
                  ${complaint.accused_last_name || ''}, ${complaint.accused_first_name || ''} ${complaint.accused_middle_name || ''}
                </div>
                <div style="font-size: 6pt; font-weight: bold; margin-top: 5px; margin-bottom: 2px;">LAST NAME, FIRST NAME, MIDDLE NAME</div>
              </div>
              
              <div class="accused-address">${complaint.accused_address || ''}</div>
              
              <table class="data-table">
                <tr class="label-row">
                  <td colspan="6" style="background: #e0e0e0; font-weight: bold; font-size: 7pt;">COMPLETE DATA BELOW IF KNOWN</td>
                </tr>
                <tr>
                  <td rowspan="2" style="width: 12%;"><strong>RACE</strong></td>
                  <td rowspan="2" style="width: 12%;"><strong>SEX</strong></td>
                  <td colspan="2" style="background: #f5f5f5;"><strong>BORN</strong></td>
                  <td colspan="2" style="background: #f5f5f5;"><strong>HT.</strong></td>
                </tr>
                <tr>
                  <td style="width: 12%;"><strong>MO.</strong></td>
                  <td style="width: 20%;"><strong>DAY | YR.</strong></td>
                  <td style="width: 12%;"><strong>FT.</strong></td>
                  <td style="width: 12%;"><strong>IN.</strong></td>
                </tr>
                <tr style="font-size: 9pt;">
                  <td>${complaint.accused_race || ''}</td>
                  <td>${complaint.accused_sex?.charAt(0).toUpperCase() || ''}</td>
                  <td>${dobFormatted ? dobFormatted.split('/')[0] : ''}</td>
                  <td>${dobFormatted ? dobFormatted.split('/')[1] + ' | ' + dobFormatted.split('/')[2] : ''}</td>
                  <td>${complaint.accused_height_ft || ''}</td>
                  <td>${complaint.accused_height_in || ''}</td>
                </tr>
                <tr>
                  <td colspan="2"><strong>WGT.</strong><br/><span style="font-size: 9pt;">${complaint.accused_weight || ''}</span></td>
                  <td colspan="2"><strong>EYES</strong><br/><span style="font-size: 9pt;">${complaint.accused_eyes || ''}</span></td>
                  <td colspan="2"><strong>HAIR</strong><br/><span style="font-size: 9pt;">${complaint.accused_hair || ''}</span></td>
                </tr>
                <tr>
                  <td colspan="6"><strong>SSN</strong><br/><span style="font-size: 9pt;">${complaint.accused_ssn || ''}</span></td>
                </tr>
              </table>
            </div>
            
            <div class="auth-section">
              <div>
                <span class="checkbox">${complaint.is_law_enforcement === false ? '✓' : ''}</span>
                <span style="font-size: 8pt;">Complainant is not a law-enforcement officer or animal control officer. Authorization prior to issuance of felony arrest warrant given by</span>
              </div>
              
              <div class="auth-checkbox-row">
                <span class="checkbox">${complaint.is_law_enforcement === false && complaint.authorization_type === 'commonwealth_attorney' ? '✓' : ''}</span>
                Commonwealth's attorney
              </div>
              <div class="auth-checkbox-row">
                <span class="checkbox">${complaint.is_law_enforcement === false && complaint.authorization_type === 'law_enforcement' ? '✓' : ''}</span>
                Law-enforcement agency having jurisdiction over alleged offense
              </div>
              
              <div style="margin-top: 10px; border-top: 1px solid #000; padding-top: 8px;">
                <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2px;">NAME OF PERSON AUTHORIZING ISSUANCE OF WARRANT</div>
                <div class="auth-field">${complaint.is_law_enforcement === false ? (complaint.authorization_given_by || '') : ''}</div>
              </div>
              
              <div style="margin-top: 8px;">
                <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2px;">DATE AND TIME AUTHORIZATION GIVEN (ZULU)</div>
                <div class="auth-field">${complaint.is_law_enforcement === false && authDateZulu ? authDateZulu : ''}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>VIRTUS SECURITY SERVICES</strong></p>
          <p style="margin-top: 2px;">VA DCJS 11-6066 & Maryland 106-4738</p>
          <p style="margin-top: 3px; color: #666;">Complaint #: ${complaint.complaint_number || ''} | Generated (Zulu): ${generatedZulu}</p>
          ${complaint.officer_ip_address ? `<p style="color: #666;">Officer IP: ${complaint.officer_ip_address}</p>` : ''}
        </div>
        
        <script>
          window.onload = function() { 
            const style = document.createElement('style');
            style.textContent = '@page { size: landscape; }';
            document.head.appendChild(style);
            window.print(); 
          }
        </script>
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
                
                <div className="flex gap-3 justify-end pt-4">
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
                        Filed by: {getOfficerFullDisplay(complaint.created_by)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mb-3 line-clamp-2">{complaint.facts_basis}</p>
                  <div className="mt-4 pt-4 border-t-2 border-slate-300">
                    <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                    <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                      {getOfficerSignature(complaint.created_by)}
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