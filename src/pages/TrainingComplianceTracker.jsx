import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, GraduationCap, Search, FileText, CheckCircle, Clock, AlertTriangle, XCircle, Users, TrendingUp, Download, BookOpen } from "lucide-react";
import { format, parseISO, isPast, isAfter, isBefore, startOfDay } from "date-fns";
import { toast } from "sonner";

const STATUS_COLORS = {
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  pending_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  overdue: "bg-red-100 text-red-700",
  missing: "bg-red-100 text-red-800",
  expiring_soon: "bg-amber-100 text-amber-800",
};

export default function TrainingComplianceTracker() {
  const [filters, setFilters] = useState({ officer: "", training: "", status: "all", dueDateStart: "", dueDateEnd: "", expDateStart: "", expDateEnd: "" });
  const [viewMode, setViewMode] = useState("overview"); // overview | by-officer | by-training
  const [markCompleteDialog, setMarkCompleteDialog] = useState(null); // { module, officerEmail?, officerName? }
  const [markCompleteOfficer, setMarkCompleteOfficer] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const userRoles = new Set((user?.additional_roles || []).map(r => String(r).toLowerCase()));
  const hasTrainingAccess = user?.role === 'admin' || userRoles.has('trainer') || userRoles.has('full_access');
  const { data: assignments = [] } = useQuery({
    queryKey: ['allTrainingAssignments'],
    queryFn: () => base44.entities.TrainingAssignment.list('-assigned_date'),
    enabled: hasTrainingAccess,
    refetchInterval: 30000,
  });
  const { data: submissions = [] } = useQuery({
    queryKey: ['allTrainingSubmissions'],
    queryFn: () => base44.entities.TrainingSubmission.list('-submission_date'),
    enabled: hasTrainingAccess,
    refetchInterval: 30000,
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['trainingUsers'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getTrainingUsers', {});
      if (response?.error) throw new Error(response.error);
      return response?.users || [];
    },
    enabled: hasTrainingAccess,
    staleTime: 30000,
  });
  const { data: trainingCompletions = [] } = useQuery({
    queryKey: ['allTrainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list('-completed_date'),
    enabled: hasTrainingAccess,
    staleTime: 60000,
  });
  const { data: trainingModules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
    enabled: hasTrainingAccess,
    staleTime: 60000,
  });
  const { data: trainingRequirements = [] } = useQuery({
    queryKey: ['trainingRequirements'],
    queryFn: () => base44.entities.TrainingRequirement.list('-created_date'),
    enabled: hasTrainingAccess,
    staleTime: 60000,
  });

  const activeOfficers = useMemo(() => allUsers.filter(u =>
    !u.termination_date && u.employment_status !== 'terminated' &&
    (u.role === 'admin' || (u.additional_roles || []).map(r => String(r).toLowerCase()).includes('officer'))
  ), [allUsers]);

  const complianceRows = useMemo(() => {
    const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const today = new Date(); today.setHours(0,0,0,0);
    const soon = new Date(today); soon.setDate(soon.getDate() + 90);
    const mandatory = [];
    trainingRequirements.filter(r => r.active !== false && r.is_mandatory !== false).forEach(r => mandatory.push({
      id: `req_${r.id}`, requirement_id: r.id, name: r.training_name, category: r.category || 'other',
      renewal_period_months: r.renewal_period_months || 0, course_id: r.course_id || '', source: 'requirement'
    }));
    trainingModules.filter(m => m.active !== false && m.required === true).forEach(m => {
      if (!mandatory.some(x => normalize(x.name) === normalize(m.title))) mandatory.push({
        id: `module_${m.id}`, module_id: m.id, name: m.title, category: m.category || m.training_category || 'other',
        renewal_period_months: m.renewal_period_months || 0, course_id: m.course_id || '', source: 'module'
      });
    });

    const result = [];
    activeOfficers.forEach(officer => {
      const certs = Array.isArray(officer.officer_certifications) ? officer.officer_certifications : [];
      mandatory.forEach(req => {
        const assignment = assignments.find(a => a.officer_email === officer.email && (
          (req.requirement_id && a.requirement_id === req.requirement_id) || normalize(a.training_name) === normalize(req.name)
        ));
        const completion = trainingCompletions.find(c => c.officer_email === officer.email && c.completed && (
          (req.module_id && c.training_module_id === req.module_id) || normalize(c.module_title || c.training_title) === normalize(req.name)
        ));
        const cert = certs.find(c => {
          const courseMatch = req.course_id && normalize(c.course_id) === normalize(req.course_id);
          const nameMatch = normalize(c.training_name) === normalize(req.name);
          return courseMatch || nameMatch;
        });
        let status = 'missing';
        let expiration_date = cert?.expiration_date || assignment?.expiration_date || null;
        if (assignment) {
          status = assignment.status === 'approved'
            ? 'approved'
            : assignment.due_date && isPast(parseISO(assignment.due_date))
              ? 'overdue'
              : assignment.status;
        }
        if (completion || cert) status = 'approved';
        if (cert?.status === 'pending') status = 'pending_review';
        if (expiration_date) {
          const exp = new Date(expiration_date); exp.setHours(0,0,0,0);
          if (exp < today) status = 'expired';
          else if (exp <= soon) status = 'expiring_soon';
        }
        result.push({
          ...(assignment || {}), id: assignment?.id || `gap_${officer.id}_${req.id}`,
          officer_email: officer.email,
          officer_name: [officer.rank, officer.last_name].filter(Boolean).join(' ') || `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email,
          training_name: req.name, category: req.category,
          requirement_id: req.requirement_id || assignment?.requirement_id,
          is_mandatory: true, expiration_date, status,
          compliance_source: cert ? 'employee_certification' : completion ? 'training_completion' : assignment ? 'assignment' : 'missing_requirement',
          certificate_number: cert?.certificate_number || '', course_id: cert?.course_id || req.course_id || '',
        });
      });
    });
    assignments.forEach(a => { if (!result.some(r => r.id === a.id)) result.push(a); });
    return result;
  }, [activeOfficers, trainingRequirements, trainingModules, assignments, trainingCompletions]);

  // Admin marks company module complete for a specific officer
  const markCompleteMutation = useMutation({
    mutationFn: async ({ module, officerEmail }) => {
      const officerUser = allUsers.find(u => u.email === officerEmail);
      const officerName = officerUser ? `${officerUser.first_name} ${officerUser.last_name}` : officerEmail;

      // 1-year expiration for company training modules
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      const expirationDate = oneYearFromNow.toISOString().split('T')[0];

      // Create or update TrainingCompletion
      const existing = trainingCompletions.find(
        c => c.training_module_id === module.id && c.officer_email === officerEmail && c.completed
      );
      if (!existing) {
        await base44.entities.TrainingCompletion.create({
          training_module_id: module.id,
          training_title: module.title,
          module_title: module.title,
          module_category: module.category,
          officer_email: officerEmail,
          officer_name: officerName,
          completed: true,
          completion_date: new Date().toISOString(),
          completed_by_admin: true,
        });
      }

      // Auto-approve any matching TrainingAssignment for this officer
      const matchingAssignments = assignments.filter(
        a => a.officer_email === officerEmail &&
          a.training_name?.toLowerCase() === module.title?.toLowerCase() &&
          a.status !== 'approved'
      );
      await Promise.all(matchingAssignments.map(a =>
        base44.entities.TrainingAssignment.update(a.id, { status: 'approved', expiration_date: expirationDate })
      ));

      // If no existing assignment, create one marked approved so it shows in all reports
      if (matchingAssignments.length === 0 && !assignments.find(
        a => a.officer_email === officerEmail && a.training_name?.toLowerCase() === module.title?.toLowerCase() && a.status === 'approved'
      )) {
        const assignment = await base44.entities.TrainingAssignment.create({
          training_name: module.title,
          category: module.category || 'other',
          officer_email: officerEmail,
          officer_name: officerName,
          assigned_date: todayStr,
          status: 'approved',
          is_mandatory: module.required || false,
          priority: 'normal',
          assigned_by: user.email,
          admin_notes: 'Marked complete by admin',
          renewal_period_months: module.renewal_period_months || 12,
          expiration_date: expirationDate,
        });
        await base44.entities.TrainingSubmission.create({
          assignment_id: assignment.id,
          training_name: module.title,
          officer_email: officerEmail,
          officer_name: officerName,
          submission_date: new Date().toISOString(),
          status: 'approved',
          issue_date: todayStr,
          expiration_date: expirationDate,
          reviewed_by: user.email,
          reviewed_by_name: `${user.first_name} ${user.last_name}`,
          reviewed_date: new Date().toISOString(),
          admin_internal_notes: 'Marked complete by admin via Compliance Tracker',
          version: 1,
        });
      }

      // Notify officer
      await base44.entities.Notification.create({
        recipient_email: officerEmail,
        type: 'training_approved',
        priority: 'normal',
        title: `Training Completed: ${module.title}`,
        message: `Admin has marked your "${module.title}" training as completed.`,
        is_read: false,
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingSubmissions'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingCompletions'] });
      setMarkCompleteDialog(null);
      setMarkCompleteOfficer("");
      toast.success("Training marked as complete");
    },
  });

  // Real-time push: instantly reflect officer completions and admin reviews
  useEffect(() => {
    const unsubAssignments = base44.entities.TrainingAssignment.subscribe((event) => {
      queryClient.setQueryData(['allTrainingAssignments'], (old = []) => {
        if (event.type === 'create') {
          if (old.find(a => a.id === event.data.id)) return old;
          return [event.data, ...old];
        } else if (event.type === 'update') {
          return old.map(a => a.id === event.id ? event.data : a);
        } else if (event.type === 'delete') {
          return old.filter(a => a.id !== event.id);
        }
        return old;
      });
    });
    const unsubSubmissions = base44.entities.TrainingSubmission.subscribe((event) => {
      queryClient.setQueryData(['allTrainingSubmissions'], (old = []) => {
        if (event.type === 'create') {
          if (old.find(s => s.id === event.data.id)) return old;
          return [event.data, ...old];
        } else if (event.type === 'update') {
          return old.map(s => s.id === event.id ? event.data : s);
        } else if (event.type === 'delete') {
          return old.filter(s => s.id !== event.id);
        }
        return old;
      });
    });
    return () => { unsubAssignments(); unsubSubmissions(); };
  }, [queryClient]);

  const getEffectiveStatus = (a) => {
    if (['missing', 'expired', 'expiring_soon'].includes(a.status)) return a.status;
    if (a.status === 'approved') return 'approved';
    if (a.due_date && isPast(parseISO(a.due_date))) return 'overdue';
    return a.status;
  };

  const filteredAssignments = useMemo(() => {
    return complianceRows.filter(a => {
      const eff = getEffectiveStatus(a);
      if (filters.officer && !a.officer_name?.toLowerCase().includes(filters.officer.toLowerCase()) && !a.officer_email?.toLowerCase().includes(filters.officer.toLowerCase())) return false;
      if (filters.training && !a.training_name?.toLowerCase().includes(filters.training.toLowerCase())) return false;
      if (filters.status !== 'all' && eff !== filters.status) return false;
      if (filters.dueDateStart && a.due_date && isBefore(parseISO(a.due_date), parseISO(filters.dueDateStart))) return false;
      if (filters.dueDateEnd && a.due_date && isAfter(parseISO(a.due_date), parseISO(filters.dueDateEnd))) return false;
      return true;
    });
  }, [complianceRows, filters]);

  const stats = useMemo(() => ({
    total: complianceRows.length,
    approved: complianceRows.filter(a => getEffectiveStatus(a) === 'approved').length,
    pending_review: complianceRows.filter(a => getEffectiveStatus(a) === 'pending_review').length,
    overdue: complianceRows.filter(a => ['overdue','expired'].includes(getEffectiveStatus(a))).length,
    rejected: complianceRows.filter(a => getEffectiveStatus(a) === 'rejected').length,
    not_started: complianceRows.filter(a => ['assigned','missing'].includes(getEffectiveStatus(a))).length,
    missing: complianceRows.filter(a => getEffectiveStatus(a) === 'missing').length,
    expiring_soon: complianceRows.filter(a => getEffectiveStatus(a) === 'expiring_soon').length,
  }), [complianceRows]);

  const byTraining = useMemo(() => {
    const map = {};
    filteredAssignments.forEach(a => {
      if (!map[a.training_name]) map[a.training_name] = { name: a.training_name, category: a.category, total: 0, approved: 0, pending: 0, overdue: 0, rejected: 0, not_started: 0 };
      const eff = getEffectiveStatus(a);
      map[a.training_name].total++;
      if (eff === 'approved') map[a.training_name].approved++;
      else if (eff === 'pending_review') map[a.training_name].pending++;
      else if (eff === 'overdue') map[a.training_name].overdue++;
      else if (eff === 'rejected') map[a.training_name].rejected++;
      else map[a.training_name].not_started++;
    });
    // Also include TrainingCompletion records (self-completed modules)
    // but only if that officer does NOT already have a TrainingAssignment for the same training
    // (to avoid double-counting)
    trainingCompletions.forEach(tc => {
      const name = tc.module_title || tc.training_name;
      if (!name) return;
      // Check if this officer already has an assignment counted above for this training
      const alreadyCounted = filteredAssignments.some(
        a => a.officer_email === tc.officer_email &&
          a.training_name?.toLowerCase() === name.toLowerCase()
      );
      if (alreadyCounted) return;
      if (!map[name]) map[name] = { name, category: tc.module_category || 'other', total: 0, approved: 0, pending: 0, overdue: 0, rejected: 0, not_started: 0 };
      map[name].total++;
      map[name].approved++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredAssignments, trainingCompletions]);

  const byOfficer = useMemo(() => {
    const map = {};
    filteredAssignments.forEach(a => {
      const key = a.officer_email;
      if (!map[key]) map[key] = { email: key, name: a.officer_name || key, total: 0, approved: 0, pending: 0, overdue: 0, not_started: 0 };
      const eff = getEffectiveStatus(a);
      map[key].total++;
      if (eff === 'approved') map[key].approved++;
      else if (eff === 'pending_review') map[key].pending++;
      else if (eff === 'overdue') map[key].overdue++;
      else map[key].not_started++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredAssignments]);

  const printReport = (type) => {
    const data = type === 'overdue' ? filteredAssignments.filter(a => getEffectiveStatus(a) === 'overdue')
      : type === 'pending' ? filteredAssignments.filter(a => a.status === 'pending_review')
      : filteredAssignments;

    const title = type === 'overdue' ? 'Overdue Training Report' : type === 'pending' ? 'Pending Review Report' : 'Company Training Report';
    const accentColor = type === 'overdue' ? '#b91c1c' : type === 'pending' ? '#b45309' : '#1e40af';

    // Build a map of module completions by officer email for "already done" items
    const completionsByOfficer = {};
    trainingCompletions.forEach(tc => {
      if (!completionsByOfficer[tc.officer_email]) completionsByOfficer[tc.officer_email] = [];
      completionsByOfficer[tc.officer_email].push(tc);
    });

    // Group assignments by officer
    const grouped = {};
    data.forEach(a => {
      const key = a.officer_email;
      if (!grouped[key]) grouped[key] = { name: a.officer_name || a.officer_email, email: key, items: [] };
      grouped[key].items.push(a);
    });
    const sortedOfficers = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    const officerSections = sortedOfficers.map(o => {
      const userRecord = allUsers.find(u => u.email === o.email);
      const rankLine = [userRecord?.rank, userRecord?.division].filter(Boolean).join(' · ');
      const moduleCompletions = completionsByOfficer[o.email] || [];

      // Assignment rows
      const assignmentRows = o.items.map(a => {
        const eff = getEffectiveStatus(a);
        const latestSub = submissions.filter(s => s.assignment_id === a.id && s.status === 'approved').sort((x, y) => new Date(y.submission_date) - new Date(x.submission_date))[0];
        const statusClass = eff === 'approved' ? 'status-approved' : eff === 'overdue' ? 'status-overdue' : eff === 'rejected' ? 'status-rejected' : 'status-pending';
        const statusLabel = eff.replace(/_/g, ' ').toUpperCase();
        return `<tr>
          <td>${a.training_name}</td>
          <td>${(a.category || '').replace(/_/g, ' ')}</td>
          <td>${a.assigned_date ? format(parseISO(a.assigned_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${a.due_date ? format(parseISO(a.due_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${latestSub?.expiration_date ? format(parseISO(latestSub.expiration_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${latestSub?.certificate_number || '-'}</td>
          <td class="${statusClass}">${statusLabel}</td>
          <td>${a.is_mandatory ? 'Yes' : '-'}</td>
          <td>${latestSub?.reviewed_date ? format(new Date(latestSub.reviewed_date), 'MM/dd/yyyy') : '-'}</td>
        </tr>`;
      }).join('');

      // Module completion rows (self-completed trainings not in assignments)
      const assignedNames = new Set(o.items.map(a => a.training_name?.toLowerCase()));
      const extraCompletionRows = moduleCompletions
        .filter(tc => !assignedNames.has(tc.module_title?.toLowerCase()))
        .map(tc => `<tr class="module-row">
          <td>${tc.module_title || tc.training_title || '-'}</td>
          <td>${(tc.module_category || '').replace(/_/g, ' ')}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${tc.quiz_score != null ? `Score: ${tc.quiz_score}%` : '-'}</td>
          <td class="status-approved">COMPLETED</td>
          <td>-</td>
          <td>${tc.completed_date ? format(new Date(tc.completed_date), 'MM/dd/yyyy') : '-'}</td>
        </tr>`).join('');

      return `
        <div class="officer-section">
          <div class="officer-header">${o.name}${rankLine ? ` <span class="officer-rank">${rankLine}</span>` : ''} <span class="officer-email">&lt;${o.email}&gt;</span></div>
          <table>
            <thead><tr>
              <th>Training</th><th>Category</th><th>Assigned</th>
              <th>Due Date</th><th>Expiration</th><th>Cert #</th><th>Status</th><th>Mandatory</th><th>Completed</th>
            </tr></thead>
            <tbody>${assignmentRows}${extraCompletionRows}</tbody>
          </table>
        </div>`;
    }).join('');

    // Summary stats
    const totalApproved = data.filter(a => a.status === 'approved').length;
    const totalOverdue = data.filter(a => getEffectiveStatus(a) === 'overdue').length;
    const totalPending = data.filter(a => a.status === 'pending_review').length;

    const win = window.open('', '', 'width=1000,height=800');
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      @media print { .no-print { display:none; } @page { margin: 0.5in; size: landscape; } }
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; color: #111; background-color: #fff; }
      h1 { font-size: 20px; margin-bottom: 2px; color: #1e293b; }
      .meta { color: #555; margin-bottom: 4px; font-size: 11px; }
      .report-tag { display:inline-block; background-color:${accentColor} !important; color:white !important; padding:2px 10px; border-radius:4px; font-size:10px; margin-bottom:8px; font-weight:bold; }
      .stats-bar { display:flex; gap:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 14px; margin-bottom:16px; font-size:11px; }
      .stat-item { text-align:center; }
      .stat-val { font-size:16px; font-weight:bold; }
      .stat-label { color:#64748b; font-size:9px; text-transform:uppercase; }
      .officer-section { margin-bottom: 28px; page-break-inside: avoid; }
      .officer-header { background-color: #1e3a5f !important; color: white !important; padding: 7px 10px; font-size: 13px; font-weight: bold; border-radius: 4px 4px 0 0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .officer-rank { font-size: 10px; font-weight: normal; background:rgba(255,255,255,0.15); padding:1px 6px; border-radius:3px; }
      .officer-email { font-size: 10px; font-weight: normal; opacity: 0.7; margin-left:auto; }
      table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; }
      th { background-color: ${accentColor} !important; color: white !important; padding: 5px 7px; text-align: left; font-size: 10px; }
      td { padding: 4px 7px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
      tr:nth-child(even) td { background-color: #f9fafb !important; }
      .module-row td { background-color: #f5f3ff !important; }
      .status-approved { color: #16a34a !important; font-weight: bold; }
      .status-overdue { color: #dc2626 !important; font-weight: bold; }
      .status-pending { color: #d97706 !important; font-weight: bold; }
      .status-rejected { color: #dc2626 !important; font-weight: bold; }
      .no-data { text-align:center; padding:30px; color:#999; font-style:italic; }
      .back-btn { margin-bottom: 12px; padding: 6px 14px; background-color:${accentColor} !important; color:white !important; border:none; border-radius:4px; cursor:pointer; font-size:12px; }
      .logo { font-weight:bold; font-size:18px; color:#1e293b; margin-bottom:2px; }
    </style></head><body>
    <button class="no-print back-btn" onclick="window.close()">← Close</button>
    <div class="logo">Black Point Protection</div>
    <h1>${title}</h1>
    <div class="meta">Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}</div>
    <div class="report-tag">${title.toUpperCase()}</div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-val">${sortedOfficers.length}</div><div class="stat-label">Officers</div></div>
      <div class="stat-item"><div class="stat-val">${data.length}</div><div class="stat-label">Records</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#16a34a">${totalApproved}</div><div class="stat-label">Approved</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#d97706">${totalPending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#dc2626">${totalOverdue}</div><div class="stat-label">Overdue</div></div>
    </div>
    ${sortedOfficers.length === 0 ? '<div class="no-data">No records match the selected filter.</div>' : officerSections}
    <script>window.onload = () => setTimeout(() => window.print(), 400)</script>
    </body></html>`);
    win.document.close();
  };

  if (!hasTrainingAccess) {
    return <div className="p-8 text-center"><Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" /><h2 className="text-xl font-bold">Training Access Required</h2></div>;
  }

  return (
    <>
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-700 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Training Compliance Tracker</h1>
              <p className="text-slate-500 text-sm">Company-wide training overview and reporting</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => printReport('overdue')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium text-sm border border-red-200 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Overdue Report
            </button>
            <button
              onClick={() => printReport('pending')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium text-sm border border-amber-200 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Pending Report
            </button>
            <button
              onClick={() => printReport('all')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Full Report
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, color: "bg-slate-600" },
            { label: "Approved", value: stats.approved, color: "bg-green-600" },
            { label: "Pending Review", value: stats.pending_review, color: "bg-orange-500" },
            { label: "Overdue", value: stats.overdue, color: "bg-red-600" },
            { label: "Rejected", value: stats.rejected, color: "bg-red-400" },
            { label: "Not Started", value: stats.not_started, color: "bg-slate-400" },
          ].map(s => (
            <Card key={s.label} className="border-none shadow-sm">
              <CardContent className="p-3">
                <div className={`text-xl font-bold text-white ${s.color} rounded-lg w-10 h-10 flex items-center justify-center mb-1`}>{s.value}</div>
                <p className="text-xs text-slate-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Officer</Label>
                <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-8 h-9 text-sm" placeholder="Search officer..." value={filters.officer} onChange={e => setFilters(p => ({ ...p, officer: e.target.value }))} /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Training</Label>
                <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-8 h-9 text-sm" placeholder="Search training..." value={filters.training} onChange={e => setFilters(p => ({ ...p, training: e.target.value }))} /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Due Date From</Label>
                <Input type="date" className="h-9 text-sm" value={filters.dueDateStart} onChange={e => setFilters(p => ({ ...p, dueDateStart: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          {[
            { value: "overview", label: "By Training" },
            { value: "by-officer", label: "By Officer" },
            { value: "detail", label: "Detailed List" },
          ].map(v => (
            <Button key={v.value} size="sm" variant={viewMode === v.value ? "default" : "outline"} onClick={() => setViewMode(v.value)}>
              {v.label}
            </Button>
          ))}
        </div>

        {/* By Training View */}
        {viewMode === "overview" && (
          <div className="space-y-3">
            {byTraining.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-slate-500"><GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No training data</p></CardContent></Card>
            ) : byTraining.map(t => {
              const pct = t.total > 0 ? Math.round((t.approved / t.total) * 100) : 0;
              const matchedModule = trainingModules.find(m => m.title?.toLowerCase() === t.name?.toLowerCase() && m.training_category === 'company');
              return (
                <Card key={t.name} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{t.name}</h3>
                          <Badge className="bg-blue-100 text-blue-800 text-xs capitalize">{t.category?.replace(/_/g, ' ')}</Badge>
                          {matchedModule && <Badge className="bg-purple-100 text-purple-800 text-xs">Company Module</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{pct}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex gap-3 text-sm">
                          <div className="text-center"><div className="font-bold text-slate-900">{t.total}</div><div className="text-xs text-slate-400">Total</div></div>
                          <div className="text-center"><div className="font-bold text-green-600">{t.approved}</div><div className="text-xs text-slate-400">Done</div></div>
                          <div className="text-center"><div className="font-bold text-orange-500">{t.pending}</div><div className="text-xs text-slate-400">Review</div></div>
                          <div className="text-center"><div className="font-bold text-red-600">{t.overdue}</div><div className="text-xs text-slate-400">Overdue</div></div>
                          <div className="text-center"><div className="font-bold text-slate-500">{t.not_started}</div><div className="text-xs text-slate-400">Pending</div></div>
                        </div>
                        {matchedModule && (
                          <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => { setMarkCompleteDialog(matchedModule); setMarkCompleteOfficer(""); }}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />Mark Officer Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* By Officer View */}
        {viewMode === "by-officer" && (
          <div className="space-y-3">
            {byOfficer.map(o => {
              const pct = o.total > 0 ? Math.round((o.approved / o.total) * 100) : 0;
              return (
                <Card key={o.email} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="w-4 h-4 text-slate-500" />
                          <h3 className="font-semibold text-slate-900">{o.name}</h3>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{o.email}</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{pct}% complete</span>
                        </div>
                      </div>
                      <div className="flex gap-3 text-sm">
                        <div className="text-center"><div className="font-bold text-slate-900">{o.total}</div><div className="text-xs text-slate-400">Total</div></div>
                        <div className="text-center"><div className="font-bold text-green-600">{o.approved}</div><div className="text-xs text-slate-400">Done</div></div>
                        <div className="text-center"><div className="font-bold text-orange-500">{o.pending}</div><div className="text-xs text-slate-400">Review</div></div>
                        <div className="text-center"><div className="font-bold text-red-600">{o.overdue}</div><div className="text-xs text-slate-400">Overdue</div></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detailed List View */}
        {viewMode === "detail" && (
          <div className="space-y-2">
            {filteredAssignments.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-slate-500">No records match filters</CardContent></Card>
            ) : filteredAssignments.map(a => {
              const eff = getEffectiveStatus(a);
              return (
                <Card key={a.id} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.officer_name || a.officer_email}</span>
                          <span className="text-slate-400">—</span>
                          <span className="text-sm text-slate-700">{a.training_name}</span>
                          <Badge className={`text-xs ${STATUS_COLORS[eff] || 'bg-slate-100 text-slate-800'}`}>{eff.replace(/_/g, ' ')}</Badge>
                          {a.is_mandatory && <Badge className="bg-red-100 text-red-800 text-xs">Mandatory</Badge>}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
                          <span>Assigned: {a.assigned_date ? format(parseISO(a.assigned_date), 'MM/dd/yyyy') : '-'}</span>
                          {a.due_date && <span className={eff === 'overdue' ? 'text-red-600 font-semibold' : ''}>Due: {format(parseISO(a.due_date), 'MM/dd/yyyy')}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* Mark Module Complete Dialog */}
    <Dialog open={!!markCompleteDialog} onOpenChange={() => { setMarkCompleteDialog(null); setMarkCompleteOfficer(""); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Mark Training Complete
          </DialogTitle>
        </DialogHeader>
        {markCompleteDialog && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="font-semibold text-purple-900">{markCompleteDialog.title}</p>
              <p className="text-xs text-purple-600 mt-0.5 capitalize">{markCompleteDialog.category?.replace(/_/g, ' ')} · Company Module</p>
              {markCompleteDialog.description && <p className="text-xs text-slate-600 mt-1">{markCompleteDialog.description}</p>}
            </div>
            <div className="space-y-2">
              <Label>Select Officer *</Label>
              <Select value={markCompleteOfficer} onValueChange={setMarkCompleteOfficer}>
                <SelectTrigger><SelectValue placeholder="Choose officer..." /></SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter(u => u.first_name && u.email)
                    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                    .map(u => {
                      const alreadyDone = trainingCompletions.some(
                        c => c.training_module_id === markCompleteDialog.id && c.officer_email === u.email && c.completed
                      ) || assignments.some(
                        a => a.officer_email === u.email && a.training_name?.toLowerCase() === markCompleteDialog.title?.toLowerCase() && a.status === 'approved'
                      );
                      return (
                        <SelectItem key={u.id} value={u.email}>
                          {u.first_name} {u.last_name} {alreadyDone ? '✓' : ''}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500">
              This will create a completion record, approve any existing assignment, and notify the officer. It will appear in all training reports and the officer's training page.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setMarkCompleteDialog(null); setMarkCompleteOfficer(""); }}>Cancel</Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!markCompleteOfficer || markCompleteMutation.isPending}
                onClick={() => markCompleteMutation.mutate({ module: markCompleteDialog, officerEmail: markCompleteOfficer })}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {markCompleteMutation.isPending ? 'Saving...' : 'Mark as Complete'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}