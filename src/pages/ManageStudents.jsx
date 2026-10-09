import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, Users, Edit, ShieldAlert, CheckCircle, Clock, Mail, Save, X, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { listTrainingUsers, invalidateTrainingUsers } from '@/lib/trainingDirectory';

export default function ManageStudents({ embedded = false }) {
  const [editingStudent, setEditingStudent] = useState(null);
  const [reviewingStudent, setReviewingStudent] = useState(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [studentInvite, setStudentInvite] = useState({ first_name: '', last_name: '', email: '', date_of_birth: '' });
  const [inviting, setInviting] = useState(false);
  const [editForm, setEditForm] = useState({});
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isSystemAdmin = currentUser?.role === 'admin';
  const hasAccess = isSystemAdmin || currentUser?.additional_roles?.includes('full_access') || currentUser?.additional_roles?.includes('trainer');

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['trainingUsers', 'manageStudents'],
    queryFn: async () => {
      const allUsers = await listTrainingUsers() || [];
      return allUsers.filter(u => !u.termination_date);
    },
    enabled: hasAccess,
  });

  const { data: allCompletions = [] } = useQuery({
    queryKey: ['allTrainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list(),
    enabled: hasAccess,
  });

  const { data: trainingModules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list(),
    enabled: hasAccess,
  });


  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const requestedRole = data.role || 'user';
      if (data.role !== undefined && (editingStudent?.role || 'user') !== requestedRole) {
        if (!isSystemAdmin) throw new Error('Only a current system administrator can grant or remove administrator status.');
        const roleResult = await base44.functions.invoke('updateUser', {
          userId: id,
          updates: { role: requestedRole },
        });
        const rolePayload = roleResult?.data || roleResult || {};
        if (rolePayload.error) throw new Error(rolePayload.error);
      }
      const profileData = { ...data };
      delete profileData.role;
      profileData.full_name = [profileData.first_name, profileData.last_name].filter(Boolean).join(' ');
      const profileResult = await base44.functions.invoke('updateUser', {
        userId: id,
        updates: profileData,
      });
      const profilePayload = profileResult?.data || profileResult || {};
      if (profilePayload.error) throw new Error(profilePayload.error);
      return profilePayload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingStudent(null);
      toast.success("Student profile updated");
    },
    onError: (err) => toast.error("Failed to update: " + err.message),
  });

  const convertToOfficerMutation = useMutation({
    mutationFn: async (student) => {
      const roles = [...new Set([
        ...(student.additional_roles || []).filter(r => r !== 'student'),
        'officer',
      ])];
      const result = await base44.functions.invoke('updateUser', {
        userId: student.id,
        updates: { additional_roles: roles },
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success("Student converted to Officer. They no longer have the Student role.");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });

  const students = allUsers.filter(u => u.additional_roles?.includes('student') || ['student registration pending','student invitation pending'].includes(String(u.rank || '').toLowerCase()));
  const visibleStudents = students.filter(student => {
    const searchText = [student.first_name, student.last_name, student.email].filter(Boolean).join(' ').toLowerCase();
    if (!searchText.includes(studentSearch.trim().toLowerCase())) return false;
    if (studentFilter === 'approved') return student.additional_roles?.includes('student');
    if (studentFilter === 'ready') return String(student.rank || '').toLowerCase() === 'student registration pending' && student.student_intake_complete;
    if (studentFilter === 'waiting') return !student.additional_roles?.includes('student') && (!student.student_intake_complete || student.invitation_only);
    return true;
  });
  const inviteStudent = async (event) => {
    event.preventDefault(); setInviting(true);
    try {
      const response = await base44.functions.invoke('createPortalAccount', { ...studentInvite, accountType: 'student_pending' });
      const result = response?.data || response || {};
      if (!result.success) throw new Error(result.error || 'Invitation was not confirmed');
      toast.success('Student invitation processed; registration awaits trainer review');
      setShowInvite(false);
      setStudentInvite({ first_name: '', last_name: '', email: '', date_of_birth: '' });
      invalidateTrainingUsers();
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
    } catch (error) { toast.error(error.message || 'Student invitation failed'); }
    finally { setInviting(false); }
  };

  const getStudentStats = (studentEmail) => {
    const studentModules = trainingModules.filter(m => {
      if (!m.active) return false;
      const student = allUsers.find(u => u.email === studentEmail);
      if (m.assigned_to?.includes(studentEmail)) return true;
      if (student?.division && m.assigned_divisions?.includes(student.division)) return true;
      if (student?.rank && m.assigned_ranks?.includes(student.rank)) return true;
      if ((!m.assigned_to || m.assigned_to.length === 0) && (!m.assigned_divisions || m.assigned_divisions.length === 0) && (!m.assigned_ranks || m.assigned_ranks.length === 0)) return true;
      return false;
    });
    const completed = allCompletions.filter(c => c.officer_email === studentEmail && c.completed).length;
    return { total: studentModules.length, completed };
  };

  const isProfileComplete = (student) => Boolean(student?.student_intake_complete);

  const approveStudent = async student => {
    try {
      const response = await base44.functions.invoke('approveStudentAccount', { userId: student.id });
      const result = response?.data || response || {};
      if (!result.success) throw new Error(result.error || 'Approval was not confirmed');
      toast.success('Student approved. Student Portal access has been assigned automatically.');
      invalidateTrainingUsers();
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
    } catch (error) { toast.error(error?.response?.data?.error || error.message || 'Approval failed'); }
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setEditForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      date_of_birth: student.date_of_birth || "",
      dcjs_number: student.dcjs_number || "",
      role: student.role || "user",
    });
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">You need Admin or Trainer access.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "w-full px-4 py-5 md:px-6 md:py-6" : "p-4 md:p-8"}>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Manage Students</h1>
            <p className="text-slate-500 text-sm">{students.length} student{students.length !== 1 ? 's' : ''} registered</p>
          </div>
        </div>
        <Button onClick={() => setShowInvite(true)} className="bg-violet-700 text-white hover:bg-violet-600">Create Student Account</Button>
      </div>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent><DialogHeader><DialogTitle>Create Student Portal Invitation</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={inviteStudent}>
            {[["first_name","First name","text"],["last_name","Last name","text"],["email","Email address","email"],["date_of_birth","Date of birth","date"]].map(([key,label,type]) => <label key={key} className="block text-sm font-semibold">{label}<Input required type={type} value={studentInvite[key]} onChange={event => setStudentInvite(previous => ({ ...previous,[key]:event.target.value }))} /></label>)}
            <p className="text-xs text-slate-600">The student completes their personal and licensing registration after accepting the invitation. This does not create an employee/officer account.</p>
            <Button disabled={inviting} type="submit">{inviting ? 'Sending invitation…' : 'Invite Student'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {isLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto" />
          <p className="mt-4 text-slate-600">Loading students...</p>
        </div>
      )}

      {!isLoading && students.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">No student accounts yet. Use Create Student Account above to invite a new student.</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-white p-3">
        <Input className="min-w-[180px] flex-1" aria-label="Search students" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Find student by name or email…" />
        <select className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" aria-label="Filter student status" value={studentFilter} onChange={event => setStudentFilter(event.target.value)}><option value="all">All students</option><option value="ready">Ready to approve</option><option value="waiting">Registration pending</option><option value="approved">Approved students</option></select>
        <span className="text-xs font-medium text-slate-500">{visibleStudents.length} shown</span>
      </div>
      <div className="space-y-4">
        {visibleStudents.map((student) => {
          const stats = getStudentStats(student.email);
          const profileOk = isProfileComplete(student);
          const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

          return (
            <Card key={student.id} className="border border-slate-200 hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white font-bold text-lg">
                      {student.first_name?.charAt(0) || student.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg text-slate-900">
                          {student.first_name && student.last_name
                            ? `${student.first_name} ${student.last_name}`
                            : student.email}
                        </h3>
                        <Badge className={student.additional_roles?.includes('student') ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                          {student.additional_roles?.includes('student') ? (
                            <><CheckCircle className="w-3 h-3 mr-1" />Approved · Student Portal Active</>
                          ) : (
                            <><Clock className="w-3 h-3 mr-1" />{student.invitation_only ? 'Invitation Pending' : profileOk ? 'Pending Trainer Approval' : 'Registration Incomplete'}</>
                          )}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                        <Mail className="w-3 h-3" />
                        {student.email}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 bg-slate-200 rounded-full h-2 w-40">
                          <div
                            className="bg-violet-600 h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{stats.completed}/{stats.total} modules ({pct}%)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <div className="text-xs space-y-1 text-slate-600">
                      {student.date_of_birth && <div>DOB: {student.date_of_birth}</div>}
                      {student.dcjs_number && <div>DCJS: {student.dcjs_number}</div>}
                      {student.student_intake_complete && <div>Identity profile received</div>}
                    </div>
                    {student.additional_roles?.includes('student') && <Button variant="outline" size="sm" onClick={() => openEdit(student)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>}
                    {student.invitation_only && <Badge className="bg-amber-100 text-amber-900">Awaiting invitation acceptance</Badge>}
                    {String(student.rank || '').toLowerCase() === 'student registration pending' && <Button className="bg-green-700 text-white" size="sm" onClick={() => setReviewingStudent(student)}>Review Student Registration</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingStudent} onOpenChange={() => setEditingStudent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student Profile — {editingStudent?.email}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateStudentMutation.mutate({ id: editingStudent.id, data: editForm });
            }}
            className="space-y-4 mt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">First Name *</Label>
                <Input required value={editForm.first_name || ""} onChange={(e) => setEditForm(p => ({ ...p, first_name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Last Name *</Label>
                <Input required value={editForm.last_name || ""} onChange={(e) => setEditForm(p => ({ ...p, last_name: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Date of Birth *</Label>
              <Input type="date" required value={editForm.date_of_birth || ""} onChange={(e) => setEditForm(p => ({ ...p, date_of_birth: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">DCJS Number *</Label>
              <Input required value={editForm.dcjs_number || ""} onChange={(e) => setEditForm(p => ({ ...p, dcjs_number: e.target.value }))} />
            </div>
            {isSystemAdmin && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="student_system_admin"
                    checked={editForm.role === 'admin'}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, role: checked ? 'admin' : 'user' })}
                  />
                  <Label htmlFor="student_system_admin" className="cursor-pointer">
                    <div className="font-bold text-amber-300">System Administrator</div>
                    <div className="text-xs text-slate-400">Adds full administrative authority while retaining the Student Portal assignment.</div>
                  </Label>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingStudent(null)}>
                <X className="w-4 h-4 mr-2" />Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={updateStudentMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateStudentMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}