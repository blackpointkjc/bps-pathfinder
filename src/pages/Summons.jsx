import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, Clock, Printer } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function Summons() {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    summons_date: new Date().toISOString(),
    case_number: "",
    hearing_date: "",
    hearing_time: "",
    court_type: "general_district",
    court_other: "",
    defendant_name_last: "",
    defendant_name_first: "",
    defendant_name_middle: "",
    defendant_address: "",
    defendant_city_town: "",
    defendant_state: "VA",
    defendant_zip: "",
    defendant_race: "",
    defendant_sex: "M",
    defendant_dob: "",
    defendant_height_ft: "",
    defendant_height_in: "",
    defendant_weight: "",
    defendant_eyes: "",
    defendant_hair: "",
    defendant_dl_state: "VA",
    defendant_dl_holder: "D",
    defendant_dl_year: "",
    defendant_dl_make: "",
    defendant_dl_type: "",
    defendant_license_no: "",
    defendant_license_year: "",
    defendant_license_state: "VA",
    jurisdiction: "",
    offense_date: format(new Date(), 'yyyy-MM-dd'),
    offense_time: format(new Date(), 'HH:mm'),
    offense_time_period: "AM",
    offense_county_city: "",
    violation_code: "",
    violation_law_section: "",
    violation_charge_description: "",
    violation_county_city_town: "city",
    day_of_week: "",
    direction: "",
    accident_yes_no: "no",
    weather: "",
    route_street: "",
    location_of_offense: "",
    arrest_date: "",
    arrest_location: "",
    officer_name: "",
    officer_code_badge: "",
    mailing_address_same_above: true,
    mailing_address_change_from_dl: false,
    mailing_address_po_box: "",
    mailing_city_town: "",
    mailing_state: "",
    mailing_zip: "",
    cmv_yes: false,
    cmv_no: true,
    hazmat_resulted_fatality_yes: false,
    hazmat_resulted_fatality_no: true,
    highway_safety_corridor_yes: false,
    highway_safety_corridor_no: true,
    fine_110_201: "",
    fine_114_129_237_civil: "",
    fine_460_fixed_traffic: "",
    fine_461_misdemeanor: "",
    fine_462_drugs: "",
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

  const { data: allSummons } = useQuery({
    queryKey: ['allSummons'],
    queryFn: () => base44.entities.Summons.list('-created_date'),
    enabled: !!user,
  });

  const summonsToDisplay = React.useMemo(() => {
    if (!allSummons || !user) return [];
    
    const userSummons = isAdmin 
      ? allSummons 
      : allSummons.filter(summons => summons.created_by === user.email);
    
    if (!searchQuery.trim()) return userSummons;
    
    const query = searchQuery.toLowerCase();
    return userSummons.filter(summons => 
      summons.defendant_name_first?.toLowerCase().includes(query) ||
      summons.defendant_name_last?.toLowerCase().includes(query) ||
      summons.defendant_dob?.includes(query) ||
      summons.case_number?.toLowerCase().includes(query) ||
      summons.summons_number?.toLowerCase().includes(query)
    );
  }, [allSummons, user, isAdmin, searchQuery]);

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  useEffect(() => {
    if (user) {
      const officerFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const badgeNumber = user.badge_number || user.unit_number || '';
      setFormData(prev => ({ 
        ...prev, 
        officer_name: officerFullName,
        officer_code_badge: badgeNumber
      }));
    }
  }, [user]);

  const generateSummonsNumber = () => {
    const formDate = format(new Date(formData.offense_date), 'yyyyMMdd');
    const existingToday = allSummons?.filter(s => s.summons_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(4, '0');
    return `VS-${formDate}-${nextNum}`;
  };

  const createSummonsMutation = useMutation({
    mutationFn: async (data) => {
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      const summonsNumber = generateSummonsNumber();
      
      const summonsWithNumberAndIp = { 
        ...data,
        defendant_height_ft: data.defendant_height_ft ? parseFloat(data.defendant_height_ft) : undefined,
        defendant_height_in: data.defendant_height_in ? parseFloat(data.defendant_height_in) : undefined,
        defendant_weight: data.defendant_weight ? parseFloat(data.defendant_weight) : undefined,
        fine_110_201: data.fine_110_201 ? parseFloat(data.fine_110_201) : undefined,
        fine_114_129_237_civil: data.fine_114_129_237_civil ? parseFloat(data.fine_114_129_237_civil) : undefined,
        fine_460_fixed_traffic: data.fine_460_fixed_traffic ? parseFloat(data.fine_460_fixed_traffic) : undefined,
        fine_461_misdemeanor: data.fine_461_misdemeanor ? parseFloat(data.fine_461_misdemeanor) : undefined,
        fine_462_drugs: data.fine_462_drugs ? parseFloat(data.fine_462_drugs) : undefined,
        summons_number: summonsNumber,
        officer_ip_address: ipAddress,
      };
      
      return await base44.entities.Summons.create(summonsWithNumberAndIp);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSummons'] });
      resetForm();
      alert('✅ Summons issued successfully!');
    },
    onError: (error) => {
      console.error('Error creating summons:', error);
      alert('❌ Failed to issue summons. Please try again. Error: ' + error.message);
    },
  });

  const resetForm = () => {
    setShowForm(false);
    const officerFullName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '';
    const badgeNumber = user?.badge_number || user?.unit_number || '';
    
    setFormData({
      summons_date: new Date().toISOString(),
      case_number: "",
      hearing_date: "",
      hearing_time: "",
      court_type: "general_district",
      court_other: "",
      defendant_name_last: "",
      defendant_name_first: "",
      defendant_name_middle: "",
      defendant_address: "",
      defendant_city_town: "",
      defendant_state: "VA",
      defendant_zip: "",
      defendant_race: "",
      defendant_sex: "M",
      defendant_dob: "",
      defendant_height_ft: "",
      defendant_height_in: "",
      defendant_weight: "",
      defendant_eyes: "",
      defendant_hair: "",
      defendant_dl_state: "VA",
      defendant_dl_holder: "D",
      defendant_dl_year: "",
      defendant_dl_make: "",
      defendant_dl_type: "",
      defendant_license_no: "",
      defendant_license_year: "",
      defendant_license_state: "VA",
      jurisdiction: "",
      offense_date: format(new Date(), 'yyyy-MM-dd'),
      offense_time: format(new Date(), 'HH:mm'),
      offense_time_period: "AM",
      offense_county_city: "",
      violation_code: "",
      violation_law_section: "",
      violation_charge_description: "",
      violation_county_city_town: "city",
      day_of_week: "",
      direction: "",
      accident_yes_no: "no",
      weather: "",
      route_street: "",
      location_of_offense: "",
      arrest_date: "",
      arrest_location: "",
      officer_name: officerFullName,
      officer_code_badge: badgeNumber,
      mailing_address_same_above: true,
      mailing_address_change_from_dl: false,
      mailing_address_po_box: "",
      mailing_city_town: "",
      mailing_state: "",
      mailing_zip: "",
      cmv_yes: false,
      cmv_no: true,
      hazmat_resulted_fatality_yes: false,
      hazmat_resulted_fatality_no: true,
      highway_safety_corridor_yes: false,
      highway_safety_corridor_no: true,
      fine_110_201: "",
      fine_114_129_237_civil: "",
      fine_460_fixed_traffic: "",
      fine_461_misdemeanor: "",
      fine_462_drugs: "",
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createSummonsMutation.mutate(formData);
  };

  const getOfficerFullDisplay = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Officer';
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return 'Officer';
    
    const firstName = officer.first_name || '';
    const lastName = officer.last_name || '';
    const rank = officer.rank || '';
    
    if (rank && firstName && lastName) {
      return `${rank} ${firstName} ${lastName}`;
    }
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return 'Officer';
  };

  const printSummons = (summons) => {
    const printWindow = window.open('', '', 'width=1100,height=850');
    
    const caseNum = summons.case_number || '';
    const dobFormatted = summons.defendant_dob ? format(new Date(summons.defendant_dob), 'MM/dd/yyyy') : '';
    const offenseFormatted = summons.offense_date ? format(new Date(summons.offense_date), 'MM/dd/yyyy') : '';
    const hearingFormatted = summons.hearing_date ? format(new Date(summons.hearing_date), 'MM/dd/yyyy') : '';
    
    const dobParts = dobFormatted ? dobFormatted.split('/') : ['', '', ''];
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Virginia Uniform Summons - ${caseNum}</title>
        <style>
          @page { size: 11in 8.5in landscape; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; line-height: 1.1; color: #000; background: white; }
          
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
          
          .page { border: 3px solid #000; padding: 4px; height: 7.5in; }
          .case-header { text-align: center; margin-bottom: 2px; }
          .case-number { font-size: 18pt; font-weight: bold; }
          .form-title { font-size: 12pt; font-weight: bold; margin: 2px 0; }
          .note { font-size: 6pt; margin: 1px 0; }
          
          .two-col { display: grid; grid-template-columns: 1.8fr 3fr; gap: 6px; }
          .left-col, .right-col { border: 2px solid #000; padding: 4px; }
          
          .field { margin: 2px 0; font-size: 6pt; }
          .field-label { font-weight: bold; font-size: 5.5pt; display: block; margin-bottom: 1px; }
          .field-value { border-bottom: 1px solid #000; min-height: 11px; padding: 1px 2px; font-size: 7pt; }
          .checkbox { display: inline-block; width: 10px; height: 10px; border: 1.5px solid #000; margin: 0 2px; vertical-align: middle; text-align: center; line-height: 9px; font-size: 8pt; font-weight: bold; }
          
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; }
          .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px; }
          
          .fine-section { border: 2px solid #000; padding: 3px; margin: 3px 0; }
          .fine-row { display: flex; justify-content: space-between; font-size: 6pt; padding: 1px 0; }
          .fine-row.bold { font-weight: bold; border-top: 1.5px solid #000; padding-top: 2px; margin-top: 2px; }
          
          .footer { text-align: center; margin-top: 3px; font-size: 6pt; border-top: 2px solid #000; padding-top: 2px; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="page">
          <div class="case-header">
            <div class="case-number">290 ${caseNum}</div>
            <div class="form-title">VIRGINIA UNIFORM SUMMONS</div>
            <div class="note">(Your summons number is the stamped number here (do not include the 290 to the left!))</div>
            <div class="note">For most tickets, this will be a seven-digit number.</div>
          </div>
          
          <div class="two-col">
            <!-- LEFT COLUMN -->
            <div class="left-col">
              <div class="field">
                <span class="checkbox"></span> PROSECUTING ATTORNEY (NAME)
              </div>
              <div class="field">
                <div class="field-value" style="min-height: 14px;"></div>
              </div>
              
              <div class="field">
                <span class="checkbox"></span> DEFENDANT'S ATTORNEY (NAME)
              </div>
              <div class="field">
                <div class="field-value" style="min-height: 14px;"></div>
                <span class="checkbox"></span> MD, AT-LARGE
                <span class="checkbox"></span> ATTORNEY WAIVED
              </div>
              
              <div class="field" style="margin-top: 4px;">
                <span class="field-label">THE ACCUSED WAS THIS DAY:</span>
                <div><span class="checkbox"></span> TRIED IN ABSENCE</div>
                <div><span class="checkbox"></span> PRESENT</div>
              </div>
              
              <div class="field">
                <span class="field-label">THE ACCUSED PLEADED:</span>
                <div><span class="checkbox"></span> NOT GUILTY</div>
                <div><span class="checkbox"></span> NOLO CONTENDERE</div>
                <div><span class="checkbox"></span> GUILTY <span class="checkbox"></span> PRE-PAYMENT</div>
                <div style="margin-left: 12px; font-size: 6pt;">AND WAS TRIED BEFORE</div>
              </div>
              
              <div class="field">
                <span class="checkbox"></span> FINDING SUFFICIENT - DEFERRED: $________
              </div>
              
              <div class="field">
                <span class="checkbox"></span> NOT GUILTY
              </div>
              
              <div class="field">
                <span class="checkbox"></span> GUILTY AS CHARGED
              </div>
              
              <div class="field">
                <span class="checkbox"></span> GUILTY OF
              </div>
              <div class="field">
                <div class="field-value" style="min-height: 12px;"></div>
              </div>
              
              <div class="field">
                <span class="checkbox"></span> COMPLIED WITH LAW ORDER
              </div>
              
              <div class="field" style="margin-top: 4px;">
                <span class="field-label">IN ADDITION I FIND THE ACCUSED WAS:</span>
                <div><span class="checkbox"></span> DRIVING A COMMERCIAL MV</div>
                <div><span class="checkbox"></span> CARRYING HAZARDOUS MAT</div>
              </div>
              
              <div class="field">
                <span class="field-label">CONVICTED OF AN OFFENSE</span>
                <div><span class="checkbox"></span> RESULTING IN A FATALITY</div>
                <div><span class="checkbox"></span> WAS IN A HWY SAFETY CORRIDOR</div>
              </div>
              
              <div class="field" style="margin-top: 4px;">
                <span class="checkbox"></span> DEFERRED AS TO THE CHARGE,
              </div>
              <div class="field">
                <span class="checkbox"></span> DISMISSED
              </div>
              
              <div class="field">
                <span class="checkbox"></span> ORDER A NOLLE PROSEQUI
              </div>
              <div class="field">
                <span class="checkbox"></span> OR ON COMMONWEALTH'S MOTION
              </div>
              
              <div class="field" style="margin-top: 4px;">
                <span class="field-label">IMPOSE THE FOLLOWING SENTENCE:</span>
              </div>
              <div class="field">
                <div class="field-value" style="min-height: 30px;"></div>
              </div>
              
              <div class="field" style="margin-top: 2px;">
                <div class="field-value" style="min-height: 18px;"></div>
                <span class="field-label">DATE</span>
                <div style="text-align: right; margin-top: -14px;">JUDGE</div>
              </div>
            </div>
            
            <!-- RIGHT COLUMN -->
            <div class="right-col">
              <div class="field">
                <div style="float: right; font-weight: bold; font-size: 6pt;">HEARING DATE<br/>AND TIME</div>
                <span class="field-label">YOU ARE SUMMONED TO APPEAR IN FAIRFAX COUNTY</span>
              </div>
              
              <div class="grid-3" style="margin-top: 2px;">
                <div class="field">
                  <span class="field-label">LAST</span>
                  <div class="field-value">${summons.defendant_name_last || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">FIRST</span>
                  <div class="field-value">${summons.defendant_name_first || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">MIDDLE</span>
                  <div class="field-value">${summons.defendant_name_middle || ''}</div>
                </div>
              </div>
              
              <div class="field">
                <span class="field-label">RES. ADDRESS:</span>
                <div class="field-value">${summons.defendant_address || ''}</div>
              </div>
              
              <div class="field" style="display: flex; justify-content: flex-end; margin-bottom: 2px;">
                <span class="field-label" style="margin-right: 40px;">RES. JURIS.</span>
              </div>
              
              <div class="grid-3">
                <div class="field">
                  <span class="field-label">CITY/TOWN</span>
                  <div class="field-value">${summons.defendant_city_town || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">STATE</span>
                  <div class="field-value">${summons.defendant_state || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">ZIP</span>
                  <div class="field-value">${summons.defendant_zip || ''}</div>
                </div>
              </div>
              
              <div class="field" style="margin-top: 2px;">
                <span class="checkbox">${summons.court_type === 'general_district' ? '✓' : ''}</span> GENERAL DISTRICT COURT
                <span style="margin-left: 120px;"><span class="checkbox">${summons.court_type === 'criminal' ? '✓' : ''}</span> CRIMINAL</span>
              </div>
              <div class="field">
                <span style="margin-left: 200px;"><span class="checkbox">${summons.court_type === 'traffic' ? '✓' : ''}</span> TRAFFIC</span>
              </div>
              <div class="field">
                <span class="checkbox">${summons.court_type === 'juvenile_domestic' ? '✓' : ''}</span> Juvenile and Domestic Relations Court
              </div>
              <div class="field">
                <span class="checkbox">${summons.court_type === 'other' ? '✓' : ''}</span> Other Jurisdiction........................................
              </div>
              
              <div class="grid-4" style="margin-top: 3px;">
                <div class="field">
                  <span class="field-label">RACE</span>
                  <div class="field-value">${summons.defendant_race || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">SEX</span>
                  <div class="field-value">${summons.defendant_sex || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">D.O.B.</span>
                  <div class="grid-3" style="font-size: 5pt; margin-bottom: 1px;">
                    <span>mo.</span>
                    <span>da.</span>
                    <span>yr.</span>
                  </div>
                  <div class="field-value">${dobParts[0] || '__'}&nbsp;&nbsp;&nbsp;${dobParts[1] || '__'}&nbsp;&nbsp;&nbsp;${dobParts[2] || '____'}</div>
                </div>
                <div class="field">
                  <span class="field-label">HT.</span>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                    <div>
                      <span style="font-size: 5pt;">ft.</span>
                      <div class="field-value">${summons.defendant_height_ft || ''}</div>
                    </div>
                    <div>
                      <span style="font-size: 5pt;">in.</span>
                      <div class="field-value">${summons.defendant_height_in || ''}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="grid-3">
                <div class="field">
                  <span class="field-label">WGT.</span>
                  <div class="field-value">${summons.defendant_weight || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">EYES</span>
                  <div class="field-value">${summons.defendant_eyes || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">HAIR</span>
                  <div class="field-value">${summons.defendant_hair || ''}</div>
                </div>
              </div>
              
              <div class="field" style="margin-top: 2px;">
                <span class="field-label">DL/CDL# (If Criminal Offense or no License use SSN)</span>
                <div class="field-value">${summons.defendant_license_no || ''}</div>
                <div style="float: right; margin-top: -12px;"><span class="field-label">STATE</span></div>
              </div>
              
              <div class="grid-4">
                <div class="field">
                  <span class="field-label">DL HOLDER</span>
                  <div class="field-value">${summons.defendant_dl_holder || ''}</div>
                  <div style="font-size: 5pt;">D V C M H</div>
                </div>
                <div class="field">
                  <span class="field-label">YEAR</span>
                  <div class="field-value">${summons.defendant_dl_year || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">MAKE</span>
                  <div class="field-value">${summons.defendant_dl_make || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">TYPE</span>
                  <div class="field-value">${summons.defendant_dl_type || ''}</div>
                </div>
              </div>
              
              <div class="grid-3">
                <div class="field">
                  <span class="field-label">LICENSE NO.</span>
                  <div class="field-value">${summons.defendant_license_no || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">YR.</span>
                  <div class="field-value">${summons.defendant_license_year || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">STATE</span>
                  <div class="field-value">${summons.defendant_license_state || ''}</div>
                </div>
              </div>
              
              <div class="grid-2" style="margin-top: 2px;">
                <div class="field">
                  <span class="field-label">JURIS. OF OFF.</span>
                  <div class="field-value">${summons.jurisdiction || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">DATE OF OFF.</span>
                  <div class="field-value">${offenseFormatted}</div>
                </div>
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">DAY OF WK.</span>
                  <div class="field-value">${summons.day_of_week || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">TIME</span>
                  <div style="display: flex; gap: 2px; align-items: center;">
                    <div class="field-value" style="flex: 1;">${summons.offense_time || ''}</div>
                    <span class="checkbox" style="margin: 0 1px;">${summons.offense_time_period === 'AM' ? '✓' : ''}</span><span style="font-size: 5pt;">A.M.</span>
                    <span class="checkbox" style="margin: 0 1px;">${summons.offense_time_period === 'PM' ? '✓' : ''}</span><span style="font-size: 5pt;">P.M.</span>
                  </div>
                </div>
              </div>
              
              <div class="field">
                <span class="field-label">Violation of Law Section ${summons.violation_law_section || '_____'}&nbsp;<span class="checkbox">${summons.violation_county_city_town === 'county' ? '✓' : ''}</span> county <span class="checkbox">${summons.violation_county_city_town === 'city' ? '✓' : ''}</span> city <span class="checkbox">${summons.violation_county_city_town === 'town' ? '✓' : ''}</span> town</span>
              </div>
              <div class="field">
                <span style="font-size: 6pt;">law section. __________ Describe charge:</span>
                <div class="field-value" style="min-height: 16px;">${summons.violation_charge_description || ''}</div>
              </div>
              
              <div class="grid-4">
                <div class="field">
                  <span class="field-label">VCC:</span>
                  <div class="field-value">${summons.violation_code || ''}</div>
                </div>
                <div class="field">
                  <div style="text-align: center; font-weight: bold; font-size: 8pt; border: 1.5px solid #000; padding: 2px;">029</div>
                </div>
                <div class="field">
                  <span class="field-label">DIRECTION</span>
                  <div class="field-value">${summons.direction || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">ACCIDENT</span>
                  <div>
                    <span class="checkbox">${summons.accident_yes_no === 'yes' ? '✓' : ''}</span> yes
                    <span class="checkbox">${summons.accident_yes_no === 'no' ? '✓' : ''}</span> no
                  </div>
                </div>
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">WEA.</span>
                  <div class="field-value">${summons.weather || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">ROUTE NO./STREET</span>
                  <div class="field-value">${summons.route_street || ''}</div>
                </div>
              </div>
              
              <div class="field">
                <span class="field-label">LOCATION OF OFFENSE:</span>
                <div class="field-value">${summons.location_of_offense || ''}</div>
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">ARREST DATE</span>
                  <div class="field-value">${summons.arrest_date ? format(new Date(summons.arrest_date), 'MM/dd/yyyy') : ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">ARREST LOCATION</span>
                  <div class="field-value">${summons.arrest_location || ''}</div>
                </div>
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">OFFICER</span>
                  <div class="field-value">${summons.officer_name || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">CODE/BADGE #</span>
                  <div class="field-value">${summons.officer_code_badge || ''}</div>
                </div>
              </div>
              
              <div class="field" style="margin-top: 2px; font-size: 6pt;">
                <span class="field-label">MAILING ADDRESS:</span>
                <span class="checkbox">${summons.mailing_address_same_above ? '✓' : ''}</span> SAME AS ABOVE AT RIGHT
                <span class="checkbox">${summons.mailing_address_change_from_dl ? '✓' : ''}</span> CHANGE FROM D.L.
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">P. O. BOX/STREET</span>
                  <div class="field-value">${summons.mailing_address_po_box || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">CITY/TOWN</span>
                  <div class="field-value">${summons.mailing_city_town || ''}</div>
                </div>
              </div>
              
              <div class="grid-2">
                <div class="field">
                  <span class="field-label">STATE</span>
                  <div class="field-value">${summons.mailing_state || ''}</div>
                </div>
                <div class="field">
                  <span class="field-label">ZIP</span>
                  <div class="field-value">${summons.mailing_zip || ''}</div>
                </div>
              </div>
              
              <div class="fine-section">
                <div class="fine-row">
                  <span>110/201 FINE</span>
                  <span>$ ${summons.fine_110_201 || '_______'}</span>
                  <span>121 TRIED IN ABSENCE FEE</span>
                  <span></span>
                </div>
                <div class="fine-row">
                  <span>114/129/237 CIVIL PENALTY</span>
                  <span>$ ${summons.fine_114_129_237_civil || '_______'}</span>
                  <span>244 CH SECURITY FEE</span>
                  <span></span>
                </div>
                <div class="fine-row">
                  <span>460 FIXED TRAFFIC INFRACTION FEE</span>
                  <span>$ ${summons.fine_460_fixed_traffic || '_______'}</span>
                  <span>120/217 CT APPT. ATTY</span>
                  <span></span>
                </div>
                <div class="fine-row">
                  <span>461 FIXED MISDEMEANOR FEE</span>
                  <span>$ ${summons.fine_461_misdemeanor || '_______'}</span>
                  <span>113 WITNESS FEE</span>
                  <span></span>
                </div>
                <div class="fine-row">
                  <span>462 FIXED MISDEMEANOR FEE-DRUGS</span>
                  <span>$ ${summons.fine_462_drugs || '_______'}</span>
                  <span>243 LOCAL TRAINING ACADEMY FEE</span>
                  <span></span>
                </div>
                <div class="fine-row bold">
                  <span></span>
                  <span></span>
                  <span>TOTAL</span>
                  <span>$ _______</span>
                </div>
                <div class="fine-row">
                  <span></span>
                  <span></span>
                  <span>109 INTEREST CHARGE</span>
                  <span></span>
                </div>
                <div class="fine-row bold">
                  <span></span>
                  <span></span>
                  <span>TOTAL WITH INTEREST</span>
                  <span>$ _______</span>
                </div>
              </div>
              
              <div class="field" style="font-size: 6pt; margin-top: 2px;">
                <div>Commercial Motor Vehicle <span class="checkbox">${summons.cmv_yes ? '✓' : ''}</span> Yes <span class="checkbox">${summons.cmv_no ? '✓' : ''}</span> No</div>
                <div>Hazardous Materials Resulted In Fatality <span class="checkbox">${summons.hazmat_resulted_fatality_yes ? '✓' : ''}</span> Yes <span class="checkbox">${summons.hazmat_resulted_fatality_no ? '✓' : ''}</span> No</div>
                <div>Highway Safety Corridor <span class="checkbox">${summons.highway_safety_corridor_yes ? '✓' : ''}</span> Yes <span class="checkbox">${summons.highway_safety_corridor_no ? '✓' : ''}</span> No</div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div>290 ${caseNum}</div>
            <div style="margin-top: 1px;"><strong>VIRTUS SECURITY</strong> | VA DCJS 11-6066 & Maryland 106-4738</div>
            <div style="margin-top: 1px;">COURT COPY - PAGE 1 | PD 60 (8/13)</div>
          </div>
        </div>
        
        <script>
          window.onload = function() { 
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
        <p className="text-slate-600">You must be clocked in to issue a summons.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">VA Uniform Summons</h1>
            <p className="text-sm md:text-base text-slate-600">Issue Virginia uniform traffic summons</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Summons
          </Button>
        </div>

        {showForm && canSubmit && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                New Virginia Uniform Summons
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-medium">
                    Complete all required fields. This form creates an official Virginia Uniform Summons.
                  </p>
                </div>

                {/* Case and Hearing Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Case & Hearing Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="case_number">Case Number (Stamped Number)</Label>
                      <Input
                        id="case_number"
                        value={formData.case_number}
                        onChange={(e) => setFormData({...formData, case_number: e.target.value})}
                        placeholder="e.g., 6582158"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hearing_date">Hearing Date</Label>
                      <Input
                        id="hearing_date"
                        type="date"
                        value={formData.hearing_date}
                        onChange={(e) => setFormData({...formData, hearing_date: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hearing_time">Hearing Time</Label>
                      <Input
                        id="hearing_time"
                        type="time"
                        value={formData.hearing_time}
                        onChange={(e) => setFormData({...formData, hearing_time: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Court Type *</Label>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="court_general"
                          checked={formData.court_type === 'general_district'}
                          onCheckedChange={(checked) => checked && setFormData({...formData, court_type: 'general_district'})}
                        />
                        <Label htmlFor="court_general" className="cursor-pointer font-normal">General District Court</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="court_criminal"
                          checked={formData.court_type === 'criminal'}
                          onCheckedChange={(checked) => checked && setFormData({...formData, court_type: 'criminal'})}
                        />
                        <Label htmlFor="court_criminal" className="cursor-pointer font-normal">Criminal</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="court_traffic"
                          checked={formData.court_type === 'traffic'}
                          onCheckedChange={(checked) => checked && setFormData({...formData, court_type: 'traffic'})}
                        />
                        <Label htmlFor="court_traffic" className="cursor-pointer font-normal">Traffic</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="court_juvenile"
                          checked={formData.court_type === 'juvenile_domestic'}
                          onCheckedChange={(checked) => checked && setFormData({...formData, court_type: 'juvenile_domestic'})}
                        />
                        <Label htmlFor="court_juvenile" className="cursor-pointer font-normal">Juvenile & Domestic Relations</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="court_other"
                          checked={formData.court_type === 'other'}
                          onCheckedChange={(checked) => checked && setFormData({...formData, court_type: 'other'})}
                        />
                        <Label htmlFor="court_other" className="cursor-pointer font-normal">Other</Label>
                      </div>
                    </div>
                    {formData.court_type === 'other' && (
                      <Input
                        placeholder="Specify other jurisdiction"
                        value={formData.court_other}
                        onChange={(e) => setFormData({...formData, court_other: e.target.value})}
                        className="mt-2"
                      />
                    )}
                  </div>
                </div>

                {/* Defendant Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Defendant Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_name_last">Last Name *</Label>
                      <Input
                        id="defendant_name_last"
                        value={formData.defendant_name_last}
                        onChange={(e) => setFormData({...formData, defendant_name_last: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_name_first">First Name *</Label>
                      <Input
                        id="defendant_name_first"
                        value={formData.defendant_name_first}
                        onChange={(e) => setFormData({...formData, defendant_name_first: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_name_middle">Middle Name</Label>
                      <Input
                        id="defendant_name_middle"
                        value={formData.defendant_name_middle}
                        onChange={(e) => setFormData({...formData, defendant_name_middle: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defendant_address">Residential Address</Label>
                    <Input
                      id="defendant_address"
                      value={formData.defendant_address}
                      onChange={(e) => setFormData({...formData, defendant_address: e.target.value})}
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_city_town">City/Town</Label>
                      <Input
                        id="defendant_city_town"
                        value={formData.defendant_city_town}
                        onChange={(e) => setFormData({...formData, defendant_city_town: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_state">State</Label>
                      <Input
                        id="defendant_state"
                        value={formData.defendant_state}
                        onChange={(e) => setFormData({...formData, defendant_state: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_zip">ZIP</Label>
                      <Input
                        id="defendant_zip"
                        value={formData.defendant_zip}
                        onChange={(e) => setFormData({...formData, defendant_zip: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_race">Race</Label>
                      <Input
                        id="defendant_race"
                        value={formData.defendant_race}
                        onChange={(e) => setFormData({...formData, defendant_race: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_sex">Sex</Label>
                      <Select
                        value={formData.defendant_sex}
                        onValueChange={(value) => setFormData({...formData, defendant_sex: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Male</SelectItem>
                          <SelectItem value="F">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_dob">Date of Birth</Label>
                      <Input
                        id="defendant_dob"
                        type="date"
                        value={formData.defendant_dob}
                        onChange={(e) => setFormData({...formData, defendant_dob: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Height</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="ft"
                          type="number"
                          value={formData.defendant_height_ft}
                          onChange={(e) => setFormData({...formData, defendant_height_ft: e.target.value})}
                          className="w-20"
                        />
                        <Input
                          placeholder="in"
                          type="number"
                          value={formData.defendant_height_in}
                          onChange={(e) => setFormData({...formData, defendant_height_in: e.target.value})}
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_weight">Weight (lbs)</Label>
                      <Input
                        id="defendant_weight"
                        type="number"
                        value={formData.defendant_weight}
                        onChange={(e) => setFormData({...formData, defendant_weight: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_eyes">Eyes</Label>
                      <Input
                        id="defendant_eyes"
                        value={formData.defendant_eyes}
                        onChange={(e) => setFormData({...formData, defendant_eyes: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_hair">Hair</Label>
                      <Input
                        id="defendant_hair"
                        value={formData.defendant_hair}
                        onChange={(e) => setFormData({...formData, defendant_hair: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* License Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">License Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_license_no">License Number</Label>
                      <Input
                        id="defendant_license_no"
                        value={formData.defendant_license_no}
                        onChange={(e) => setFormData({...formData, defendant_license_no: e.target.value})}
                        placeholder="DL/CDL# or SSN"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_license_state">License State</Label>
                      <Input
                        id="defendant_license_state"
                        value={formData.defendant_license_state}
                        onChange={(e) => setFormData({...formData, defendant_license_state: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_dl_holder">DL Holder</Label>
                      <Select
                        value={formData.defendant_dl_holder}
                        onValueChange={(value) => setFormData({...formData, defendant_dl_holder: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="D">D - Driver</SelectItem>
                          <SelectItem value="V">V - Vehicle</SelectItem>
                          <SelectItem value="C">C - CDL</SelectItem>
                          <SelectItem value="M">M - Moped</SelectItem>
                          <SelectItem value="H">H - Holder</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defendant_dl_year">Vehicle Year</Label>
                      <Input
                        id="defendant_dl_year"
                        value={formData.defendant_dl_year}
                        onChange={(e) => setFormData({...formData, defendant_dl_year: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_dl_make">Vehicle Make</Label>
                      <Input
                        id="defendant_dl_make"
                        value={formData.defendant_dl_make}
                        onChange={(e) => setFormData({...formData, defendant_dl_make: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defendant_dl_type">License Type</Label>
                      <Input
                        id="defendant_dl_type"
                        value={formData.defendant_dl_type}
                        onChange={(e) => setFormData({...formData, defendant_dl_type: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Offense Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Offense Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="jurisdiction">Jurisdiction *</Label>
                      <Input
                        id="jurisdiction"
                        value={formData.jurisdiction}
                        onChange={(e) => setFormData({...formData, jurisdiction: e.target.value})}
                        placeholder="e.g., Fairfax County"
                        required
                      />
                    </div>
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
                      <Label htmlFor="day_of_week">Day of Week</Label>
                      <Input
                        id="day_of_week"
                        value={formData.day_of_week}
                        onChange={(e) => setFormData({...formData, day_of_week: e.target.value})}
                        placeholder="e.g., Monday"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="offense_time">Time</Label>
                      <Input
                        id="offense_time"
                        type="time"
                        value={formData.offense_time}
                        onChange={(e) => setFormData({...formData, offense_time: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>AM/PM</Label>
                      <Select
                        value={formData.offense_time_period}
                        onValueChange={(value) => setFormData({...formData, offense_time_period: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="violation_code">VCC (Violation Code) *</Label>
                      <Input
                        id="violation_code"
                        value={formData.violation_code}
                        onChange={(e) => setFormData({...formData, violation_code: e.target.value})}
                        placeholder="e.g., 46.2-862"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="violation_law_section">Violation of Law Section</Label>
                      <Input
                        id="violation_law_section"
                        value={formData.violation_law_section}
                        onChange={(e) => setFormData({...formData, violation_law_section: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>County/City/Town</Label>
                      <div className="flex gap-4 pt-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="location_county"
                            checked={formData.violation_county_city_town === 'county'}
                            onCheckedChange={(checked) => checked && setFormData({...formData, violation_county_city_town: 'county'})}
                          />
                          <Label htmlFor="location_county" className="cursor-pointer font-normal">County</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="location_city"
                            checked={formData.violation_county_city_town === 'city'}
                            onCheckedChange={(checked) => checked && setFormData({...formData, violation_county_city_town: 'city'})}
                          />
                          <Label htmlFor="location_city" className="cursor-pointer font-normal">City</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="location_town"
                            checked={formData.violation_county_city_town === 'town'}
                            onCheckedChange={(checked) => checked && setFormData({...formData, violation_county_city_town: 'town'})}
                          />
                          <Label htmlFor="location_town" className="cursor-pointer font-normal">Town</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="violation_charge_description">Describe Charge</Label>
                    <Textarea
                      id="violation_charge_description"
                      value={formData.violation_charge_description}
                      onChange={(e) => setFormData({...formData, violation_charge_description: e.target.value})}
                      rows={3}
                    />
                  </div>

                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="direction">Direction</Label>
                      <Input
                        id="direction"
                        value={formData.direction}
                        onChange={(e) => setFormData({...formData, direction: e.target.value})}
                        placeholder="N, S, E, W"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Accident?</Label>
                      <Select
                        value={formData.accident_yes_no}
                        onValueChange={(value) => setFormData({...formData, accident_yes_no: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weather">Weather</Label>
                      <Input
                        id="weather"
                        value={formData.weather}
                        onChange={(e) => setFormData({...formData, weather: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="route_street">Route No./Street</Label>
                      <Input
                        id="route_street"
                        value={formData.route_street}
                        onChange={(e) => setFormData({...formData, route_street: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location_of_offense">Location of Offense</Label>
                    <Input
                      id="location_of_offense"
                      value={formData.location_of_offense}
                      onChange={(e) => setFormData({...formData, location_of_offense: e.target.value})}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="arrest_date">Arrest Date (if applicable)</Label>
                      <Input
                        id="arrest_date"
                        type="date"
                        value={formData.arrest_date}
                        onChange={(e) => setFormData({...formData, arrest_date: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="arrest_location">Arrest Location</Label>
                      <Input
                        id="arrest_location"
                        value={formData.arrest_location}
                        onChange={(e) => setFormData({...formData, arrest_location: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Officer Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Officer Information</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="officer_name">Officer Name</Label>
                      <Input
                        id="officer_name"
                        value={formData.officer_name}
                        onChange={(e) => setFormData({...formData, officer_name: e.target.value})}
                        readOnly
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="officer_code_badge">Code/Badge #</Label>
                      <Input
                        id="officer_code_badge"
                        value={formData.officer_code_badge}
                        onChange={(e) => setFormData({...formData, officer_code_badge: e.target.value})}
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Mailing Address */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Mailing Address</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="mail_same"
                        checked={formData.mailing_address_same_above}
                        onCheckedChange={(checked) => setFormData({...formData, mailing_address_same_above: checked})}
                      />
                      <Label htmlFor="mail_same" className="cursor-pointer">Same as Above</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="mail_change"
                        checked={formData.mailing_address_change_from_dl}
                        onCheckedChange={(checked) => setFormData({...formData, mailing_address_change_from_dl: checked})}
                      />
                      <Label htmlFor="mail_change" className="cursor-pointer">Change from DL</Label>
                    </div>
                  </div>

                  {!formData.mailing_address_same_above && (
                    <>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="mailing_address_po_box">P.O. Box/Street</Label>
                          <Input
                            id="mailing_address_po_box"
                            value={formData.mailing_address_po_box}
                            onChange={(e) => setFormData({...formData, mailing_address_po_box: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mailing_city_town">City/Town</Label>
                          <Input
                            id="mailing_city_town"
                            value={formData.mailing_city_town}
                            onChange={(e) => setFormData({...formData, mailing_city_town: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="mailing_state">State</Label>
                          <Input
                            id="mailing_state"
                            value={formData.mailing_state}
                            onChange={(e) => setFormData({...formData, mailing_state: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mailing_zip">ZIP</Label>
                          <Input
                            id="mailing_zip"
                            value={formData.mailing_zip}
                            onChange={(e) => setFormData({...formData, mailing_zip: e.target.value})}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Additional Flags */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-2 block">Commercial Motor Vehicle</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="cmv_yes"
                            checked={formData.cmv_yes}
                            onCheckedChange={(checked) => setFormData({...formData, cmv_yes: checked, cmv_no: !checked})}
                          />
                          <Label htmlFor="cmv_yes" className="cursor-pointer font-normal">Yes</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="cmv_no"
                            checked={formData.cmv_no}
                            onCheckedChange={(checked) => setFormData({...formData, cmv_no: checked, cmv_yes: !checked})}
                          />
                          <Label htmlFor="cmv_no" className="cursor-pointer font-normal">No</Label>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">Hazardous Materials Resulted In Fatality</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="hazmat_yes"
                            checked={formData.hazmat_resulted_fatality_yes}
                            onCheckedChange={(checked) => setFormData({...formData, hazmat_resulted_fatality_yes: checked, hazmat_resulted_fatality_no: !checked})}
                          />
                          <Label htmlFor="hazmat_yes" className="cursor-pointer font-normal">Yes</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="hazmat_no"
                            checked={formData.hazmat_resulted_fatality_no}
                            onCheckedChange={(checked) => setFormData({...formData, hazmat_resulted_fatality_no: checked, hazmat_resulted_fatality_yes: !checked})}
                          />
                          <Label htmlFor="hazmat_no" className="cursor-pointer font-normal">No</Label>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">Highway Safety Corridor</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="highway_yes"
                            checked={formData.highway_safety_corridor_yes}
                            onCheckedChange={(checked) => setFormData({...formData, highway_safety_corridor_yes: checked, highway_safety_corridor_no: !checked})}
                          />
                          <Label htmlFor="highway_yes" className="cursor-pointer font-normal">Yes</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="highway_no"
                            checked={formData.highway_safety_corridor_no}
                            onCheckedChange={(checked) => setFormData({...formData, highway_safety_corridor_no: checked, highway_safety_corridor_yes: !checked})}
                          />
                          <Label htmlFor="highway_no" className="cursor-pointer font-normal">No</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fines */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Fine Amounts (Optional)</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fine_110_201">110/201 FINE</Label>
                      <Input
                        id="fine_110_201"
                        type="number"
                        value={formData.fine_110_201}
                        onChange={(e) => setFormData({...formData, fine_110_201: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fine_114_129_237_civil">114/129/237 CIVIL PENALTY</Label>
                      <Input
                        id="fine_114_129_237_civil"
                        type="number"
                        value={formData.fine_114_129_237_civil}
                        onChange={(e) => setFormData({...formData, fine_114_129_237_civil: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fine_460_fixed_traffic">460 FIXED TRAFFIC INFRACTION FEE</Label>
                      <Input
                        id="fine_460_fixed_traffic"
                        type="number"
                        value={formData.fine_460_fixed_traffic}
                        onChange={(e) => setFormData({...formData, fine_460_fixed_traffic: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fine_461_misdemeanor">461 FIXED MISDEMEANOR FEE</Label>
                      <Input
                        id="fine_461_misdemeanor"
                        type="number"
                        value={formData.fine_461_misdemeanor}
                        onChange={(e) => setFormData({...formData, fine_461_misdemeanor: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fine_462_drugs">462 FIXED MISDEMEANOR FEE-DRUGS</Label>
                      <Input
                        id="fine_462_drugs"
                        type="number"
                        value={formData.fine_462_drugs}
                        onChange={(e) => setFormData({...formData, fine_462_drugs: e.target.value})}
                      />
                    </div>
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
                    disabled={createSummonsMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createSummonsMutation.isPending ? 'Issuing...' : 'Issue Summons'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <span>My Summons ({summonsToDisplay.length})</span>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name, DOB, or case #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-80"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summonsToDisplay.map((summons) => (
                <div key={summons.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-blue-500">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {summons.case_number && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 font-mono">
                            Case: 290 {summons.case_number}
                          </Badge>
                        )}
                        {summons.summons_number && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 font-mono">
                            {summons.summons_number}
                          </Badge>
                        )}
                        <Badge className={
                          summons.status === 'paid' ? 'bg-green-600' :
                          summons.status === 'failed_to_appear' ? 'bg-red-600' :
                          'bg-amber-600'
                        }>
                          {summons.status ? summons.status.replace(/_/g, ' ').toUpperCase() : 'ISSUED'}
                        </Badge>
                      </div>
                      <p className="font-semibold text-slate-900 mb-1">
                        Defendant: {summons.defendant_name_first} {summons.defendant_name_last}
                      </p>
                      <p className="text-sm text-slate-600">
                        Offense: {summons.violation_code} - {summons.violation_charge_description || 'N/A'}
                      </p>
                      <p className="text-sm text-slate-600">
                        Offense Date: {summons.offense_date ? format(new Date(summons.offense_date), 'MMMM d, yyyy') : 'N/A'}
                      </p>
                      {summons.hearing_date && (
                        <p className="text-sm text-slate-600">
                          Hearing: {format(new Date(summons.hearing_date), 'MMMM d, yyyy')} at {summons.hearing_time || 'TBD'}
                        </p>
                      )}
                      <p className="text-sm text-slate-600">
                        Issued by: {getOfficerFullDisplay(summons.created_by)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printSummons(summons)}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print/View
                    </Button>
                  </div>
                </div>
              ))}
              {summonsToDisplay.length === 0 && (
                <p className="text-center text-slate-500 py-8">
                  {searchQuery ? 'No summons found matching your search' : 'No summons issued yet'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}