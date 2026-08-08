
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Lock, AlertCircle, CheckCircle, FileText, Loader2 } from "lucide-react"; // Added FileText, Loader2
import { Alert, AlertDescription } from "@/components/ui/alert";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';

export default function ConfidentialReport() {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    report_type: "",
    description: "",
    preferred_contact_method: "email",
    anonymous: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch all confidential reports
  const { data: reports, isLoading: isLoadingReports, isError: isErrorReports } = useQuery({
    queryKey: ['confidentialReports'],
    queryFn: () => base44.entities.ConfidentialReport.list(),
    enabled: !!user, // Only fetch reports if user data is available
  });

  // Confidential reports are private to their creator through entity RLS.
  const myReports = reports?.filter(r => String(r.created_by_id || '') === String(user?.id || '') && !r.archived) || [];

  const submitReportMutation = useMutation({
    mutationFn: (data) => base44.entities.ConfidentialReport.create(data),
    onSuccess: () => {
      setSubmitted(true);
      // Invalidate and refetch reports to update the list after a new submission
      queryClient.invalidateQueries({ queryKey: ['confidentialReports'] });
      setTimeout(() => {
        setSubmitted(false);
        setFormData({
          report_type: "",
          description: "",
          preferred_contact_method: "email",
          anonymous: false,
        });
      }, 3000);
    },
    onError: (error) => {
        console.error("Error submitting report:", error);
        // Optionally display an error message to the user, e.g., using a toast
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSubmit = { ...formData };
    // Ownership is recorded by Base44 as created_by_id. The anonymous flag controls
    // whether management displays the submitter's identity; it does not weaken RLS.
    dataToSubmit.status = 'new';

    submitReportMutation.mutate(dataToSubmit);
  };

  if (submitted) {
    return (
      <div className="p-4 md:p-8 min-h-screen flex items-center justify-center">
        <Card className="max-w-2xl w-full border-none shadow-xl bg-gradient-to-br from-green-50 to-emerald-50">
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-green-900 mb-4">Report Submitted</h2>
            <p className="text-lg text-green-700 mb-2">
              Your confidential report has been securely submitted to management.
            </p>
            <p className="text-sm text-green-600">
              A member of the office team will review your concern and may follow up with you based on your contact preferences.
            </p>
            <div className="mt-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="text-xs text-green-500 mt-2">Returning to form...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper function to render status badge
  const renderStatusBadge = (status) => {
    let colorClass = "bg-gray-200 text-gray-800";
    let statusText = status;
    switch (status) {
      case 'pending':
        colorClass = "bg-yellow-100 text-yellow-800";
        statusText = "Pending Review";
        break;
      case 'in_progress':
        colorClass = "bg-blue-100 text-blue-800";
        statusText = "In Progress";
        break;
      case 'resolved':
        colorClass = "bg-green-100 text-green-800";
        statusText = "Resolved";
        break;
      case 'closed':
        colorClass = "bg-slate-100 text-slate-800";
        statusText = "Closed";
        break;
      case 'rejected':
        colorClass = "bg-red-100 text-red-800";
        statusText = "Rejected";
        break;
      default:
        colorClass = "bg-gray-100 text-gray-700";
        statusText = status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        break;
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {statusText}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ShieldCheck className="w-12 h-12 text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-900">Confidential Report</h1>
          </div>
          <p className="text-slate-600">Submit concerns privately and securely to management</p>
        </div>

        <Alert className="bg-blue-50 border-blue-200">
          <Lock className="h-5 w-5 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <p className="font-semibold mb-2">This report is completely confidential</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Only authorized management and office staff can view your report</li>
              <li>Your fellow officers cannot see this report</li>
              <li>Reports are stored securely and handled with discretion</li>
              <li>The office may follow up with you for additional information based on your contact preferences</li>
              <li>You can choose to remain anonymous if you prefer</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Card className="border-none shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              Submit Your Concern
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="report_type">Type of Concern *</Label>
                <Select
                  value={formData.report_type}
                  onValueChange={(value) => setFormData({...formData, report_type: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select concern type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workplace_concern">Workplace Concern</SelectItem>
                    <SelectItem value="safety_issue">Safety Issue</SelectItem>
                    <SelectItem value="policy_concern">Policy Concern</SelectItem>
                    <SelectItem value="team_issue">Team Issue</SelectItem>
                    <SelectItem value="management_concern">Management Concern</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Please provide a detailed description of your concern. Include dates, locations, and any relevant context that will help us address the situation effectively..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                  rows={8}
                  className="resize-none"
                />
                <p className="text-xs text-slate-500">
                  The more detail you provide, the better we can address your concern
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_method">Preferred Contact Method</Label>
                <Select
                  value={formData.preferred_contact_method}
                  onValueChange={(value) => setFormData({...formData, preferred_contact_method: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone Call</SelectItem>
                    <SelectItem value="in_person">In-Person Meeting</SelectItem>
                    <SelectItem value="no_contact">No Follow-Up Needed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  How would you like the office to contact you if they need more information?
                </p>
              </div>

              <div className="flex items-start space-x-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <Checkbox
                  id="anonymous"
                  checked={formData.anonymous}
                  onCheckedChange={(checked) => setFormData({...formData, anonymous: checked})}
                />
                <div className="flex-1">
                  <Label htmlFor="anonymous" className="cursor-pointer font-semibold text-amber-900">
                    Submit Anonymously
                  </Label>
                  <p className="text-xs text-amber-700 mt-1">
                    If checked, your identity will be hidden from the report. Note: Management may have limited ability to follow up with you if needed.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Your Rights:</strong> This report is for your protection and the betterment of our workplace.
                  Black Point Protection prohibits retaliation against anyone who reports concerns in good faith.
                  Your report will be reviewed promptly and handled with the utmost confidentiality and professionalism.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData({
                    report_type: "",
                    description: "",
                    preferred_contact_method: "email",
                    anonymous: false,
                  })}
                >
                  Clear Form
                </Button>
                <RequiredAIReportReview />
                <Button
                  type="submit"
                  disabled={submitReportMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitReportMutation.isPending ? 'Submitting...' : 'Submit Confidential Report'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Section to display My Submitted Reports */}
        <div className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-4">
            <FileText className="w-6 h-6 text-blue-600" /> My Submitted Reports
          </h2>

          {isLoadingReports ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-2" />
              <p className="text-slate-600">Loading your reports...</p>
            </div>
          ) : isErrorReports ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Error loading your reports. Please try again later.
              </AlertDescription>
            </Alert>
          ) : myReports.length === 0 ? (
            <p className="text-slate-500 italic p-4 bg-slate-50 rounded-lg border border-slate-200">
              You haven't submitted any confidential reports yet. Use the form above to submit your first concern.
            </p>
          ) : (
            <div className="space-y-4">
              {myReports.map((report) => (
                <Card key={report.id} className="shadow-sm border-l-4 border-blue-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-800">
                      {report.report_type.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </CardTitle>
                    {renderStatusBadge(report.status)}
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-700 mb-2 line-clamp-3">
                      {report.description}
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                      <p><strong>Submitted:</strong> {new Date(report.created_at).toLocaleString()}</p>
                      <p><strong>Contact method:</strong> {report.preferred_contact_method.replace(/_/g, ' ')}</p>
                      <p><strong>Anonymous:</strong> {report.anonymous ? 'Yes' : 'No'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
