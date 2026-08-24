import { uploadInternalFile } from '@/lib/internalUpload';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Mail, Phone, Calendar, Edit, Briefcase, Save, X, AlertTriangle, Unlink, Camera, Loader2, UserMinus, CheckCircle2 } from "lucide-react";
import OfficerCertificationsTab from "../components/OfficerCertificationsTab";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ProfilePhotoCropper from "../components/ProfilePhotoCropper";
import { listDirectoryUsers, listDirectoryLocations, listDirectoryDivisions, invalidateAppDirectory } from '@/lib/appDirectory';
import { isInternalMember } from '@/lib/directoryUtils';

const FIREARM_COURSE_PREFIXES = ["07", "08", "09", "10"];

function computeDcjsExpiration(certs) {
  if (!certs || !certs.length) return "";
  const core = certs.find(c => c.course_id?.startsWith("01") && c.expiration_date);
  if (core) return core.expiration_date;
  const dcjsCerts = certs.filter(c => c.category === "dcjs" && c.expiration_date);
  if (dcjsCerts.length === 0) return "";
  return dcjsCerts.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0].expiration_date;
}

function computeFirearmExpiration(certs) {
  if (!certs || !certs.length) return "";
  const firearmCerts = certs.filter(c =>
    FIREARM_COURSE_PREFIXES.some(prefix => c.course_id?.startsWith(prefix)) && c.expiration_date
  );
  if (firearmCerts.length === 0) return "";
  return firearmCerts.sort((a, b) => new Date(b.expiration_date) - new Date(a.expiration_date))[0].expiration_date;
}

