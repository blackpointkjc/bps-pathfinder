import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, Users, Edit, ShieldAlert, CheckCircle, Clock, Mail, Save, X, UserCheck, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ManageStudents() {
  const [editingStudent, setEditingStudent] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ first_name: '', last_name: '', email: '', mobile_phone: '' });
  const [editForm, setEditForm] = useState({});
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = currentUser?.role === 'admin' || currentUser?.additional_roles?.includes('full_access') || currentUser?.additional_roles?.includes('trainer');

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
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


  const waitForInvitedUser = async (email) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const users = await base44.entities.User.list();
      const invited = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (invited) return invited;
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    return null;
  };

  const createStudentMutation = useMutation({
    mutationFn: async (data) => {
      const existingUsers = await base44.entities.User.list();
      let studentUser = existingUsers.find(u => u.email?.toLowerCase() === data.email.toLowerCase());
      if (!studentUser) {
        const invitation = await base44.users.inviteUser(data.email, 'user');
        studentUser = invitation?.user || (invitation?.id ? invitation : null) || await waitForInvitedUser(data.email);
      }
      if (!studentUser?.id) {
        throw new Error('The invitation was sent, but the student record is not ready yet. Try again after the student accepts the invitation.');
      }
      return base44.entities.User.update(studentUser.id, {
        first_name: data.first_name,
        last_name: data.last_name,
        mobile_phone: data.mobile_phone,
        rank: 'Student',
        role: 'user',
        additional_roles: ['student'],
        assigned_location: null,
        assigned_locations: [],
        assigned_sites: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateDialog(false);
      setCreateForm({ first_name: '', last_name: '', email: '', mobile_phone: '' });
      toast.success('Student invitation sent. Student Portal-only access assigned.');
    },
    onError: (err) => toast.error('Unable to create student: ' + err.message),
  });

  const updateStudentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingStudent(null);
      toast.success("Student profile updated");
    },
    onError: (err) => toast.error("Failed to update: " + err.message),
  });

  const convertToOfficerMutation = useMutation({
    mutationFn: async (student) => {
      const roles = (student.additional_roles || []).filter(r => r !== 'student');
      return base44.entities.User.update(student.id, { additional_roles: roles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success("Student converted to Officer. They no longer have the Student role.");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });

  const students = allUsers.filter(u => u.additional_roles?.includes('student'));

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

  const isProfileComplete = (student) =>
    student?.first_name && student?.last_name && student?.date_of_birth && student?.ssn && student?.dcjs_number;

  const openEdit = (student) => {
    setEditingStudent(student);
    setEditForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      date_of_birth: student.date_of_birth || "",
      ssn: student.ssn || "",
      dcjs_number: student.dcjs_number || "",
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
    <div className="p-4 md:p-8">
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
        <Button onClick={() => setShowCreateDialog(true)} className="bg-violet-700 hover:bg-violet-800">
          <Plus className="w-4 h-4 mr-2" />Create Student
        </Button>
      </div>

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
            <p className="text-slate-500">No students found. Use Create Student to send an invitation with Student Portal-only access.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {students.map((student) => {
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
                        <Badge className={profileOk ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                          {profileOk ? (
                            <><CheckCircle className="w-3 h-3 mr-1" />Profile Complete</>
                          ) : (
                            <><Clock className="w-3 h-3 mr-1" />Profile Incomplete</>
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
                      {student.ssn && <div>SSN: ***-**-{student.ssn.slice(-4)}</div>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(student)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => {
                        if (window.confirm(`Convert ${student.first_name || student.email} from Student to Officer? This removes the Student role.`)) {
                          convertToOfficerMutation.mutate(student);
                        }
                      }}
                      disabled={convertToOfficerMutation.isPending}
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      Convert to Officer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Student Account</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createStudentMutation.mutate(createForm); }} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input required value={createForm.first_name} onChange={(e) => setCreateForm(p => ({...p, first_name: e.target.value}))} /></div>
              <div><Label>Last Name *</Label><Input required value={createForm.last_name} onChange={(e) => setCreateForm(p => ({...p, last_name: e.target.value}))} /></div>
            </div>
            <div><Label>Email *</Label><Input type="email" required value={createForm.email} onChange={(e) => setCreateForm(p => ({...p, email: e.target.value}))} /></div>
            <div><Label>Mobile Phone</Label><Input type="tel" value={createForm.mobile_phone} onChange={(e) => setCreateForm(p => ({...p, mobile_phone: e.target.value}))} /></div>
            <div className="rounded border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">This account will receive only the Student Portal. It will not receive CAD, Officer, HR, Trainer, Accounting, or Admin access.</div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createStudentMutation.isPending} className="bg-violet-700 hover:bg-violet-800">{createStudentMutation.isPending ? 'Creating...' : 'Invite Student'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              <Label className="text-xs text-slate-500">Social Security Number *</Label>
              <Input required placeholder="XXX-XX-XXXX" value={editForm.ssn || ""} onChange={(e) => setEditForm(p => ({ ...p, ssn: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">DCJS Number *</Label>
              <Input required value={editForm.dcjs_number || ""} onChange={(e) => setEditForm(p => ({ ...p, dcjs_number: e.target.value }))} />
            </div>
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