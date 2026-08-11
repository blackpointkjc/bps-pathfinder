import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingCreate, trainingDelete, trainingUpdate } from '@/lib/trainingRecordsApi';
import { listTrainingUsers } from '@/lib/trainingDirectory';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Edit, FileText, Video, Shield, X, Upload, Download, HelpCircle, Trash2, Presentation, Clock, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

const DCJS_ITEMS = [
  "01I — Introduction to Security",
  "01E — Ethics and Professionalism",
  "02I — Legal Powers and Limitations",
  "02E — Legal Updates",
  "03I — Emergency Response",
  "03E — Emergency Response Refresher",
  "04I — First Aid / CPR",
  "04E — First Aid / CPR Renewal",
  "05I — Report Writing",
  "05E — Report Writing Advanced",
  "06I — Patrol Procedures",
  "06E — Patrol Procedures Advanced",
  "07I — Firearms Safety (Unarmed)",
  "07R — Firearms Qualification",
  "08E — Use of Force",
  "09I — Trespass Law",
  "09E — Trespass Law Update",
  "10I — Crowd Control",
  "11I — Access Control",
  "12I — Incident Reporting",
  "13I — Traffic Control",
  "14I — Fire Prevention",
  "15I — Terrorism Awareness",
];

const COMPANY_ITEMS = [
  "Company Policies & Procedures",
  "Uniform & Appearance Standards",
  "Post Orders Overview",
  "Client Relations",
  "Radio Communication",
  "Vehicle Patrol Procedures",
  "Foot Patrol Procedures",
  "Key Control",
  "Visitor Management",
  "Loss Prevention",
  "Workplace Violence Prevention",
  "Drug & Alcohol Policy",
  "Social Media Policy",
  "Confidentiality & Privacy",
  "Equipment Inspection & Care",
  "GPS & Tracking Compliance",
  "QR Patrol System",
  "Daily Activity Report Completion",
  "Incident Report Writing",
  "Supervisor Chain of Command",
  "Shift Handover Procedures",
  "Holiday Coverage Protocol",
  "Background Check Compliance",
  "OSHA Safety Standards",
];

