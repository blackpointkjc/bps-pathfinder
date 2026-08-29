import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getCurrentDirectoryUser, listSupervisorDirectoryOfficers } from '@/lib/appDirectory';

export default function SupervisorUseOfForce() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [formData, setFormData] = useState({
    officer_name: "",
    officer_email: "",
    incident_date: "",
    incident_time: "",
    location: "",
    description: "",
    force_type: "physical_contact",
    injury_reported: false,
    police_notified: false,
    status: "draft",
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => getCurrentDirectoryUser(),
    retry: false,
  });

  const { data: officers = [], isLoading: officersLoading, error: officersError } = useQuery({
    queryKey: ["officerDirectory", "supervisorUseOfForce"],
    queryFn: () => listSupervisorDirectoryOfficers('last_name', 1000),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: reports } = useQuery({
    queryKey: ["useOfForceReports"],
    queryFn: async () => {
      try {
        const allReports = await base44.entities.UseOfForceReport.list();
        return allReports || [];
      } catch {
        return [];
      }
    },
  });

  const createReportMutation = useMutation({
    mutationFn: (data) => base44.entities.UseOfForceReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["useOfForceReports"] });
      toast.success(
        editingReport ? "Report updated successfully" : "Report created successfully"
      );
      handleCloseDialog();
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UseOfForceReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["useOfForceReports"] });
      toast.success("Report updated successfully");
      handleCloseDialog();
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: (id) => base44.entities.UseOfForceReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["useOfForceReports"] });
      toast.success("Report deleted successfully");
    },
  });

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingReport(null);
    setFormData({
      officer_name: "",
      officer_email: "",
      incident_date: "",
      incident_time: "",
      location: "",
      description: "",
      force_type: "physical_contact",
      injury_reported: false,
      police_notified: false,
      status: "draft",
    });
  };

  const handleEditReport = (report) => {
    setEditingReport(report);
    setFormData({
      officer_name: report.officer_name,
      officer_email: report.officer_email,
      incident_date: report.incident_date,
      incident_time: report.incident_time,
      location: report.location,
      description: report.description,
      force_type: report.force_type,
      injury_reported: report.injury_reported,
      police_notified: report.police_notified,
      status: report.status,
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingReport) {
      updateReportMutation.mutate({
        id: editingReport.id,
        data: formData,
      });
    } else {
      createReportMutation.mutate(formData);
    }
  };

  const filteredReports = reports || [];

  const getStatusColor = (status) => {
    const colors = {
      draft: "bg-slate-100 text-slate-800",
      submitted: "bg-blue-100 text-blue-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return colors[status] || colors.draft;
  };

  const getForceTypeLabel = (type) => {
    const labels = {
      physical_contact: "Physical Contact",
      restraint: "Restraint",
      baton: "Baton",
      pepper_spray: "Pepper Spray",
      firearm: "Firearm",
      other: "Other",
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#351d08_0,_#07101c_42%,_#050a12_100%)] p-3 text-slate-100 sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-[#33210e] via-[#111925] to-[#07101c] p-5 shadow-2xl sm:flex-row sm:items-center sm:justify-between md:p-7">
          <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Supervisor Oversight</div><h1 className="mt-1 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">Use-of-Force Reports</h1><p className="mt-1 text-sm text-slate-400">Document, review, and manage use-of-force incidents.</p></div>
          <Button onClick={() => setShowDialog(true)} className="w-full shrink-0 rounded-xl bg-amber-600 hover:bg-amber-500 sm:w-auto"><Plus className="mr-2 h-4 w-4" />New Report</Button>
        </div>

        <div className="grid gap-4">
          {filteredReports.length === 0 ? (
            <Card className="rounded-2xl border border-slate-700 bg-[#0d1725] text-slate-100 shadow-xl">
              <CardContent className="rounded-xl border border-dashed border-slate-700 py-10 text-center text-slate-400">
                No use-of-force reports found.
              </CardContent>
            </Card>
          ) : (
            filteredReports.map((report) => (
              <Card
                key={report.id}
                className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1725] text-slate-100 shadow-xl transition hover:border-amber-600/50 hover:shadow-2xl"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {report.officer_name}
                      </CardTitle>
                      <p className="text-sm text-slate-500 mt-1">
                        {report.incident_date} at {report.incident_time}
                      </p>
                    </div>
                    <Badge className={getStatusColor(report.status)}>
                      {report.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Location
                      </p>
                      <p className="text-sm text-white">{report.location}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Force Type
                      </p>
                      <p className="text-sm text-white">
                        {getForceTypeLabel(report.force_type)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                      Description
                    </p>
                    <p className="text-sm text-slate-300">
                      {report.description}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {report.injury_reported && (
                      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Injury Reported
                      </Badge>
                    )}
                    {report.police_notified && (
                      <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                        Police Notified
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditReport(report)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        deleteReportMutation.mutate(report.id)
                      }
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingReport ? "Edit Use-of-Force Report" : "New Use-of-Force Report"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="officer_email">Officer *</Label>
                  <Select
                    value={formData.officer_email}
                    onValueChange={(value) => {
                      const officer = officers?.find((o) => o.email === value);
                      setFormData({
                        ...formData,
                        officer_email: value,
                        officer_name: officer ? [officer.rank, officer.last_name].filter(Boolean).join(' ') : "",
                      });
                    }}
                  >
                    <SelectTrigger id="officer_email">
                      <SelectValue placeholder="Select officer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {officersLoading ? (
                        <div className="p-2 text-sm text-slate-500">Loading officers...</div>
                      ) : officersError ? (
                        <div className="p-2 text-sm text-red-600">Unable to load officers. Reopen this report to retry.</div>
                      ) : officers.length === 0 ? (
                        <div className="p-2 text-sm text-slate-500">No active Officer-role accounts found</div>
                      ) : officers.map((officer) => (
                        <SelectItem key={officer.email} value={officer.email}>
                          {[officer.rank, officer.last_name].filter(Boolean).join(' ') || officer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="force_type">Force Type *</Label>
                  <Select
                    value={formData.force_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, force_type: value })
                    }
                  >
                    <SelectTrigger id="force_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical_contact">
                        Physical Contact
                      </SelectItem>
                      <SelectItem value="restraint">Restraint</SelectItem>
                      <SelectItem value="baton">Baton</SelectItem>
                      <SelectItem value="pepper_spray">Pepper Spray</SelectItem>
                      <SelectItem value="firearm">Firearm</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="incident_date">Incident Date *</Label>
                  <Input
                    id="incident_date"
                    type="date"
                    value={formData.incident_date}
                    onChange={(e) =>
                      setFormData({ ...formData, incident_date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="incident_time">Incident Time *</Label>
                  <Input
                    id="incident_time"
                    type="time"
                    value={formData.incident_time}
                    onChange={(e) =>
                      setFormData({ ...formData, incident_time: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  placeholder="Where did the incident occur?"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Detailed description of the incident..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                  className="h-24"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="injury_reported">Injury Reported?</Label>
                  <Select
                    value={formData.injury_reported ? "true" : "false"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        injury_reported: value === "true",
                      })
                    }
                  >
                    <SelectTrigger id="injury_reported">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">No</SelectItem>
                      <SelectItem value="true">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="police_notified">Police Notified?</Label>
                  <Select
                    value={formData.police_notified ? "true" : "false"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        police_notified: value === "true",
                      })
                    }
                  >
                    <SelectTrigger id="police_notified">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">No</SelectItem>
                      <SelectItem value="true">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={
                    createReportMutation.isPending ||
                    updateReportMutation.isPending
                  }
                >
                  {editingReport ? "Update Report" : "Create Report"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}