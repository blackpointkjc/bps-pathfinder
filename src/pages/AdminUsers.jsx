import { isOutOfOffice } from '@/utils/outOfOffice';
import AdminOutOfOffice from '@/components/AdminOutOfOffice';
import { getPayRangeForRank, nextUnitNumber, previewRankChange } from '@/utils/rankPolicy';
import { uploadInternalFile } from '@/lib/internalUpload';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Plus, Mail, Calendar, Edit, Save, X, AlertTriangle, Camera, Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ProfilePhotoCropper from "../components/ProfilePhotoCropper";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { listDirectoryDivisions, listDirectoryLocations, invalidateAppDirectory } from '@/lib/appDirectory';

export default function AdminUsers({ embedded = false }) {
  const navigate = useNavigate();
  const [accountSearch,setAccountSearch]=useState("");
  const [accountRole,setAccountRole]=useState("all");
  const [pendingOnly,setPendingOnly]=useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoToCrop, setPhotoToCrop] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createAsClient, setCreateAsClient] = useState(false);
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
  const [approvedUserIds, setApprovedUserIds] = useState(() => new Set());
  const [imapMailboxId, setImapMailboxId] = useState('');
  const [imapSaving, setImapSaving] = useState(false);
  const [imapForm, setImapForm] = useState({
    mailbox_email: '', display_name: '', imap_host: '', imap_port: 993, imap_secure: true,
    smtp_host: '', smtp_port: 465, smtp_secure: true, username: '', password: '', active: true,
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin' || user?.additional_roles?.includes('full_access');

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['portalUsers', user?.role, ...(user?.additional_roles || [])],
    queryFn: async () => {
      const response=await base44.functions.invoke('getAdminUserAccounts',{});
      const result=response?.data||response||{};
      if(result.error || !Array.isArray(result.users))throw new Error(result.error||'Administrator account directory unavailable');
      return result.users;
    },
    enabled: hasAccess,
    retry: 1,
    staleTime: 15_000,
    refetchOnMount:'always',
    refetchOnWindowFocus:true,
  });

  const { data: accessRequests = [] } = useQuery({
    queryKey: ['pendingAccessRequests'],
    queryFn: () => base44.entities.AccessRequest.filter({ status: 'pending' }, '-created_date', 500),
    enabled: hasAccess,
    refetchInterval: 60000,
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
    queryKey: ['directoryLocations', 'adminUsers'],
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
      if (payload.error || payload.success !== true) throw new Error(payload.error || 'Account invitation was not confirmed');
      return payload;
    },
    onSuccess: (result) => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateDialog(false);
      resetCreateForm();
      if (result?.provisioned) {
        alert('Account created and the Base44 login invitation processed. Assign Support Staff, Officer, Student, or Client access from Pending Users.');
      } else if (result?.invitation_sent) {
        alert('Base44 invitation sent. The person must accept the invitation to finish registration before their account appears in Pending Users. No password is emailed; they securely set their own password.');
      } else {
        alert('An existing account was found, but a fresh invitation was not confirmed. Check the Base44 user dashboard.');
      }
    },
    onError: (error) => {
      alert('❌ Failed to create pending user: ' + error.message);
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }) => {
      const response = await base44.functions.invoke('updateUser', { userId: id, updates: userData });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: (result) => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ predicate: query => {
        const key = JSON.stringify(query.queryKey || []).toLowerCase();
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank') || key.includes('payroll') || key.includes('rate') || key.includes('cad') || key.includes('schedule') || key.includes('training');
      }});
      setShowDialog(false);
      setEditingUser(null);
      alert(result?.user ? ('Saved '+result.user.rank+' · Unit '+result.user.unit_number+' · $'+Number(result.user.hourly_rate || 0).toFixed(2)+'/hr'+(result.warnings?.length ? '\n'+result.warnings.join('\n') : '')) : 'User updated successfully');
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

  const getNextAvailableUnitNumber = rank => nextUnitNumber(rank, users || [], editingUser || '');

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
    if (!isEdit) return;
    try {
      setEditFormData(prev => ({...prev,...previewRankChange(selectedUser, newRank, users || [])}));
    } catch(error) { alert(error.message); }
  };

  const handleEditUser = (userData) => {
    setEditingUser(userData.id);
    setImapMailboxId('');
    setImapForm({ mailbox_email: '', display_name: '', imap_host: '', imap_port: 993, imap_secure: true, smtp_host: '', smtp_port: 465, smtp_secure: true, username: '', password: '', active: true });
    base44.entities.CompanyImapMailbox.filter({ user_id: userData.id }, '-updated_date', 1).then(rows => {
      const mailbox = rows?.[0];
      if (!mailbox) return;
      setImapMailboxId(mailbox.id);
      setImapForm({
        mailbox_email: mailbox.mailbox_email || '',
        display_name: mailbox.display_name || '',
        imap_host: mailbox.imap_host || '',
        imap_port: Number(mailbox.imap_port || 993),
        imap_secure: mailbox.imap_secure !== false,
        smtp_host: mailbox.smtp_host || '',
        smtp_port: Number(mailbox.smtp_port || 465),
        smtp_secure: mailbox.smtp_secure !== false,
        username: mailbox.username || '',
        password: '',
        active: mailbox.active !== false,
      });
    }).catch(() => null);
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

  const saveCompanyMailbox = async () => {
    if (!editingUser || !selectedUser) return;
    if (!imapForm.mailbox_email.trim() || !imapForm.imap_host.trim() || !imapForm.smtp_host.trim() || !imapForm.username.trim()) {
      alert('Company email, IMAP host, SMTP host, and username are required.');
      return;
    }
    try {
      setImapSaving(true);
      const payload = {
        user_id: editingUser,
        pathfinder_email: selectedUser.email || '',
        mailbox_email: imapForm.mailbox_email.trim().toLowerCase(),
        display_name: imapForm.display_name.trim() || imapForm.mailbox_email.trim(),
        approved_by_company: true,
        active: imapForm.active !== false,
        imap_host: imapForm.imap_host.trim(),
        imap_port: Number(imapForm.imap_port || 993),
        imap_secure: imapForm.imap_secure !== false,
        smtp_host: imapForm.smtp_host.trim(),
        smtp_port: Number(imapForm.smtp_port || 465),
        smtp_secure: imapForm.smtp_secure !== false,
        username: imapForm.username.trim(),
        updated_by: user?.email || '',
        ...(imapForm.password ? { password: imapForm.password } : {}),
      };
      const saved = imapMailboxId
        ? await base44.entities.CompanyImapMailbox.update(imapMailboxId, payload)
        : await base44.entities.CompanyImapMailbox.create(payload);
      setImapMailboxId(saved.id || imapMailboxId);
      setImapForm(current => ({ ...current, password: '' }));
      alert('Company IMAP mailbox assignment saved.');
    } catch (error) {
      alert('Unable to save company mailbox: ' + (error?.message || 'Unknown error'));
    } finally {
      setImapSaving(false);
    }
  };

  const verifyCompanyMailbox = async () => {
    if (!imapMailboxId) return alert('Save the company mailbox first.');
    try {
      setImapSaving(true);
      const result = await base44.functions.invoke('companyImapMail', { action: 'verify', mailbox_id: imapMailboxId });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      alert('Company mailbox connection verified successfully.');
    } catch (error) {
      alert('Mailbox verification failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setImapSaving(false);
    }
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

  const saveCroppedAdminPhoto = async ({ dataUrl, file }) => {
    if (!editingUser || !dataUrl) return;
    setUploadingPhoto(true);
    setPhotoPreview(dataUrl);
    try {
      let photoUrl = dataUrl;
      if (file) {
        try {
          const uploaded = await uploadInternalFile(file);
          if (uploaded?.file_url) photoUrl = uploaded.file_url;
        } catch (uploadError) {
          console.warn('Profile photo file upload failed; using compressed image fallback:', uploadError?.message || uploadError);
        }
      }
      const result = await base44.functions.invoke('updateUser', {
        userId: editingUser,
        updates: { profile_photo_url: photoUrl },
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.details || payload.error);
      setEditFormData(prev => ({ ...prev, profile_photo_url: photoUrl }));
      setSelectedUser(prev => prev ? { ...prev, profile_photo_url: photoUrl } : prev);
      setPhotoToCrop(null);
      invalidateAppDirectory();
      await queryClient.invalidateQueries({ predicate: query => {
        const key = JSON.stringify(query.queryKey || []).toLowerCase();
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank') || key.includes('payroll') || key.includes('rate') || key.includes('cad') || key.includes('schedule') || key.includes('training');
      }});
      window.dispatchEvent(new CustomEvent('bps-personnel-photo-updated', { detail: { userId: editingUser, profile_photo_url: photoUrl } }));
      alert('Officer photo updated successfully.');
    } catch (error) {
      console.error('Profile photo save failed:', error);
      alert(`Unable to save the cropped profile photo: ${error?.message || 'Unknown error'}`);
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
    setCreateAsClient(false);
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
  // Avoid logging full personnel profiles or private identity fields.

  // Pending users have no assigned portal category. Support is an independent
  // employee login and must never require an Officer/reporting-officer role.
  const isPendingUser = (u) => {
    const roles = new Set((u.additional_roles || []).map(role => String(role).toLowerCase()));
    return u.role !== 'admin' && String(u.rank || '').toLowerCase() !== 'student registration pending' &&
      !['officer','client','student','support','support_staff','hr','accounting','trainer','dispatch','cad_access'].some(role => roles.has(role)) &&
      !['support staff','human resources'].includes(String(u.rank || '').trim().toLowerCase());
  };

  const activeUsers=(users||[]).filter(u=>{
   if(u.termination_date||['terminated','former'].includes(String(u.employment_status||'').toLowerCase()))return false;
   if(pendingOnly&&(!isPendingUser(u)||approvedUserIds.has(u.id)))return false;
   if(accountRole!=='all'&&u.role!==accountRole&&!(u.additional_roles||[]).includes(accountRole))return false;
   return [u.rank,u.first_name,u.last_name,u.email,u.unit_number,...(u.additional_roles||[])].join(' ').toLowerCase().includes(accountSearch.toLowerCase().trim());
  });

  const assignUserCategory = async (userData, category) => {
    const categoryConfig = {
      support: { roles: ['support_staff'], rank: 'Support Staff', page: 'AdminSupportStaffClock' },
      officer: { roles: ['officer', 'cad_access'], rank: 'Officer', page: 'ManageCompanyEmployees' },
      student: { roles: ['student'], rank: 'Student', page: 'TrainerCenter' },
      client: { roles: ['client'], rank: 'Client', page: 'ManageClients' },
    };
    const config = categoryConfig[category];
    if (!config) return;
    const officerRequired = ['mobile_phone','address','city','state','zip','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','drivers_license_number','drivers_license_state','drivers_license_expiration'];
    if (category === 'officer') {
      const missing = officerRequired.filter(field => !String(userData[field] || '').trim());
      if (missing.length) {
        alert('Officer onboarding has not been completed. The officer must sign in and submit their personal, emergency contact, driver license and DCJS information before approval. Missing: ' + missing.join(', '));
        return;
      }
    }
    const existingRank = String(userData.rank || '').trim();
    const approvedRank = category === 'officer' && existingRank && !['pending assignment','officer','pending'].includes(existingRank.toLowerCase()) ? existingRank : config.rank;
    if (category === 'officer' && !String(userData.dcjs_number || '').trim()) {
      const accepted = window.confirm('This officer has no DCJS registration number on file. Approve the personnel account while keeping DCJS verification outstanding for Training/HR? This does not certify the officer for field duty.');
      if (!accepted) return;
    }
    const response = await base44.functions.invoke('updateUser', {
      userId: userData.id,
      updates: { role: 'user', additional_roles: config.roles, rank: approvedRank },
    });
    const payload = response?.data || response || {};
    if (payload.error || payload.success !== true) throw new Error(payload.error || 'Unable to approve account');
    // Immediately remove the approved account from pending, independent of the
    // directory cache or navigation finishing. Do not remove before save success.
    setApprovedUserIds(previous => new Set([...previous, userData.id]));
    invalidateAppDirectory();
    queryClient.setQueriesData({queryKey:['portalUsers']}, previous => Array.isArray(previous) ? previous.map(entry => entry.id === userData.id ? {...entry,role:'user',rank:approvedRank,additional_roles:config.roles} : entry) : previous);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portalUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['clientUsers'] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);
    navigate(`${createPageUrl(config.page)}?email=${encodeURIComponent(userData.email || '')}`);
  };
  const terminatedUsers = users?.filter(u => Boolean(u.termination_date) || ['terminated','former'].includes(String(u.employment_status||'').toLowerCase()) || String(u.account_status||'').toLowerCase()==='terminated') || [];
  const transitionFormerEmployee = async (person, action) => {
    if(!window.confirm((action==='restore'?'Restore account to pending review with no operational roles?':'Move former employee to client with no CAD roles?')+' '+person.email))return;
    try{
      const response=await base44.functions.invoke('manageFormerEmployee',{user_id:person.id,action});
      const payload=response?.data||response||{};
      if(!payload.success)throw new Error(payload.error||'Account transition failed');
      invalidateAppDirectory();
      await queryClient.invalidateQueries({queryKey:['portalUsers']});
      alert(action==='restore'?'Account restored for role review.':'Client account created from historical employee profile; verify site access.');
    }catch(error){alert(error?.response?.data?.error||error.message||'Account transition failed');}
  }; 
  
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
    <div className={embedded ? "bps-command-page min-h-0 bg-[#080d16] p-2 text-white md:p-3" : "bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8"}>
      <ProfilePhotoCropper
        open={!!photoToCrop}
        imageFile={photoToCrop}
        saving={uploadingPhoto}
        onClose={() => setPhotoToCrop(null)}
        onSave={saveCroppedAdminPhoto}
      />

      <div className="space-y-4">
       <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4"><div><h1 className="text-2xl font-bold text-white">Accounts & Access</h1><p className="mt-1 text-sm text-slate-400">Find an account, assign access, or update its employee record.</p></div><Button onClick={()=>{resetCreateForm();setShowCreateDialog(true);}}><Plus className="mr-2 h-4 w-4"/>Create account</Button></header>
       <div className="grid items-end gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 md:grid-cols-[minmax(0,1fr)_200px_auto]"><label className="text-xs text-slate-400">Search accounts<Input value={accountSearch} onChange={event=>setAccountSearch(event.target.value)} placeholder="Name, rank, unit or email" className="mt-1 border-slate-600 bg-slate-950 text-white"/></label><label className="text-xs text-slate-400">Access role<select value={accountRole} onChange={event=>setAccountRole(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white">{['all','admin','officer','supervisor','client','hr','trainer','student','support_staff','fleet_manager'].map(role=><option key={role} value={role}>{role==='all'?'All roles':role.replaceAll('_',' ')}</option>)}</select></label><label className="flex min-h-10 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={pendingOnly} onChange={event=>setPendingOnly(event.target.checked)}/>Needs role assignment</label></div>

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
            <TabsTrigger value="active">Active accounts ({activeUsers.length})</TabsTrigger>
            <TabsTrigger value="terminated">Terminated ({terminatedUsers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
             <div className="overflow-x-auto rounded-xl border border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="p-3">Account</th><th className="p-3">Access</th><th className="p-3">Platoon / Unit</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">{activeUsers.map(person=><tr key={person.id} className="hover:bg-slate-900"><td className="p-3"><div className="flex items-center gap-3">{person.profile_photo_url&&<img src={person.profile_photo_url} alt="" className="h-10 w-10 rounded-full object-cover"/>}<div><strong className="block text-white">{(person.additional_roles||[]).includes('client')?[person.first_name,person.last_name].filter(Boolean).join(' '):[person.rank,person.last_name].filter(Boolean).join(' ')||person.full_name||person.email}</strong><span className="text-xs text-slate-400">{person.email}</span></div></div></td><td className="p-3"><div className="flex max-w-sm flex-wrap gap-1">{[...(person.role==='admin'?['admin']:[]),...(person.additional_roles||[])].map(role=><span key={role} className="rounded border border-slate-700 px-2 py-1 text-xs text-cyan-200">{role.replaceAll('_',' ')}</span>)}{isPendingUser(person)&&<span className="text-xs text-amber-300">Pending access</span>}</div></td><td className="p-3 text-slate-300">{person.platoon||'—'} / {person.unit_number||'—'}</td><td className="p-3"><Button type="button" size="sm" variant="outline" onClick={()=>handleEditUser(person)}>Manage account</Button>{isPendingUser(person)&&<select aria-label={'Assign access to '+person.email} defaultValue="" onChange={async event=>{const category=event.target.value;if(category&&await confirmInApp('Assign '+category+' access to '+person.email+'?'))await assignUserCategory(person,category);event.target.value='';}} className="ml-2 rounded border border-slate-600 bg-slate-900 p-2 text-xs text-white"><option value="">Assign access…</option>{['officer','support','student','client'].map(role=><option key={role}>{role}</option>)}</select>}</td></tr>)}</tbody></table>{!activeUsers.length&&<p className="p-6 text-sm text-slate-400">No accounts match these filters.</p>}</div>
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
                    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>transitionFormerEmployee(userData,'restore')}>Restore Pending</Button><Button variant="outline" size="sm" onClick={()=>transitionFormerEmployee(userData,'convert_client')}>Move to Client</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(userData)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      View/Edit
                    </Button></div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail className="w-4 h-4" />
                      {userData.email}
                    </div>
                    {isOutOfOffice(userData) && <Badge className="bg-amber-100 text-amber-900">Out of office · returns {new Date(userData.out_of_office_return).toLocaleString()}</Badge>}
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
          {selectedUser && <AdminOutOfOffice key={selectedUser.id} user={selectedUser} />}
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
              <TabsList className={`grid w-full ${user?.role === 'admin' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
                {user?.role === 'admin' && <TabsTrigger value="company-mail">Company Email</TabsTrigger>}
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
                    <SelectItem value="Colonel">Colonel (100)</SelectItem>
                    <SelectItem value="Lt Colonel">Lt Colonel (101 onward)</SelectItem>
                    <SelectItem value="Major">Major (200 series)</SelectItem>
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

            {user?.role === 'admin' && <TabsContent value="company-mail" className="space-y-4 mt-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-blue-900"><Mail className="h-4 w-4" /> Company IMAP Mailbox</div>
                <p className="mt-1 text-xs text-blue-700">Assign an approved company mailbox to this Pathfinder user. The mailbox password is not shown to the assigned user and is only used by the backend mail service.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="text-xs text-slate-500">Company Email</Label><Input type="email" placeholder="officer@company.com" value={imapForm.mailbox_email} onChange={e => setImapForm({...imapForm, mailbox_email:e.target.value})} /></div>
                <div><Label className="text-xs text-slate-500">Display Name</Label><Input placeholder="Officer Mailbox" value={imapForm.display_name} onChange={e => setImapForm({...imapForm, display_name:e.target.value})} /></div>
                <div><Label className="text-xs text-slate-500">IMAP Host</Label><Input placeholder="imap.company.com" value={imapForm.imap_host} onChange={e => setImapForm({...imapForm, imap_host:e.target.value})} /></div>
                <div><Label className="text-xs text-slate-500">IMAP Port</Label><Input type="number" value={imapForm.imap_port} onChange={e => setImapForm({...imapForm, imap_port:Number(e.target.value)||993})} /></div>
                <div><Label className="text-xs text-slate-500">SMTP Host</Label><Input placeholder="smtp.company.com" value={imapForm.smtp_host} onChange={e => setImapForm({...imapForm, smtp_host:e.target.value})} /></div>
                <div><Label className="text-xs text-slate-500">SMTP Port</Label><Input type="number" value={imapForm.smtp_port} onChange={e => setImapForm({...imapForm, smtp_port:Number(e.target.value)||465})} /></div>
                <div><Label className="text-xs text-slate-500">Username</Label><Input value={imapForm.username} onChange={e => setImapForm({...imapForm, username:e.target.value})} /></div>
                <div><Label className="text-xs text-slate-500">Mailbox Password</Label><Input type="password" placeholder={imapMailboxId ? 'Leave blank to keep current password' : 'Enter mailbox password'} value={imapForm.password} onChange={e => setImapForm({...imapForm, password:e.target.value})} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveCompanyMailbox} disabled={imapSaving}>{imapSaving ? 'Saving…' : 'Save Company Mailbox'}</Button>
                {imapMailboxId && <Button type="button" variant="outline" onClick={verifyCompanyMailbox} disabled={imapSaving}>Test IMAP Connection</Button>}
              </div>
            </TabsContent>}

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
            <DialogTitle>{createAsClient ? 'Create New Client' : 'Create New Officer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <label htmlFor="create_as_client" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <Checkbox checked={createAsClient} onCheckedChange={(checked) => setCreateAsClient(checked === true)} id="create_as_client" />
              <span className="text-sm font-semibold text-slate-700">This user is a Client</span>
              <span className="text-xs text-slate-500">Only first name, last name, phone and email are required; the account goes to Pending Users for approval.</span>
            </label>
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

              {!createAsClient && (<div>
                <Label htmlFor="create_date_of_birth" className="text-xs text-slate-500">Date of Birth</Label>
                <Input
                  id="create_date_of_birth"
                  type="date"
                  value={createFormData.date_of_birth}
                  onChange={(e) => setCreateFormData({...createFormData, date_of_birth: e.target.value})}
                />
              </div>)}

              <div>
                <Label htmlFor="create_mobile_phone" className="text-xs text-slate-500">Mobile Phone{createAsClient ? ' *' : ''}</Label>
                <Input
                  id="create_mobile_phone"
                  type="tel"
                  required={createAsClient}
                  value={createFormData.mobile_phone}
                  onChange={(e) => setCreateFormData({...createFormData, mobile_phone: e.target.value})}
                />
              </div>

              {!createAsClient && (<div>
                <Label htmlFor="create_badge_number" className="text-xs text-slate-500">Badge Number</Label>
                <Input
                  id="create_badge_number"
                  value={createFormData.badge_number}
                  onChange={(e) => setCreateFormData({...createFormData, badge_number: e.target.value})}
                />
              </div>)}

              {!createAsClient && (<div>
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
                    <SelectItem value="Colonel">Colonel (100)</SelectItem>
                    <SelectItem value="Lt Colonel">Lt Colonel (101 onward)</SelectItem>
                    <SelectItem value="Major">Major (200 series)</SelectItem>
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
              </div>)}

              {!createAsClient && (<div>
                <Label htmlFor="create_unit_number" className="text-xs text-slate-500">Unit Number</Label>
                <Input
                  id="create_unit_number"
                  value={createFormData.unit_number}
                  onChange={(e) => setCreateFormData({...createFormData, unit_number: e.target.value})}
                />
              </div>)}

              {!createAsClient && (<div>
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
              </div>)}

              {!createAsClient && (<div>
                <Label htmlFor="create_hire_date" className="text-xs text-slate-500">Hire Date *</Label>
                <Input
                  id="create_hire_date"
                  type="date"
                  value={createFormData.hire_date}
                  onChange={(e) => setCreateFormData({...createFormData, hire_date: e.target.value})}
                  required
                />
              </div>)}

              {!createAsClient && (<div>
                <Label htmlFor="create_dcjs_number" className="text-xs text-slate-500">DCJS Number</Label>
                <Input
                  id="create_dcjs_number"
                  value={createFormData.dcjs_number}
                  onChange={(e) => setCreateFormData({...createFormData, dcjs_number: e.target.value})}
                />
              </div>)}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> {createAsClient ? 'The client will be invited by email and will appear in Pending Users for approval, just like a new employee.' : 'The officer account will be created immediately and they will receive login credentials via email.'}
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