export default function AdminTraining({ embedded = false }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    training_category: "company",
    course_id: "",
    training_items: [],
    category: "security_procedures",
    material_type: "document",
    material_types: ["document"],
    document_url: "",
    video_url: "",
    video_urls: [],
    slideshow_urls: [],
    seconds_per_slide: 30,
    duration_minutes: "",
    renewal_period_months: 0,
    requires_expiration_tracking: false,
    auto_renewal: false,
    assigned_to: [],
    assigned_divisions: [],
    assigned_ranks: [],
    required: false,
    due_after_days: "",
    active: true,
    quiz_questions: [],
    passing_score: 80,
  });
  const [uploadingSlides, setUploadingSlides] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainingModules } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
    initialData: [],
  });

  const userRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasTrainingAccess = user?.role === 'admin' || userRoles.has('trainer') || userRoles.has('full_access');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['trainingUsers'],
    queryFn: () => listTrainingUsers(true),
    enabled: hasTrainingAccess,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => base44.entities.Division.list('division_name'),
  });

  const { data: completions } = useQuery({
    queryKey: ['trainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list('-created_date'),
    initialData: [],
  });

  const saveModuleMutation = useMutation({
    mutationFn: async (data) => {
      // Sync material_type for backward compat
      const saveData = { ...data, material_type: data.material_types?.[0] || data.material_type };
      if (editingModule) {
        return await trainingUpdate('TrainingModule', editingModule.id, saveData);
      }
      const newModule = await trainingCreate('TrainingModule', saveData);
      
      // Create notifications for assigned officers (only if allUsers is available)
      const users = allUsers || [];
      const assignedOfficers = [];
      
      // Get officers by email
      if (data.assigned_to?.length > 0) {
        assignedOfficers.push(...users.filter(u => data.assigned_to.includes(u.email)));
      }
      
      // Get officers by division
      if (data.assigned_divisions?.length > 0) {
        assignedOfficers.push(...users.filter(u => 
          data.assigned_divisions.includes(u.division) && 
          !assignedOfficers.some(o => o.email === u.email)
        ));
      }
      
      // Get officers by rank
      if (data.assigned_ranks?.length > 0) {
        assignedOfficers.push(...users.filter(u => 
          data.assigned_ranks.includes(u.rank) && 
          !assignedOfficers.some(o => o.email === u.email)
        ));
      }
      
      // If no specific assignments, notify all officers
      if (!data.assigned_to?.length && !data.assigned_divisions?.length && !data.assigned_ranks?.length) {
        assignedOfficers.push(...users.filter(u => u.email && u.first_name));
      }
      
      // Create notifications
      const notificationPromises = assignedOfficers.map(officer => {
        const notification = {
          recipient_email: officer.email,
          recipient_name: `${officer.first_name} ${officer.last_name}`,
          type: 'training_assigned',
          priority: data.required ? 'high' : 'normal',
          title: `New Training: ${data.title}`,
          message: data.required 
            ? `Required training "${data.title}" has been assigned. ${data.due_after_days ? `Complete within ${data.due_after_days} days.` : 'Please complete as soon as possible.'}`
            : `New training "${data.title}" is now available.`,
          action_url: '/officer-training',
          read: false,
        };
        
        return base44.entities.Notification.create(notification);
      });
      
      // Send email notifications for required training
      if (data.required) {
        const emailPromises = assignedOfficers.map(officer => 
          base44.integrations.Core.SendEmail({
            to: officer.email,
            subject: `[REQUIRED] New Training Assignment: ${data.title}`,
            body: `
              <h2>Required Training Assignment</h2>
              <p>Dear ${officer.first_name},</p>
              <p>You have been assigned a <strong>required training module</strong>:</p>
              <h3>${data.title}</h3>
              <p>${data.description}</p>
              ${data.due_after_days ? `<p><strong>Deadline:</strong> Complete within ${data.due_after_days} days of assignment</p>` : ''}
              <p>Please log in to the Black Point Portal portal to complete this training.</p>
              <p>Best regards,<br/>Black Point Protection Training Team</p>
            `
          }).catch(err => console.error('Email failed:', err))
        );
        await Promise.all([...notificationPromises, ...emailPromises]);
      } else {
        await Promise.all(notificationPromises);
      }
      
      return newModule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingModules'] });
      resetForm();
      setShowDialog(false);
    },
    onError: (error) => {
      alert('Failed to save training module: ' + (error?.message || 'Unknown error'));
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: (id) => trainingDelete('TrainingModule', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingModules'] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      course_id: "",
      training_category: "company",
      training_items: [],
      category: "security_procedures",
      material_type: "document",
      material_types: ["document"],
      document_url: "",
      video_urls: [],
      slideshow_urls: [],
      seconds_per_slide: 30,
      duration_minutes: "",
      renewal_period_months: 0,
      requires_expiration_tracking: false,
      auto_renewal: false,
      assigned_to: [],
      assigned_divisions: [],
      assigned_ranks: [],
      required: false,
      due_after_days: "",
      active: true,
      quiz_questions: [],
      passing_score: 80,
    });
    setEditingModule(null);
  };

  const handleEdit = (module) => {
    setEditingModule(module);
    setFormData({
      title: module.title,
      description: module.description,
      course_id: module.course_id || "",
      training_category: module.training_category || "company",
      training_items: module.training_items || [],
      category: module.category,
      material_type: module.material_type,
      material_types: module.material_types || (module.material_type ? [module.material_type] : ["document"]),
      renewal_period_months: module.renewal_period_months || 0,
      requires_expiration_tracking: module.requires_expiration_tracking || false,
      auto_renewal: module.auto_renewal || false,
      document_url: module.document_url || "",
      video_urls: module.video_urls || [],
      slideshow_urls: module.slideshow_urls || [],
      seconds_per_slide: module.seconds_per_slide || 30,
      duration_minutes: module.duration_minutes || "",
      assigned_to: module.assigned_to || [],
      assigned_divisions: module.assigned_divisions || [],
      assigned_ranks: module.assigned_ranks || [],
      required: module.required || false,
      due_after_days: module.due_after_days || "",
      active: module.active !== false,
      quiz_questions: module.quiz_questions || [],
      passing_score: module.passing_score || 80,
    });
    setShowDialog(true);
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, [type]: file_url }));
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleSlideshowUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploadingSlides(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedUrls.push(file_url);
      }
      setFormData(prev => ({ ...prev, slideshow_urls: [...prev.slideshow_urls, ...uploadedUrls] }));
      alert(`Successfully uploaded ${uploadedUrls.length} slides`);
    } catch (error) {
      console.error("Error uploading slides:", error);
      alert("Failed to upload some slides");
    } finally {
      setUploadingSlides(false);
    }
  };

  const toggleMaterialType = (type) => {
    setFormData(prev => {
      const has = prev.material_types.includes(type);
      const updated = has ? prev.material_types.filter(t => t !== type) : [...prev.material_types, type];
      return { ...prev, material_types: updated, material_type: updated[0] || 'document' };
    });
  };

  const removeSlide = (index) => {
    setFormData(prev => ({
      ...prev,
      slideshow_urls: prev.slideshow_urls.filter((_, i) => i !== index)
    }));
  };

  const getCompletionStats = (moduleId) => {
    const moduleCompletions = completions.filter(c => c.training_module_id === moduleId);
    const completed = moduleCompletions.filter(c => c.completed).length;
    const total = moduleCompletions.length;
    return { completed, total };
  };

  const activeModules = trainingModules.filter(m => m.active);
  const inactiveModules = trainingModules.filter(m => !m.active);

  const exportCompletions = (module) => {
    const moduleCompletions = completions.filter(c => c.training_module_id === module.id);
    const csv = [
      ['Officer Name', 'Email', 'Status', 'Completion Date'],
      ...moduleCompletions.map(c => [
        c.officer_name,
        c.officer_email,
        c.completed ? 'Completed' : 'In Progress',
        c.completion_date ? format(new Date(c.completion_date), 'MM/dd/yyyy') : 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${module.title}_completions.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  if (!hasTrainingAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Trainer Access Required</h2>
      </div>
    );
  }

  return (
    <div className={embedded ? "w-full bg-transparent px-4 py-5 md:px-6 md:py-6" : "min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 md:p-8"}>
      <div className={embedded ? "w-full space-y-5" : "max-w-7xl mx-auto space-y-8"}>
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Training Creation</h1>
                <p className="text-slate-600 mt-1">Create and manage DCJS and company training modules</p>
              </div>
            </div>
            <Button onClick={() => { resetForm(); setShowDialog(true); }} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg h-12 px-6">
              <Plus className="w-5 h-5 mr-2" />
              Create Training Module
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
              Active Training Modules
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeModules.map((module) => {
                const stats = getCompletionStats(module.id);
                const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                return (
                  <Card key={module.id} className="border-none shadow-xl hover:shadow-2xl transition-all duration-300 bg-white overflow-hidden group">
                    <div className={`h-2 ${module.required ? 'bg-gradient-to-r from-red-500 to-pink-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'}`}></div>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                            <GraduationCap className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-900 leading-tight line-clamp-2">{module.title}</h3>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => exportCompletions(module)} className="h-8 w-8 p-0">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(module)} className="h-8 w-8 p-0">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-slate-600 line-clamp-2">{module.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {module.course_id && <Badge className="text-xs bg-blue-100 text-blue-800 border border-blue-300 font-mono">{module.course_id}</Badge>}
                        {module.training_category === "dcjs" ? <Badge className="text-xs bg-blue-600 text-white">DCJS</Badge> : <Badge className="text-xs bg-purple-600 text-white">Company</Badge>}
                        <Badge className="text-xs bg-slate-100 text-slate-700 border border-slate-200">{module.category.replace(/_/g, ' ')}</Badge>
                        {module.renewal_period_months > 0 && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Renews {module.renewal_period_months}mo</Badge>}
                        {module.required && <Badge className="text-xs bg-red-600 text-white">Required</Badge>}
                        {module.material_type === 'slideshow' && <Badge variant="outline" className="text-xs"><Presentation className="w-3 h-3 mr-1" />Slides</Badge>}
                        {module.material_type === 'quiz' && <Badge className="text-xs bg-purple-600 text-white"><HelpCircle className="w-3 h-3 mr-1" />Quiz</Badge>}
                      </div>
                      {module.duration_minutes && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {module.duration_minutes} min
                        </p>
                      )}
                      {module.training_items?.length > 0 && (
                        <div className="pt-2">
                          <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" /> Topics Covered
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {module.training_items.slice(0, 3).map((item, i) => (
                              <span key={i} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{item}</span>
                            ))}
                            {module.training_items.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{module.training_items.length - 3} more</span>
                            )}
                          </div>
                        </div>
                      )}
                      {stats.total > 0 && (
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-700">Completion Rate</p>
                            <p className="text-xs font-bold text-blue-600">{completionPercentage}%</p>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
                              style={{ width: `${completionPercentage}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{stats.completed} of {stats.total} officers</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {activeModules.length === 0 && (
              <Card className="border-none shadow-xl">
                <CardContent className="p-16 text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <GraduationCap className="w-10 h-10 text-slate-400" />
                  </div>
                  <p className="text-slate-600 text-lg">No active training modules yet</p>
                  <p className="text-slate-500 text-sm mt-2">Create your first training module to get started</p>
                </CardContent>
              </Card>
            )}
          </div>

          {inactiveModules.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Inactive Modules</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {inactiveModules.map((module) => (
                  <Card key={module.id} className="opacity-60">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{module.title}</span>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(module)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="outline">Inactive</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { resetForm(); } setShowDialog(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModule ? 'Edit Training Module' : 'Create Training Module'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveModuleMutation.mutate(formData); }} className="space-y-4">

           {/* Training Type — Radio Buttons */}
           <div className="space-y-2">
             <Label className="text-sm font-semibold text-slate-700">Training Type *</Label>
             <div className="flex gap-4">
               <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer flex-1 transition-all ${formData.training_category === "dcjs" ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
                 <input
                   type="radio"
                   name="training_category"
                   value="dcjs"
                   checked={formData.training_category === "dcjs"}
                   onChange={() => setFormData({...formData, training_category: "dcjs", training_items: []})}
                   className="w-4 h-4 accent-blue-600"
                 />
                 <span className={`font-semibold text-sm ${formData.training_category === "dcjs" ? "text-blue-800" : "text-slate-600"}`}>🏛️ DCJS Training</span>
               </label>
               <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer flex-1 transition-all ${formData.training_category === "company" ? "border-purple-600 bg-purple-50" : "border-slate-200 hover:border-purple-300"}`}>
                 <input
                   type="radio"
                   name="training_category"
                   value="company"
                   checked={formData.training_category === "company"}
                   onChange={() => setFormData({...formData, training_category: "company", training_items: []})}
                   className="w-4 h-4 accent-purple-600"
                 />
                 <span className={`font-semibold text-sm ${formData.training_category === "company" ? "text-purple-800" : "text-slate-600"}`}>🏢 Company Training</span>
               </label>
             </div>
           </div>

           {/* Training Items — dropdown to add topics */}
           <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
             <Label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
               <ListChecks className="w-4 h-4 text-slate-600" />
               Training Topics / Items Covered
             </Label>
             <div className="flex gap-2">
               <Select
                 value=""
                 onValueChange={(value) => {
                   if (value && !formData.training_items.includes(value)) {
                     setFormData({...formData, training_items: [...formData.training_items, value]});
                   }
                 }}
               >
                 <SelectTrigger className="flex-1">
                   <SelectValue placeholder={`Select ${formData.training_category === "dcjs" ? "DCJS course" : "company topic"}...`} />
                 </SelectTrigger>
                 <SelectContent className="max-h-64">
                   {(formData.training_category === "dcjs" ? DCJS_ITEMS : COMPANY_ITEMS).map((item) => (
                     <SelectItem key={item} value={item} disabled={formData.training_items.includes(item)}>
                       {item}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
             {formData.training_items.length > 0 ? (
               <div className="space-y-1.5 mt-1">
                 {formData.training_items.map((item, idx) => (
                   <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                     <span className="text-sm text-slate-800">{item}</span>
                     <button
                       type="button"
                       onClick={() => setFormData({...formData, training_items: formData.training_items.filter((_, i) => i !== idx)})}
                       className="text-slate-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                     >
                       <X className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 ))}
               </div>
             ) : (
               <p className="text-xs text-slate-400 italic">No items added yet — select from the dropdown above.</p>
             )}
           </div>

           <div className="grid md:grid-cols-2 gap-4">
             <div className="space-y-2">
               <Label>Course ID {formData.training_category === "dcjs" ? "(e.g. 01E, 07R)" : "(optional)"}</Label>
               <Input
                 placeholder={formData.training_category === "dcjs" ? "e.g. 01I, 07R, 08E" : "e.g. CPR-01"}
                 value={formData.course_id}
                 onChange={(e) => setFormData({...formData, course_id: e.target.value})}
               />
             </div>
             <div className="space-y-2">
               <Label>Title *</Label>
               <Input
                 value={formData.title}
                 onChange={(e) => setFormData({...formData, title: e.target.value})}
                 required
               />
             </div>
           </div>

           <div className="space-y-2">
             <Label>Description *</Label>
             <Textarea
               value={formData.description}
               onChange={(e) => setFormData({...formData, description: e.target.value})}
               rows={3}
               required
             />
           </div>

           <div className="grid md:grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg border">
             <div className="space-y-2">
               <Label>Renewal Period (months)</Label>
               <Input
                 type="number"
                 min="0"
                 placeholder="0 = no renewal"
                 value={formData.renewal_period_months}
                 onChange={(e) => setFormData({...formData, renewal_period_months: parseInt(e.target.value) || 0})}
               />
               <p className="text-xs text-slate-500">0 = one-time, 12 = yearly, 24 = every 2 years</p>
             </div>
             <div className="flex flex-col justify-center gap-3 pt-2">
               <div className="flex items-center gap-2">
                 <Checkbox checked={formData.requires_expiration_tracking} onCheckedChange={(c) => setFormData({...formData, requires_expiration_tracking: !!c})} />
                 <Label className="text-sm cursor-pointer">Track expiration dates</Label>
               </div>
               <div className="flex items-center gap-2">
                 <Checkbox checked={formData.auto_renewal} onCheckedChange={(c) => setFormData({...formData, auto_renewal: !!c})} />
                 <Label className="text-sm cursor-pointer">Auto-reassign on expiry</Label>
               </div>
             </div>
           </div>

           <div className="space-y-2">
             <Label>Sub-Category</Label>
             <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
               <SelectTrigger>
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="safety">Safety</SelectItem>
                 <SelectItem value="security_procedures">Security Procedures</SelectItem>
                 <SelectItem value="legal_compliance">Legal Compliance</SelectItem>
                 <SelectItem value="equipment">Equipment</SelectItem>
                 <SelectItem value="customer_service">Customer Service</SelectItem>
                 <SelectItem value="emergency_response">Emergency Response</SelectItem>
                 <SelectItem value="other">Other</SelectItem>
               </SelectContent>
             </Select>
           </div>

           {/* Material Type — Checkboxes (multi-select) */}
             <div className="space-y-3">
               <Label className="text-sm font-semibold text-slate-700">Material Type * <span className="text-xs font-normal text-slate-400">(select all that apply)</span></Label>
               <div className="grid grid-cols-1 gap-3">

                 {/* Document */}
                 <div className="rounded-lg border-2 transition-all overflow-hidden" style={{ borderColor: formData.material_types?.includes('document') ? '#3b82f6' : '#e2e8f0' }}>
                   <label className={`flex items-center gap-3 p-4 cursor-pointer ${formData.material_types?.includes('document') ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
                     <input
                       type="checkbox"
                       checked={formData.material_types?.includes('document') || false}
                       onChange={() => toggleMaterialType('document')}
                       className="w-4 h-4 accent-blue-600"
                     />
                     <FileText className="w-4 h-4 text-blue-600" />
                     <span className={`font-semibold text-sm ${formData.material_types?.includes('document') ? 'text-blue-800' : 'text-slate-600'}`}>📄 Document</span>
                   </label>
                   {formData.material_types?.includes('document') && (
                     <div className="p-4 border-t-2 border-blue-200 bg-blue-50 space-y-2">
                       <Label className="text-xs font-semibold text-blue-800">Upload Training Document (PDF, DOCX, or PowerPoint)</Label>
                       <div className="flex gap-2 items-center">
                         <Input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => handleFileUpload(e, 'document_url')} disabled={uploading} className="bg-white" />
                         {formData.document_url && (
                           <div className="flex gap-2 flex-shrink-0">
                             <Badge className="bg-green-600">✓ Uploaded</Badge>
                             <Button type="button" size="sm" variant="ghost" onClick={() => setFormData({...formData, document_url: ''})} className="h-6 w-6 p-0">
                               <X className="w-4 h-4 text-red-600" />
                             </Button>
                           </div>
                         )}
                       </div>
                       {formData.document_url && (
                         <a href={formData.document_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Preview document</a>
                       )}
                       <p className="text-xs text-blue-700">PDF and DOCX files display inline for officers. Officers must open/view the document before marking complete.</p>
                     </div>
                   )}
                 </div>

                 {/* Video */}
                 <div className="rounded-lg border-2 transition-all overflow-hidden" style={{ borderColor: formData.material_types?.includes('video') ? '#a855f7' : '#e2e8f0' }}>
                   <label className={`flex items-center gap-3 p-4 cursor-pointer ${formData.material_types?.includes('video') ? 'bg-purple-50' : 'bg-white hover:bg-slate-50'}`}>
                     <input
                       type="checkbox"
                       checked={formData.material_types?.includes('video') || false}
                       onChange={() => toggleMaterialType('video')}
                       className="w-4 h-4 accent-purple-600"
                     />
                     <Video className="w-4 h-4 text-purple-600" />
                     <span className={`font-semibold text-sm ${formData.material_types?.includes('video') ? 'text-purple-800' : 'text-slate-600'}`}>🎬 Video</span>
                   </label>
                   {formData.material_types?.includes('video') && (
                     <div className="p-4 border-t-2 border-purple-200 bg-purple-50 space-y-3">
                       <div>
                         <Label className="text-xs font-semibold text-purple-800">Slideshow Images</Label>
                         {formData.slideshow_urls.length > 0 && (
                           <div className="grid grid-cols-3 gap-2 mt-2">
                             {formData.slideshow_urls.map((url, idx) => (
                               <div key={idx} className="relative group">
                                 <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-20 object-cover rounded border border-slate-200" />
                                 <Button type="button" size="sm" variant="ghost" onClick={() => removeSlide(idx)} className="absolute top-1 right-1 h-5 w-5 p-0 bg-red-500 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <X className="w-3 h-3 text-white" />
                                 </Button>
                               </div>
                             ))}
                           </div>
                         )}
                         <div className="flex gap-2 mt-2">
                           <Input type="file" multiple accept="image/*" onChange={handleSlideshowUpload} disabled={uploadingSlides} className="hidden" id="slideshow-upload" />
                           <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('slideshow-upload').click()} disabled={uploadingSlides}>
                             <Upload className="w-4 h-4 mr-1" />{uploadingSlides ? 'Uploading...' : 'Add Slideshow Images'}
                           </Button>
                         </div>
                       </div>
                       <div>
                         <Label className="text-xs font-semibold text-purple-800">Training Videos (up to 3)</Label>
                         {formData.video_urls.map((url, idx) => (
                           <div key={idx} className="flex gap-2 items-center">
                             <Input placeholder="https://youtube.com/watch?v=... or upload file" value={url}
                               onChange={(e) => { const updated = [...formData.video_urls]; updated[idx] = e.target.value; setFormData({...formData, video_urls: updated}); }}
                               className="bg-white" />
                             <Button type="button" size="sm" variant="ghost" onClick={() => setFormData({...formData, video_urls: formData.video_urls.filter((_, i) => i !== idx)})}>
                               <X className="w-4 h-4" />
                             </Button>
                           </div>
                         ))}
                         {formData.video_urls.length < 3 && (
                           <div className="flex gap-2 flex-wrap">
                             <Button type="button" size="sm" variant="outline" onClick={() => setFormData({...formData, video_urls: [...formData.video_urls, '']})}>
                               <Plus className="w-4 h-4 mr-1" />Add Video URL
                             </Button>
                             <div>
                               <Input type="file" accept="video/*" onChange={async (e) => {
                                 const file = e.target.files[0]; if (!file) return;
                                 setUploading(true);
                                 try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setFormData(prev => ({...prev, video_urls: [...prev.video_urls, file_url]})); }
                                 catch { alert("Failed to upload video"); } finally { setUploading(false); }
                               }} disabled={uploading} className="hidden" id="video-file-upload" />
                               <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('video-file-upload').click()} disabled={uploading}>
                                 <Upload className="w-4 h-4 mr-1" />{uploading ? 'Uploading...' : 'Upload Video File'}
                               </Button>
                             </div>
                           </div>
                         )}
                         <p className="text-xs text-purple-700">Officers must watch all videos before marking training complete.</p>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Quiz */}
                 <div className="rounded-lg border-2 transition-all overflow-hidden" style={{ borderColor: formData.material_types?.includes('quiz') ? '#22c55e' : '#e2e8f0' }}>
                   <label className={`flex items-center gap-3 p-4 cursor-pointer ${formData.material_types?.includes('quiz') ? 'bg-green-50' : 'bg-white hover:bg-slate-50'}`}>
                     <input
                       type="checkbox"
                       checked={formData.material_types?.includes('quiz') || false}
                       onChange={() => toggleMaterialType('quiz')}
                       className="w-4 h-4 accent-green-600"
                     />
                     <HelpCircle className="w-4 h-4 text-green-600" />
                     <span className={`font-semibold text-sm ${formData.material_types?.includes('quiz') ? 'text-green-800' : 'text-slate-600'}`}>📝 Quiz</span>
                   </label>
                   {formData.material_types?.includes('quiz') && (
                     <div className="p-4 border-t-2 border-green-200 bg-green-50 space-y-3">
                       <div className="flex items-center justify-between">
                         <Label className="text-xs font-semibold text-green-800">Quiz Questions</Label>
                         <Button type="button" size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setFormData({
                           ...formData,
                           quiz_questions: [...formData.quiz_questions, { question: "", options: ["", "", "", ""], correct_answer: "" }]
                         })}>
                           <Plus className="w-4 h-4 mr-1" />Add Question
                         </Button>
                       </div>
                       {formData.quiz_questions.length > 0 && (
                         <div className="space-y-2">
                           <Label className="text-xs">Passing Score (%)</Label>
                           <Input type="number" min="0" max="100" value={formData.passing_score}
                             onChange={(e) => setFormData({...formData, passing_score: parseInt(e.target.value) || 80})}
                             className="bg-white w-32" />
                         </div>
                       )}
                       <div className="space-y-4 max-h-96 overflow-y-auto">
                         {formData.quiz_questions.map((q, idx) => (
                           <Card key={idx} className="bg-white border border-green-200">
                             <CardContent className="p-4 space-y-3">
                               <div className="flex items-start justify-between">
                                 <Label className="text-xs font-semibold text-green-800">Question {idx + 1}</Label>
                                 <Button type="button" size="sm" variant="ghost" onClick={() => setFormData({...formData, quiz_questions: formData.quiz_questions.filter((_, i) => i !== idx)})}>
                                   <Trash2 className="w-4 h-4 text-red-600" />
                                 </Button>
                               </div>
                               <Input placeholder="Enter question..." value={q.question} onChange={(e) => {
                                 const updated = [...formData.quiz_questions]; updated[idx].question = e.target.value;
                                 setFormData({...formData, quiz_questions: updated});
                               }} />
                               <div className="space-y-2">
                                 <Label className="text-xs text-slate-600">Answer Options</Label>
                                 {q.options?.map((opt, optIdx) => (
                                   <Input key={optIdx} placeholder={`Option ${optIdx + 1}`} value={opt} onChange={(e) => {
                                     const updated = [...formData.quiz_questions]; updated[idx].options[optIdx] = e.target.value;
                                     setFormData({...formData, quiz_questions: updated});
                                   }} />
                                 ))}
                               </div>
                               <div className="space-y-2">
                                 <Label className="text-xs text-slate-600">Correct Answer</Label>
                                 <Select value={q.correct_answer} onValueChange={(value) => {
                                   const updated = [...formData.quiz_questions]; updated[idx].correct_answer = value;
                                   setFormData({...formData, quiz_questions: updated});
                                 }}>
                                   <SelectTrigger><SelectValue placeholder="Select correct answer..." /></SelectTrigger>
                                   <SelectContent>
                                     {q.options?.filter(o => o).map((opt, optIdx) => (
                                       <SelectItem key={optIdx} value={opt}>{opt}</SelectItem>
                                     ))}
                                   </SelectContent>
                                 </Select>
                               </div>
                             </CardContent>
                           </Card>
                         ))}
                       </div>
                       {formData.quiz_questions.length === 0 && (
                         <p className="text-xs text-green-700 italic">No questions yet — click "Add Question" above.</p>
                       )}
                     </div>
                   )}
                 </div>

               </div>
             </div>

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>Due After (days from assignment)</Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g., 7 for 1 week, 30 for 1 month"
                value={formData.due_after_days}
                onChange={(e) => setFormData({...formData, due_after_days: e.target.value})}
              />
              <p className="text-xs text-slate-500">
                Leave blank for no deadline. Officers will have this many days from when they're assigned to complete the training.
              </p>
            </div>



            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({...formData, required: checked})}
                />
                <Label>Required Training</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                />
                <Label>Active</Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setShowDialog(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveModuleMutation.isPending || uploading}>
                {editingModule ? 'Update Module' : 'Create Module'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}