export default function ManageCompanyEmployees({ portalContext = 'shared' }) {
  const [editingUser, setEditingUser] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoToCrop, setPhotoToCrop] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
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

  const userRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isSystemAdmin = user?.role === 'admin';
  const canManageEmployees = isSystemAdmin || userRoles.has('full_access') || userRoles.has('hr');
  const isHrReadOnly = false;
  const hasAccess = canManageEmployees;

  const { data: users, isLoading } = useQuery({
    queryKey: ['directoryUsers', 'manageCompanyEmployees', portalContext],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: locations } = useQuery({
    queryKey: ['directoryLocations', 'manageCompanyEmployees'],
    queryFn: () => listDirectoryLocations('site_name', 1000),
    enabled: hasAccess,
    initialData: [],
  });

  const { data: divisions } = useQuery({
    queryKey: ['directoryDivisions', 'manageCompanyEmployees'],
    queryFn: () => listDirectoryDivisions('division_name', 1000),
    enabled: hasAccess,
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => base44.entities.Equipment.list(),
    enabled: hasAccess,
    initialData: [],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }) => {
      const requestedSystemRole = userData.role === 'admin' ? 'admin' : 'user';
      const requestedAdditionalRoles = [...new Set(userData.additional_roles || [])].sort();
      const existingAdditionalRoles = [...new Set(selectedUser?.additional_roles || [])].sort();
      const systemAccessChanged = selectedUser?.role !== requestedSystemRole
        || JSON.stringify(existingAdditionalRoles) !== JSON.stringify(requestedAdditionalRoles);

      if (systemAccessChanged) {
        if (!isSystemAdmin) throw new Error('Only a current system administrator can change system roles and permissions.');
        const roleResult = await base44.functions.invoke('updateUser', {
          userId: id,
          updates: {
            role: requestedSystemRole,
            additional_roles: requestedAdditionalRoles,
          },
        });
        const rolePayload = roleResult?.data || roleResult || {};
        if (rolePayload.error) throw new Error(rolePayload.error);
      }

      const profileUpdates = { ...userData };
      delete profileUpdates.role;
      delete profileUpdates.additional_roles;
      if (portalContext === 'hr' || userRoles.has('hr') || userRoles.has('full_access')) {
        const result = await base44.functions.invoke('updateUser', { userId: id, updates: profileUpdates });
        const payload = result?.data || result || {};
        if (payload.error) throw new Error(payload.error);
        return payload;
      }
      return base44.entities.User.update(id, profileUpdates);
    },
    onSuccess: () => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ predicate: query => {
        const key = JSON.stringify(query.queryKey || []).toLowerCase();
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank') || key.includes('trainingcompliancematrix');
      }});
      setShowDialog(false);
      setEditingUser(null);
      alert('User updated successfully');
    },
    onError: (error) => { alert('Failed to update user: ' + error.message); }
  });

  const moveToPendingMutation = useMutation({
    mutationFn: async (userData) => {
      const newRoles = (userData.additional_roles || []).filter(r => r !== 'officer');
      await base44.entities.User.update(userData.id, { additional_roles: newRoles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      alert('✅ User moved back to Pending Users.');
    },
    onError: (error) => { alert('Failed: ' + error.message); }
  });

  const assignEquipmentMutation = useMutation({
    mutationFn: async ({ equipmentId, officerEmail }) => {
      const result = await base44.functions.invoke('manageHREquipment', { action: 'assign', equipment_id: equipmentId, officer_email: officerEmail });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.equipment;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment'] }); }
  });

  const unassignEquipmentMutation = useMutation({
    mutationFn: async ({ equipmentId }) => {
      const result = await base44.functions.invoke('manageHREquipment', { action: 'unassign', equipment_id: equipmentId });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.equipment;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment'] }); }
  });

  // HR/member directory contains only internal employees. Client and student
  // accounts stay in their dedicated menus and never appear in this list.
  const allEmployees = (users || []).filter(isInternalMember);
  const activeEmployees = allEmployees.filter(u => !u.termination_date);
  const terminatedEmployees = allEmployees.filter(u => u.termination_date);

  const filterBySearch = (list) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(u =>
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.rank?.toLowerCase().includes(q)
    );
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
    setImapMailboxId('');
    setImapForm({ mailbox_email: '', display_name: '', imap_host: '', imap_port: 993, imap_secure: true, smtp_host: '', smtp_port: 465, smtp_secure: true, username: '', password: '', active: true });
    if (isSystemAdmin) {
      base44.entities.CompanyImapMailbox.filter({ user_id: userData.id }, '-updated_date', 1).then(rows => {
        const mailbox = rows?.[0];
        if (!mailbox) return;
        setImapMailboxId(mailbox.id);
        setImapForm({
          mailbox_email: mailbox.mailbox_email || '', display_name: mailbox.display_name || '',
          imap_host: mailbox.imap_host || '', imap_port: Number(mailbox.imap_port || 993), imap_secure: mailbox.imap_secure !== false,
          smtp_host: mailbox.smtp_host || '', smtp_port: Number(mailbox.smtp_port || 465), smtp_secure: mailbox.smtp_secure !== false,
          username: mailbox.username || '', password: '', active: mailbox.active !== false,
        });
      }).catch(() => null);
    }
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
      profile_photo_url: userData.profile_photo_url || "",
      officer_certifications: Array.isArray(userData.officer_certifications) ? userData.officer_certifications : []
    });
    setSelectedUser(userData);
    setShowDialog(true);
  };

  const saveCompanyMailbox = async () => {
    if (!editingUser || !selectedUser || !isSystemAdmin) return;
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
        imap_host: imapForm.imap_host.trim(), imap_port: Number(imapForm.imap_port || 993), imap_secure: imapForm.imap_secure !== false,
        smtp_host: imapForm.smtp_host.trim(), smtp_port: Number(imapForm.smtp_port || 465), smtp_secure: imapForm.smtp_secure !== false,
        username: imapForm.username.trim(), updated_by: user?.email || '',
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

  const saveCroppedEmployeePhoto = async ({ dataUrl, file }) => {
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
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank');
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
    if (!editingUser || !canManageEmployees) return;
    const filteredData = Object.fromEntries(
      Object.entries(editFormData).filter(([key, value]) => {
        // Always include additional_roles even if empty array
        if (key === 'additional_roles') return true;
        if (value === null || value === undefined || value === '') return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      })
    );
    // Auto-compute DCJS and Firearm expiration from certification records
    const certs = editFormData.officer_certifications || [];
    filteredData.dcjs_expiration = computeDcjsExpiration(certs) || null;
    filteredData.firearm_expiration = computeFirearmExpiration(certs) || null;
    updateUserMutation.mutate({ id: editingUser, userData: filteredData });
  };

  const getRankColor = (rank) => {
    const colors = {
      'Colonel': "bg-amber-100 text-amber-900 border-amber-400",
      'Lt Colonel': "bg-rose-100 text-rose-900 border-rose-400",
      'Major': "bg-red-100 text-red-800 border-red-300",
      'Captain': "bg-orange-100 text-orange-800 border-orange-300",
      'Lieutenant': "bg-yellow-100 text-yellow-800 border-yellow-300",
      'First Sergeant': "bg-lime-100 text-lime-800 border-lime-300",
      'Sergeant': "bg-green-100 text-green-800 border-green-300",
      'Corporal': "bg-blue-100 text-blue-800 border-blue-300",
      'Senior officer': "bg-purple-100 text-purple-800 border-purple-300",
      'Officer': "bg-indigo-100 text-indigo-800 border-indigo-300",
      'Unarmed Officer': "bg-slate-100 text-slate-800 border-slate-300",
    };
    return colors[rank] || "bg-slate-100 text-slate-800 border-slate-300";
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">You don't have permission to manage company employees.</p>
      </div>
    );
  }

  const renderUserCard = (userData, isTerminated = false) => (
    <Card key={userData.id} className={`border border-slate-200 hover:shadow-lg transition-all duration-300 bg-white rounded-lg ${isTerminated ? 'opacity-75' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            {userData.profile_photo_url ? (
              <img src={userData.profile_photo_url} alt={`${userData.first_name} ${userData.last_name}`} className={`w-14 h-14 rounded-full object-cover ${isTerminated ? 'grayscale' : ''}`} />
            ) : (
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md ${isTerminated ? 'bg-gradient-to-br from-slate-400 to-slate-600' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>
                {userData.first_name?.charAt(0)}{userData.last_name?.charAt(0)}
              </div>
            )}
            <div>
              <CardTitle className="text-lg">
                {userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : userData.email}
              </CardTitle>
              <div className="flex flex-wrap gap-2 mt-1">
                {userData.role === 'admin' && <Badge className="bg-amber-100 text-amber-800 border-amber-300">Admin</Badge>}
                {isTerminated && <Badge variant="destructive">Terminated</Badge>}
                {userData.rank && <Badge className={getRankColor(userData.rank)}>{userData.rank}</Badge>}
                {userData.unit_number && <Badge variant="outline">Unit #{userData.unit_number}</Badge>}
                {userData.division && <Badge variant="outline">{userData.subdivision ? `${userData.division} - ${userData.subdivision}` : userData.division}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleEditUser(userData)}>
              <Edit className="w-4 h-4 mr-2" />{canManageEmployees ? 'Edit' : 'View'}
            </Button>
            {canManageEmployees && userData.additional_roles?.includes('officer') && !isTerminated && (
              <Button
                variant="outline"
                size="sm"
                className="text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={async () => {
                  if (await confirmInApp(`Move ${userData.first_name} ${userData.last_name} back to Pending Users? This will remove their Officer role.`)) {
                    moveToPendingMutation.mutate(userData);
                  }
                }}
              >
                <UserMinus className="w-4 h-4 mr-2" />Move to Pending
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2"><Mail className="w-4 h-4" />{userData.email}</div>
          {userData.mobile_phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" />{userData.mobile_phone}</div>}
          {userData.hire_date && <div className="flex items-center gap-2"><Calendar className="w-4 h-4" />Hired: {format(new Date(userData.hire_date), 'MMM d, yyyy')}</div>}
          {isTerminated && userData.termination_date && <div className="flex items-center gap-2 text-red-600"><Calendar className="w-4 h-4" />Terminated: {format(new Date(userData.termination_date), 'MMM d, yyyy')}</div>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-8">
      <ProfilePhotoCropper
        open={!!photoToCrop}
        imageFile={photoToCrop}
        saving={uploadingPhoto}
        onClose={() => setPhotoToCrop(null)}
        onSave={saveCroppedEmployeePhoto}
      />
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Manage Company Employees</h1>
            <p className="text-slate-600">{portalContext === 'hr' ? 'HR employee directory and account access management' : portalContext === 'training' ? 'Training-managed employee certifications and records' : 'Active company users and assigned operational roles'}</p>
          </div>
        </div>
        <Input
          placeholder="Search by name, email, or rank..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading employees...</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({filterBySearch(activeEmployees).length})</TabsTrigger>
            <TabsTrigger value="terminated">Terminated ({filterBySearch(terminatedEmployees).length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="space-y-4 mt-4">
            {filterBySearch(activeEmployees).length === 0 ? (
              <Card className="p-8 text-center"><p className="text-slate-600">No active company employees found</p></Card>
            ) : filterBySearch(activeEmployees).map(u => renderUserCard(u))}
          </TabsContent>
          <TabsContent value="terminated" className="space-y-4 mt-4">
            {filterBySearch(terminatedEmployees).map(u => renderUserCard(u, true))}
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{canManageEmployees ? 'Edit Employee Information' : 'Employee Information'}</DialogTitle>
          </DialogHeader>
          {isHrReadOnly && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>HR access is view-only. A Trainer, Full Access user, or system administrator must update employee and certification records.</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo */}
            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-lg border">
              <div className="relative">
                {(photoPreview || editFormData.profile_photo_url) ? (
                  <img src={photoPreview || editFormData.profile_photo_url} alt="photo" className="w-20 h-20 rounded-full object-cover border-2 border-slate-300" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-2xl">
                    {editFormData.first_name?.charAt(0)}{editFormData.last_name?.charAt(0)}
                  </div>
                )}
                {uploadingPhoto && <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>}
              </div>
              {canManageEmployees ? (
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handlePhotoSelection(file); }} disabled={uploadingPhoto} />
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50">
                    <Camera className="w-4 h-4" />{uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </span>
                </label>
              ) : (
                <span className="text-sm text-slate-500">Photo changes are managed by Training.</span>
              )}
            </div>

            <Tabs defaultValue="basic">
              <TabsList className={`grid w-full ${isSystemAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="certs">Certifications</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
                {isSystemAdmin && <TabsTrigger value="company-mail">Company Email</TabsTrigger>}
              </TabsList>
              <TabsContent value="basic" className="space-y-4 mt-4">
                <fieldset disabled={isHrReadOnly} className="space-y-4 disabled:opacity-90">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label className="text-xs text-slate-500">First Name</Label><Input value={editFormData.first_name || ""} onChange={(e) => setEditFormData({...editFormData, first_name: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Last Name</Label><Input value={editFormData.last_name || ""} onChange={(e) => setEditFormData({...editFormData, last_name: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">SSN</Label><Input value={editFormData.ssn || ""} onChange={(e) => setEditFormData({...editFormData, ssn: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Date of Birth</Label><Input type="date" value={editFormData.date_of_birth || ""} onChange={(e) => setEditFormData({...editFormData, date_of_birth: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Mobile Phone</Label><Input type="tel" value={editFormData.mobile_phone || ""} onChange={(e) => setEditFormData({...editFormData, mobile_phone: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Badge Number</Label><Input value={editFormData.badge_number || ""} onChange={(e) => setEditFormData({...editFormData, badge_number: e.target.value})} /></div>
                  <div>
                    <Label className="text-xs text-slate-500">Rank</Label>
                    <Select value={editFormData.rank || "Officer"} onValueChange={(v) => setEditFormData({...editFormData, rank: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer','Human Resources','Support Staff'].map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-slate-500">Unit Number</Label><Input value={editFormData.unit_number || ""} onChange={(e) => setEditFormData({...editFormData, unit_number: e.target.value})} /></div>
                  <div>
                    <Label className="text-xs text-slate-500">Division</Label>
                    <select
                      value={editFormData.division || ''}
                      onChange={(e) => setEditFormData(prev => ({...prev, division: e.target.value, subdivision: ''}))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">None</option>
                      {divisions?.filter(d => !d.is_subdivision && d.active !== false).map(d => <option key={d.id} value={d.division_name}>{d.division_name}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-xs text-slate-500">Hire Date</Label><Input type="date" value={editFormData.hire_date || ""} onChange={(e) => setEditFormData({...editFormData, hire_date: e.target.value})} /></div>
                  <div>
                    <Label className="text-xs text-slate-500">Hourly Rate ($)</Label>
                    <Input type="number" step="0.01" value={editFormData.hourly_rate || ""} onChange={(e) => setEditFormData({...editFormData, hourly_rate: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Employment Status</Label>
                    <Select value={editFormData.employment_status || "active"} onValueChange={(v) => setEditFormData({...editFormData, employment_status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-slate-500">Termination Date</Label><Input type="date" value={editFormData.termination_date || ""} onChange={(e) => setEditFormData({...editFormData, termination_date: e.target.value})} /></div>
                  <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-800">Driver's License</div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div><Label className="text-xs text-slate-500">License Number</Label><Input value={editFormData.drivers_license_number || ""} onChange={(e) => setEditFormData({...editFormData, drivers_license_number: e.target.value})} /></div>
                      <div><Label className="text-xs text-slate-500">State</Label><Input maxLength={2} placeholder="VA" value={editFormData.drivers_license_state || ""} onChange={(e) => setEditFormData({...editFormData, drivers_license_state: e.target.value.toUpperCase()})} /></div>
                      <div><Label className="text-xs text-slate-500">Expiration</Label><Input type="date" value={editFormData.drivers_license_expiration || ""} onChange={(e) => setEditFormData({...editFormData, drivers_license_expiration: e.target.value})} /></div>
                    </div>
                  </div>
                  <div><Label className="text-xs text-slate-500">DCJS Number</Label><Input value={editFormData.dcjs_number || ""} onChange={(e) => setEditFormData({...editFormData, dcjs_number: e.target.value})} /></div>
                  <div>
                    <Label className="text-xs text-slate-500">DCJS Expiration <span className="text-slate-400">(auto from certifications)</span></Label>
                    <div className="text-sm font-medium py-2 px-1">
                      {(() => {
                        const val = computeDcjsExpiration(editFormData.officer_certifications);
                        return val ? new Date(val).toLocaleDateString() : <span className="text-slate-400 italic">Set via Certifications tab</span>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Firearm Expiration <span className="text-slate-400">(auto from certifications)</span></Label>
                    <div className="text-sm font-medium py-2 px-1">
                      {(() => {
                        const val = computeFirearmExpiration(editFormData.officer_certifications);
                        return val ? new Date(val).toLocaleDateString() : <span className="text-slate-400 italic">Set via Certifications tab</span>;
                      })()}
                    </div>
                  </div>
                </div>
                </fieldset>
              </TabsContent>
              <TabsContent value="certs" className="mt-4">
                <OfficerCertificationsTab editFormData={editFormData} setEditFormData={setEditFormData} readOnly={isHrReadOnly} />
              </TabsContent>
              <TabsContent value="emergency" className="space-y-4 mt-4">
                <fieldset disabled={isHrReadOnly}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label className="text-xs text-slate-500">Emergency Contact Name</Label><Input value={editFormData.emergency_contact_name || ""} onChange={(e) => setEditFormData({...editFormData, emergency_contact_name: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Relationship</Label><Input value={editFormData.emergency_contact_relationship || ""} onChange={(e) => setEditFormData({...editFormData, emergency_contact_relationship: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Emergency Phone</Label><Input type="tel" value={editFormData.emergency_contact_phone || ""} onChange={(e) => setEditFormData({...editFormData, emergency_contact_phone: e.target.value})} /></div>
                </div>
                </fieldset>
              </TabsContent>
              {isSystemAdmin && <TabsContent value="company-mail" className="space-y-4 mt-4">
                <div className={`rounded-lg border p-4 ${String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com') ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                  <div className={`flex items-center gap-2 font-semibold ${String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com') ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com') ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    Microsoft Sign-In {String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com') ? 'Ready' : 'Not Ready'}
                  </div>
                  <p className={`mt-1 text-xs ${String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com') ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {String(selectedUser?.email || '').toLowerCase().endsWith('@blackpointkjc.com')
                      ? `This Pathfinder account uses ${selectedUser?.email}. The employee can use Sign in with Microsoft and keep this same Pathfinder user ID, roles, reports, and history.`
                      : `This Pathfinder account currently signs in as ${selectedUser?.email || 'a non-Black Point address'}. Microsoft sign-in will not attach to it until the Pathfinder login email matches the employee's approved @blackpointkjc.com Microsoft 365 address. Do not create a duplicate employee account.`}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-blue-900"><Mail className="h-4 w-4" /> Company IMAP Mailbox</div>
                  <p className="mt-1 text-xs text-blue-700">Assign an approved company mailbox to this existing employee. The employee can later change only the mailbox password from My Profile.</p>
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

            {/* Roles */}
            <fieldset disabled={!isSystemAdmin} className="border-t pt-4 disabled:opacity-70">
              <Label className="text-base font-semibold mb-3 block">System Roles & Permissions</Label>
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                <Label className="text-xs font-bold uppercase tracking-wider text-amber-300">Account Type</Label>
                <Select
                  value={editFormData.role === 'admin' ? 'admin' : 'user'}
                  onValueChange={(value) => setEditFormData({ ...editFormData, role: value })}
                >
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User — standard application account</SelectItem>
                    <SelectItem value="admin">Admin — system administrator</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-slate-400">Every account is a User unless an existing system administrator explicitly changes it to Admin.</div>
              </div>
              {!isSystemAdmin && (
                <Alert className="mb-4">
                  <Shield className="h-4 w-4" />
                  <AlertDescription>Only a system administrator can change account type or toolbar permissions.</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { id: 'cad_access', label: 'CAD Access', desc: 'Command, dispatch, live map, field unit and CAD records', color: 'text-sky-800' },
                  { id: 'officer', label: 'Officer Role', desc: 'Company employee and Officer Center access', color: 'text-blue-800' },
                  { id: 'supervisor', label: 'Supervisor Tools', desc: 'CAD, inspections, write-ups and supervisor chat', color: 'text-cyan-800' },
                  { id: 'hr', label: 'HR Access', desc: 'PTO, time entries and employee management', color: 'text-emerald-800' },
                  { id: 'accounting', label: 'Accounting Access', desc: 'Payroll, invoices and financial reports', color: 'text-amber-800' },
                  { id: 'trainer', label: 'Trainer', desc: 'Training creation, compliance and student records', color: 'text-indigo-800' },
                  { id: 'full_access', label: 'Full Access', desc: 'Access to every internal operations center', color: 'text-purple-800' },
                ].map(({ id, label, desc, color }) => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`emp_${id}`}
                      checked={editFormData.additional_roles?.includes(id) || false}
                      onCheckedChange={(checked) => {
                        const roles = editFormData.additional_roles || [];
                        setEditFormData({...editFormData, additional_roles: checked ? [...roles, id] : roles.filter(r => r !== id)});
                      }}
                    />
                    <Label htmlFor={`emp_${id}`} className="cursor-pointer">
                      <div className={`font-semibold text-sm ${color || ''}`}>{label}</div>
                      <div className="text-xs text-slate-500">{desc}</div>
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>

            {/* Equipment */}
            <fieldset disabled={isHrReadOnly} className="border-t pt-4">
              <Label className="text-base font-semibold mb-3 block">Equipment ({equipment?.filter(e => e.assigned_to === selectedUser?.email).length || 0})</Label>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-300 space-y-3">
                {equipment?.filter(e => e.assigned_to === selectedUser?.email).map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border border-slate-300 text-slate-900">
                    <div><p className="text-sm font-medium">{item.product_name}</p><p className="text-xs text-slate-500">{item.equipment_type}</p></div>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => unassignEquipmentMutation.mutate({ equipmentId: item.id })}><Unlink className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Select value="" onValueChange={(eid) => { if (eid && selectedUser) assignEquipmentMutation.mutate({ equipmentId: eid, officerEmail: selectedUser.email }); }}>
                  <SelectTrigger><SelectValue placeholder="Assign equipment..." /></SelectTrigger>
                  <SelectContent>
                    {equipment?.filter(e => !e.assigned_to || e.status === 'available').map(item => (
                      <SelectItem key={item.id} value={item.id}>{item.product_name} ({item.equipment_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {editFormData.termination_date && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>This employee is marked as terminated.</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowDialog(false); setEditingUser(null); }}><X className="w-4 h-4 mr-2" />Close</Button>
              {canManageEmployees && (
                <Button type="submit" disabled={updateUserMutation.isPending}><Save className="w-4 h-4 mr-2" />{updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}