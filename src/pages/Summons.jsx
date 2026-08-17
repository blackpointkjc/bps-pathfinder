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
import { openVirginiaSummonsPrint } from "@/utils/virginiaSummonsPrint";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';

export default function Summons() {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    summons_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
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

  const { data: allSummons } = useQuery({
    queryKey: ['allSummons'],
    queryFn: () => base44.entities.Summons.list('-created_date'),
    enabled: !!user,
  });

  const summonsToDisplay = React.useMemo(() => {
    if (!allSummons || !user) return [];
    
    const userSummons = isAdmin 
      ? allSummons 
      : allSummons.filter(summons => String(summons.created_by_id || '') === String(user.id));
    
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
    queryFn: () => listDirectoryUsers(),
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
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
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

  const getOfficerEmail = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    return officer?.email || '';
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
    openVirginiaSummonsPrint(summons, {
      officerName: summons.officer_name || getOfficerFullDisplay(getOfficerEmail(summons.created_by_id)),
      badge: summons.officer_code_badge || '',
    });
    return;
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
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
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
                        Issued by: {getOfficerFullDisplay(getOfficerEmail(summons.created_by_id))}
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