import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingCreate, trainingUpdate } from '@/lib/trainingRecordsApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, Plus, Search, ChevronLeft, Award, Settings,
  Calendar, MapPin, User, Edit, Save, BookOpen, Download, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import ClassForm from "../components/training/ClassForm";
import AttendeeRoster from "../components/training/AttendeeRoster";
import CertificateGenerator from "../components/training/CertificateGenerator";

const CLASS_STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function TrainingRecords({ embedded = false }) {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("classes");
  const [selectedClass, setSelectedClass] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [certSearch, setCertSearch] = useState("");
  const [certFilterStatus, setCertFilterStatus] = useState("all");
  const [schoolForm, setSchoolForm] = useState(null);
  const [savingSchool, setSavingSchool] = useState(false);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const isAdmin = user?.role === "admin";
  const isTrainer = user?.additional_roles?.includes("trainer") || user?.additional_roles?.includes("full_access") || isAdmin;
  const isSupervisor = user?.additional_roles?.includes("supervisor");
  const isHR = user?.additional_roles?.includes("hr");
  const canAccess = isAdmin || isTrainer || isSupervisor || isHR;

  const { data: classes = [], refetch: refetchClasses } = useQuery({
    queryKey: ["trainingClasses"],
    queryFn: () => base44.entities.TrainingClass.list("-class_date"),
    enabled: canAccess,
  });

  const { data: certificates = [], refetch: refetchCerts } = useQuery({
    queryKey: ["trainingCertificates"],
    queryFn: () => base44.entities.TrainingCertificate.list("-created_date"),
    enabled: canAccess,
  });

  const { data: schoolSettingsList = [] } = useQuery({
    queryKey: ["trainingSchoolSettings"],
    queryFn: () => base44.entities.TrainingSchoolSettings.list(),
    enabled: canAccess,
  });

  const schoolSettings = schoolSettingsList[0] || null;

  const DEFAULT_LOGO = "https://media.base44.com/images/public/69503da793f3e1140bbd4426/fadcae8f1_BlackPointTrainingSchoollogo.png";

  useEffect(() => {
    if (schoolSettings) {
      setSchoolForm({ ...schoolSettings, school_logo_url: schoolSettings.school_logo_url || DEFAULT_LOGO, default_signature_url: schoolSettings.default_signature_url || "https://media.base44.com/images/public/69503da793f3e1140bbd4426/07ae583e9_LtColJGSherrilldesign.png" });
    } else if (!schoolSettings && !schoolForm) {
      setSchoolForm({
        school_name: "", dcjs_school_number: "", school_address: "",
        school_phone: "", school_email: "", school_logo_url: "https://media.base44.com/images/public/69503da793f3e1140bbd4426/fadcae8f1_BlackPointTrainingSchoollogo.png",
        default_signature_url: "https://media.base44.com/images/public/69503da793f3e1140bbd4426/07ae583e9_LtColJGSherrilldesign.png", certificate_footer_text: "", passing_score: 75
      });
    }
  }, [schoolSettings]);

  const handleSaveSchool = async () => {
    setSavingSchool(true);
    try {
      if (schoolSettings?.id) {
        await trainingUpdate('TrainingSchoolSettings', schoolSettings.id, schoolForm);
      } else {
        await trainingCreate('TrainingSchoolSettings', schoolForm);
      }
      await qc.invalidateQueries({ queryKey: ["trainingSchoolSettings"] });
      toast.success("School settings saved");
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSavingSchool(false);
    }
  };

  const handleGenerateCertificate = async (attendee) => {
    const cls = selectedClass;
    const certNum = `CERT-${Date.now().toString().slice(-8)}`;
    const cert = await trainingCreate('TrainingCertificate', {
      certificate_number: certNum,
      class_id: cls.id,
      attendee_id: attendee.id,
      student_name: attendee.full_name,
      student_dcjs: attendee.dcjs_number,
      student_dob: attendee.date_of_birth,
      student_email: attendee.email,
      course_title: cls.course_title,
      course_id: cls.course_id,
      training_type: cls.training_type,
      completion_date: attendee.completion_date || cls.class_date,
      class_date: cls.class_date,
      issue_date: new Date().toISOString().split("T")[0],
      instructor_name: cls.instructor_name,
      instructor_signature_url: cls.instructor_signature_url || schoolSettings?.default_signature_url,
      school_name: schoolSettings?.school_name || "",
      school_dcjs_id: schoolSettings?.dcjs_school_number || "",
      school_address: schoolSettings?.school_address || "",
      school_phone: schoolSettings?.school_phone || "",
      school_logo_url: schoolSettings?.school_logo_url || DEFAULT_LOGO,
      footer_text: schoolSettings?.certificate_footer_text || "",
      status: "draft",
      quiz_score: attendee.quiz_score,
      quiz_total: attendee.quiz_total,
      quiz_percentage: attendee.quiz_percentage,
    });
    await trainingUpdate('TrainingAttendee', attendee.id, {
      certificate_issued: true,
      certificate_id: cert.id,
    });
    refetchCerts();
    toast.success(`Certificate created for ${attendee.full_name}`);
  };

  const handleExportRoster = () => {
    if (!selectedClass) return;
    // Simple CSV export — will open in new tab as data URI
    base44.entities.TrainingAttendee.filter({ class_id: selectedClass.id }).then(attendees => {
      const headers = ["Full Name","DCJS Number","Phone","DOB","Email","Attendance","Quiz Score","Quiz Total","Score %","Pass/Fail","Completed","Completion Date","Notes"];
      const rows = attendees.map(a => [
        a.full_name, a.dcjs_number, a.phone_number, a.date_of_birth, a.email,
        a.attendance_status, a.quiz_score, a.quiz_total, a.quiz_percentage,
        a.pass_fail, a.completed ? "Yes" : "No", a.completion_date, a.notes
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${v || ""}"`).join(",")).join("\n");
      const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Roster-${selectedClass.class_name}.csv`;
      a.click();
    });
  };

  const filteredClasses = classes.filter(c => {
    const matchSearch = !search ||
      c.class_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.course_title?.toLowerCase().includes(search.toLowerCase()) ||
      c.course_id?.toLowerCase().includes(search.toLowerCase()) ||
      c.instructor_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const filteredCerts = certificates.filter(c => {
    const matchSearch = !certSearch ||
      c.student_name?.toLowerCase().includes(certSearch.toLowerCase()) ||
      c.course_title?.toLowerCase().includes(certSearch.toLowerCase()) ||
      c.student_dcjs?.toLowerCase().includes(certSearch.toLowerCase()) ||
      c.course_id?.toLowerCase().includes(certSearch.toLowerCase()) ||
      c.instructor_name?.toLowerCase().includes(certSearch.toLowerCase());
    const matchStatus = certFilterStatus === "all" || c.status === certFilterStatus;
    return matchSearch && matchStatus;
  });

  if (!canAccess) {
    return (
      <div className="p-6 text-center text-slate-500">
        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="font-semibold">Access Restricted</p>
        <p className="text-sm">Training Records are only accessible to trainers, supervisors, HR, and admins.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "w-full space-y-5 px-4 py-5 md:px-6 md:py-6" : "p-4 md:p-6 space-y-4 max-w-7xl mx-auto"}>
      <div className="flex items-center gap-3">
        <GraduationCap className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Training Records</h1>
          <p className="text-sm text-slate-500">Manage in-person classes, rosters, and certificates</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={t => { setTab(t); setSelectedClass(null); setShowClassForm(false); }}>
        <TabsList className="mb-2">
          <TabsTrigger value="classes"><BookOpen className="w-4 h-4 mr-1" />Classes</TabsTrigger>
          <TabsTrigger value="certificates"><Award className="w-4 h-4 mr-1" />Certificates</TabsTrigger>
          {isAdmin && <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1" />School Settings</TabsTrigger>}
        </TabsList>

        {/* ── CLASSES TAB ── */}
        <TabsContent value="classes" className="space-y-4">
          {selectedClass ? (
            <div className="space-y-4">
              {/* Class detail header */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => { setSelectedClass(null); setShowClassForm(false); }}>
                  <ChevronLeft className="w-4 h-4 mr-1" />Back to Classes
                </Button>
                <Badge className={CLASS_STATUS_COLORS[selectedClass.status]}>{selectedClass.status ? selectedClass.status.charAt(0).toUpperCase() + selectedClass.status.slice(1) : ""}</Badge>
                <h2 className="font-bold text-lg text-slate-900 flex-1">{selectedClass.class_name}</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportRoster}>
                    <Download className="w-4 h-4 mr-1" />Export Roster
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditingClass(selectedClass); setShowClassForm(true); }}>
                    <Edit className="w-4 h-4 mr-1" />Edit Class
                  </Button>
                </div>
              </div>

              {showClassForm && editingClass && (
                <ClassForm
                  existingClass={editingClass}
                  onSave={async () => {
                    setShowClassForm(false);
                    setEditingClass(null);
                    await refetchClasses();
                    const updated = await base44.entities.TrainingClass.filter({ id: selectedClass.id });
                    if (updated[0]) setSelectedClass(updated[0]);
                  }}
                  onCancel={() => { setShowClassForm(false); setEditingClass(null); }}
                />
              )}

              {/* Class info */}
              <Card>
                <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-slate-500 text-xs">Course</div><div className="font-medium">{selectedClass.course_title}</div></div>
                  <div><div className="text-slate-500 text-xs">Course ID</div><div className="font-medium">{selectedClass.course_id || "—"}</div></div>
                  <div><div className="text-slate-500 text-xs">Type</div><div className="font-medium">{selectedClass.training_type || "—"}</div></div>
                  <div><div className="text-slate-500 text-xs">Instructor</div><div className="font-medium">{selectedClass.instructor_name}</div></div>
                  <div><div className="text-slate-500 text-xs">Date</div><div className="font-medium">{selectedClass.class_date}</div></div>
                  <div><div className="text-slate-500 text-xs">Time</div><div className="font-medium">{selectedClass.start_time || "—"} – {selectedClass.end_time || "—"}</div></div>
                  <div><div className="text-slate-500 text-xs">Location</div><div className="font-medium">{selectedClass.location || "—"}</div></div>
                  {selectedClass.notes && <div className="col-span-2 md:col-span-4"><div className="text-slate-500 text-xs">Notes</div><div className="font-medium">{selectedClass.notes}</div></div>}
                </CardContent>
              </Card>

              <AttendeeRoster
                trainingClass={selectedClass}
                onGenerateCertificate={handleGenerateCertificate}
                schoolSettings={schoolSettings}
              />
            </div>
          ) : (
            <>
              <div className="flex gap-3 flex-wrap items-center justify-between">
                <div className="flex gap-2 flex-1 min-w-0">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input className="pl-9" placeholder="Search classes..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => { setShowClassForm(true); setEditingClass(null); }}>
                  <Plus className="w-4 h-4 mr-2" />New Class
                </Button>
              </div>

              {showClassForm && !editingClass && (
                <ClassForm
                  onSave={() => { setShowClassForm(false); refetchClasses(); toast.success("Class created"); }}
                  onCancel={() => setShowClassForm(false)}
                />
              )}

              {filteredClasses.length === 0 ? (
                <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No classes found</p>
                  <p className="text-sm mt-1">Create your first training class to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredClasses.map(cls => (
                    <Card key={cls.id} className="cursor-pointer hover:shadow-md transition-shadow border hover:border-indigo-300"
                      onClick={() => setSelectedClass(cls)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="font-semibold text-slate-900 leading-tight">{cls.class_name}</div>
                          <Badge className={CLASS_STATUS_COLORS[cls.status] || "bg-slate-100"}>{cls.status ? cls.status.charAt(0).toUpperCase() + cls.status.slice(1) : ""}</Badge>
                        </div>
                        <div className="text-sm text-slate-600 mb-1">{cls.course_title}</div>
                        {cls.course_id && <div className="text-xs text-slate-400 mb-2">ID: {cls.course_id}</div>}
                        <div className="flex flex-col gap-1 text-xs text-slate-500">
                          <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{cls.class_date}</div>
                          <div className="flex items-center gap-1"><User className="w-3 h-3" />{cls.instructor_name}</div>
                          {cls.location && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{cls.location}</div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── CERTIFICATES TAB ── */}
        <TabsContent value="certificates" className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-9" placeholder="Search by name, course, DCJS..." value={certSearch} onChange={e => setCertSearch(e.target.value)} />
            </div>
            <Select value={certFilterStatus} onValueChange={setCertFilterStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={syncingAll}
              onClick={async () => {
                setSyncingAll(true);
                const issued = certificates.filter(c => c.status === 'issued' || c.status === 'approved');
                let synced = 0;
                for (const c of issued) {
                  try {
                    const res = await base44.functions.invoke('syncCertToOfficer', { certificate_id: c.id });
                    if (res.data?.synced) synced++;
                  } catch (e) { /* skip */ }
                }
                setSyncingAll(false);
                toast.success(`Synced ${synced} of ${issued.length} certificates to officer profiles`);
              }}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? 'Syncing...' : 'Sync All to Officers'}
            </Button>
          </div>
          {filteredCerts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <Award className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No certificates found</p>
              <p className="text-sm mt-1">Certificates are created from the class roster when a student passes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCerts.map(cert => (
                <CertificateGenerator
                  key={cert.id}
                  certificate={cert}
                  isAdmin={isAdmin}
                  onStatusChange={refetchCerts}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── SCHOOL SETTINGS TAB ── */}
        {isAdmin && (
          <TabsContent value="settings">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />School / Certificate Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {schoolForm && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1"><Label>Official School Name *</Label><Input value={schoolForm.school_name} onChange={e => setSchoolForm(p => ({ ...p, school_name: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>DCJS School Number (88-XXXX)</Label><Input value={schoolForm.dcjs_school_number} onChange={e => setSchoolForm(p => ({ ...p, dcjs_school_number: e.target.value }))} placeholder="88-0000" /></div>
                      <div className="space-y-1"><Label>School Address</Label><Input value={schoolForm.school_address} onChange={e => setSchoolForm(p => ({ ...p, school_address: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>School Phone</Label><Input value={schoolForm.school_phone} onChange={e => setSchoolForm(p => ({ ...p, school_phone: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>School Email</Label><Input value={schoolForm.school_email} onChange={e => setSchoolForm(p => ({ ...p, school_email: e.target.value }))} /></div>
                      <div className="space-y-1"><Label>Default Passing Score (%)</Label><Input type="number" value={schoolForm.passing_score} onChange={e => setSchoolForm(p => ({ ...p, passing_score: Number(e.target.value) }))} /></div>
                      <div className="space-y-1 md:col-span-2"><Label>School Logo URL</Label><Input value={schoolForm.school_logo_url} onChange={e => setSchoolForm(p => ({ ...p, school_logo_url: e.target.value }))} placeholder="https://..." /></div>
                      <div className="space-y-1 md:col-span-2"><Label>Default Instructor Signature URL</Label><Input value={schoolForm.default_signature_url} onChange={e => setSchoolForm(p => ({ ...p, default_signature_url: e.target.value }))} placeholder="https://..." /></div>
                    </div>
                    <div className="space-y-1">
                      <Label>Certificate Footer Text</Label>
                      <Textarea
                        value={schoolForm.certificate_footer_text}
                        onChange={e => setSchoolForm(p => ({ ...p, certificate_footer_text: e.target.value }))}
                        rows={3}
                        placeholder="e.g., This document is an official training completion record issued by [School Name] in compliance with applicable training requirements."
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveSchool} disabled={savingSchool}>
                        <Save className="w-4 h-4 mr-2" />{savingSchool ? "Saving..." : "Save Settings"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}