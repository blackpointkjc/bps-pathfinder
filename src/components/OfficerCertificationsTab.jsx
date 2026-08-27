import { uploadInternalFile } from '@/lib/internalUpload';
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Edit, CheckCircle, AlertTriangle, Upload, FileText, Image, ExternalLink, AlertCircle, Paperclip } from "lucide-react";
import { format, isPast, addMonths } from "date-fns";

// Full DCJS training list
const DCJS_COURSES = [
  // Entry Level
  { id: "01E", name: "Security Officer Core Subjects", level: "Entry Level", converts_to: "01I" },
  { id: "02E", name: "Private Investigator", level: "Entry Level", converts_to: "02I" },
  { id: "03E", name: "Armored Car Personnel", level: "Entry Level", converts_to: "03I" },
  { id: "04ES", name: "Security Canine Handler", level: "Entry Level", converts_to: "04IS" },
  { id: "04ED", name: "Detector Canine Handler", level: "Entry Level", converts_to: "04ID" },
  { id: "05E", name: "Armed Security Officer Arrest Authority", level: "Entry Level" },
  { id: "06E", name: "Special Conservator of the Peace Core Subjects", level: "Entry Level", converts_to: "06I" },
  { id: "07E", name: "Handgun", level: "Entry Level", converts_to: "07R" },
  { id: "08E", name: "Shotgun", level: "Entry Level", converts_to: "08R" },
  { id: "09E", name: "Advanced Handgun", level: "Entry Level", converts_to: "09R" },
  { id: "10E", name: "Patrol Rifle", level: "Entry Level", converts_to: "10R" },
  { id: "25E", name: "Locksmith", level: "Entry Level", converts_to: "25I" },
  { id: "30E", name: "Electronic Security Core Subjects", level: "Entry Level", converts_to: "30I" },
  { id: "32E", name: "Personal Protection Specialist", level: "Entry Level", converts_to: "32I" },
  { id: "35E", name: "Electronic Security Technician", level: "Entry Level" },
  { id: "38E", name: "Central Dispatcher", level: "Entry Level" },
  { id: "39E", name: "Electronic Security Sales Representative", level: "Entry Level" },
  { id: "40E", name: "Bail Bondsman", level: "Entry Level", converts_to: "40I" },
  { id: "44E", name: "Bail Enforcement Agent", level: "Entry Level", converts_to: "44I" },
  // In-Service
  { id: "01I", name: "Security Officer Core Subjects", level: "In-Service" },
  { id: "02I", name: "Private Investigator", level: "In-Service" },
  { id: "03I", name: "Armored Car Personnel", level: "In-Service" },
  { id: "04IS", name: "Security Canine Handler", level: "In-Service" },
  { id: "04ID", name: "Detector Canine Handler", level: "In-Service" },
  { id: "06I", name: "Special Conservator of the Peace Core Subjects", level: "In-Service" },
  { id: "25I", name: "Locksmith", level: "In-Service" },
  { id: "30I", name: "Electronic Security Core Subjects", level: "In-Service" },
  { id: "32I", name: "Personal Protection Specialist", level: "In-Service" },
  { id: "40I", name: "Bail Bondsman", level: "In-Service" },
  { id: "44I", name: "Bail Enforcement Agent", level: "In-Service" },
  // Retraining
  { id: "07R", name: "Handgun Re-Training", level: "Retraining" },
  { id: "08R", name: "Shotgun Re-Training", level: "Retraining" },
  { id: "09R", name: "Advanced Handgun Re-Training", level: "Retraining" },
  { id: "10R", name: "Patrol Rifle Re-Training", level: "Retraining" },
];

const ENTRY_CONVERSIONS = {
  "01E": "01I", "02E": "02I", "03E": "03I", "04ES": "04IS", "04ED": "04ID",
  "06E": "06I", "07E": "07R", "08E": "08R", "09E": "09R", "10E": "10R",
  "25E": "25I", "30E": "30I", "32E": "32I", "40E": "40I", "44E": "44I"
};

const COURSES_WITH_CERT_NUMBER = ["07E", "75E", "01E", "05E", "10E", "08E", "07R", "08R", "10R", "01I"];

function getCertStatus(cert) {
  if (!cert.expiration_date) return cert.status || "active";
  const now = new Date();
  const exp = new Date(cert.expiration_date);
  if (isPast(exp)) return "expired";
  const thirtyDays = addMonths(now, 1);
  if (exp <= thirtyDays) return "expiring_soon";
  return "active";
}

