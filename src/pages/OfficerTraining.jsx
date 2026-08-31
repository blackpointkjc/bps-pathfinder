import { uploadInternalFile } from '@/lib/internalUpload';
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  GraduationCap, FileText, CheckCircle, Clock, Award,
  Upload, AlertTriangle, XCircle, Calendar, RefreshCw, Eye, Info, ChevronRight, BarChart3
} from "lucide-react";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import TrainingModuleViewer from "../components/training/TrainingModuleViewer";
import { listDirectoryUsers } from '@/lib/appDirectory';

const STATUS_CONFIG = {
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-800", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-800", icon: RefreshCw },
  pending_review: { label: "Pending Review", color: "bg-orange-100 text-orange-800", icon: Eye },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
  expired: { label: "Expired", color: "bg-gray-100 text-gray-800", icon: AlertTriangle },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-800", icon: AlertTriangle },
};

export default function OfficerTraining() {
  const navigate = useNavigate();
  const [viewingModule, setViewingModule] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [submittingAssignment, setSubmittingAssignment] = useState(null);
  const [viewingAssignment, setViewingAssignment] = useState(null);
  const [submissionForm, setSubmissionForm] = useState({
    photo_url_1: "", photo_url_2: "", document_url: "", document_name: "",
    certificate_number: "", issue_date: "", expiration_date: "", officer_notes: "",
  });
  const [uploading, setUploading] = useState({});
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  // Students should use StudentPortal, not OfficerTraining
  useEffect(() => {
    if (user && user.additional_roles?.includes('student') && user.role !== 'admin') {
      navigate(createPageUrl('StudentPortal'), { replace: true });
    }
  }, [user, navigate]);

  // --- Module Training data ---
  const { data: trainingModules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
  });

  const { data: myCompletions = [] } = useQuery({
    queryKey: ['myTrainingCompletions', user?.email],
    queryFn: () => base44.entities.TrainingCompletion.filter({ officer_email: user.email }),
    enabled: !!user?.email,
  });

  // --- Compliance Assignment data ---
  const { data: assignments = [] } = useQuery({
    queryKey: ['myTrainingAssignments', user?.email],
    queryFn: () => base44.entities.TrainingAssignment.filter({ officer_email: user.email }, '-assigned_date'),
    enabled: !!user?.email,
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['myTrainingSubmissions', user?.email],
    queryFn: () => base44.entities.TrainingSubmission.filter({ officer_email: user.email }, '-submission_date'),
    enabled: !!user?.email,
  });

  // --- Module completion mutation ---
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
          officer_name: `${user.first_name} ${user.last_name}`,
          completed: true,
          completion_date: new Date().toISOString(),
          notes: completionNotes,
          quiz_score: quizScore,
          quiz_attempts: 1,
        });
      }

      // Auto-approve any matching TrainingAssignment for this officer+module
      const matchingAssignment = assignments.find(
        a => a.training_name?.toLowerCase() === moduleTitle?.toLowerCase() &&
          a.officer_email === user.email &&
          a.status !== 'approved'
      );
      if (matchingAssignment) {
        const result = await base44.functions.invoke('officerTrainingAction', {
          action: 'complete_module',
          assignment_id: matchingAssignment.id,
        });
        const payload = result?.data || result || {};
        if (payload.error) throw new Error(payload.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTrainingCompletions'] });
      queryClient.invalidateQueries({ queryKey: ['myTrainingAssignments'] });
      setViewingModule(null);
      setCompletionNotes("");
      toast.success("Training completed!");
    },
  });

  // --- Compliance submission mutation ---
  const submitMutation = useMutation({
    mutationFn: async ({ assignment, form }) => {
      const result = await base44.functions.invoke('officerTrainingAction', {
        action: 'submit',
        assignment_id: assignment.id,
        form,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      const submission = payload.submission;
      const admins = await listDirectoryUsers();
      await Promise.all(admins.filter(u => u.role === 'admin').map(admin =>
        base44.entities.Notification.create({
          recipient_email: admin.email,
          recipient_name: `${admin.first_name} ${admin.last_name}`,
          type: 'training_submission',
          priority: 'normal',
          title: `Training Submission: ${assignment.training_name}`,
          message: `${submission.officer_name} submitted proof for "${assignment.training_name}" — pending your review.`,
          read: false,
        }).catch(() => {})
      ));
      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['myTrainingSubmissions'] });
      setSubmittingAssignment(null);
      setSubmissionForm({ photo_url_1: "", photo_url_2: "", document_url: "", document_name: "", certificate_number: "", issue_date: "", expiration_date: "", officer_notes: "" });
      toast.success("Submitted for review!");
    },
  });

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, [field]: true }));
    try {
      const { file_url } = await uploadInternalFile(file);
      setSubmissionForm(prev => ({ ...prev, [field]: file_url, ...(field === 'document_url' ? { document_name: file.name } : {}) }));
      toast.success("File uploaded");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(prev => ({ ...prev, [field]: false })); }
  };

  const getLatestSubmission = (assignmentId) =>
    mySubmissions.filter(s => s.assignment_id === assignmentId)
      .sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date))[0];

  const openSubmitDialog = (assignment) => {
    const latest = getLatestSubmission(assignment.id);
    setSubmissionForm(latest ? {
      photo_url_1: latest.photo_url_1 || "", photo_url_2: latest.photo_url_2 || "",
      document_url: latest.document_url || "", document_name: latest.document_name || "",
      certificate_number: latest.certificate_number || "", issue_date: latest.issue_date || "",
      expiration_date: latest.expiration_date || "", officer_notes: "",
    } : { photo_url_1: "", photo_url_2: "", document_url: "", document_name: "", certificate_number: "", issue_date: "", expiration_date: "", officer_notes: "" });
    setSubmittingAssignment(assignment);
  };

  const getEffectiveStatus = (a) => {
    if (a.status === 'approved') return 'approved';
    if (a.due_date && isPast(new Date(a.due_date)) && a.status !== 'approved') return 'overdue';
    return a.status || 'assigned';
  };

  const getMyAssignedModules = () => {
    if (!user) return [];
    return trainingModules.filter(module => {
      if (!module.active) return false;
      if (module.assigned_to?.includes(user.email)) return true;
      if (module.assigned_divisions?.includes(user.division)) return true;
      if (module.assigned_ranks?.includes(user.rank)) return true;
      if ((!module.assigned_to || module.assigned_to.length === 0) &&
          (!module.assigned_divisions || module.assigned_divisions.length === 0) &&
          (!module.assigned_ranks || module.assigned_ranks.length === 0)) return true;
      return false;
    });
  };

  const generateCertificate = (module, completion) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    const htmlContent = `<!DOCTYPE html><html><head><title>Training Certificate</title>
      <style>@page{size:11in 8.5in landscape;margin:0.5in}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
      .back-button{position:fixed;top:10px;left:10px;padding:10px 20px;background:#1e40af;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;z-index:9999}
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Georgia',serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      .certificate{width:10in;height:7.5in;background:#ffffff!important;padding:40px 60px;box-shadow:0 20px 60px rgba(0,0,0,.3);border:15px solid #1e40af!important;position:relative}
      .certificate::before{content:'';position:absolute;top:25px;left:25px;right:25px;bottom:25px;border:2px solid #3b82f6!important}
      .header{text-align:center;margin-bottom:30px}.logo{width:120px;height:120px;margin:0 auto 20px}
      .title{font-size:48pt;color:#1e40af!important;font-weight:bold;margin-bottom:10px}.subtitle{font-size:18pt;color:#64748b!important;font-style:italic}
      .content{text-align:center;margin:40px 0}.recipient{font-size:14pt;color:#475569!important;margin-bottom:15px}
      .name{font-size:36pt;color:#1e293b!important;font-weight:bold;margin:20px 0;border-bottom:3px solid #3b82f6!important;display:inline-block;padding-bottom:10px}
      .completion-text{font-size:16pt;color:#475569!important;line-height:1.6;margin:30px 0}
      .training-title{font-size:22pt;color:#1e40af!important;font-weight:bold;margin:20px auto;max-width:90%;word-wrap:break-word}
      .footer{display:flex;justify-content:space-between;margin-top:40px;padding-top:20px;border-top:2px solid #e2e8f0!important}
      .signature-section{text-align:center}.signature-line{width:250px;margin:10px auto}
      .signature-image{width:100%;height:auto;max-height:120px;object-fit:contain;margin-bottom:5px}
      .signature-label{font-size:11pt;color:#64748b!important}.date{font-size:12pt;color:#1e293b!important;font-weight:bold}
      .seal{width:120px;height:120px;border:3px solid #1e40af!important;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;background:linear-gradient(135deg,#3b82f6 0%,#1e40af 100%)!important;color:white!important;font-size:9pt;text-align:center;padding:15px;line-height:1.3}
      </style></head><body>
      <button class="back-button no-print" onclick="window.close()">← Back to App</button>
      <div class="certificate">
        <div class="header"><div class="logo"><img src="/black-point-shield.webp" style="width:100%;height:100%;object-fit:contain"/></div>
        <div class="title">CERTIFICATE</div><div class="subtitle">of Training Completion</div></div>
        <div class="content"><div class="recipient">This certifies that</div>
        <div class="name">${user.first_name} ${user.last_name}</div>
        ${user.rank ? `<div style="font-size:14pt;color:#64748b;margin-top:10px">${user.rank}</div>` : ''}
        <div class="completion-text">has successfully completed the required training program</div>
        <div class="training-title">${module.title}</div></div>
        <div class="footer">
          <div class="signature-section"><div class="signature-line">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/ae268d2bf_ChatGPTImageDec31202509_09_27PM.png" alt="Signature" class="signature-image"/></div>
            <div class="signature-label">Training Coordinator</div>
            <div class="date" style="margin-top:20px">Date: ${format(new Date(completion.completion_date), 'MMMM d, yyyy')}</div></div>
          <div class="signature-section"><div class="seal"><div>BLACK POINT<br/>PROTECTION<br/>CERTIFIED</div></div>
          <div class="signature-label" style="margin-top:10px">Official Seal</div></div>
        </div>
      </div>
      <script>window.onload=function(){setTimeout(()=>{window.print()},500)}</script>
      </body></html>`;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const assignedModules = getMyAssignedModules();
  const completedModules = assignedModules.filter(m => myCompletions.some(c => c.training_module_id === m.id && c.completed));
  const pendingModules = assignedModules.filter(m => !myCompletions.some(c => c.training_module_id === m.id && c.completed));

  const activeAssignments = assignments.filter(a => !['approved'].includes(a.status));
  const completedAssignments = assignments.filter(a => a.status === 'approved');
  const overdueCount = assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && a.status !== 'approved').length;

  return (
    <div className="bps-command-page min-h-screen overflow-x-hidden bg-[#080d16] p-3 text-white sm:p-4 md:p-5">
      <div className="mx-auto w-full min-w-0 space-y-4" style={{ maxWidth: '1180px' }}>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 sm:h-11 sm:w-11">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white sm:text-2xl">My Training & Compliance</h1>
            <p className="text-slate-500 text-sm">All training modules, certifications, and compliance records</p>
            </div>
          </div>
          <Link
            to={createPageUrl("MyPerformanceAnalytics")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 sm:w-auto"
          >
            <BarChart3 className="w-4 h-4" />
            View My Performance <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Summary Stats */}
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-none shadow-sm bg-amber-50">
            <CardContent className="p-3 text-center sm:p-4">
              <p className="text-3xl font-bold text-amber-600">{pendingModules.length}</p>
              <p className="text-xs text-slate-600 mt-1">Modules Pending</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-green-50">
            <CardContent className="p-3 text-center sm:p-4">
              <p className="text-3xl font-bold text-green-600">{completedModules.length}</p>
              <p className="text-xs text-slate-600 mt-1">Modules Completed</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-blue-50">
            <CardContent className="p-3 text-center sm:p-4">
              <p className="text-3xl font-bold text-blue-600">{completedAssignments.length}</p>
              <p className="text-xs text-slate-600 mt-1">Certifications Approved</p>
            </CardContent>
          </Card>
          <Card className={`border-none shadow-sm ${overdueCount > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <CardContent className="p-3 text-center sm:p-4">
              <p className={`text-3xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>{overdueCount}</p>
              <p className="text-xs text-slate-600 mt-1">Overdue Items</p>
            </CardContent>
          </Card>
        </div>

        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-800 font-medium text-sm">You have {overdueCount} overdue training item{overdueCount > 1 ? 's' : ''}. Please complete them immediately.</p>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="modules">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 border bg-white p-1 sm:grid-cols-2 lg:w-auto">
            <TabsTrigger value="modules" className="min-w-0 gap-2 whitespace-normal py-2 text-left">
              <GraduationCap className="w-4 h-4" />
              Training Modules {pendingModules.length > 0 && <Badge className="bg-amber-500 text-white text-xs ml-1">{pendingModules.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="compliance" className="min-w-0 gap-2 whitespace-normal py-2 text-left">
              <CheckCircle className="w-4 h-4" />
              Certifications & Compliance {activeAssignments.length > 0 && <Badge className="bg-blue-500 text-white text-xs ml-1">{activeAssignments.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ---- MODULES TAB ---- */}
          <TabsContent value="modules" className="mt-4 space-y-4">
            {pendingModules.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-2 h-5 bg-amber-500 rounded-full" />
                  Pending Training
                </h2>
                <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                  {pendingModules.map(module => (
                    <Card key={module.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-all">
                      <div className={`h-1.5 ${module.required ? 'bg-red-500' : 'bg-amber-400'}`} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{module.title}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">{module.category?.replace(/_/g, ' ')}</p>
                          </div>
                          {module.required && <Badge className="bg-red-600 text-white text-xs">Required</Badge>}
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">{module.description}</p>
                        <div className="flex gap-2 flex-wrap">
                          {module.duration_minutes && <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{module.duration_minutes} min</Badge>}
                          {(module.material_types?.includes('document') || module.material_type === 'document' || module.material_type === 'both' || module.document_url) && <Badge className="bg-blue-100 text-blue-800 text-xs">📄 Document</Badge>}
                          {(module.material_types?.includes('video') || module.material_type === 'video' || module.material_type === 'both' || (module.video_urls && module.video_urls.length > 0) || module.video_url) && <Badge className="bg-purple-100 text-purple-800 text-xs">🎬 Video</Badge>}
                          {(module.material_types?.includes('quiz') || module.material_type === 'quiz' || (module.quiz_questions && module.quiz_questions.length > 0)) && <Badge className="bg-green-100 text-green-800 text-xs">📝 Quiz</Badge>}
                          {(module.material_types?.includes('slideshow') || module.material_type === 'slideshow' || (module.slideshow_urls && module.slideshow_urls.length > 0)) && <Badge className="bg-blue-600 text-white text-xs">🖼️ Slideshow</Badge>}
                        </div>
                        <Button onClick={() => setViewingModule(module)} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white" size="sm">
                          Start Training →
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {completedModules.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-2 h-5 bg-green-500 rounded-full" />
                  Completed Modules
                </h2>
                <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                  {completedModules.map(module => {
                    const completion = myCompletions.find(c => c.training_module_id === module.id && c.completed);
                    return (
                      <Card key={module.id} className="border border-green-200 bg-green-50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-900">{module.title}</h3>
                                <p className="text-xs text-green-700 font-medium mt-0.5">
                                  Completed {format(new Date(completion.completion_date), 'MMM d, yyyy')}
                                </p>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => generateCertificate(module, completion)}>
                              <Award className="w-4 h-4 mr-1" /> Certificate
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {assignedModules.length === 0 && (
              <Card><CardContent className="p-12 text-center text-slate-500">
                <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No training modules assigned yet</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ---- COMPLIANCE TAB ---- */}
          <TabsContent value="compliance" className="space-y-4 mt-4">
            <Tabs defaultValue="active">
              <TabsList className="bg-white border">
                <TabsTrigger value="active">Active ({activeAssignments.length})</TabsTrigger>
                <TabsTrigger value="completed">Approved ({completedAssignments.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-3 mt-3">
                {activeAssignments.length === 0 ? (
                  <Card><CardContent className="p-12 text-center text-slate-500">
                    <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>No active compliance assignments</p>
                  </CardContent></Card>
                ) : activeAssignments.map(assignment => {
                  const effectiveStatus = getEffectiveStatus(assignment);
                  const statusCfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.assigned;
                  const StatusIcon = statusCfg.icon;
                  const latestSub = getLatestSubmission(assignment.id);
                  const isRejected = assignment.status === 'rejected';
                  const canSubmit = ['assigned', 'in_progress', 'rejected'].includes(assignment.status);

                  return (
                    <Card key={assignment.id} className="border border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-slate-900">{assignment.training_name}</h3>
                              <Badge className={statusCfg.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {effectiveStatus === 'overdue' ? 'OVERDUE' : statusCfg.label}
                              </Badge>
                              {assignment.is_mandatory && <Badge className="bg-red-100 text-red-800 text-xs">Mandatory</Badge>}
                            </div>
                            <p className="text-xs text-slate-500 capitalize">{assignment.category?.replace(/_/g, ' ')}</p>
                            <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                               {assignment.assigned_date && <span><Calendar className="w-3 h-3 inline mr-1" />Assigned: {format(new Date(assignment.assigned_date), 'MMM d, yyyy')}</span>}
                               {assignment.due_date && (
                                 <span className={isPast(new Date(assignment.due_date)) && assignment.status !== 'approved' ? 'text-red-600 font-semibold' : ''}>
                                   <Clock className="w-3 h-3 inline mr-1" />Due: {format(new Date(assignment.due_date), 'MMM d, yyyy')}
                                 </span>
                               )}
                            </div>
                            {assignment.admin_notes && (
                              <div className="mt-2 bg-blue-50 border border-blue-100 rounded p-2 text-xs text-blue-800">
                                <Info className="w-3 h-3 inline mr-1" /><strong>Admin Note:</strong> {assignment.admin_notes}
                              </div>
                            )}
                            {isRejected && latestSub?.rejection_reason && (
                              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800">
                                <XCircle className="w-3 h-3 inline mr-1" /><strong>Rejection:</strong> {latestSub.rejection_reason}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {latestSub && (
                              <Button size="sm" variant="outline" onClick={() => setViewingAssignment({ assignment, submission: latestSub })}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {canSubmit && (
                              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => openSubmitDialog(assignment)}>
                                <Upload className="w-4 h-4 mr-1" />
                                {isRejected ? 'Resubmit' : latestSub ? 'Update' : 'Submit'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>

              <TabsContent value="completed" className="space-y-3 mt-3">
                {completedAssignments.length === 0 ? (
                  <Card><CardContent className="p-12 text-center text-slate-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>No approved certifications yet</p>
                  </CardContent></Card>
                ) : completedAssignments.map(assignment => {
                  const latestSub = getLatestSubmission(assignment.id);
                  return (
                    <Card key={assignment.id} className="border border-green-200 bg-green-50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <h3 className="font-semibold text-slate-900">{assignment.training_name}</h3>
                              <Badge className="bg-green-100 text-green-800">Approved</Badge>
                            </div>
                            <p className="text-xs text-slate-500 capitalize">{assignment.category?.replace(/_/g, ' ')}</p>
                            {latestSub && (
                              <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                                {latestSub.reviewed_date && <span>Approved: {format(new Date(latestSub.reviewed_date), 'MMM d, yyyy')}</span>}
                                {latestSub.expiration_date && (
                                  <span className={isPast(new Date(latestSub.expiration_date)) ? 'text-red-600 font-semibold' : 'text-green-700'}>
                                    Expires: {format(new Date(latestSub.expiration_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            )}
                            {(assignment.renewal_period_months > 0 || latestSub?.expiration_date) && (assignment.renewal_due_date || latestSub?.expiration_date) && (
                              <p className="text-xs text-blue-700 mt-1">Renewal due: {format(new Date(assignment.renewal_due_date || latestSub?.expiration_date), 'MMM d, yyyy')}</p>
                            )}
                          </div>
                          {latestSub && (
                            <Button size="sm" variant="outline" onClick={() => setViewingAssignment({ assignment, submission: latestSub })}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* Module Viewer Dialog */}
      <Dialog open={!!viewingModule} onOpenChange={() => setViewingModule(null)}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden sm:max-h-[92vh] sm:w-auto">
          <DialogHeader className="border-b pb-3 flex-shrink-0">
            <DialogTitle className="text-lg flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <span className="truncate">{viewingModule?.title}</span>
            </DialogTitle>
            {viewingModule?.description && (
              <p className="text-sm text-slate-500 mt-1 ml-12">{viewingModule.description}</p>
            )}
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

      {/* Submit Proof Dialog */}
      <Dialog open={!!submittingAssignment} onOpenChange={() => setSubmittingAssignment(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:max-h-[90vh] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Submit Proof — {submittingAssignment?.training_name}
            </DialogTitle>
          </DialogHeader>
          {submittingAssignment && (
            <div className="space-y-4">
              {submittingAssignment.required_proof_type && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  <strong>Required proof:</strong> {submittingAssignment.required_proof_type}
                </div>
              )}
              {['photo_url_1', 'photo_url_2'].map((field, i) => (
                <div key={field} className="space-y-2">
                  <Label>Photo {i + 1} {field === 'photo_url_1' && submittingAssignment.requires_photos && <span className="text-red-500">*</span>}{field === 'photo_url_2' && '(Optional)'}</Label>
                  {submissionForm[field] ? (
                    <div className="relative">
                      <img src={submissionForm[field]} alt={`Proof ${i+1}`} className="w-full h-40 object-cover rounded-lg border" />
                      <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={() => setSubmissionForm(p => ({ ...p, [field]: "" }))}>Remove</Button>
                    </div>
                  ) : (
                    <div>
                      <input type="file" accept="image/*" id={field} className="hidden" onChange={(e) => handleFileUpload(e, field)} />
                      <Button type="button" variant="outline" className="w-full" disabled={uploading[field]} onClick={() => document.getElementById(field).click()}>
                        <Upload className="w-4 h-4 mr-2" />{uploading[field] ? 'Uploading...' : `Upload Photo ${i+1}`}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="space-y-2">
                <Label>Document / Certificate (PDF, optional)</Label>
                {submissionForm.document_url ? (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm flex-1 truncate">{submissionForm.document_name || 'Document uploaded'}</span>
                    <Button size="sm" variant="ghost" onClick={() => setSubmissionForm(p => ({ ...p, document_url: "", document_name: "" }))}>Remove</Button>
                  </div>
                ) : (
                  <div>
                    <input type="file" accept=".pdf,.doc,.docx" id="doc" className="hidden" onChange={(e) => handleFileUpload(e, 'document_url')} />
                    <Button type="button" variant="outline" className="w-full" disabled={uploading.document_url} onClick={() => document.getElementById('doc').click()}>
                      <FileText className="w-4 h-4 mr-2" />{uploading.document_url ? 'Uploading...' : 'Upload Document'}
                    </Button>
                  </div>
                )}
              </div>
              {submittingAssignment.requires_certificate_number && (
                <div className="space-y-2">
                  <Label>Certificate / Card Number <span className="text-red-500">*</span></Label>
                  <Input value={submissionForm.certificate_number} onChange={e => setSubmissionForm(p => ({ ...p, certificate_number: e.target.value }))} placeholder="Enter certificate number" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Issue Date</Label>
                  <Input type="date" value={submissionForm.issue_date} onChange={e => setSubmissionForm(p => ({ ...p, issue_date: e.target.value }))} /></div>
                <div className="space-y-2">
                  <Label>Expiration Date {submittingAssignment.requires_expiration_date && <span className="text-red-500">*</span>}</Label>
                  <Input type="date" value={submissionForm.expiration_date} onChange={e => setSubmissionForm(p => ({ ...p, expiration_date: e.target.value }))} /></div>
              </div>
              <div className="space-y-2">
                <Label>Notes / Comments</Label>
                <Textarea value={submissionForm.officer_notes} onChange={e => setSubmissionForm(p => ({ ...p, officer_notes: e.target.value }))} rows={3} placeholder="Add notes for admin..." />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setSubmittingAssignment(null)}>Cancel</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={submitMutation.isPending}
                  onClick={() => submitMutation.mutate({ assignment: submittingAssignment, form: submissionForm })}>
                  <CheckCircle className="w-4 h-4 mr-2" />{submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Submission Dialog */}
      <Dialog open={!!viewingAssignment} onOpenChange={() => setViewingAssignment(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:max-h-[90vh] sm:w-auto">
          <DialogHeader>
            <DialogTitle>Submission Details — {viewingAssignment?.assignment?.training_name}</DialogTitle>
          </DialogHeader>
          {viewingAssignment?.submission && (
            <div className="space-y-4">
              <Badge className={STATUS_CONFIG[viewingAssignment.submission.status]?.color || 'bg-slate-100 text-slate-800'}>
                {STATUS_CONFIG[viewingAssignment.submission.status]?.label}
              </Badge>
              {viewingAssignment.submission.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                  <strong>Rejection reason:</strong> {viewingAssignment.submission.rejection_reason}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {viewingAssignment.submission.photo_url_1 && (
                  <a href={viewingAssignment.submission.photo_url_1} target="_blank" rel="noreferrer">
                    <img src={viewingAssignment.submission.photo_url_1} alt="Proof 1" className="w-full h-32 object-cover rounded border" />
                  </a>
                )}
                {viewingAssignment.submission.photo_url_2 && (
                  <a href={viewingAssignment.submission.photo_url_2} target="_blank" rel="noreferrer">
                    <img src={viewingAssignment.submission.photo_url_2} alt="Proof 2" className="w-full h-32 object-cover rounded border" />
                  </a>
                )}
              </div>
              {viewingAssignment.submission.document_url && (
                <a href={viewingAssignment.submission.document_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-slate-50 border rounded hover:bg-slate-100">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-600">{viewingAssignment.submission.document_name || 'View Document'}</span>
                </a>
              )}
              {viewingAssignment.submission.admin_cert_file_url && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Official Certificate (attached by admin)</p>
                  <a href={viewingAssignment.submission.admin_cert_file_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 p-3 bg-green-50 border border-green-300 rounded hover:bg-green-100">
                    <FileText className="w-4 h-4 text-green-700" />
                    <span className="text-sm text-green-800 font-medium">View / Download Certificate</span>
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {viewingAssignment.submission.certificate_number && <div><Label className="text-xs">Cert #</Label><p>{viewingAssignment.submission.certificate_number}</p></div>}
                {viewingAssignment.submission.issue_date && <div><Label className="text-xs">Issue Date</Label><p>{format(new Date(viewingAssignment.submission.issue_date), 'MMM d, yyyy')}</p></div>}
                {viewingAssignment.submission.expiration_date && <div><Label className="text-xs">Expires</Label><p>{format(new Date(viewingAssignment.submission.expiration_date), 'MMM d, yyyy')}</p></div>}
                {viewingAssignment.submission.reviewed_date && <div><Label className="text-xs">Reviewed</Label><p>{format(new Date(viewingAssignment.submission.reviewed_date), 'MMM d, yyyy')}</p></div>}
              </div>
              {viewingAssignment.submission.officer_notes && (
                <div><Label className="text-xs">Your Notes</Label><p className="text-sm mt-1">{viewingAssignment.submission.officer_notes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}