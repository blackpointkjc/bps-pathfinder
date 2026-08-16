import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Users, Plus, Mail, Phone, MapPin, Calendar, Edit, Save, X, AlertTriangle, Camera, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ProfilePhotoCropper from "../components/ProfilePhotoCropper";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { listDirectoryDivisions, listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [editingUser, setEditingUser] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoToCrop, setPhotoToCrop] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [checkingAnniversaries, setCheckingAnniversaries] = useState(false); // New state variable
  const [editFormData, setEditFormData] = useState({
    first_name: "",
    last_name: "",
    ssn: "",
    date_of_birth: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    mobile_phone: "",
    badge_number: "",
    rank: "Officer",
    unit_number: "",
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    hourly_rate: 0,
    work_state: "",
    employment_status: "active",
    termination_date: "",

    division: "",
    subdivision: "",
    dcjs_number: "",
    dcjs_expiration: "",
    firearm_expiration: "",
    drivers_license_number: "",
    drivers_license_state: "",
    drivers_license_expiration: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
    role: "user",
    additional_roles: [],
    assigned_sites: [],
    additional_certifications: []
  });
  const [createFormData, setCreateFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    date_of_birth: "", // Added
    mobile_phone: "",
    badge_number: "",
    rank: "Officer",
    unit_number: "",
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    division: "",
    dcjs_number: "",
    dcjs_expiration: "",
    firearm_expiration: "",
  });
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState("active");

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin' || user?.additional_roles?.includes('full_access');

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['portalUsers', user?.role, ...(user?.additional_roles || [])],
    queryFn: async () => await listDirectoryUsers(undefined, 1000) || [],
    enabled: hasAccess,
    retry: 3,
    staleTime: 0,
  });

  const { data: accessRequests = [] } = useQuery({
    queryKey: ['pendingAccessRequests'],
    queryFn: () => base44.entities.AccessRequest.filter({ status: 'pending' }, '-created_date', 500),
    enabled: hasAccess,
    refetchInterval: 10000,
    initialData: [],
  });

  const convertAccessRequest = useMutation({
    mutationFn: async request => {
      const response = await base44.functions.invoke('createPortalAccount', {
        accountType: 'pending',
        first_name: String(request.full_name || '').trim().split(/\s+/)[0] || 'Pending',
        last_name: String(request.full_name || '').trim().split(/\s+/).slice(1).join(' '),
        email: request.email,
        mobile_phone: request.phone || '',
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      await base44.entities.AccessRequest.update(request.id, {
        status: 'invited',
        processed_by: user?.email || '',
        processed_at: new Date().toISOString(),
      });
      return request;
    },
    onSuccess: request => {
      queryClient.invalidateQueries({ queryKey: ['pendingAccessRequests'] });
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      alert(`Invitation sent to ${request.email}. The account will appear in Pending Users when Base44 finishes creating it.`);
    },
    onError: error => alert(`Unable to process access request: ${error.message}`),
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => listDirectoryLocations(),
    enabled: hasAccess,
    initialData: [],
  });

  const { data: divisions } = useQuery({
    queryKey: ['activeDivisions'],
    queryFn: async () => {
      const allDivisions = await listDirectoryDivisions('division_name');
      return allDivisions.filter(div => div.active);
    },
    enabled: hasAccess,
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => base44.entities.Equipment.list(),
    enabled: hasAccess,
    initialData: [],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('createPortalAccount', {
        accountType: 'pending',
        ...data,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateDialog(false);
      resetCreateForm();
      if (result?.email_sent === false) {
        alert(`✅ Pending user created, but the Black Point welcome email could not be delivered. ${result?.email_error || 'Verify the email address and resend the invitation.'}`);
      } else {
        alert('✅ Pending user created. Assign the person as Officer, Student, or Client from this page.');
      }
    },
    onError: (error) => {
      alert('❌ Failed to create pending user: ' + error.message);
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }) => base44.entities.User.update(id, userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowDialog(false);
      setEditingUser(null);
      alert('User updated successfully');
    },
    onError: (error) => {
      alert('Failed to update user: ' + error.message);
    }
  });

  const assignEquipmentMutation = useMutation({
    mutationFn: ({ equipmentId, officerEmail }) => 
      base44.entities.Equipment.update(equipmentId, { 
        assigned_to: officerEmail,
        status: 'assigned'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      alert('✅ Equipment assigned successfully');
    },
    onError: (error) => {
      alert('Failed to assign equipment: ' + error.message);
    }
  });

  const unassignEquipmentMutation = useMutation({
    mutationFn: ({ equipmentId }) => 
      base44.entities.Equipment.update(equipmentId, { 
        assigned_to: null,
        status: 'available'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      alert('✅ Equipment unassigned successfully');
    },
    onError: (error) => {
      alert('Failed to unassign equipment: ' + error.message);
    }
  });

  const getRankSeries = (rank) => {
    const seriesMap = {
      'Colonel': { start: 100, end: 100 },
      'Lt Colonel': { start: 200, end: 200 },
      'Major': { start: 300, end: 349 },
      'Captain': { start: 350, end: 399 },
      'Lieutenant': { start: 400, end: 449 },
      'First Sergeant': { start: 450, end: 499 },
      'Sergeant': { start: 500, end: 549 },
      'Corporal': { start: 550, end: 599 },
      'Senior officer': { start: 600, end: 649 },
      'Officer': { start: 650, end: 699 },
      'Unarmed Officer': { start: 700, end: 799 }
    };
    return seriesMap[rank] || null;
  };

  const getNextAvailableUnitNumber = (rank) => {
    const series = getRankSeries(rank);
    if (!series) return "";

    const usedNumbers = users
      .filter(u => u.unit_number && parseInt(u.unit_number) >= series.start && parseInt(u.unit_number) <= series.end)
      .map(u => parseInt(u.unit_number))
      .sort((a, b) => a - b);

    for (let i = series.start; i <= series.end; i++) {
      if (!usedNumbers.includes(i)) {
        return i.toString();
      }
    }
    return series.start.toString();
  };

  const checkAnniversariesAndBirthdays = async () => {
    setCheckingAnniversaries(true);
    try {
      const today = new Date();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      
      const activeOfficers = users?.filter(u => !u.termination_date) || [];
      let anniversaryCount = 0;
      let birthdayCount = 0;
      
      console.log('Checking for today:', todayMonth, '/', todayDay);

      for (const officer of activeOfficers) {
        // Check work anniversary
        if (officer.hire_date) {
          // Parse date string directly to avoid timezone issues
          const [year, month, day] = officer.hire_date.split('-').map(Number);
          
          console.log(`${officer.first_name} hire date: ${month}/${day}`);
          
          if (month === todayMonth && day === todayDay) {
            const yearsOfService = today.getFullYear() - year;
            
            await base44.entities.Announcement.create({
              title: `🎉 Work Anniversary - ${officer.first_name} ${officer.last_name}`,
              message: `Congratulations to ${officer.rank || ''} ${officer.first_name} ${officer.last_name}${officer.unit_number ? ` (Unit ${officer.unit_number})` : ''} on ${yearsOfService} ${yearsOfService === 1 ? 'year' : 'years'} with Black Point Protection! Thank you for your dedication and service. Your commitment to excellence makes our team stronger.`,
              priority: 'important'
            });
            anniversaryCount++;
            console.log(`✅ Created anniversary announcement for ${officer.first_name}`);
          }
        }

        // Check birthday
        if (officer.date_of_birth) {
          // Parse date string directly to avoid timezone issues
          const [year, month, day] = officer.date_of_birth.split('-').map(Number);
          
          console.log(`${officer.first_name} birthday: ${month}/${day}`);
          
          if (month === todayMonth && day === todayDay) {
            await base44.entities.Announcement.create({
              title: `🎂 Happy Birthday - ${officer.first_name} ${officer.last_name}`,
              message: `Happy Birthday to ${officer.rank || ''} ${officer.first_name} ${officer.last_name}${officer.unit_number ? ` (Unit ${officer.unit_number})` : ''}! Wishing you a wonderful day filled with joy and celebration. Thank you for being part of the Black Point Protection family!`,
              priority: 'normal'
            });
            birthdayCount++;
            console.log(`✅ Created birthday announcement for ${officer.first_name}`);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      
      if (anniversaryCount === 0 && birthdayCount === 0) {
        alert(`✅ Check complete - No anniversaries or birthdays found\n\nToday's date: ${todayMonth}/${todayDay}\n\nCheck the browser console for details on all officers checked.`);
      } else {
        alert(`✅ Announcements sent!\n\nToday's date: ${todayMonth}/${todayDay}\n🎉 Work Anniversaries: ${anniversaryCount}\n🎂 Birthdays: ${birthdayCount}`);
      }
    } catch (error) {
      console.error('Error checking anniversaries/birthdays:', error);
      alert('❌ Error sending announcements. Please try again.');
    } finally {
      setCheckingAnniversaries(false);
    }
  };

  const handleRankChange = (newRank, isEdit = false) => {
    const nextUnitNumber = getNextAvailableUnitNumber(newRank);
    const payRange = getPayRangeForRank(newRank);
    const currentRate = isEdit ? editFormData.hourly_rate : 0;
    const isFlexible = ['Human Resources', 'Support Staff'].includes(newRank);

    // Use lowest rate for rank, or keep current rate if it's higher (flexible ranks keep any rate)
    const newRate = isFlexible ? (currentRate || payRange.min) : (currentRate && currentRate >= payRange.min ? currentRate : payRange.min);

    if (isEdit) {
      setEditFormData({
        ...editFormData,
        rank: newRank,
        unit_number: nextUnitNumber,
        hourly_rate: newRate
      });
    }
  };

  const getPayRangeForRank = (rank) => {
    const payRanges = {
      'Unarmed Officer': { min: 18.00, max: 20.00 },
      'Officer': { min: 19.50, max: 21.50 },
      'Senior officer': { min: 20.50, max: 22.50 },
      'Corporal': { min: 21.00, max: 23.00 },
      'Sergeant': { min: 22.00, max: 24.00 },
      'First Sergeant': { min: 23.00, max: 25.00 },
      'Lieutenant': { min: 24.00, max: 26.00 },
      'Captain': { min: 25.00, max: 27.00 },
      'Lt Colonel': { min: 27.50, max: 27.50 },
      'Colonel': { min: 27.50, max: 27.50 },
      'Major': { min: 27.50, max: 27.50 },
    };
    return payRanges[rank] || { min: 18.00, max: 20.00 };
  };

  const handleEditUser = (userData) => {
    setEditingUser(userData.id);
    setPhotoPreview(null);
    const payRange = getPayRangeForRank(userData.rank || "Officer");
    const isFlexible = ['Human Resources', 'Support Staff'].includes(userData.rank);
    const defaultRate = isFlexible
      ? (userData.hourly_rate || payRange.min)
      : (userData.hourly_rate && userData.hourly_rate >= payRange.min ? userData.hourly_rate : payRange.min);

    setEditFormData({
      first_name: userData.first_name || "",
      last_name: userData.last_name || "",
      ssn: userData.ssn || "",
      date_of_birth: userData.date_of_birth || "",
      address: userData.address || "",
      city: userData.city || "",
      state: userData.state || "",
      zip: userData.zip || "",
      mobile_phone: userData.mobile_phone || "",
      badge_number: userData.badge_number || "",
      rank: userData.rank || "Officer",
      unit_number: userData.unit_number || "",
      hire_date: userData.hire_date || format(new Date(), 'yyyy-MM-dd'),
      hourly_rate: defaultRate,
      work_state: userData.work_state || "",
      employment_status: userData.employment_status || "active",
      termination_date: userData.termination_date || "",
      division: userData.division || "",
      subdivision: userData.subdivision || "",
      dcjs_number: userData.dcjs_number || "",
      dcjs_expiration: userData.dcjs_expiration || "",
      firearm_expiration: userData.firearm_expiration || "",
      drivers_license_number: userData.drivers_license_number || "",
      drivers_license_state: userData.drivers_license_state || "",
      drivers_license_expiration: userData.drivers_license_expiration || "",
      emergency_contact_name: userData.emergency_contact_name || "",
      emergency_contact_relationship: userData.emergency_contact_relationship || "",
      emergency_contact_phone: userData.emergency_contact_phone || "",
      role: userData.role || "user",
      additional_roles: userData.additional_roles || [],
      assigned_sites: userData.assigned_sites || [],
      additional_certifications: userData.certifications || [],
      officer_certifications: userData.officer_certifications || [],
      profile_photo_url: userData.profile_photo_url || ""
    });
    setSelectedUser(userData);
    setShowDialog(true);
  };

  const handlePhotoSelection = (file) => {
    if (!file || !editingUser) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB.');
      return;
    }
    setPhotoToCrop(file);
  };

  const saveCroppedAdminPhoto = async ({ file, dataUrl }) => {
    if (!editingUser) return;
    setUploadingPhoto(true);
    setPhotoPreview(dataUrl);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.User.update(editingUser, { profile_photo_url: file_url });
      setEditFormData(prev => ({ ...prev, profile_photo_url: file_url }));
      setPhotoToCrop(null);
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      console.error('Profile photo upload failed:', error);
      alert('Unable to save the cropped profile photo.');
    } finally {
      setPhotoPreview(null);
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    // Validate hourly_rate is set
    if (!editFormData.hourly_rate || editFormData.hourly_rate <= 0) {
      alert('Hourly rate is required and must be greater than 0');
      return;
    }

    // Validate hourly_rate is within rank range (skip enforcement for HR and Support Staff)
    const payRange = getPayRangeForRank(editFormData.rank);
    const isFlexibleRank = ['Human Resources', 'Support Staff'].includes(editFormData.rank);
    if (!isFlexibleRank && (editFormData.hourly_rate < payRange.min || editFormData.hourly_rate > payRange.max)) {
      alert(`Hourly rate must be between $${payRange.min.toFixed(2)} and $${payRange.max.toFixed(2)} for ${editFormData.rank}`);
      return;
    }

    // Only include fields that have values (filter out empty strings, null, undefined)
    const filteredData = Object.fromEntries(
      Object.entries(editFormData).filter(([key, value]) => {
        if (value === null || value === undefined || value === '') return false;
        if (Array.isArray(value) && value.length === 0 && key !== 'additional_certifications') return false;
        return true;
      })
    );

    // Map additional_certifications to certifications for the API
    if (filteredData.additional_certifications) {
      filteredData.certifications = filteredData.additional_certifications;
      delete filteredData.additional_certifications;
    }
    // officer_certifications passes through directly

    updateUserMutation.mutate({
      id: editingUser,
      userData: filteredData
    });
  };

  const resetCreateForm = () => {
    setCreateFormData({
      first_name: "",
      last_name: "",
      email: "",
      date_of_birth: "", // Added
      mobile_phone: "",
      badge_number: "",
      rank: "Officer",
      unit_number: "",
      hire_date: format(new Date(), 'yyyy-MM-dd'),
      division: "",
      dcjs_number: "",
      dcjs_expiration: "",
      firearm_expiration: "",
    });
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createUserMutation.mutate(createFormData);
  };

  // Debug logging
  console.log('=== AdminUsers Debug ===');
  console.log('Has access:', hasAccess);
  console.log('Current user:', user);
  console.log('Total users loaded:', users?.length);
  console.log('Is loading:', isLoading);
  console.log('Error:', error);
  console.log('Users data:', users);

  // Pending Users = NOT admin AND NOT has officer additional role AND NOT client AND NOT student
  const isPendingUser = (u) =>
    u.role !== 'admin' &&
    !u.additional_roles?.includes('officer') &&
    !u.additional_roles?.includes('client') &&
    !u.additional_roles?.includes('student');

  const activeUsers = users?.filter(u => !u.termination_date && isPendingUser(u)) || [];

  const assignUserCategory = async (userData, category) => {
    const categoryConfig = {
      student: { roles: ['student'], rank: 'Student', page: 'ManageStudents' },
      officer: { roles: ['officer', 'cad_access'], rank: 'Officer', page: 'ManageCompanyEmployees' },
      client: { roles: ['client'], rank: 'Client', page: 'ManageClients' },
    };
    const config = categoryConfig[category];
    if (!config) return;
    const response = await base44.functions.invoke('updateUser', {
      userId: userData.id,
      updates: { role: 'user', additional_roles: config.roles, rank: config.rank },
    });
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['clientUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);
    navigate(`${createPageUrl(config.page)}?email=${encodeURIComponent(userData.email || '')}`);
  };
  const terminatedUsers = users?.filter(u => u.termination_date && isPendingUser(u)) || [];
  
  console.log('Active users:', activeUsers.length);
  console.log('Terminated users:', terminatedUsers.length);

  const getRankColor = (rank) => {
    switch (rank) {
      case "Colonel": return "bg-amber-100 text-amber-900 border-amber-400";
      case "Lt Colonel": return "bg-rose-100 text-rose-900 border-rose-400";
      case "Major": return "bg-red-100 text-red-800 border-red-300";
      case "Captain": return "bg-orange-100 text-orange-800 border-orange-300";
      case "Lieutenant": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "First Sergeant": return "bg-lime-100 text-lime-800 border-lime-300";
      case "Sergeant": return "bg-green-100 text-green-800 border-green-300";
      case "Corporal": return "bg-blue-100 text-blue-800 border-blue-300";
      case "Senior officer": return "bg-purple-100 text-purple-800 border-purple-300";
      case "Officer": return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case "Unarmed Officer": return "bg-slate-100 text-slate-800 border-slate-300";
      default: return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">You don't have permission to manage users.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <ProfilePhotoCropper
        open={!!photoToCrop}
        imageFile={photoToCrop}
        saving={uploadingPhoto}
        onClose={() => setPhotoToCrop(null)}
        onSave={saveCroppedAdminPhoto}
      />
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Pending Users</h1>
              <p className="text-slate-600">Create one user account, then assign the person as Officer, Student, or Client</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={checkAnniversariesAndBirthdays}
              disabled={checkingAnniversaries}
              variant="outline"
              className="bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"
            >
              {checkingAnniversaries ? (
                <>
                  <Calendar className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Check Anniversaries & Birthdays
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                resetCreateForm();
                setShowCreateDialog(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 shadow-md transition-all duration-200 rounded-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create User
            </Button>
          </div>
        </div>

        {error && (
          <Card className="p-8 text-center border-red-200 bg-red-50">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-600" />
            <h3 className="text-xl font-bold text-red-900 mb-2">Error Loading Users</h3>
            <p className="text-red-700">{error?.message || 'Unknown error'}</p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })} className="mt-4">
              Retry
            </Button>
          </Card>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading officers...</p>
          </div>
        )}

        {!isLoading && !error && accessRequests.length > 0 && (
          <Card className="mb-5 border border-amber-500/30 bg-amber-950/20">
            <CardHeader><CardTitle className="flex items-center gap-2 text-amber-200"><Mail className="h-5 w-5" />Access Requests ({accessRequests.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {accessRequests.map(request => (
                <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white">{request.full_name}</p>
                    <p className="text-sm text-slate-300">{request.email}{request.phone ? ` · ${request.phone}` : ''}</p>
                    <p className="mt-1 text-xs uppercase tracking-wider text-amber-300">Requested: {request.requested_category || 'Administrator should decide'}</p>
                    {request.notes && <p className="mt-2 text-sm text-slate-400">{request.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={convertAccessRequest.isPending} onClick={() => convertAccessRequest.mutate(request)} className="bg-[#c9a227] text-black hover:bg-[#ddb940]">Create Pending User</Button>
                    <Button variant="outline" onClick={async () => { await base44.entities.AccessRequest.update(request.id, { status: 'denied', processed_by: user?.email || '', processed_at: new Date().toISOString() }); queryClient.invalidateQueries({ queryKey: ['pendingAccessRequests'] }); }} className="border-red-700 text-red-300">Deny</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
            <TabsTrigger value="active">Pending ({activeUsers.length})</TabsTrigger>
            <TabsTrigger value="terminated">Terminated ({terminatedUsers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4 mt-4">
            {activeUsers.length === 0 && (
              <Card className="p-8 text-center">
                <Users className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600">No pending users found. All users have been assigned a role.</p>
                </Card>
              )}
              {activeUsers.map((userData) => (
              <Card key={userData.id} className="border border-slate-200 hover:shadow-lg transition-all duration-300 bg-white rounded-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {userData.profile_photo_url ? (
                        <img
                          src={userData.profile_photo_url}
                          alt={`${userData.first_name} ${userData.last_name}`}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
                          {userData.first_name?.charAt(0)}{userData.last_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-xl">
                          {userData.first_name && userData.last_name 
                            ? `${userData.first_name} ${userData.last_name}` 
                            : userData.email}
                          <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700">Pending Role Assignment</Badge>
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {userData.rank ? (
                            <Badge className={getRankColor(userData.rank)}>
                              {userData.rank}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-100 text-slate-600">No Rank Assigned</Badge>
                          )}
                          {userData.hourly_rate && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                              ${userData.hourly_rate.toFixed(2)}/hr
                            </Badge>
                          )}
                          {userData.unit_number && (
                            <Badge variant="outline">Unit #{userData.unit_number}</Badge>
                          )}
                          {userData.subdivision && (
                            <Badge variant="outline">{userData.division} - {userData.subdivision}</Badge>
                          )}
                          {!userData.subdivision && userData.division && (
                            <Badge variant="outline">{userData.division}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                        onClick={async () => {
                          if (window.confirm(`Assign ${userData.first_name || userData.email} as a Student?`)) {
                            await assignUserCategory(userData, 'student');
                          }
                        }}
                      >
                        Assign Student
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                        onClick={async () => {
                          if (window.confirm(`Assign ${userData.first_name || userData.email} as an Officer?`)) {
                            await assignUserCategory(userData, 'officer');
                          }
                        }}
                      >
                        Assign Officer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"
                        onClick={async () => {
                          if (window.confirm(`Assign ${userData.first_name || userData.email} as a Client? The property can be selected from Manage Clients.`)) {
                            await assignUserCategory(userData, 'client');
                          }
                        }}
                      >
                        Assign Client
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditUser(userData)}
                        className="rounded-lg"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Select
                        value={userData.role || 'user'}
                        onValueChange={async (newRole) => {
                          try {
                            const action = newRole === 'admin' ? 'grant full admin access to' : 'remove admin access from';
                            if (window.confirm(`Are you sure you want to ${action} ${userData.first_name} ${userData.last_name}?`)) {
                              await base44.entities.User.update(userData.id, { role: newRole });
                              queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
                              alert(`✅ User role updated to ${newRole}`);
                            }
                          } catch (error) {
                            console.error('Error updating role:', error);
                            alert('❌ Failed to update role: ' + error.message);
                          }
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail className="w-4 h-4" />
                      {userData.email}
                    </div>
                    {userData.mobile_phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-4 h-4" />
                        {userData.mobile_phone}
                      </div>
                    )}
                    {userData.hire_date && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        Hired: {userData.hire_date ? format(new Date(userData.hire_date), 'MMM d, yyyy') : 'N/A'}
                      </div>
                    )}
                  </div>
                  {userData.assigned_sites && userData.assigned_sites.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Assigned Sites:</p>
                      <div className="flex flex-wrap gap-2">
                        {userData.assigned_sites.map((site, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            <MapPin className="w-3 h-3 mr-1" />
                            {site}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              ))}
            </TabsContent>

            <TabsContent value="terminated" className="space-y-4 mt-4">
            {terminatedUsers.map((userData) => (
              <Card key={userData.id} className="border-slate-200 opacity-75">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {userData.profile_photo_url ? (
                        <img
                          src={userData.profile_photo_url}
                          alt={`${userData.first_name} ${userData.last_name}`}
                          className="w-16 h-16 rounded-full object-cover grayscale"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white font-bold text-xl">
                          {userData.first_name?.charAt(0)}{userData.last_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-xl text-slate-600">
                          {userData.first_name} {userData.last_name}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="destructive">Terminated</Badge>
                          <Badge className={getRankColor(userData.rank)}>
                            {userData.rank}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(userData)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      View/Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail className="w-4 h-4" />
                      {userData.email}
                    </div>
                    {userData.termination_date && (
                      <div className="flex items-center gap-2 text-red-600">
                        <Calendar className="w-4 h-4" />
                        Terminated: {userData.termination_date ? format(new Date(userData.termination_date), 'MMM d, yyyy') : 'N/A'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Officer Information</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-lg border">
              <div className="relative">
                {(photoPreview || editFormData.profile_photo_url) ? (
                  <img
                    src={photoPreview || editFormData.profile_photo_url}
                    alt="Officer photo"
                    className="w-20 h-20 rounded-full object-cover border-2 border-slate-300"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-2xl">
                    {editFormData.first_name?.charAt(0)}{editFormData.last_name?.charAt(0)}
                  </div>
                )}
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Officer Photo</p>
                <p className="text-xs text-slate-500 mb-2">Shown on profile, schedule, and throughout the app</p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handlePhotoSelection(file); }}
                    disabled={uploadingPhoto}
                  />
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <Camera className="w-4 h-4" />
                    {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </span>
                </label>
              </div>
            </div>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name" className="text-xs text-slate-500">First Name</Label>
                    <Input
                      id="first_name"
                      value={editFormData.first_name}
                      onChange={(e) => setEditFormData({...editFormData, first_name: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="last_name" className="text-xs text-slate-500">Last Name</Label>
                    <Input
                      id="last_name"
                      value={editFormData.last_name}
                      onChange={(e) => setEditFormData({...editFormData, last_name: e.target.value})}
                    />
                  </div>

              <div>
                <Label htmlFor="ssn" className="text-xs text-slate-500">Social Security Number</Label>
                <Input
                  id="ssn"
                  placeholder="XXX-XX-XXXX"
                  value={editFormData.ssn}
                  onChange={(e) => setEditFormData({...editFormData, ssn: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="date_of_birth" className="text-xs text-slate-500">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={editFormData.date_of_birth}
                  onChange={(e) => setEditFormData({...editFormData, date_of_birth: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="address" className="text-xs text-slate-500">Street Address</Label>
                <Input
                  id="address"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="city" className="text-xs text-slate-500">City</Label>
                <Input
                  id="city"
                  value={editFormData.city}
                  onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="state" className="text-xs text-slate-500">State</Label>
                <Input
                  id="state"
                  placeholder="VA"
                  value={editFormData.state}
                  onChange={(e) => setEditFormData({...editFormData, state: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="zip" className="text-xs text-slate-500">ZIP Code</Label>
                <Input
                  id="zip"
                  value={editFormData.zip}
                  onChange={(e) => setEditFormData({...editFormData, zip: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="mobile_phone" className="text-xs text-slate-500">Mobile Phone</Label>
                <Input
                  id="mobile_phone"
                  type="tel"
                  value={editFormData.mobile_phone}
                  onChange={(e) => setEditFormData({...editFormData, mobile_phone: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="badge_number" className="text-xs text-slate-500">Badge Number</Label>
                <Input
                  id="badge_number"
                  value={editFormData.badge_number}
                  onChange={(e) => setEditFormData({...editFormData, badge_number: e.target.value})}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-500">
                  Rank
                  {editingUser === user?.id && user?.rank !== 'Colonel (Operations Manager)' && user?.rank !== 'Lieutenant Colonel' && user?.rank !== 'Major' && (
                    <span className="text-amber-600 ml-2">🔒 Cannot edit your own rank</span>
                  )}
                </Label>
                <Select
                  value={editFormData.rank}
                  onValueChange={(value) => handleRankChange(value, true)}
                  disabled={editingUser === user?.id && user?.rank !== 'Colonel (Operations Manager)' && user?.rank !== 'Lieutenant Colonel' && user?.rank !== 'Major'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colonel">Colonel (100 series)</SelectItem>
                    <SelectItem value="Lt Colonel">Lt Colonel (200 series)</SelectItem>
                    <SelectItem value="Major">Major (300 series)</SelectItem>
                    <SelectItem value="Captain">Captain (350 series)</SelectItem>
                    <SelectItem value="Lieutenant">Lieutenant (400 series)</SelectItem>
                    <SelectItem value="First Sergeant">First Sergeant (450 series)</SelectItem>
                    <SelectItem value="Sergeant">Sergeant (500 series)</SelectItem>
                    <SelectItem value="Corporal">Corporal (550 series)</SelectItem>
                    <SelectItem value="Senior officer">Senior officer (600 series)</SelectItem>
                    <SelectItem value="Officer">Officer (650 series)</SelectItem>
                    <SelectItem value="Unarmed Officer">Unarmed Officer (700 series)</SelectItem>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                    <SelectItem value="Support Staff">Support Staff</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="unit_number" className="text-xs text-slate-500">Unit Number</Label>
                <Input
                  id="unit_number"
                  value={editFormData.unit_number}
                  onChange={(e) => setEditFormData({...editFormData, unit_number: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="division" className="text-xs text-slate-500">Division</Label>
                <select
                  id="division"
                  value={editFormData.division || ''}
                  onChange={(e) => setEditFormData(prev => ({...prev, division: e.target.value || null, subdivision: null}))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">None</option>
                  {divisions?.filter(d => !d.is_subdivision && d.active !== false).map((div) => (
                    <option key={div.id} value={div.division_name}>{div.division_name}</option>
                  ))}
                </select>
              </div>

              {editFormData.division && divisions?.filter(d => d.is_subdivision && d.parent_division === editFormData.division && d.active !== false).length > 0 && (
                <div>
                  <Label htmlFor="subdivision" className="text-xs text-slate-500">Subdivision</Label>
                  <select
                    id="subdivision"
                    value={editFormData.subdivision || ''}
                    onChange={(e) => setEditFormData(prev => ({...prev, subdivision: e.target.value || null}))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">None</option>
                    {divisions
                      ?.filter(d => d.is_subdivision && d.parent_division === editFormData.division && d.active !== false)
                      .map((div) => (
                        <option key={div.id} value={div.subdivision || div.division_name}>{div.subdivision || div.division_name}</option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="hire_date" className="text-xs text-slate-500">Hire Date</Label>
                <Input
                  id="hire_date"
                  type="date"
                  value={editFormData.hire_date}
                  onChange={(e) => setEditFormData({...editFormData, hire_date: e.target.value})}
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-800">Driver's License</div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div><Label className="text-xs text-slate-500">License Number</Label><Input value={editFormData.drivers_license_number || ''} onChange={(e) => setEditFormData({...editFormData, drivers_license_number: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">State</Label><Input maxLength={2} placeholder="VA" value={editFormData.drivers_license_state || ''} onChange={(e) => setEditFormData({...editFormData, drivers_license_state: e.target.value.toUpperCase()})} /></div>
                  <div><Label className="text-xs text-slate-500">Expiration</Label><Input type="date" value={editFormData.drivers_license_expiration || ''} onChange={(e) => setEditFormData({...editFormData, drivers_license_expiration: e.target.value})} /></div>
                </div>
              </div>

              <div>
                <Label htmlFor="hourly_rate" className="text-xs text-slate-500">Hourly Rate ($) *</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  min={['Human Resources', 'Support Staff'].includes(editFormData.rank) ? undefined : (editFormData.rank ? getPayRangeForRank(editFormData.rank).min : 18.00)}
                  max={['Human Resources', 'Support Staff'].includes(editFormData.rank) ? undefined : (editFormData.rank ? getPayRangeForRank(editFormData.rank).max : 27.50)}
                  placeholder="e.g., 18.50"
                  value={editFormData.hourly_rate || ''}
                  onChange={(e) => setEditFormData({...editFormData, hourly_rate: parseFloat(e.target.value) || 0})}
                  required
                />
                {editFormData.rank && (
                  <p className={`text-xs mt-1 ${['Human Resources', 'Support Staff'].includes(editFormData.rank) ? 'text-blue-600' : 'text-slate-500'}`}>
                    {['Human Resources', 'Support Staff'].includes(editFormData.rank) ? '💡 Recommended' : 'Range'} for {editFormData.rank}: ${getPayRangeForRank(editFormData.rank).min.toFixed(2)} - ${getPayRangeForRank(editFormData.rank).max.toFixed(2)}/hr
                    {['Human Resources', 'Support Staff'].includes(editFormData.rank) && <span className="text-slate-400"> (any rate allowed)</span>}
                  </p>
                )}
                {editFormData.hourly_rate > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs font-semibold text-blue-900 mb-1">Rate Breakdown:</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Regular Rate:</span>
                        <span className="font-bold">${editFormData.hourly_rate.toFixed(2)}/hr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Overtime (1.5x):</span>
                        <span className="font-bold text-amber-700">${(editFormData.hourly_rate * 1.5).toFixed(2)}/hr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Holiday (1.25x):</span>
                        <span className="font-bold text-green-700">${(editFormData.hourly_rate * 1.25).toFixed(2)}/hr</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
            </TabsContent>

            <TabsContent value="emergency" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">Emergency Contact Name</Label>
                  <Input
                    value={editFormData.emergency_contact_name || ""}
                    onChange={(e) => setEditFormData({...editFormData, emergency_contact_name: e.target.value})}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Relationship</Label>
                  <Input
                    value={editFormData.emergency_contact_relationship || ""}
                    onChange={(e) => setEditFormData({...editFormData, emergency_contact_relationship: e.target.value})}
                    placeholder="e.g., Spouse, Parent, Sibling"
                  />
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Emergency Contact Phone</Label>
                  <Input
                    type="tel"
                    value={editFormData.emergency_contact_phone || ""}
                    onChange={(e) => setEditFormData({...editFormData, emergency_contact_phone: e.target.value})}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </TabsContent>

          </Tabs>


            {editFormData.termination_date && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This officer is marked as terminated on {editFormData.termination_date ? format(new Date(editFormData.termination_date), 'MMMM d, yyyy') : 'Unknown date'}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDialog(false);
                  setEditingUser(null);
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={updateUserMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Officer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create_first_name" className="text-xs text-slate-500">First Name *</Label>
                <Input
                  id="create_first_name"
                  value={createFormData.first_name}
                  onChange={(e) => setCreateFormData({...createFormData, first_name: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="create_last_name" className="text-xs text-slate-500">Last Name *</Label>
                <Input
                  id="create_last_name"
                  value={createFormData.last_name}
                  onChange={(e) => setCreateFormData({...createFormData, last_name: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="create_email" className="text-xs text-slate-500">Email Address *</Label>
                <Input
                  id="create_email"
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({...createFormData, email: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="create_date_of_birth" className="text-xs text-slate-500">Date of Birth</Label>
                <Input
                  id="create_date_of_birth"
                  type="date"
                  value={createFormData.date_of_birth}
                  onChange={(e) => setCreateFormData({...createFormData, date_of_birth: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="create_mobile_phone" className="text-xs text-slate-500">Mobile Phone</Label>
                <Input
                  id="create_mobile_phone"
                  type="tel"
                  value={createFormData.mobile_phone}
                  onChange={(e) => setCreateFormData({...createFormData, mobile_phone: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="create_badge_number" className="text-xs text-slate-500">Badge Number</Label>
                <Input
                  id="create_badge_number"
                  value={createFormData.badge_number}
                  onChange={(e) => setCreateFormData({...createFormData, badge_number: e.target.value})}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-500">Rank *</Label>
                <Select
                  value={createFormData.rank}
                  onValueChange={(value) => {
                    const nextUnitNumber = getNextAvailableUnitNumber(value);
                    setCreateFormData({...createFormData, rank: value, unit_number: nextUnitNumber});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colonel">Colonel (100 series)</SelectItem>
                    <SelectItem value="Lt Colonel">Lt Colonel (200 series)</SelectItem>
                    <SelectItem value="Major">Major (300 series)</SelectItem>
                    <SelectItem value="Captain">Captain (350 series)</SelectItem>
                    <SelectItem value="Lieutenant">Lieutenant (400 series)</SelectItem>
                    <SelectItem value="First Sergeant">First Sergeant (450 series)</SelectItem>
                    <SelectItem value="Sergeant">Sergeant (500 series)</SelectItem>
                    <SelectItem value="Corporal">Corporal (550 series)</SelectItem>
                    <SelectItem value="Senior officer">Senior officer (600 series)</SelectItem>
                    <SelectItem value="Officer">Officer (650 series)</SelectItem>
                    <SelectItem value="Unarmed Officer">Unarmed Officer (700 series)</SelectItem>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                    <SelectItem value="Support Staff">Support Staff</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="create_unit_number" className="text-xs text-slate-500">Unit Number</Label>
                <Input
                  id="create_unit_number"
                  value={createFormData.unit_number}
                  onChange={(e) => setCreateFormData({...createFormData, unit_number: e.target.value})}
                />
              </div>

              <div>
                <Label htmlFor="create_division" className="text-xs text-slate-500">Division</Label>
                <select
                  id="create_division"
                  value={createFormData.division || ''}
                  onChange={(e) => setCreateFormData(prev => ({...prev, division: e.target.value}))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">None</option>
                  {divisions?.filter(d => !d.is_subdivision && d.active !== false).map((div) => (
                    <option key={div.id} value={div.division_name}>{div.division_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="create_hire_date" className="text-xs text-slate-500">Hire Date *</Label>
                <Input
                  id="create_hire_date"
                  type="date"
                  value={createFormData.hire_date}
                  onChange={(e) => setCreateFormData({...createFormData, hire_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="create_dcjs_number" className="text-xs text-slate-500">DCJS Number</Label>
                <Input
                  id="create_dcjs_number"
                  value={createFormData.dcjs_number}
                  onChange={(e) => setCreateFormData({...createFormData, dcjs_number: e.target.value})}
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> The officer account will be created immediately and they will receive login credentials via email.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetCreateForm();
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {createUserMutation.isPending ? 'Creating...' : 'Create Pending User'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}