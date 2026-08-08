import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, CheckCircle, User, ShieldAlert, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import TrainingModuleViewer from "../components/training/TrainingModuleViewer";

export default function StudentPortal() {
  const [viewingModule, setViewingModule] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isStudent = user?.additional_roles?.includes('student');

  const { data: trainingModules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
    enabled: isStudent,
  });

  const { data: myCompletions = [] } = useQuery({
    queryKey: ['myTrainingCompletions', user?.email],
    queryFn: () => base44.entities.TrainingCompletion.filter({ officer_email: user.email }),
    enabled: !!user?.email && isStudent,
  });

  const completeTrainingMutation = useMutation({
    mutationFn: async ({ moduleId, moduleTitle, quizScore }) => {
      const existing = myCompletions.find(c => c.training_module_id === moduleId);
      if (existing) {
        await base44.entities.TrainingCompletion.update(existing.id, {
          completed: true,
          completion_date: new Date().toISOString(),
          notes: completionNotes,
          quiz_score: quizScore,
          quiz_attempts: (existing.quiz_attempts || 0) + 1,
        });
      } else {
        await base44.entities.TrainingCompletion.create({
          training_module_id: moduleId,
          training_title: moduleTitle,
          officer_email: user.email,
          officer_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          completed: true,
          completion_date: new Date().toISOString(),
          notes: completionNotes,
          quiz_score: quizScore,
          quiz_attempts: 1,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTrainingCompletions'] });
      setViewingModule(null);
      setCompletionNotes("");
      toast.success("Training completed!");
    },
  });

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    await base44.auth.updateMe(profileForm);
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    setSavingProfile(false);
    toast.success("Profile saved! You can now access your training.");
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStudent) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">You don't have the Student role. Contact your administrator.</p>
      </div>
    );
  }

  // Profile gate — required fields before class access
  const profileComplete = user?.first_name && user?.last_name && user?.date_of_birth && user?.ssn && user?.dcjs_number;

  if (!profileComplete) {
    return (
      <div className="min-h-screen bg-violet-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-xl border-violet-200">
          <CardHeader className="text-center border-b border-violet-100 pb-4">
            <div className="w-14 h-14 bg-violet-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-7 h-7 text-white" />
            </div>
            <CardTitle className="text-2xl text-violet-900">Complete Your Profile</CardTitle>
            <p className="text-slate-500 text-sm mt-1">Before you can access your training courses, you must complete your student profile.</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 flex gap-2 items-start">
              <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">All fields below are required to unlock your training portal.</p>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">First Name *</Label>
                  <Input
                    required
                    defaultValue={user?.first_name || ""}
                    onChange={(e) => setProfileForm(p => ({ ...p, first_name: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Last Name *</Label>
                  <Input
                    required
                    defaultValue={user?.last_name || ""}
                    onChange={(e) => setProfileForm(p => ({ ...p, last_name: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Date of Birth *</Label>
                <Input
                  type="date"
                  required
                  defaultValue={user?.date_of_birth || ""}
                  onChange={(e) => setProfileForm(p => ({ ...p, date_of_birth: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Social Security Number *</Label>
                <Input
                  required
                  placeholder="XXX-XX-XXXX"
                  defaultValue={user?.ssn || ""}
                  onChange={(e) => setProfileForm(p => ({ ...p, ssn: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600">DCJS Number *</Label>
                <Input
                  required
                  placeholder="DCJS number"
                  defaultValue={user?.dcjs_number || ""}
                  onChange={(e) => setProfileForm(p => ({ ...p, dcjs_number: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={savingProfile} className="w-full bg-violet-600 hover:bg-violet-700 mt-2">
                {savingProfile ? "Saving..." : "Save Profile & Access Training"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get assigned modules
  const assignedModules = trainingModules.filter(module => {
    if (!module.active) return false;
    if (module.assigned_to?.includes(user.email)) return true;
    if (module.assigned_divisions?.includes(user.division)) return true;
    if (module.assigned_ranks?.includes(user.rank)) return true;
    if ((!module.assigned_to || module.assigned_to.length === 0) &&
        (!module.assigned_divisions || module.assigned_divisions.length === 0) &&
        (!module.assigned_ranks || module.assigned_ranks.length === 0)) return true;
    return false;
  });

  const completedModules = assignedModules.filter(m => myCompletions.some(c => c.training_module_id === m.id && c.completed));
  const pendingModules = assignedModules.filter(m => !myCompletions.some(c => c.training_module_id === m.id && c.completed));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-700 to-indigo-800 rounded-2xl flex items-center justify-center shadow-lg">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-0.5">Black Point Protection</p>
            <h1 className="text-2xl font-bold text-slate-900">Black Point Training School</h1>
            <p className="text-slate-500 text-sm">Welcome, {user.first_name}. Complete your assigned training below.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-none shadow-sm bg-amber-50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{pendingModules.length}</p>
              <p className="text-xs text-slate-600 mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-green-50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{completedModules.length}</p>
              <p className="text-xs text-slate-600 mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-violet-50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-violet-600">{assignedModules.length}</p>
              <p className="text-xs text-slate-600 mt-1">Total Assigned</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending */}
        {pendingModules.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <div className="w-2 h-5 bg-amber-500 rounded-full" />
              Pending Training
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {pendingModules.map(module => (
                <Card key={module.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className={`h-1.5 ${module.required ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{module.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">{module.category?.replace(/_/g, ' ')}</p>
                      </div>
                      {module.required && <Badge className="bg-red-600 text-white text-xs">Required</Badge>}
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2">{module.description}</p>
                    {module.training_category === 'dcjs' && (
                      <Badge className="bg-blue-100 text-blue-800 text-xs">DCJS Training</Badge>
                    )}
                    <Button onClick={() => setViewingModule(module)} className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white" size="sm">
                      Start Training →
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Completed */}
        {completedModules.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <div className="w-2 h-5 bg-green-500 rounded-full" />
              Completed
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {completedModules.map(module => {
                const completion = myCompletions.find(c => c.training_module_id === module.id && c.completed);
                return (
                  <Card key={module.id} className="border border-green-200 bg-green-50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{module.title}</h3>
                          <p className="text-xs text-green-700 font-medium">
                            Completed {format(new Date(completion.completion_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {assignedModules.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-slate-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No training modules assigned yet. Check back soon!</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!viewingModule} onOpenChange={() => setViewingModule(null)}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b pb-3 flex-shrink-0">
            <DialogTitle className="text-lg flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <span className="truncate">{viewingModule?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {viewingModule && (
            <div className="flex-1 overflow-y-auto py-4">
              <TrainingModuleViewer
                module={viewingModule}
                isPending={completeTrainingMutation.isPending}
                onComplete={({ notes, quizScore } = {}) => {
                  setCompletionNotes(notes || "");
                  completeTrainingMutation.mutate({
                    moduleId: viewingModule.id,
                    moduleTitle: viewingModule.title,
                    quizScore,
                  });
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}