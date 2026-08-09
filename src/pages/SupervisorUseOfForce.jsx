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
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { listDirectoryUsers } from '@/lib/appDirectory';

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
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: officers = [] } = useQuery({
    queryKey: ["directoryUsers", "supervisorUseOfForceOfficers"],
    queryFn: async () => (await listDirectoryUsers('last_name', 1000)).filter(hasOfficerAdditionalRole),
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
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Use-of-Force Reports
          </h1>
          <p className="text-slate-600">
            Document and manage use-of-force incidents
          </p>
        </div>

        <div className="mb-6 flex justify-end">
          <Button
            onClick={() => setShowDialog(true)}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        <div className="grid gap-4">
          {filteredReports.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-slate-600">
                No use-of-force reports found.
              </CardContent>
            </Card>
          ) : (
            filteredReports.map((report) => (
              <Card
                key={report.id}
                className="hover:shadow-lg transition-shadow"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Location
                      </p>
                      <p className="text-sm text-slate-900">{report.location}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Force Type
                      </p>
                      <p className="text-sm text-slate-900">
                        {getForceTypeLabel(report.force_type)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                      Description
                    </p>
                    <p className="text-sm text-slate-700">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="officer_email">Officer *</Label>
                  <Select
                    value={formData.officer_email}
                    onValueChange={(value) => {
                      const officer = officers?.find((o) => o.email === value);
                      setFormData({
                        ...formData,
                        officer_email: value,
                        officer_name: officer?.full_name || "",
                      });
                    }}
                  >
                    <SelectTrigger id="officer_email">
                      <SelectValue placeholder="Select officer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {officers?.map((officer) => (
                        <SelectItem key={officer.email} value={officer.email}>
                          {officer.full_name || officer.email}
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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