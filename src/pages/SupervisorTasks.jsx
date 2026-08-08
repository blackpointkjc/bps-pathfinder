import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, AlertTriangle, FileWarning, ClipboardCheck, UserCheck, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function SupervisorTasks() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: pendingComplaints } = useQuery({
    queryKey: ['supervisorComplaints'],
    queryFn: async () => {
      const all = await base44.entities.Complaint.filter({ created_by_id: user.id });
      return all.filter(c => c.investigation_status === 'pending' || c.investigation_status === 'under_investigation');
    },
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  const { data: pendingWriteUps } = useQuery({
    queryKey: ['supervisorWriteUps'],
    queryFn: async () => {
      const all = await base44.entities.WriteUpReport.filter({ created_by_id: user.id });
      return all.filter(w => w.status === 'pending_approval');
    },
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  const { data: pendingPerformanceReviews } = useQuery({
    queryKey: ['supervisorPendingReviews'],
    queryFn: async () => {
      const all = await base44.entities.PerformanceReview.list('-review_date');
      return all.filter(r => r.supervisor_review_pending && !r.supervisor_review_completed);
    },
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  const { data: followUpInspections } = useQuery({
    queryKey: ['followUpInspections'],
    queryFn: async () => {
      const all = await base44.entities.InspectionReport.filter({ created_by_id: user.id });
      return all.filter(i => i.follow_up_required && !i.follow_up_completed);
    },
    enabled: user?.additional_roles?.includes('supervisor'),
  });

  if (!user?.additional_roles?.includes('supervisor')) {
    return (
      <div className="p-8 text-center">
        <UserCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
      </div>
    );
  }

  const totalTasks = (pendingComplaints?.length || 0) + 
                     (pendingWriteUps?.length || 0) + 
                     (pendingPerformanceReviews?.length || 0) + 
                     (followUpInspections?.length || 0);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2 mb-2">
            <ClipboardList className="w-8 h-8 text-green-600" />
            Supervisor Action Items
          </h1>
          <p className="text-slate-600">
            Tasks requiring your attention ({totalTasks} pending)
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50 hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-purple-600" />
                  Performance Reviews
                </div>
                <Badge className="bg-purple-600 text-white">
                  {pendingPerformanceReviews?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Review performance evaluations with officers and obtain signatures
              </p>
              {pendingPerformanceReviews && pendingPerformanceReviews.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {pendingPerformanceReviews.slice(0, 3).map((review) => (
                    <div key={review.id} className="p-3 bg-white rounded-lg border border-purple-200">
                      <p className="font-semibold text-sm">{review.officer_name}</p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(review.review_period_start), 'MMM d')} - {format(parseISO(review.review_period_end), 'MMM d, yyyy')}
                      </p>
                    </div>
                  ))}
                  {pendingPerformanceReviews.length > 3 && (
                    <p className="text-xs text-slate-500">+ {pendingPerformanceReviews.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-600 mb-4">✓ All reviews completed</p>
              )}
              <Link to={createPageUrl("SupervisorPerformanceReview")}>
                <Button className="w-full bg-purple-600 hover:bg-purple-700">
                  View Tasks <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-50 hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-600" />
                  Write-Up Approvals
                </div>
                <Badge className="bg-red-600 text-white">
                  {pendingWriteUps?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Write-ups awaiting admin approval
              </p>
              {pendingWriteUps && pendingWriteUps.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {pendingWriteUps.slice(0, 3).map((writeUp) => (
                    <div key={writeUp.id} className="p-3 bg-white rounded-lg border border-red-200">
                      <p className="font-semibold text-sm">{writeUp.officer_name}</p>
                      <p className="text-xs text-slate-500">
                        {writeUp.violation_type?.replace(/_/g, ' ')} - {writeUp.severity?.replace(/_/g, ' ')}
                      </p>
                    </div>
                  ))}
                  {pendingWriteUps.length > 3 && (
                    <p className="text-xs text-slate-500">+ {pendingWriteUps.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-600 mb-4">✓ No pending approvals</p>
              )}
              <Link to={createPageUrl("SupervisorWriteUps")}>
                <Button className="w-full bg-red-600 hover:bg-red-700">
                  View Write-Ups <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Complaint Investigations
                </div>
                <Badge className="bg-amber-600 text-white">
                  {pendingComplaints?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Complaints awaiting investigation results
              </p>
              {pendingComplaints && pendingComplaints.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {pendingComplaints.slice(0, 3).map((complaint) => (
                    <div key={complaint.id} className="p-3 bg-white rounded-lg border border-amber-200">
                      <p className="font-semibold text-sm">{complaint.officer_name}</p>
                      <p className="text-xs text-slate-500">
                        {complaint.complaint_type?.replace(/_/g, ' ')} - {complaint.investigation_status}
                      </p>
                    </div>
                  ))}
                  {pendingComplaints.length > 3 && (
                    <p className="text-xs text-slate-500">+ {pendingComplaints.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-600 mb-4">✓ No pending investigations</p>
              )}
              <Link to={createPageUrl("SupervisorComplaints")}>
                <Button className="w-full bg-amber-600 hover:bg-amber-700">
                  View Complaints <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-cyan-50 hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-blue-600" />
                  Follow-Up Inspections
                </div>
                <Badge className="bg-blue-600 text-white">
                  {followUpInspections?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Officers requiring follow-up inspections
              </p>
              {followUpInspections && followUpInspections.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {followUpInspections.slice(0, 3).map((inspection) => (
                    <div key={inspection.id} className="p-3 bg-white rounded-lg border border-blue-200">
                      <p className="font-semibold text-sm">{inspection.officer_inspected}</p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(inspection.inspection_date), 'MMM d, yyyy')} - {inspection.location}
                      </p>
                    </div>
                  ))}
                  {followUpInspections.length > 3 && (
                    <p className="text-xs text-slate-500">+ {followUpInspections.length - 3} more</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-600 mb-4">✓ No follow-ups needed</p>
              )}
              <Link to={createPageUrl("SupervisorInspections")}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  View Inspections <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}