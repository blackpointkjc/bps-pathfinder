import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Edit, Save, X, Award, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  present: "bg-green-100 text-green-800",
  absent: "bg-red-100 text-red-800",
  late: "bg-yellow-100 text-yellow-800",
  excused: "bg-blue-100 text-blue-800",
};

const PASS_FAIL_COLORS = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  pending: "bg-slate-100 text-slate-600",
};

const emptyAttendee = (classId, className) => ({
  class_id: classId,
  class_name: className,
  full_name: "",
  phone_number: "",
  date_of_birth: "",
  dcjs_number: "",
  email: "",
  attendance_status: "present",
  quiz_score: "",
  quiz_total: "",
  quiz_percentage: "",
  pass_fail: "pending",
  completion_date: "",
  completed: false,
  notes: "",
  certificate_issued: false,
});

export default function AttendeeRoster({ trainingClass, onGenerateCertificate, schoolSettings }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAttendee(trainingClass.id, trainingClass.class_name));
  const [saving, setSaving] = useState(false);

  const fetchAttendees = async () => {
    setLoading(true);
    const data = await base44.entities.TrainingAttendee.filter({ class_id: trainingClass.id });
    setAttendees(data);
    setLoading(false);
  };

  useEffect(() => { fetchAttendees(); }, [trainingClass.id]);

  const set = (field, value) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      if (field === "quiz_score" || field === "quiz_total") {
        const score = parseFloat(field === "quiz_score" ? value : prev.quiz_score) || 0;
        const total = parseFloat(field === "quiz_total" ? value : prev.quiz_total) || 0;
        if (total > 0) {
          const pct = Math.round((score / total) * 100);
          updated.quiz_percentage = pct;
          updated.pass_fail = pct >= (schoolSettings?.passing_score || 75) ? "pass" : "fail";
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, quiz_score: Number(form.quiz_score) || 0, quiz_total: Number(form.quiz_total) || 0 };
    if (editingId) {
      await base44.entities.TrainingAttendee.update(editingId, payload);
    } else {
      await base44.entities.TrainingAttendee.create(payload);
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyAttendee(trainingClass.id, trainingClass.class_name));
    fetchAttendees();
    toast.success("Attendee saved");
  };

  const handleEdit = (a) => {
    setForm({ ...a });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this attendee?")) return;
    await base44.entities.TrainingAttendee.delete(id);
    fetchAttendees();
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyAttendee(trainingClass.id, trainingClass.class_name));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg text-slate-800">Attendance Roster</h3>
        <Button size="sm" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyAttendee(trainingClass.id, trainingClass.class_name)); }}>
          <UserPlus className="w-4 h-4 mr-2" />Add Attendee
        </Button>
      </div>

      {showForm && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">{editingId ? "Edit Attendee" : "Add Attendee"}</CardTitle>
            <Button variant="ghost" size="icon" onClick={handleCancel}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Full Name *</Label><Input value={form.full_name} onChange={e => set("full_name", e.target.value)} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={form.phone_number} onChange={e => set("phone_number", e.target.value)} /></div>
              <div className="space-y-1"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} /></div>
              <div className="space-y-1"><Label>DCJS Number</Label><Input value={form.dcjs_number} onChange={e => set("dcjs_number", e.target.value)} /></div>
              <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={e => set("email", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Attendance</Label>
                <Select value={form.attendance_status} onValueChange={v => set("attendance_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="excused">Excused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Quiz Score</Label><Input type="number" value={form.quiz_score} onChange={e => set("quiz_score", e.target.value)} /></div>
              <div className="space-y-1"><Label>Quiz Total</Label><Input type="number" value={form.quiz_total} onChange={e => set("quiz_total", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Pass / Fail</Label>
                <Select value={form.pass_fail} onValueChange={v => set("pass_fail", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Completion Date</Label><Input type="date" value={form.completion_date} onChange={e => set("completion_date", e.target.value)} /></div>
              <div className="space-y-1 flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.completed} onChange={e => set("completed", e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-medium">Mark Completed</span>
                </label>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.full_name}>
                <Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading roster...</div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
          No attendees yet. Click "Add Attendee" to start building the roster.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-slate-700">Name</th>
                <th className="text-left p-2 font-semibold text-slate-700">DCJS #</th>
                <th className="text-left p-2 font-semibold text-slate-700">Attendance</th>
                <th className="text-left p-2 font-semibold text-slate-700">Score</th>
                <th className="text-left p-2 font-semibold text-slate-700">Result</th>
                <th className="text-left p-2 font-semibold text-slate-700">Completed</th>
                <th className="text-left p-2 font-semibold text-slate-700">Cert</th>
                <th className="text-left p-2 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendees.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="p-2 font-medium">{a.full_name}</td>
                  <td className="p-2 text-slate-500">{a.dcjs_number || "—"}</td>
                  <td className="p-2">
                    <Badge className={STATUS_COLORS[a.attendance_status] || "bg-slate-100"}>
                      {a.attendance_status ? a.attendance_status.charAt(0).toUpperCase() + a.attendance_status.slice(1) : ""}
                    </Badge>
                  </td>
                  <td className="p-2">
                    {a.quiz_total > 0 ? `${a.quiz_score}/${a.quiz_total} (${a.quiz_percentage}%)` : "—"}
                  </td>
                  <td className="p-2">
                    <Badge className={PASS_FAIL_COLORS[a.pass_fail] || "bg-slate-100"}>
                      {a.pass_fail ? a.pass_fail.charAt(0).toUpperCase() + a.pass_fail.slice(1) : ""}
                    </Badge>
                  </td>
                  <td className="p-2">
                    {a.completed ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-slate-400" />}
                  </td>
                  <td className="p-2">
                    {a.certificate_issued
                      ? <Award className="w-4 h-4 text-amber-500" title="Certificate Issued" />
                      : a.completed && a.pass_fail === "pass"
                        ? <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onGenerateCertificate(a)}>
                            <Award className="w-3 h-3 mr-1" />Issue
                          </Button>
                        : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                  <td className="p-2 flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(a)}><Edit className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(a.id)}><X className="w-3 h-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}