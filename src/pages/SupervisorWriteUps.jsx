import { confirmInApp } from '@/lib/inAppDialog';
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileWarning, Plus, UserCheck, Send, AlertCircle, Archive } from "lucide-react";
import AIWriteUpAssistant from "../components/AIWriteUpAssistant";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCurrentDirectoryUser, listDirectoryLocations, listSupervisorDirectoryOfficers } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';

export default function SupervisorWriteUps() {
  const [showForm, setShowForm] = useState(false);
  const [editingWriteUp, setEditingWriteUp] = useState(null);
  // selectedOfficer state removed as officer selection dropdown is replaced with text inputs
  const [formData, setFormData] = useState({
    report_date: new Date().toISOString(),
    officer_name: "",
    officer_email: "",
    incident_date: new Date().toISOString(),
    location: "",
    violation_type: "policy_violation",
    severity: "written_warning",
    description: "",
    corrective_action: "",
    officer_statement: "",
    witnesses: "",
    acknowledged_by_officer: false,
    expiration_date: "",
    status: "draft",
    archived: false
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  // Re-introducing allUsers query as `getOfficerIdentifier` function requires it.
  const { data: allUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'supervisorWriteUps'],
    queryFn: () => listSupervisorDirectoryOfficers('last_name', 1000),
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const filteredUsers = allUsers.filter(hasOfficerAdditionalRole);

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'supervisorWriteUps'],
    queryFn: () => listDirectoryLocations('site_name', 1000),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access'),
    initialData: [],
  });

  const { data: writeUps } = useQuery({
    queryKey: ['writeUpReports'],
    queryFn: () => base44.entities.WriteUpReport.list('-created_date'),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access'),
  });

  // Auto-archive expired write-ups
  useEffect(() => {
    if (!writeUps) return;
    
    const expiredWriteUps = writeUps.filter(w => 
      w.expiration_date && 
      !w.archived && 
      isPast(new Date(w.expiration_date))
    );

    expiredWriteUps.forEach(writeUp => {
      updateWriteUpMutation.mutate({
        id: writeUp.id,
        data: { ...writeUp, archived: true }
      });
    });
  }, [writeUps]);

  const createWriteUpMutation = useMutation({
    mutationFn: (data) => base44.entities.WriteUpReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writeUpReports'] });
      setShowForm(false);
      setEditingWriteUp(null);
      setFormData({
        report_date: new Date().toISOString(),
        officer_name: "",
        officer_email: "",
        incident_date: new Date().toISOString(),
        location: "",
        violation_type: "policy_violation",
        severity: "written_warning",
        description: "",
        corrective_action: "",
        officer_statement: "",
        witnesses: "",
        acknowledged_by_officer: false,
        expiration_date: "",
        status: "draft",
        archived: false
      });
    },
  });

  const updateWriteUpMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WriteUpReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writeUpReports'] });
      setShowForm(false);
      setEditingWriteUp(null);
    },
  });

  const getOfficerIdentifier = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingWriteUp) {
      updateWriteUpMutation.mutate({ id: editingWriteUp.id, data: formData });
    } else {
      createWriteUpMutation.mutate(formData);
    }
  };

  const handleEdit = (writeUp) => {
    setEditingWriteUp(writeUp);
    setFormData(writeUp); // This will correctly populate officer_name and officer_email from the writeUp object
    setShowForm(true);
  };

  const handleSubmitForApproval = async (writeUp) => {
    if (!writeUp.acknowledged_by_officer) {
      alert('Write-up must be acknowledged by officer before submitting for approval');
      return;
    }
    
    if (await confirmInApp('Submit this write-up for admin approval?')) {
      updateWriteUpMutation.mutate({
        id: writeUp.id,
        data: { ...writeUp, status: 'pending_approval' }
      });
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'verbal_warning': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'written_warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'final_warning': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'suspension_recommended': return 'bg-red-100 text-red-800 border-red-200';
      case 'termination_recommended': return 'bg-red-200 text-red-900 border-red-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft': return <Badge variant="outline" className="bg-slate-100 text-slate-800">Draft</Badge>;
      case 'pending_approval': return <Badge variant="outline" className="bg-amber-100 text-amber-800">Pending Approval</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-green-100 text-green-800">Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-100 text-red-800">Rejected - Needs Revision</Badge>;
      default: return null;
    }
  };

  const activeWriteUps = writeUps?.filter(w => !w.archived) || [];
  const archivedWriteUps = writeUps?.filter(w => w.archived) || [];

  const draftWriteUps = activeWriteUps.filter(w => w.status === 'draft' || w.status === 'rejected');
  const pendingWriteUps = activeWriteUps.filter(w => w.status === 'pending_approval');
  const approvedWriteUps = activeWriteUps.filter(w => w.status === 'approved');
  
  const todoCount = draftWriteUps.filter(w => !w.acknowledged_by_officer || w.status === 'rejected').length;

  // Removed selectedOfficer filtering as the filter dropdown is removed
  const filteredDraftWriteUps = draftWriteUps; 
  const filteredPendingWriteUps = pendingWriteUps;
  const filteredApprovedWriteUps = approvedWriteUps;
  const filteredArchivedWriteUps = archivedWriteUps;

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('supervisor') && !user?.additional_roles?.includes('full_access')) {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="mobile-page-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Write-Up Reports</h1>
            <p className="text-slate-600">Document disciplinary actions and policy violations</p>
            {todoCount > 0 && (
              <Alert className="mt-3 bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <strong>{todoCount}</strong> write-up{todoCount !== 1 ? 's' : ''} require{todoCount === 1 ? 's' : ''} action: 
                  {draftWriteUps.filter(w => !w.acknowledged_by_officer).length > 0 && ` ${draftWriteUps.filter(w => !w.acknowledged_by_officer).length} awaiting officer acknowledgment`}
                  {draftWriteUps.filter(w => w.status === 'rejected').length > 0 && ` ${draftWriteUps.filter(w => w.status === 'rejected').length} rejected by admin - needs revision`}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <Button
            onClick={() => {
              setEditingWriteUp(null);
              setFormData({
                report_date: new Date().toISOString(),
                officer_name: "",
                officer_email: "",
                incident_date: new Date().toISOString(),
                location: "",
                violation_type: "policy_violation",
                severity: "written_warning",
                description: "",
                corrective_action: "",
                officer_statement: "",
                witnesses: "",
                acknowledged_by_officer: false,
                expiration_date: "",
                status: "draft",
                archived: false
              });
              setShowForm(!showForm);
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Write-Up
          </Button>
        </div>

        {/* Officer Filter Card removed */}
        {/* <Card className="border-none shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Filter className="w-5 h-5 text-slate-600" />
              <Label>Filter by Officer:</Label>
              <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {allUsers?.map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card> */}

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-red-600" />
                {editingWriteUp ? 'Edit Write-Up' : 'New Disciplinary Write-Up'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="officer_select">Officer *</Label>
                    <Select
                      value={formData.officer_email}
                      onValueChange={(value) => {
                        const officer = allUsers?.find(u => u.email === value);
                        if (officer) {
                          setFormData({
                            ...formData,
                            officer_name: `${officer.first_name} ${officer.last_name}`,
                            officer_email: value
                          });
                        }
                      }}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select officer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUsers.length === 0 ? (
                          <div className="p-2 text-sm text-slate-500">No officers found</div>
                        ) : (
                          filteredUsers.map((officer) => (
                            <SelectItem key={officer.email} value={officer.email}>
                              {officer.first_name} {officer.last_name} - {officer.rank || 'Officer'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officer_email">Officer Email</Label>
                    <Input
                      id="officer_email"
                      value={formData.officer_email}
                      disabled
                      className="bg-slate-100"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="incident_date">Incident Date & Time *</Label>
                    <Input
                      id="incident_date"
                      type="datetime-local"
                      value={format(new Date(formData.incident_date), "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => setFormData({...formData, incident_date: new Date(e.target.value).toISOString()})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map((loc) => (
                          <SelectItem key={loc.id} value={loc.site_name}>
                            {loc.site_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiration_date">Corrective Action Expires *</Label>
                    <Input
                      id="expiration_date"
                      type="date"
                      value={formData.expiration_date}
                      onChange={(e) => setFormData({...formData, expiration_date: e.target.value})}
                      required
                    />
                    <p className="text-xs text-slate-500">Date when corrective action plan ends</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Violation Type *</Label>
                    <Select
                      value={formData.violation_type}
                      onValueChange={(value) => setFormData({...formData, violation_type: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="policy_violation">Policy Violation</SelectItem>
                        <SelectItem value="tardiness">Tardiness</SelectItem>
                        <SelectItem value="uniform_violation">Uniform Violation</SelectItem>
                        <SelectItem value="insubordination">Insubordination</SelectItem>
                        <SelectItem value="performance_issue">Performance Issue</SelectItem>
                        <SelectItem value="conduct_violation">Conduct Violation</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Severity Level *</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => setFormData({...formData, severity: value})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                      <SelectItem value="written_warning">Written Warning</SelectItem>
                      <SelectItem value="final_warning">Final Warning</SelectItem>
                      <SelectItem value="suspension_recommended">Suspension Recommended</SelectItem>
                      <SelectItem value="termination_recommended">Termination Recommended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Incident Description *</Label>
                    <AIWriteUpAssistant 
                      description={formData.description}
                      onSuggest={(suggestions) => {
                        setFormData({
                          ...formData,
                          violation_type: suggestions.violation_type,
                          severity: suggestions.severity,
                          corrective_action: suggestions.corrective_action
                        });
                        alert(`AI Suggestions Applied:\n\nViolation: ${suggestions.violation_type}\nSeverity: ${suggestions.severity}\n\nReasoning: ${suggestions.reasoning}`);
                      }}
                    />
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Detailed description of the incident..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    required
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="corrective_action">Required Corrective Action</Label>
                  <Textarea
                    id="corrective_action"
                    placeholder="What corrective actions are required..."
                    value={formData.corrective_action}
                    onChange={(e) => setFormData({...formData, corrective_action: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="officer_statement">Officer Statement</Label>
                  <Textarea
                    id="officer_statement"
                    placeholder="Statement from the officer..."
                    value={formData.officer_statement}
                    onChange={(e) => setFormData({...formData, officer_statement: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="witnesses">Witnesses</Label>
                  <Textarea
                    id="witnesses"
                    placeholder="Names and contact information of witnesses..."
                    value={formData.witnesses}
                    onChange={(e) => setFormData({...formData, witnesses: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="acknowledged"
                    checked={formData.acknowledged_by_officer}
                    onCheckedChange={(checked) => setFormData({...formData, acknowledged_by_officer: checked})}
                  />
                  <Label htmlFor="acknowledged" className="cursor-pointer">
                    Officer has acknowledged and signed this write-up
                  </Label>
                </div>

                {editingWriteUp?.status === 'rejected' && editingWriteUp?.admin_notes && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription>
                      <strong className="text-red-900">Admin Rejection Notes:</strong>
                      <p className="text-red-800 mt-1">{editingWriteUp.admin_notes}</p>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingWriteUp(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createWriteUpMutation.isPending || updateWriteUpMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {createWriteUpMutation.isPending || updateWriteUpMutation.isPending ? 'Saving...' : editingWriteUp ? 'Update Write-Up' : 'Save Write-Up'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="draft" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1">
            <TabsTrigger value="draft" className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-900">
              <AlertCircle className="w-4 h-4 mr-2" />
              Draft / Action Required ({filteredDraftWriteUps.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-900">
              <Send className="w-4 h-4 mr-2" />
              Pending Admin Approval ({filteredPendingWriteUps.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-900">
              Approved ({filteredApprovedWriteUps.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="data-[state=active]:bg-slate-50 data-[state=active]:text-slate-900">
              <Archive className="w-4 h-4 mr-2" />
              Archived ({filteredArchivedWriteUps.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draft">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Draft Write-Ups & Action Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredDraftWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className={`p-5 rounded-lg border-l-4 ${writeUp.status === 'rejected' ? 'border-red-500 bg-red-50' : !writeUp.acknowledged_by_officer ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-slate-50'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600">{writeUp.location}</p>
                          {writeUp.expiration_date && (
                            <p className="text-xs text-slate-500 mt-1">
                              Expires: {format(new Date(writeUp.expiration_date), 'MMM d, yyyy')}
                            </p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">Created by: {writeUp.created_by}</p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          {getStatusBadge(writeUp.status)}
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                            {writeUp.violation_type.replace(/_/g, ' ')}
                          </Badge>
                          {!writeUp.acknowledged_by_officer && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              ⚠️ Needs Acknowledgment
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Incident Description:</p>
                          <p className="text-sm text-slate-700">{writeUp.description}</p>
                        </div>
                        {writeUp.corrective_action && (
                          <div className="p-2 bg-white rounded border border-amber-200">
                            <p className="text-xs text-amber-700 font-medium mb-1">Required Corrective Action:</p>
                            <p className="text-sm text-amber-900">{writeUp.corrective_action}</p>
                          </div>
                        )}
                        {writeUp.status === 'rejected' && writeUp.admin_notes && (
                          <div className="p-2 bg-red-100 rounded border border-red-300">
                            <p className="text-xs text-red-700 font-medium mb-1">Admin Rejection Notes:</p>
                            <p className="text-sm text-red-900">{writeUp.admin_notes}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(writeUp)}
                        >
                          Edit
                        </Button>
                        {writeUp.acknowledged_by_officer && writeUp.status !== 'rejected' && (
                          <Button
                            size="sm"
                            onClick={() => handleSubmitForApproval(writeUp)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Submit for Approval
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredDraftWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No draft write-ups</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Pending Admin Approval</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredPendingWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className="p-5 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600">{writeUp.location}</p>
                          {writeUp.expiration_date && (
                            <p className="text-xs text-slate-500 mt-1">
                              Expires: {format(new Date(writeUp.expiration_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          {getStatusBadge(writeUp.status)}
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700">{writeUp.description}</p>
                    </div>
                  ))}
                  {filteredPendingWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No pending write-ups</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Approved Write-Ups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredApprovedWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className="p-5 bg-green-50 rounded-lg border-l-4 border-green-500">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600">{writeUp.location}</p>
                          {writeUp.expiration_date && (
                            <p className="text-xs text-slate-500 mt-1">
                              Expires: {format(new Date(writeUp.expiration_date), 'MMM d, yyyy')}
                            </p>
                          )}
                          <p className="text-xs text-green-700 mt-1">
                            Approved by {writeUp.reviewed_by} on {format(new Date(writeUp.reviewed_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          {getStatusBadge(writeUp.status)}
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700">{writeUp.description}</p>
                    </div>
                  ))}
                  {filteredApprovedWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No approved write-ups</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Archived Write-Ups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredArchivedWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-slate-400 opacity-75">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600">{writeUp.location}</p>
                          {writeUp.expiration_date && (
                            <p className="text-xs text-slate-500 mt-1">
                              Expired: {format(new Date(writeUp.expiration_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Badge variant="outline" className="bg-slate-100 text-slate-800">
                            <Archive className="w-3 h-3 mr-1" />
                            Archived
                          </Badge>
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700">{writeUp.description}</p>
                    </div>
                  ))}
                  {filteredArchivedWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No archived write-ups</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}