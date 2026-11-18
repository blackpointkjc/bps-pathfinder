import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { trainingUpdate } from '@/lib/trainingRecordsApi';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Download, CheckCircle, XCircle, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  ready_for_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  issued: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
};

const DEFAULT_LOGO = "https://media.base44.com/images/public/69503da793f3e1140bbd4426/fadcae8f1_BlackPointTrainingSchoollogo.png";

function CertificatePrint({ cert }) {
  const logo = cert.school_logo_url || DEFAULT_LOGO;
  return (
    <div id={`cert-print-${cert.id}`} style={{
      width: "800px", minHeight: "560px", padding: "40px 60px", background: "white",
      border: "8px double #1e3a5f", fontFamily: "Georgia, serif", position: "relative",
      boxSizing: "border-box"
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        {logo && <img src={logo} alt="School Logo" style={{ maxHeight: "70px", marginBottom: "10px" }} />}
        <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "2px" }}>
          Certificate of Completion
        </div>
        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#1e3a5f", marginTop: "4px" }}>
          {cert.school_name || "Training Academy"}
        </div>
        {cert.school_dcjs_id && (
          <div style={{ fontSize: "11px", color: "#777", marginTop: "4px" }}>
            DCJS School Number: {cert.school_dcjs_id}
          </div>
        )}
        {cert.school_address && (
          <div style={{ fontSize: "10px", color: "#888" }}>{cert.school_address}</div>
        )}
      </div>

      <hr style={{ borderColor: "#1e3a5f", marginBottom: "20px" }} />

      {/* Body */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ fontSize: "13px", color: "#555", marginBottom: "8px" }}>This certifies that</div>
        <div style={{ fontSize: "28px", fontWeight: "bold", color: "#1e3a5f", borderBottom: "2px solid #1e3a5f", display: "inline-block", padding: "0 20px 4px" }}>
          {cert.student_name}
        </div>
        {cert.student_dcjs && (
          <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>DCJS #: {cert.student_dcjs}</div>
        )}
        <div style={{ fontSize: "13px", color: "#444", marginTop: "14px" }}>
          has successfully completed the required training course
        </div>
        <div style={{ fontSize: "20px", fontWeight: "bold", color: "#1e3a5f", marginTop: "10px" }}>
          {cert.course_title}
        </div>
        {cert.course_id && (
          <div style={{ fontSize: "11px", color: "#777" }}>Course ID: {cert.course_id}</div>
        )}
        {cert.training_type && (
          <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
            Training Category: <strong>{cert.training_type}</strong>
          </div>
        )}
        {cert.quiz_total > 0 && (
          <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
            Final Score: {cert.quiz_score}/{cert.quiz_total} ({cert.quiz_percentage}%)
          </div>
        )}
      </div>

      {/* Dates */}
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "30px", fontSize: "12px", color: "#444" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Completion Date</div>
          <div>{cert.completion_date}</div>
        </div>
        {cert.class_date && cert.class_date !== cert.completion_date && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Class Date</div>
            <div>{cert.class_date}</div>
          </div>
        )}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Issue Date</div>
          <div>{cert.issue_date || cert.completion_date}</div>
        </div>
      </div>

      {/* Signature */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <div style={{ textAlign: "center" }}>
          {cert.instructor_signature_url && (
            <img src={cert.instructor_signature_url} alt="Signature" style={{ maxHeight: "50px", marginBottom: "4px" }} />
          )}
          <div style={{ borderTop: "1px solid #333", paddingTop: "4px", fontSize: "12px" }}>
            {cert.instructor_name}
          </div>
          <div style={{ fontSize: "10px", color: "#777" }}>Instructor</div>
        </div>
      </div>

      {/* Footer */}
      <hr style={{ borderColor: "#ccc", marginBottom: "10px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#aaa" }}>
        <span>Certificate No: {cert.certificate_number || cert.id?.slice(-8).toUpperCase()}</span>
        <span>{cert.footer_text || "This is an official training completion record."}</span>
      </div>
    </div>
  );
}

export default function CertificateGenerator({ certificate, isAdmin, onStatusChange }) {
  const [updating, setUpdating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef();

  const handleStatusChange = async (newStatus) => {
    setUpdating(true);
    await trainingUpdate('TrainingCertificate', certificate.id, {
      status: newStatus,
      reviewed_by: newStatus !== "draft" ? "admin" : undefined,
      reviewed_date: new Date().toISOString(),
    });

    // Sync to officer's certifications when issued or approved
    if (newStatus === 'issued' || newStatus === 'approved') {
      try {
        await base44.functions.invoke('syncCertToOfficer', { certificate_id: certificate.id });
        toast.success(`Certificate issued & synced to officer profile`);
      } catch (e) {
        toast.success(`Certificate ${newStatus.replace("_", " ")} (sync pending)`);
      }
    } else {
      toast.success(`Certificate ${newStatus.replace("_", " ")}`);
    }
    setUpdating(false);
    onStatusChange?.();
  };

  const handlePrint = () => {
    const printContent = document.getElementById(`cert-print-${certificate.id}`);
    if (!printContent) return;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>Certificate - ${certificate.student_name}</title>
      <style>body{margin:0;padding:20px;background:#f5f5f5;display:flex;justify-content:center;}
      @media print{body{padding:0;background:white;}}</style></head>
      <body>${printContent.outerHTML}<script>setTimeout(()=>{window.print();},300);<\/script></body></html>
    `);
    win.document.close();
  };

  return (
    <Card className="border border-amber-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-slate-900">{certificate.student_name}</span>
              <Badge className={STATUS_COLORS[certificate.status] || "bg-slate-100"}>
                {certificate.status?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </Badge>
            </div>
            <div className="text-sm text-slate-600">{certificate.course_title} {certificate.course_id && `(${certificate.course_id})`}</div>
            <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
              {certificate.course_id && <span>Course ID: {certificate.course_id}</span>}
              <span>Completion: {certificate.completion_date}</span>
              <span>Instructor: {certificate.instructor_name}</span>
              {certificate.student_dcjs && <span>DCJS: {certificate.student_dcjs}</span>}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="w-3 h-3 mr-1" />{showPreview ? "Hide" : "Preview"}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="w-3 h-3 mr-1" />PDF
            </Button>
            {isAdmin && (
              <>
                {certificate.status === "ready_for_review" && (
                  <>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange("approved")} disabled={updating}>
                      <CheckCircle className="w-3 h-3 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleStatusChange("rejected")} disabled={updating}>
                      <XCircle className="w-3 h-3 mr-1" />Reject
                    </Button>
                  </>
                )}
                {certificate.status === "approved" && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleStatusChange("issued")} disabled={updating}>
                    <Award className="w-3 h-3 mr-1" />Mark Issued
                  </Button>
                )}
              </>
            )}
            {!isAdmin && certificate.status === "draft" && (
              <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700" onClick={() => handleStatusChange("ready_for_review")} disabled={updating}>
                Submit for Review
              </Button>
            )}
          </div>
        </div>

        {showPreview && (
          <div className="mt-4 overflow-x-auto border rounded-lg" ref={printRef}>
            <CertificatePrint cert={certificate} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}