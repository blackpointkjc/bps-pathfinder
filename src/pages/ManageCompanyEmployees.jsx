import { canAccessAccounting } from '@/lib/accountingAccess';
import EmployeeDirectory from '@/components/admin/EmployeeDirectory';
import { isClientAccount } from '@/lib/directoryUtils';
import { getPayRangeForRank, previewRankChange } from '@/utils/rankPolicy';
import CommandRankTiers from '@/components/CommandRankTiers';
import { reportingLabel, oversightLabel } from '@/utils/commandReporting';
import { uploadInternalFile } from '@/lib/internalUpload';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Mail, Phone, Calendar, Edit, Save, X, AlertTriangle, Unlink, Camera, Loader2, UserMinus, CheckCircle2 } from "lucide-react";
import OfficerCertificationsTab from "../components/OfficerCertificationsTab";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ProfilePhotoCropper from "../components/ProfilePhotoCropper";
import { listDirectoryUsers, listDirectoryDivisions, invalidateAppDirectory } from '@/lib/appDirectory';
import { isCompanyEmployeeAccount } from '@/lib/directoryUtils';

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
  const explicit = certs.map(c => c?.firearm_expiration_date).filter(Boolean).sort();
  if (explicit.length) return explicit[explicit.length - 1];
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
  const [fullPhoto, setFullPhoto] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [employeeView,setEmployeeView]=useState("directory");
  const [platoonFilter,setPlatoonFilter]=useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [imapMailboxId, setImapMailboxId] = useState('');
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTestReport, setImapTestReport] = useState(null);
  const [revealedMailboxPassword, setRevealedMailboxPassword] = useState(null);
  const [revealingMailboxPassword, setRevealingMailboxPassword] = useState(false);
  const [imapForm, setImapForm] = useState({
    mailbox_email: '', display_name: '', imap_host: '', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.purelymail.com', smtp_port: 465, smtp_secure: true, username: '', password: '', active: true,
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

  const { data: users, isLoading, error: usersError, refetch: refetchUsers, isFetching: usersFetching } = useQuery({
    queryKey: ['directoryUsers', 'manageCompanyEmployees', portalContext],
    queryFn: async () => {
      if(portalContext==='hr'){
        const response=await base44.functions.invoke('getHRUsers',{});
        const payload=response?.data||response||{};
        if(payload.error || !Array.isArray(payload.users))throw new Error(payload.error||'HR personnel list unavailable');
        return payload.users;
      }
      return listDirectoryUsers('last_name',1000,true);
    },
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
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
        if (!rolePayload.success) throw new Error(rolePayload.error || rolePayload.details || "Role update failed");
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
      const response = await base44.functions.invoke('updateUser', { userId: id, updates: profileUpdates });
      const payload = response?.data || response || {};
      if (!payload.success) throw new Error(payload.error || payload.details || 'Employee update failed');
      return payload;
    },
    onSuccess: (result) => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ predicate: query => {
        const key = JSON.stringify(query.queryKey || []).toLowerCase();
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank') || key.includes('payroll') || key.includes('rate') || key.includes('cad') || key.includes('schedule') || key.includes('trainingcompliancematrix');
      }});
      setShowDialog(false);
      setEditingUser(null);
      alert(result?.user ? ('Saved '+result.user.rank+' · Unit '+result.user.unit_number+' · $'+Number(result.user.hourly_rate || 0).toFixed(2)+'/hr'+(result.warnings?.length ? '\n'+result.warnings.join('\n') : '')) : 'User updated successfully');
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
  const isTerminated = u => Boolean(u.termination_date) || ['terminated','former'].includes(String(u.employment_status||'').toLowerCase()) || String(u.account_status||'').toLowerCase()==='terminated';
  const allEmployees = (users || []).filter(u => !isClientAccount(u)&&(isCompanyEmployeeAccount(u) || isTerminated(u)));
  const activeEmployees = allEmployees.filter(u => !isTerminated(u));
  const terminatedEmployees = allEmployees.filter(isTerminated);
  const pendingOnboarding = (users||[]).filter(u => !isClientAccount(u)&&u.email && !isTerminated(u) && u.role!=='admin'
    && !(u.additional_roles||[]).some(role=>['officer','cad_access','support','support_staff','client','student','hr','accounting','trainer','supervisor','full_access'].includes(String(role).toLowerCase()))
    && !['client','student','student registration pending'].includes(String(u.rank||'').toLowerCase()));

  const transitionFormerEmployee = async (person, action) => {
    if (!isSystemAdmin) return alert('Administrator authorization required.');
    const question=action==='restore'?'Restore to pending review without operational permissions?':'Convert to client and remove all CAD roles?';
    if(!await confirmInApp(question+' '+person.email))return;
    try {
      const response=await base44.functions.invoke('manageFormerEmployee',{user_id:person.id,action});
      const payload=response?.data||response||{};
      if(!payload.success)throw new Error(payload.error||'Transition failed');
      invalidateAppDirectory();
      await refetchUsers();
      alert(action==='restore'?'Restored pending administrator role review.':'Converted to client. Verify property permissions separately.');
    }catch(error){alert(error?.response?.data?.error||error.message||'Transition failed');}
  };
  const filterBySearch=list=>list.filter(person=>{
   if(platoonFilter!=='all'&&(person.platoon||'unassigned')!==platoonFilter)return false;
   const hay=[person.first_name,person.last_name,person.rank,person.email,person.unit_number,person.division,person.subdivision].filter(Boolean).join(' ').toLowerCase();
   return hay.includes(searchQuery.trim().toLowerCase());
  });

  const handleRankChange = rank => {
    try { setEditFormData(prev => ({...prev,...previewRankChange(selectedUser, rank, users || [])})); }
    catch(error) { alert(error.message); }
  };

  const handleEditUser = (userData) => {
    setEditingUser(userData.id);
    setImapMailboxId('');
    setImapTestReport(null);
    setRevealedMailboxPassword(null);
    setImapForm({ mailbox_email: '', display_name: '', imap_host: 'imap.purelymail.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.purelymail.com', smtp_port: 465, smtp_secure: true, username: '', password: '', active: true });
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
      profile_photo_original_url: userData.profile_photo_original_url || "",
      officer_certifications: Array.isArray(userData.officer_certifications) ? userData.officer_certifications : []
    });
    setSelectedUser(userData);
    setShowDialog(true);
  };

  const saveCompanyMailbox = async () => {
    if (!editingUser || !selectedUser || !isSystemAdmin) return;
    if (!imapForm.mailbox_email.trim()) {
      alert('Company email address is required.');
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
        imap_host: imapMailboxId ? imapForm.imap_host.trim() || 'imap.purelymail.com' : 'imap.purelymail.com', imap_port: imapMailboxId ? Number(imapForm.imap_port || 993) : 993, imap_secure: imapMailboxId ? imapForm.imap_secure !== false : true,
        smtp_host: imapMailboxId ? imapForm.smtp_host.trim() || 'smtp.purelymail.com' : 'smtp.purelymail.com', smtp_port: imapMailboxId ? Number(imapForm.smtp_port || 465) : 465, smtp_secure: imapMailboxId ? imapForm.smtp_secure !== false : true,
        username: imapMailboxId ? (imapForm.username.trim() || imapForm.mailbox_email.trim().toLowerCase()) : imapForm.mailbox_email.trim().toLowerCase(), updated_by: user?.email || '',
        ...(imapForm.password ? { password: imapForm.password } : {}),
      };
      const saved = imapMailboxId
        ? await base44.entities.CompanyImapMailbox.update(imapMailboxId, payload)
        : await base44.entities.CompanyImapMailbox.create(payload);
      setImapMailboxId(saved.id || imapMailboxId);
      setImapTestReport(null);
      setRevealedMailboxPassword(null);
      setImapForm(current => ({ ...current, password: '' }));
      alert('Company IMAP mailbox assignment saved.');
    } catch (error) {
      alert('Unable to save company mailbox: ' + (error?.message || 'Unknown error'));
    } finally {
      setImapSaving(false);
    }
  };

  const toggleMailboxPassword = async () => {
    if (revealedMailboxPassword !== null) { setRevealedMailboxPassword(null); return; }
    if (!isSystemAdmin || !imapMailboxId || !editingUser) return;
    try {
      setRevealingMailboxPassword(true);
      // Fetch only after an explicit administrator click; never place the
      // existing credential into the editable password input or console logs.
      const mailbox = await base44.entities.CompanyImapMailbox.get(imapMailboxId);
      if (String(mailbox?.user_id) !== String(editingUser)) throw new Error('Selected mailbox does not belong to this officer.');
      if (!mailbox?.password) throw new Error('The existing password is not available to this administrator.');
      setRevealedMailboxPassword(String(mailbox.password));
    } catch (error) { alert('Unable to reveal mailbox password: ' + (error?.message || 'Access denied')); }
    finally { setRevealingMailboxPassword(false); }
  };

  const verifyCompanyMailbox = async () => {
    if (!imapMailboxId) return alert('Save the company mailbox first.');
    try {
      setImapSaving(true);
      setImapTestReport(null);
      const result = await base44.functions.invoke('companyImapMail', {action:'verify',mailbox_id:imapMailboxId});
      const payload = result?.data || result || {};
      setImapTestReport(payload.error ? {ok:false,error:payload.error} : payload);
    } catch(error) {
      setImapTestReport({ok:false,error:error?.message || 'Connection test could not be completed'});
    } finally { setImapSaving(false); }
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
          throw new Error('Cropped photo upload failed: ' + (uploadError?.message || uploadError));
        }
      }
      let originalUrl = '';
      if (photoToCrop) {
        try {
          const original = await uploadInternalFile(photoToCrop);
          originalUrl = original?.file_url || '';
        } catch (error) {
          console.warn('Full-resolution original unavailable; using high-resolution crop:', error?.message);
        }
      }
      if (!file || photoUrl === dataUrl) throw new Error('The cropped photo could not be stored.');
      if (!originalUrl) originalUrl = photoUrl;
      const result = await base44.functions.invoke('updateUser', {
        userId: editingUser,
        updates: { profile_photo_url: photoUrl, profile_photo_original_url: originalUrl },
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.details || payload.error);
      setEditFormData(prev => ({ ...prev, profile_photo_url: photoUrl, profile_photo_original_url: originalUrl }));
      setSelectedUser(prev => prev ? { ...prev, profile_photo_url: photoUrl, profile_photo_original_url: originalUrl } : prev);
      setPhotoToCrop(null);
      invalidateAppDirectory();
      await queryClient.invalidateQueries({ predicate: query => {
        const key = JSON.stringify(query.queryKey || []).toLowerCase();
        return key.includes('user') || key.includes('directory') || key.includes('officer') || key.includes('supervisor') || key.includes('chat') || key.includes('personnel') || key.includes('rank') || key.includes('payroll') || key.includes('rate') || key.includes('cad') || key.includes('schedule');
      }});
      const photoChange = { userId: editingUser, profile_photo_url: photoUrl };
      window.dispatchEvent(new CustomEvent('bps-personnel-photo-updated', { detail: photoChange }));
      try {
        const channel = new BroadcastChannel('bps-pathfinder-personnel-photos');
        channel.postMessage(photoChange);
        channel.close();
      } catch {}
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
        // Always include role arrays and home-address fields, even when empty,
        // so admins can both set and clear the officer's navigation address.
        if (key === 'additional_roles') return true;
        if (['address', 'city', 'state', 'zip'].includes(key)) return true;
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
              <button type="button" onClick={() => setFullPhoto({url:userData.profile_photo_url,fallback:userData.profile_photo_url,name:`${userData.first_name || ''} ${userData.last_name || ''}`})} aria-label="View full officer photo"><img src={userData.profile_photo_url} alt={`${userData.first_name} ${userData.last_name}`} className={`w-14 h-14 rounded-full object-cover ${isTerminated ? 'grayscale' : ''}`} /></button>
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
                {(userData.additional_roles || []).map(role => String(role).toLowerCase()).includes('officer') && <Badge className="border-blue-300 bg-blue-100 text-blue-900">Officer</Badge>}
                {isTerminated && <Badge variant="destructive">Terminated</Badge>}
                {userData.rank && <Badge className={getRankColor(userData.rank)}>{userData.rank}</Badge>}
                {userData.unit_number && <Badge variant="outline">Unit #{userData.unit_number}</Badge>}
                {userData.division && <Badge variant="outline">{userData.subdivision ? `${userData.division} - ${userData.subdivision}` : userData.division}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isTerminated && isSystemAdmin && <><Button size="sm" variant="outline" onClick={()=>transitionFormerEmployee(userData,'restore')}>Restore Pending</Button><Button size="sm" variant="outline" onClick={()=>transitionFormerEmployee(userData,'convert_client')}>Move to Client</Button></>}
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

  const hierarchyRanks = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
  const commandRanks = new Set(['Colonel','Lt Colonel','Major']);
  const rankSort = (a,b) => {
    const ai=hierarchyRanks.indexOf(a.rank), bi=hierarchyRanks.indexOf(b.rank);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || (Number(a.unit_number) || 9999) - (Number(b.unit_number) || 9999);
  };
  const renderHierarchyNode = (person, group, depth=0) => {
    const children = depth < 14 ? group.filter(other => other.supervisor_id === person.id && other.id !== person.id).sort(rankSort) : [];
    return <div key={person.id} className="flex min-w-0 flex-col items-center" style={{flex:'0 0 auto'}}>
      <div className="w-[280px] max-w-[calc(100vw-48px)] rounded-xl border border-amber-600/60 bg-[#101b30] p-3 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => person.profile_photo_url && setFullPhoto({url:person.profile_photo_url,fallback:person.profile_photo_url,name:`${person.first_name || ''} ${person.last_name || ''}`})} aria-label={`View full photo of ${person.first_name} ${person.last_name}`} className="shrink-0">
            {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" className="h-[78px] w-[64px] rounded-md border border-amber-600/60 object-cover"/> : <div className="flex h-[78px] w-[64px] items-center justify-center rounded-md bg-slate-700 font-bold">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
          </button>
          <div className="min-w-0 flex-1"><div className="text-[11px] font-black uppercase tracking-wider text-amber-300">{person.rank || 'Employee'}</div><div className="break-words text-sm font-black">{person.first_name} {person.last_name}</div><div className="mt-1 text-[11px] text-slate-300">Badge {person.badge_number || '—'} · Unit {person.unit_number || '—'}</div><div className="text-[11px] text-slate-300">{person.division || 'No division'} · {commandRanks.has(person.rank) ? 'Command' : `Platoon ${person.platoon || 'Unassigned'}`}</div></div>
        </div>
        <div className="mt-2 space-y-1 border-t border-slate-700 pt-2 text-[11px]"><div className="break-all text-slate-300">{person.email || 'No email'}</div><div className="text-slate-300">{person.mobile_phone || 'No phone recorded'}</div></div>
        {commandRanks.has(person.rank) && <div className="mt-2 text-xs text-amber-200">Reports to {reportingLabel(person, users || [], p=>`${p.rank} ${p.last_name || p.first_name}`)}</div>}
        <Button type="button" size="sm" variant="outline" className="mt-3 w-full border-amber-500/70 bg-slate-900 text-white hover:bg-slate-700" onClick={() => handleEditUser(person)}><Edit className="mr-2 h-3.5 w-3.5"/> Edit Personnel</Button>
        {canManageEmployees && person.additional_roles?.includes('officer') && <button type="button" className="mt-2 w-full text-center text-[11px] text-amber-300 underline underline-offset-2" onClick={async () => { if (await confirmInApp(`Move ${person.first_name} ${person.last_name} back to Pending Users? This removes their Officer role.`)) moveToPendingMutation.mutate(person); }}>Move to Pending Users</button>}
      </div>
      {children.length > 0 && <><div className="h-6 w-px bg-amber-600/70"/><div className="flex items-start justify-center gap-4 border-t border-amber-600/60 pt-4">{children.map(child => renderHierarchyNode(child,group,depth+1))}</div></>}
    </div>;
  };
  const renderHierarchySection = (title, people) => {
    const ids=new Set(people.map(person=>person.id));
    const roots=people.filter(person=>!person.supervisor_id || !ids.has(person.supervisor_id) || person.supervisor_id===person.id).sort(rankSort);
    return <section className="overflow-hidden rounded-2xl border border-amber-700/40 bg-[#0e1829]">
      <div className="border-b border-amber-700/40 bg-[#15233a] px-4 py-3 text-center text-sm font-black uppercase tracking-[.15em] text-amber-300">{title} · {people.length} Personnel</div>
      <div className="overflow-x-auto p-5">{roots.length ? <div className="flex min-w-max justify-center gap-5">{roots.map(person=>renderHierarchyNode(person,people))}</div> : <div className="py-6 text-center text-slate-400">No personnel assigned</div>}</div>
    </section>;
  };
  const renderActiveHierarchy = people => {
    const ranked=people.filter(person=>hierarchyRanks.includes(person.rank));
    const other=people.filter(person=>!hierarchyRanks.includes(person.rank));
    return <div className="space-y-5">
      <section className="rounded-2xl border border-amber-700/40 bg-[#0e1829] p-5"><h2 className="mb-4 text-center font-black text-amber-300">COMMAND — SHARED REPORTING</h2><CommandRankTiers users={ranked} renderPerson={person=>renderHierarchyNode(person,[])}/></section>
      <div className="mx-auto h-6 w-px bg-amber-600/70"/>
      <div className="grid gap-5 xl:grid-cols-2">{renderHierarchySection('Platoon A',ranked.filter(person=>person.platoon==='A' && !commandRanks.has(person.rank)))}{renderHierarchySection('Platoon B',ranked.filter(person=>person.platoon==='B' && !commandRanks.has(person.rank)))}</div>
      {ranked.some(person=>!commandRanks.has(person.rank) && !['A','B'].includes(person.platoon)) && renderHierarchySection('Unassigned Platoon',ranked.filter(person=>!commandRanks.has(person.rank) && !['A','B'].includes(person.platoon)))}
      {other.length>0 && <section className="space-y-3"><h2 className="text-lg font-black text-white">Other Company Personnel</h2><div className="grid gap-3 md:grid-cols-2">{other.map(person=>renderUserCard(person))}</div></section>}
    </div>;
  };

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <Dialog open={!!fullPhoto} onOpenChange={open => !open && setFullPhoto(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{fullPhoto?.name || 'Officer photo'}</DialogTitle></DialogHeader>{fullPhoto?.url && <img src={fullPhoto.url} onError={event => { const fallback = fullPhoto?.fallback; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={fullPhoto.name || 'Full officer photo'} className="max-h-[75vh] w-full object-contain" />}</DialogContent></Dialog>
      <ProfilePhotoCropper
        open={!!photoToCrop}
        imageFile={photoToCrop}
        saving={uploadingPhoto}
        onClose={() => setPhotoToCrop(null)}
        onSave={saveCroppedEmployeePhoto}
      />
      <header className="mb-4 rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-[#0b1a2a] p-5">
       <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Company personnel</span><h1 className="mt-1 text-2xl font-bold">Manage Company Employees</h1><p className="mt-2 text-sm text-slate-400">Employee records, certifications and employment history. Client accounts stay in Client Accounts.</p></div><div className="flex gap-4 text-center text-sm">{[['Active',activeEmployees.length],['Onboarding',pendingOnboarding.length],['Former',terminatedEmployees.length]].map(([label,count])=><div key={label}><strong className="block text-2xl text-white">{count}</strong><span className="text-xs text-slate-400">{label}</span></div>)}</div></div>
       <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]"><label className="text-xs text-slate-400">Find an employee<Input placeholder="Name, rank, unit, division or email" value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} className="mt-1 border-slate-600 bg-slate-950 text-white"/></label><label className="text-xs text-slate-400">Platoon<select value={platoonFilter} onChange={event=>setPlatoonFilter(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"><option value="all">All platoons</option><option>A</option><option>B</option><option>Command</option><option value="unassigned">Unassigned</option></select></label><label className="text-xs text-slate-400">View<select value={employeeView} onChange={event=>setEmployeeView(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"><option value="directory">Employee directory</option><option value="structure">Permanent reporting structure</option></select></label></div>
      </header>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading employees...</p>
        </div>
      ) : usersError ? (
        <Alert className="border-red-300 bg-red-50 text-red-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Employee directory could not load: {usersError.message}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetchUsers()} disabled={usersFetching}>
              {usersFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({filterBySearch(activeEmployees).length})</TabsTrigger>
            <TabsTrigger value="pending">Pending Onboarding ({filterBySearch(pendingOnboarding).length})</TabsTrigger>
            <TabsTrigger value="terminated">Terminated ({filterBySearch(terminatedEmployees).length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="space-y-3 mt-4">
            <p className="text-sm text-slate-500">Accounts awaiting administrator review. Pending accounts cannot use operational CAD functions until permissions are approved.</p>
            {filterBySearch(pendingOnboarding).length===0 && <Card className="p-6 text-slate-500">No pending employee onboarding accounts.</Card>}
            {filterBySearch(pendingOnboarding).map(person=><Card key={person.id} className="p-4"><div className="font-semibold">{[person.first_name,person.last_name].filter(Boolean).join(' ')||person.email}</div><p className="text-sm text-slate-600">{person.email}</p><p className="text-xs text-amber-700">Pending administrator role assignment — open Admin Users to select Support, Officer, Student or Client access.</p></Card>)}
          </TabsContent>
          <TabsContent value="active" className="space-y-4 mt-4">
            {filterBySearch(activeEmployees).length === 0 ? (
              <Card className="p-8 text-center"><p className="text-slate-600">No active company employees found</p></Card>
            ) : employeeView==='structure'?renderActiveHierarchy(filterBySearch(activeEmployees)):<EmployeeDirectory employees={filterBySearch(activeEmployees)} onEdit={handleEditUser} onPhoto={setFullPhoto}/>}
          </TabsContent>
          <TabsContent value="terminated" className="space-y-4 mt-4">
            {filterBySearch(terminatedEmployees).map(u => renderUserCard(u, true))}
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={open => { setShowDialog(open); if (!open) setRevealedMailboxPassword(null); }}>
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
                  <button type="button" onClick={() => setFullPhoto({url:photoPreview || editFormData.profile_photo_url,fallback:photoPreview || editFormData.profile_photo_url,name:`${editFormData.first_name || ''} ${editFormData.last_name || ''}`})} aria-label="View full officer photo"><img src={photoPreview || editFormData.profile_photo_url} alt="photo" className="w-20 h-20 rounded-full object-cover border-2 border-slate-300" /></button>
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
                  <div className="md:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3">
                    <div className="mb-3">
                      <Label className="text-xs font-bold text-cyan-900">Home / Navigation Address</Label>
                      <p className="mt-1 text-[11px] text-cyan-800">This is the same address shown in the officer's My Profile and used by the GPS Home button.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="md:col-span-2"><Label className="text-xs text-slate-600">Street Address</Label><Input autoComplete="street-address" value={editFormData.address || ""} onChange={(e) => setEditFormData({...editFormData, address: e.target.value})} placeholder="123 Main Street" /></div>
                      <div><Label className="text-xs text-slate-600">City</Label><Input autoComplete="address-level2" value={editFormData.city || ""} onChange={(e) => setEditFormData({...editFormData, city: e.target.value})} placeholder="Richmond" /></div>
                      <div className="grid grid-cols-[.8fr_1.2fr] gap-3">
                        <div><Label className="text-xs text-slate-600">State</Label><Input autoComplete="address-level1" maxLength={2} value={editFormData.state || ""} onChange={(e) => setEditFormData({...editFormData, state: e.target.value.toUpperCase()})} placeholder="VA" /></div>
                        <div><Label className="text-xs text-slate-600">ZIP</Label><Input autoComplete="postal-code" value={editFormData.zip || ""} onChange={(e) => setEditFormData({...editFormData, zip: e.target.value})} placeholder="23223" /></div>
                      </div>
                    </div>
                  </div>
                  <div><Label className="text-xs text-slate-500">Mobile Phone</Label><Input type="tel" value={editFormData.mobile_phone || ""} onChange={(e) => setEditFormData({...editFormData, mobile_phone: e.target.value})} /></div>
                  <div><Label className="text-xs text-slate-500">Badge Number</Label><Input value={editFormData.badge_number || "Assigned on first Officer-role grant"} readOnly className="bg-slate-100" /></div>
                  <div>
                    <Label className="text-xs text-slate-500">Rank</Label>
                    <Select value={editFormData.rank || "Officer"} onValueChange={handleRankChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer','Human Resources','Support Staff'].map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-slate-500">Unit Number</Label><Input value={editFormData.unit_number || ""} readOnly /><p className="mt-1 text-xs text-slate-500">Automatically assigned from the selected rank series when saved.</p></div>
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
                <OfficerCertificationsTab editFormData={editFormData} setEditFormData={setEditFormData} readOnly={isHrReadOnly} onSaveCert={async certs => {
                  const result = await base44.functions.invoke('manageOfficerCertifications',{user_id:editingUser,officer_certifications:certs});
                  const payload = result?.data || result || {};
                  if (!payload.success) throw new Error(payload.error || 'Certification save failed');
                  invalidateAppDirectory();
                  await queryClient.invalidateQueries({queryKey:['trainingUsers']});
                  await queryClient.invalidateQueries({queryKey:['roleWorkQueue']});
                  alert('Officer certification saved and review tasks updated.');
                }} />
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
                  <div className="col-span-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">Company server settings are preconfigured from the existing Sergeant Robinson mailbox: secure IMAP port 993 and secure SMTP port 465. Only provide the officer mailbox address and its password; the mailbox must already exist at the mail provider.</div>
                  <div><Label className="text-xs text-slate-500">Mailbox Password</Label><Input type="password" placeholder={imapMailboxId ? 'Leave blank to keep current password' : 'Enter mailbox password'} value={imapForm.password} onChange={e => setImapForm({...imapForm, password:e.target.value})} /></div>
                  {imapMailboxId && isSystemAdmin && <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Label className="text-xs text-slate-700">Current Officer Mailbox Password — Admin Only</Label>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-sm text-slate-900">{revealedMailboxPassword === null ? '••••••••••••' : revealedMailboxPassword}</code><Button type="button" variant="outline" size="sm" disabled={revealingMailboxPassword} onClick={toggleMailboxPassword}>{revealingMailboxPassword ? 'Loading…' : revealedMailboxPassword === null ? 'Show Password' : 'Hide Password'}</Button></div>
                    <p className="mt-2 text-xs text-slate-600">Visible only on request to system administrators. Hide it before sharing your screen. The field above is for changing the password, not displaying the stored password.</p>
                  </div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={saveCompanyMailbox} disabled={imapSaving}>{imapSaving ? 'Saving…' : 'Save Company Mailbox'}</Button>
                  {imapMailboxId && <Button type="button" variant="outline" onClick={verifyCompanyMailbox} disabled={imapSaving}>{imapSaving ? 'Testing email…' : 'Test Incoming & Outgoing Email'}</Button>}
                </div>
                {imapTestReport && <div role="status" className={`mt-3 rounded-lg border p-4 text-sm ${imapTestReport.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
                  <div className="font-bold">{imapTestReport.ok ? 'Email connection verified' : 'Email connection needs attention'}</div>
                  {imapTestReport.error && <div className="mt-2 break-words">{imapTestReport.error}</div>}
                  {imapTestReport.imap && <div className="mt-2">IMAP login: {imapTestReport.imap.ok ? 'Passed' : `Failed — ${imapTestReport.imap.error || 'Could not authenticate'}`} · {imapTestReport.imap.server}:{imapTestReport.imap.port}</div>}
                  {imapTestReport.inbox && <div className="mt-1">Inbox access: {imapTestReport.inbox.ok ? `Passed (${imapTestReport.inbox.message_count} messages)` : `Failed — ${imapTestReport.inbox.error || 'Unable to open inbox'}`}</div>}
                  {imapTestReport.network && <div className="mt-2 border-t border-amber-200 pt-2">Backend to Purelymail TLS connection: {imapTestReport.network.ok === true ? 'Passed' : imapTestReport.network.ok === false ? `Failed — ${imapTestReport.network.error}` : imapTestReport.network.detail}</div>}
                  {imapTestReport.smtp && <div className="mt-1">Outgoing SMTP: {imapTestReport.smtp.ok ? 'Authentication passed' : `Failed — ${imapTestReport.smtp.error || 'SMTP unavailable'}`}</div>}
                  <div className="mt-2 text-xs">SMTP authentication confirms the sending connection is ready; it does not send a test message or guarantee delivery.</div>
                </div>}
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
                  { id: 'full_access', label: 'Full Access', desc: 'Internal operations access; accounting is restricted to Colonel Hiers', color: 'text-purple-800' },
                ].filter(item => item.id !== 'accounting' || canAccessAccounting(selectedUser)).map(({ id, label, desc, color }) => (
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