function StatusBadge({ cert }) {
  const status = getCertStatus(cert);
  if (status === "expired") return <Badge className="bg-red-600 text-white text-xs">Expired</Badge>;
  if (status === "expiring_soon") return <Badge className="bg-amber-500 text-white text-xs">Expiring Soon</Badge>;
  if (status === "pending") return <Badge className="bg-blue-500 text-white text-xs">Pending</Badge>;
  return <Badge className="bg-green-600 text-white text-xs">Active</Badge>;
}

const BLANK_CERT = {
  course_id: "",
  training_name: "",
  category: "dcjs",
  status: "active",
  issue_date: "",
  expiration_date: "",
  renewal_period_months: 24,
  certificate_number: "",
  cert_file_url: "",
  notes: "",
  manually_verified: false,
};

function CertFileUploader({ certFileUrl, onChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadInternalFile(file);
    onChange(file_url);
    setUploading(false);
  };

  const isPdf = certFileUrl && certFileUrl.toLowerCase().includes('.pdf');

  return (
    <div className="space-y-2">
      <Label className="text-xs">Certificate / Card File (Photo or PDF)</Label>
      {certFileUrl ? (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
          {isPdf
            ? <FileText className="w-4 h-4 text-green-700 flex-shrink-0" />
            : <Image className="w-4 h-4 text-green-700 flex-shrink-0" />
          }
          <span className="text-xs text-green-800 flex-1 truncate">File uploaded</span>
          <a href={certFileUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:text-green-900">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => onChange("")} className="text-red-500 hover:text-red-700 ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <Upload className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500">{uploading ? "Uploading..." : "Upload photo or PDF"}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

export default function OfficerCertificationsTab({ editFormData, setEditFormData, readOnly = false }) {
  const [addMode, setAddMode] = useState(null); // 'dcjs' | 'company'
  const [newCert, setNewCert] = useState(BLANK_CERT);
  const [editingIdx, setEditingIdx] = useState(null);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [viewingCert, setViewingCert] = useState(null); // cert object for detail dialog
  const [viewingCertIdx, setViewingCertIdx] = useState(null);
  const [dialogUploading, setDialogUploading] = useState(false);

  const certs = editFormData.officer_certifications || [];
  const dcjsCerts = certs.filter(cert => cert.category === 'dcjs');
  const companyCerts = certs.filter(cert => cert.category !== 'dcjs');

  if (readOnly) {
    const renderReadOnlyCert = (cert, index) => (
      <div key={`${cert.course_id || cert.training_name}-${index}`} className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{[cert.course_id, cert.training_name].filter(Boolean).join(' — ') || 'Certification'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {cert.issue_date ? `Issued ${format(new Date(cert.issue_date), 'MM/dd/yyyy')}` : 'Issue date not recorded'}
              {cert.expiration_date ? ` • Expires ${format(new Date(cert.expiration_date), 'MM/dd/yyyy')}` : ''}
            </p>
            {cert.certificate_number && <p className="mt-1 text-xs text-slate-600">Card/Certificate #: {cert.certificate_number}</p>}
            {cert.notes && <p className="mt-1 text-xs text-slate-600">{cert.notes}</p>}
          </div>
          <StatusBadge cert={cert} />
        </div>
        {cert.cert_file_url && (
          <a href={cert.cert_file_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
            <FileText className="h-3.5 w-3.5" /> View certificate file
          </a>
        )}
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Certification records are view-only for HR. Training staff manage additions, renewals, files, and verification.
        </div>
        <section className="space-y-3">
          <h4 className="font-bold text-slate-900">DCJS Certifications ({dcjsCerts.length})</h4>
          {dcjsCerts.length ? dcjsCerts.map(renderReadOnlyCert) : <p className="text-sm italic text-slate-500">No DCJS certifications on file.</p>}
        </section>
        <section className="space-y-3">
          <h4 className="font-bold text-slate-900">Company Certifications ({companyCerts.length})</h4>
          {companyCerts.length ? companyCerts.map(renderReadOnlyCert) : <p className="text-sm italic text-slate-500">No company certifications on file.</p>}
        </section>
      </div>
    );
  }

  const saveCert = () => {
    const certToSave = { ...newCert };

    if (certToSave.category === "dcjs" && ENTRY_CONVERSIONS[certToSave.course_id]) {
      const convertsTo = ENTRY_CONVERSIONS[certToSave.course_id];
      const convertedCourse = DCJS_COURSES.find(c => c.id === convertsTo);
      certToSave.notes = (certToSave.notes ? certToSave.notes + " | " : "") + `Entry level completed — tracking as ${convertsTo} for renewals`;
      const renewalCert = {
        ...certToSave,
        course_id: convertsTo,
        training_name: convertedCourse?.name || convertsTo,
        status: "active",
        notes: `Auto-converted from ${certToSave.course_id}`,
        cert_file_url: "",
      };
      let updated;
      if (editingIdx !== null) {
        updated = certs.map((c, i) => i === editingIdx ? certToSave : c);
      } else {
        const filtered = certs.filter(c => c.course_id !== certToSave.course_id && c.course_id !== convertsTo);
        updated = [...filtered, certToSave, renewalCert];
      }
      setEditFormData({ ...editFormData, officer_certifications: updated });
    } else {
      let updated;
      if (editingIdx !== null) {
        updated = certs.map((c, i) => i === editingIdx ? certToSave : c);
      } else {
        updated = [...certs, certToSave];
      }
      setEditFormData({ ...editFormData, officer_certifications: updated });
    }

    setNewCert(BLANK_CERT);
    setAddMode(null);
    setEditingIdx(null);
  };

  const removeCert = (idx) => {
    const updated = certs.filter((_, i) => i !== idx);
    setEditFormData({ ...editFormData, officer_certifications: updated });
  };

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setNewCert({ ...certs[idx] });
    setAddMode(certs[idx].category === "dcjs" ? "dcjs" : "company");
  };

  // Upload a file directly to an existing cert card (not in edit mode)
  const handleInlineUpload = async (realIdx, file) => {
    setUploadingIdx(realIdx);
    const { file_url } = await uploadInternalFile(file);
    const updated = certs.map((c, i) => i === realIdx ? { ...c, cert_file_url: file_url } : c);
    setEditFormData({ ...editFormData, officer_certifications: updated });
    setUploadingIdx(null);
  };

  const removeInlineFile = (realIdx) => {
    const updated = certs.map((c, i) => i === realIdx ? { ...c, cert_file_url: "" } : c);
    setEditFormData({ ...editFormData, officer_certifications: updated });
  };

  const handleDialogFileUpload = async (file) => {
    setDialogUploading(true);
    const { file_url } = await uploadInternalFile(file);
    const updated = certs.map((c, i) => i === viewingCertIdx ? { ...c, cert_file_url: file_url } : c);
    setEditFormData({ ...editFormData, officer_certifications: updated });
    setViewingCert({ ...viewingCert, cert_file_url: file_url });
    setDialogUploading(false);
  };

  const handleDialogFileRemove = () => {
    const updated = certs.map((c, i) => i === viewingCertIdx ? { ...c, cert_file_url: "" } : c);
    setEditFormData({ ...editFormData, officer_certifications: updated });
    setViewingCert({ ...viewingCert, cert_file_url: "" });
  };


  const renderCertCard = (cert, i, borderColor, textColor) => {
    const realIdx = certs.indexOf(cert);
    const isPending = cert.status === "pending";
    const hasFile = !!cert.cert_file_url;
    const isPdf = hasFile && cert.cert_file_url.toLowerCase().includes('.pdf');
    const needsFile = isPending && !hasFile;

    return (
      <div key={i} className={`p-3 bg-white rounded-lg border shadow-sm ${needsFile ? 'border-amber-400' : `border-${borderColor}-200`}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="flex items-center gap-1.5 hover:underline focus:outline-none"
                onClick={() => { setViewingCert(cert); setViewingCertIdx(realIdx); }}
              >
                <span className={`font-mono font-bold ${textColor} text-sm`}>{cert.course_id}</span>
                <span className="font-medium text-slate-900 text-sm">{cert.training_name}</span>
                <Paperclip className={`w-3 h-3 ${hasFile ? 'text-green-500' : 'text-slate-300'}`} />
              </button>
              <StatusBadge cert={cert} />
              {cert.manually_verified && (
                <Badge variant="outline" className="text-xs border-green-400 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />Verified
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 space-x-3">
              {cert.issue_date && <span>Issued: {format(new Date(cert.issue_date), 'MM/dd/yyyy')}</span>}
              {cert.expiration_date && <span>Expires: {format(new Date(cert.expiration_date), 'MM/dd/yyyy')}</span>}
              {cert.certificate_number && <span className="font-medium text-slate-700">Card #: {cert.certificate_number}</span>}
            </div>
            {cert.notes && <p className="text-xs text-slate-400 mt-1 italic">{cert.notes}</p>}

            {/* File section */}
            <div className="mt-2">
              {hasFile ? (
                <div className="flex items-center gap-2">
                  <a href={cert.cert_file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-50 border border-green-200 rounded px-2 py-1">
                    {isPdf ? <FileText className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                    View Certificate
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button onClick={() => removeInlineFile(realIdx)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {needsFile && (
                    <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                      <AlertCircle className="w-3 h-3" />Certificate file requested
                    </span>
                  )}
                  <label className={`flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border border-dashed transition-colors
                    ${needsFile ? 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                    <Upload className="w-3 h-3" />
                    {uploadingIdx === realIdx ? "Uploading..." : "Attach file"}
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => { if (e.target.files[0]) handleInlineUpload(realIdx, e.target.files[0]); }}
                      disabled={uploadingIdx === realIdx} />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-1 ml-2 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={() => startEdit(realIdx)} className="h-7 w-7 p-0"><Edit className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => removeCert(realIdx)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700"><X className="w-3 h-3" /></Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* DCJS Number */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <Label className="text-xs font-bold text-blue-900 uppercase tracking-wide">DCJS License Number</Label>
        <Input
          className="mt-2"
          placeholder="e.g., 123456"
          value={editFormData.dcjs_number || ""}
          onChange={(e) => setEditFormData({ ...editFormData, dcjs_number: e.target.value })}
        />
        <p className="text-xs text-blue-700 mt-1">This is the officer's DCJS-issued license number linked to all their DCJS certifications.</p>
      </div>

      {/* DCJS Certifications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2 h-5 bg-blue-600 rounded-full inline-block"></span>
            DCJS Certifications ({dcjsCerts.length})
          </h4>
          {addMode !== "dcjs" && (
            <Button size="sm" variant="outline" className="text-blue-600 border-blue-300"
              onClick={() => { setNewCert({...BLANK_CERT, category: "dcjs"}); setAddMode("dcjs"); setEditingIdx(null); }}>
              <Plus className="w-3 h-3 mr-1" /> Add DCJS Cert
            </Button>
          )}
        </div>

        {dcjsCerts.length === 0 && addMode !== "dcjs" && (
          <p className="text-sm text-slate-500 italic px-1">No DCJS certifications on file.</p>
        )}

        {dcjsCerts.map((cert, i) => renderCertCard(cert, i, "blue", "text-blue-700"))}

        {/* Add/Edit DCJS form */}
        {addMode === "dcjs" && (
          <div className="p-4 bg-blue-50 border border-blue-300 rounded-lg space-y-3">
            <h5 className="font-semibold text-blue-900 text-sm">{editingIdx !== null ? "Edit DCJS Certification" : "Add DCJS Certification"}</h5>

            <div>
              <Label className="text-xs">DCJS Course</Label>
              <Select value={newCert.course_id} onValueChange={(val) => {
                const course = DCJS_COURSES.find(c => c.id === val);
                setNewCert(p => ({ ...p, course_id: val, training_name: course?.name || val }));
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select course..." />
                </SelectTrigger>
                <SelectContent>
                  {["Entry Level", "In-Service", "Retraining"].map(level => (
                    <React.Fragment key={level}>
                      <div className="px-2 py-1 text-xs font-bold text-slate-500 uppercase bg-slate-50">{level}</div>
                      {DCJS_COURSES.filter(c => c.level === level).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.id} — {c.name}</SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              {newCert.course_id && ENTRY_CONVERSIONS[newCert.course_id] && (
                <p className="text-xs text-amber-700 mt-1">⚡ Entry level — will automatically convert to <strong>{ENTRY_CONVERSIONS[newCert.course_id]}</strong> for future renewal tracking.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Issue Date</Label>
                <Input type="date" className="mt-1" value={newCert.issue_date} onChange={e => setNewCert(p => ({ ...p, issue_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Expiration Date</Label>
                <Input type="date" className="mt-1" value={newCert.expiration_date} onChange={e => setNewCert(p => ({ ...p, expiration_date: e.target.value }))} />
              </div>
            </div>

            {COURSES_WITH_CERT_NUMBER.includes(newCert.course_id) && (
              <div>
                <Label className="text-xs">Certificate / Card #</Label>
                <Input className="mt-1" placeholder="e.g., 2024-VA-00123" value={newCert.certificate_number}
                  onChange={e => setNewCert(p => ({ ...p, certificate_number: e.target.value }))} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={newCert.status} onValueChange={v => setNewCert(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Renewal Period (months)</Label>
                <Input type="number" className="mt-1" value={newCert.renewal_period_months}
                  onChange={e => setNewCert(p => ({ ...p, renewal_period_months: parseInt(e.target.value) || 24 }))} />
              </div>
            </div>

            <CertFileUploader
              certFileUrl={newCert.cert_file_url}
              onChange={url => setNewCert(p => ({ ...p, cert_file_url: url }))}
            />

            <div className="flex items-center gap-2">
              <Checkbox checked={newCert.manually_verified} onCheckedChange={c => setNewCert(p => ({ ...p, manually_verified: !!c }))} />
              <Label className="text-xs cursor-pointer">Manually verified by admin</Label>
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input className="mt-1" placeholder="e.g., renewal card on file" value={newCert.notes}
                onChange={e => setNewCert(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={saveCert} disabled={!newCert.course_id} className="bg-blue-600 hover:bg-blue-700 text-white">
                {editingIdx !== null ? "Update" : "Add Certification"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddMode(null); setEditingIdx(null); setNewCert(BLANK_CERT); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Company Certifications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2 h-5 bg-purple-600 rounded-full inline-block"></span>
            Company Certifications ({companyCerts.length})
          </h4>
          {addMode !== "company" && (
            <Button size="sm" variant="outline" className="text-purple-600 border-purple-300"
              onClick={() => { setNewCert({...BLANK_CERT, category: "company"}); setAddMode("company"); setEditingIdx(null); }}>
              <Plus className="w-3 h-3 mr-1" /> Add Company Cert
            </Button>
          )}
        </div>

        {companyCerts.length === 0 && addMode !== "company" && (
          <p className="text-sm text-slate-500 italic px-1">No company certifications on file.</p>
        )}

        {companyCerts.map((cert, i) => renderCertCard(cert, i, "purple", "text-purple-700"))}

        {/* Add/Edit Company form */}
        {addMode === "company" && (
          <div className="p-4 bg-purple-50 border border-purple-300 rounded-lg space-y-3">
            <h5 className="font-semibold text-purple-900 text-sm">{editingIdx !== null ? "Edit Company Certification" : "Add Company Certification"}</h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Course ID (optional)</Label>
                <Input className="mt-1" placeholder="e.g., CPR-01" value={newCert.course_id}
                  onChange={e => setNewCert(p => ({ ...p, course_id: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Training / Certification Name *</Label>
                <Input className="mt-1" placeholder="e.g., CPR, First Aid, Fire Watch" value={newCert.training_name}
                  onChange={e => setNewCert(p => ({ ...p, training_name: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Issue Date</Label>
                <Input type="date" className="mt-1" value={newCert.issue_date}
                  onChange={e => setNewCert(p => ({ ...p, issue_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Expiration Date</Label>
                <Input type="date" className="mt-1" value={newCert.expiration_date}
                  onChange={e => setNewCert(p => ({ ...p, expiration_date: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Certificate / Card # (optional)</Label>
              <Input className="mt-1" placeholder="e.g., CPR-2024-001" value={newCert.certificate_number}
                onChange={e => setNewCert(p => ({ ...p, certificate_number: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={newCert.status} onValueChange={v => setNewCert(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Renewal Period (months)</Label>
                <Input type="number" className="mt-1" placeholder="e.g., 12 for yearly" value={newCert.renewal_period_months}
                  onChange={e => setNewCert(p => ({ ...p, renewal_period_months: parseInt(e.target.value) || 12 }))} />
              </div>
            </div>

            <CertFileUploader
              certFileUrl={newCert.cert_file_url}
              onChange={url => setNewCert(p => ({ ...p, cert_file_url: url }))}
            />

            <div className="flex items-center gap-2">
              <Checkbox checked={newCert.manually_verified} onCheckedChange={c => setNewCert(p => ({ ...p, manually_verified: !!c }))} />
              <Label className="text-xs cursor-pointer">Manually verified by admin</Label>
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input className="mt-1" placeholder="e.g., Card on file, renewal required annually" value={newCert.notes}
                onChange={e => setNewCert(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={saveCert} disabled={!newCert.training_name} className="bg-purple-600 hover:bg-purple-700 text-white">
                {editingIdx !== null ? "Update" : "Add Certification"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddMode(null); setEditingIdx(null); setNewCert(BLANK_CERT); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Summary / Alerts */}
      {certs.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold text-amber-900 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Certification Alerts</p>
          {certs.filter(c => getCertStatus(c) === "expired").map((c, i) => (
            <p key={i} className="text-xs text-red-700">🔴 <strong>{c.course_id || c.training_name}</strong> is expired{c.expiration_date ? ` (${format(new Date(c.expiration_date), 'MM/dd/yyyy')})` : ''}</p>
          ))}
          {certs.filter(c => getCertStatus(c) === "expiring_soon").map((c, i) => (
            <p key={i} className="text-xs text-amber-700">🟡 <strong>{c.course_id || c.training_name}</strong> expires soon{c.expiration_date ? ` (${format(new Date(c.expiration_date), 'MM/dd/yyyy')})` : ''}</p>
          ))}
          {certs.filter(c => c.status === "pending" && !c.cert_file_url).map((c, i) => (
            <p key={`pending-${i}`} className="text-xs text-amber-700">📎 <strong>{c.course_id || c.training_name}</strong> is pending — certificate file not yet uploaded</p>
          ))}
          {certs.filter(c => getCertStatus(c) !== "expired" && getCertStatus(c) !== "expiring_soon" && !(c.status === "pending" && !c.cert_file_url)).length === certs.length && (
            <p className="text-xs text-green-700">✅ All certifications are current.</p>
          )}
        </div>
      )}

      {/* Cert Detail / Document Dialog */}
      <Dialog open={!!viewingCert} onOpenChange={() => { setViewingCert(null); setViewingCertIdx(null); }}>
        <DialogContent className="max-w-md">
          {viewingCert && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  {viewingCert.course_id && <span className="font-mono text-blue-700">{viewingCert.course_id}</span>}
                  <span>{viewingCert.training_name}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Details summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm bg-slate-50 rounded-lg p-3">
                  <span className="text-slate-500">Status</span>
                  <span><StatusBadge cert={viewingCert} /></span>
                  {viewingCert.issue_date && <><span className="text-slate-500">Issued</span><span className="font-medium">{format(new Date(viewingCert.issue_date), 'MM/dd/yyyy')}</span></>}
                  {viewingCert.expiration_date && <><span className="text-slate-500">Expires</span><span className="font-medium">{format(new Date(viewingCert.expiration_date), 'MM/dd/yyyy')}</span></>}
                  {viewingCert.certificate_number && <><span className="text-slate-500">Card #</span><span className="font-medium">{viewingCert.certificate_number}</span></>}
                </div>

                {/* Document section */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Certificate Document</Label>
                  <p className="text-xs text-slate-500">Attach a photo or PDF of the certificate. Both admin and officer can view this document.</p>

                  {viewingCert.cert_file_url ? (
                    <div className="space-y-3">
                      {/* Preview if image */}
                      {!viewingCert.cert_file_url.toLowerCase().includes('.pdf') && (
                        <img src={viewingCert.cert_file_url} alt="Certificate" className="w-full rounded-lg border border-slate-200 object-contain max-h-48" />
                      )}
                      <div className="flex items-center gap-2">
                        <a
                          href={viewingCert.cert_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-green-50 border border-green-300 rounded-lg text-green-800 text-sm font-medium hover:bg-green-100 transition-colors"
                        >
                          {viewingCert.cert_file_url.toLowerCase().includes('.pdf')
                            ? <FileText className="w-4 h-4" />
                            : <Image className="w-4 h-4" />
                          }
                          Open / Download Certificate
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleDialogFileRemove}>
                          <X className="w-3.5 h-3.5 mr-1" />Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                      ${viewingCert.status === 'pending' ? 'border-amber-400 bg-amber-50 hover:bg-amber-100' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                      <Upload className={`w-6 h-6 ${viewingCert.status === 'pending' ? 'text-amber-500' : 'text-slate-400'}`} />
                      <div className="text-center">
                        <p className="text-sm font-medium text-slate-700">{dialogUploading ? "Uploading..." : "Upload Certificate"}</p>
                        <p className="text-xs text-slate-500">Photo (JPG, PNG) or PDF</p>
                      </div>
                      <input type="file" accept="image/*,.pdf" className="hidden"
                        onChange={e => { if (e.target.files[0]) handleDialogFileUpload(e.target.files[0]); }}
                        disabled={dialogUploading} />
                    </label>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => { setViewingCert(null); setViewingCertIdx(null); }}>Close</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}