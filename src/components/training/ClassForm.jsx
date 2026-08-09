import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { trainingCreate, trainingUpdate } from '@/lib/trainingRecordsApi';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";

const TRAINING_TYPES = [
  "Entry-Level Security",
  "In-Service Training",
  "Firearms Certification",
  "First Aid / CPR",
  "Use of Force",
  "Legal Powers / Arrest",
  "Report Writing",
  "Supervisor Training",
  "Other"
];

export default function ClassForm({ existingClass, onSave, onCancel }) {
  const [form, setForm] = useState({
    class_name: existingClass?.class_name || "",
    course_title: existingClass?.course_title || "",
    course_id: existingClass?.course_id || "",
    training_type: existingClass?.training_type || "",
    instructor_name: existingClass?.instructor_name || "",
    instructor_email: existingClass?.instructor_email || "",
    class_date: existingClass?.class_date || "",
    start_time: existingClass?.start_time || "",
    end_time: existingClass?.end_time || "",
    location: existingClass?.location || "",
    notes: existingClass?.notes || "",
    status: existingClass?.status || "draft",
  });
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    if (existingClass?.id) {
      await trainingUpdate('TrainingClass', existingClass.id, form);
    } else {
      await trainingCreate('TrainingClass', form);
    }
    setSaving(false);
    onSave();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{existingClass ? "Edit Class" : "Create New Class"}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Class Name *</Label>
            <Input value={form.class_name} onChange={e => set("class_name", e.target.value)} placeholder="e.g., Spring 2025 Entry-Level" />
          </div>
          <div className="space-y-1">
            <Label>Course Title *</Label>
            <Input value={form.course_title} onChange={e => set("course_title", e.target.value)} placeholder="e.g., Basic Security Officer Training" />
          </div>
          <div className="space-y-1">
            <Label>Course ID / Code</Label>
            <Input value={form.course_id} onChange={e => set("course_id", e.target.value)} placeholder="e.g., BSO-101" />
          </div>
          <div className="space-y-1">
            <Label>Training Type</Label>
            <Select value={form.training_type} onValueChange={v => set("training_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {TRAINING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Instructor Name *</Label>
            <Input value={form.instructor_name} onChange={e => set("instructor_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Instructor Email</Label>
            <Input value={form.instructor_email} onChange={e => set("instructor_email", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Class Date *</Label>
            <Input type="date" value={form.class_date} onChange={e => set("class_date", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Input value={form.location} onChange={e => set("location", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Start Time</Label>
            <Input type="time" value={form.start_time} onChange={e => set("start_time", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>End Time</Label>
            <Input type="time" value={form.end_time} onChange={e => set("end_time", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.class_name || !form.course_title || !form.instructor_name || !form.class_date}>
            {saving ? "Saving..." : existingClass ? "Update Class" : "Create Class"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}