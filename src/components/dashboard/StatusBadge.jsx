import { Badge } from "@/components/ui/badge";

export default function StatusBadge({ status }) {
  const statusConfig = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    denied: { label: "Denied", className: "bg-red-100 text-red-800 border-red-200" },
    draft: { label: "Draft", className: "bg-slate-100 text-slate-800 border-slate-200" },
    submitted: { label: "Submitted", className: "bg-blue-100 text-blue-800 border-blue-200" },
    on_duty: { label: "On Duty", className: "bg-green-100 text-green-800 border-green-200" },
    off_duty: { label: "Off Duty", className: "bg-slate-100 text-slate-800 border-slate-200" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant="outline" className={`${config.className} border font-medium`}>
      {config.label}
    </Badge>
  );
}