import { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingCreate, trainingDelete, trainingUpdate } from '@/lib/trainingRecordsApi';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GraduationCap, Plus, CheckCircle, XCircle, Eye, Users, Shield,
  Trash2, Edit, Search, Download, FileText, AlertTriangle, X, Printer
} from "lucide-react";
import { format, parseISO, addMonths } from "date-fns";
import { toast } from "sonner";
import OfficerCertificationCenter from '@/components/training/OfficerCertificationCenter';
import TrainingComplianceTracker from './TrainingComplianceTracker';
import AdminCertificationAlerts from './AdminCertificationAlerts';
import { listTrainingUsers } from '@/lib/trainingDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { Navigate } from 'react-router-dom';

const CATEGORIES = [
  { value: "certification", label: "Certification" },
  { value: "safety", label: "Safety" },
  { value: "legal_compliance", label: "Legal Compliance" },
  { value: "site_specific", label: "Site-Specific" },
  { value: "company_policy", label: "Company Policy" },
  { value: "emergency_response", label: "Emergency Response" },
  { value: "first_aid", label: "First Aid" },
  { value: "use_of_force", label: "Use of Force" },
  { value: "other", label: "Other" },
];

const PRESET_TRAININGS = [
  "CPR", "First Aid", "DCJS", "Fire Watch", "De-escalation",
  "Use of Force", "Company Orientation", "Site-Specific Training", "AED Training",
  "Bloodborne Pathogens", "Active Shooter Response", "Report Writing",
];

const STATUS_COLORS = {
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  pending_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  overdue: "bg-red-100 text-red-800",
};

const emptyRequirement = {
  training_name: "", category: "certification", description: "", required_proof_type: "",
  requires_photos: true, requires_expiration_date: false, requires_certificate_number: false,
  requires_approval: true, is_mandatory: true, renewal_period_months: 0, renewal_requirement_id: "", renewal_training_name: "", active: true, admin_notes: "",
};

const emptyAssignment = {
  trainings: [], // array of { requirement_id, training_name, category, description, required_proof_type, requires_photos, requires_expiration_date, requires_certificate_number, renewal_period_months }
  officer_emails: [], assign_to_all: false,
  due_date: "", is_mandatory: true, priority: "normal", admin_notes: "",
};

const emptyAssignmentTraining = {
  requirement_id: "", training_name: "", category: "certification", description: "",
  required_proof_type: "", requires_photos: true, requires_expiration_date: false,
  requires_certificate_number: false, renewal_period_months: 0, renewal_requirement_id: "",
};

function AdminTrainingComplianceContent({ embedded = false }) {
  const [activeTab, setActiveTab] = useState("officer-records");
  const [showRequirementDialog, setShowRequirementDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const emptyRecordEntry = { training_name: "", category: "certification", completed_date: new Date().toISOString().split('T')[0], expiration_date: "", due_date: "", certificate_number: "", notes: "", renewal_period_months: 0, renewal_requirement_id: "", renewal_training_name: "", requirement_id: "" };
  const [recordForm, setRecordForm] = useState({ officer_email: "", entries: [{ ...emptyRecordEntry }] });
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updatingAssignment, setUpdatingAssignment] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    expiration_date: "", certificate_number: "", completed_date: "", notes: "",
  });
  const [editingRequirement, setEditingRequirement] = useState(null);
  const [requirementForm, setRequirementForm] = useState(emptyRequirement);
  const [assignForm, setAssignForm] = useState(emptyAssignment);
  const [reviewingSubmission, setReviewingSubmission] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [approvalDetails, setApprovalDetails] = useState({
    expiration_date: "", certificate_number: "", issue_date: "", renewal_due_date: "", renewal_requirement_id: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: requirements = [] } = useQuery({
    queryKey: ['trainingRequirements'],
    queryFn: () => base44.entities.TrainingRequirement.list('-created_date'),
    refetchInterval: 30000,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['allTrainingAssignments'],
    queryFn: () => base44.entities.TrainingAssignment.list('-assigned_date'),
    refetchInterval: 30000,
  });
  const { data: submissions = [] } = useQuery({
    queryKey: ['allTrainingSubmissions'],
    queryFn: () => base44.entities.TrainingSubmission.list('-submission_date'),
    refetchInterval: 30000,
  });
  const userRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasTrainingAccess = user?.role === 'admin' || userRoles.has('trainer') || userRoles.has('full_access');
  const { data: allUsers = [] } = useQuery({
    queryKey: ['trainingUsers'],
    queryFn: () => listTrainingUsers(true),
    enabled: hasTrainingAccess,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const { data: trainingModules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
    refetchInterval: 60000,
  });
  const { data: trainingCompletions = [] } = useQuery({
    queryKey: ['allTrainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list('-completed_date'),
    staleTime: 60000,
  });

  // Real-time push: update cache instantly when assignments/submissions change
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

  // Merge TrainingModules into requirements-compatible list for dropdowns
  const allTrainingOptions = useMemo(() => {
    const reqOptions = requirements.filter(r => r.active).map(r => ({
      id: r.id,
      training_name: r.training_name,
      category: r.category || 'other',
      description: r.description || '',
      required_proof_type: r.required_proof_type || '',
      requires_photos: r.requires_photos !== false,
      requires_expiration_date: r.requires_expiration_date || false,
      requires_certificate_number: r.requires_certificate_number || false,
      is_mandatory: r.is_mandatory !== false,
      admin_notes: r.admin_notes || '',
      renewal_period_months: r.renewal_period_months || 0,
      source: 'requirement',
    }));
    const moduleOptions = trainingModules.filter(m => m.active !== false).map(m => ({
      id: `module_${m.id}`,
      _module_id: m.id,
      training_name: m.title,
      category: m.category || 'other',
      description: m.description || '',
      required_proof_type: m.requires_expiration_tracking ? 'Certificate' : '',
      requires_photos: true,
      requires_expiration_date: m.requires_expiration_tracking || false,
      requires_certificate_number: false,
      is_mandatory: m.required || false,
      admin_notes: '',
      renewal_period_months: m.renewal_period_months || 0,
      source: 'module',
      course_id: m.course_id,
      training_category: m.training_category,
    }));
    // Deduplicate by training_name (prefer requirement if same name)
    const seen = new Set(reqOptions.map(r => r.training_name.toLowerCase()));
    const uniqueModules = moduleOptions.filter(m => !seen.has(m.training_name.toLowerCase()));
    return [...reqOptions, ...uniqueModules];
  }, [requirements, trainingModules]);

  const officerUsers = allUsers.filter(u => hasOfficerAdditionalRole(u) && u.first_name && u.email && !u.termination_date && String(u.status || '').toLowerCase() !== 'terminated');

  // Save requirement
  const saveRequirementMutation = useMutation({
    mutationFn: (data) => {
      const renewalReq = data.renewal_requirement_id ? requirements.find(r => r.id === data.renewal_requirement_id) : null;
      const finalData = {
        ...data,
        renewal_training_name: renewalReq?.training_name || null,
      };
      return editingRequirement
        ? trainingUpdate('TrainingRequirement', editingRequirement.id, finalData)
        : trainingCreate('TrainingRequirement', finalData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingRequirements'] });
      setShowRequirementDialog(false);
      setEditingRequirement(null);
      setRequirementForm(emptyRequirement);
      toast.success(editingRequirement ? "Requirement updated" : "Training requirement created");
    },
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: (id) => trainingDelete('TrainingRequirement', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trainingRequirements'] }); toast.success("Deleted"); },
  });

  // Assign training
  const assignMutation = useMutation({
    mutationFn: async (form) => {
      const today = new Date().toISOString().split('T')[0];
      let targetEmails = form.assign_to_all ? officerUsers.map(u => u.email) : form.officer_emails;
      const trainings = form.trainings.length > 0 ? form.trainings : [];
      if (trainings.length === 0) throw new Error("No trainings selected");

      const created = [];
      for (const t of trainings) {
        for (const email of targetEmails) {
          const officer = officerUsers.find(u => u.email === email);
          const renewalReq = t.renewal_requirement_id ? requirements.find(r => r.id === t.renewal_requirement_id) : null;
          const a = await trainingCreate('TrainingAssignment', {
            requirement_id: t.requirement_id || null,
            training_name: t.training_name,
            category: t.category,
            description: t.description,
            officer_email: email,
            officer_name: officer ? `${officer.first_name} ${officer.last_name}` : email,
            assigned_date: today,
            due_date: form.due_date || null,
            is_mandatory: form.is_mandatory,
            priority: form.priority,
            admin_notes: form.admin_notes,
            required_proof_type: t.required_proof_type,
            requires_photos: t.requires_photos,
            requires_expiration_date: t.requires_expiration_date,
            requires_certificate_number: t.requires_certificate_number,
            renewal_period_months: t.renewal_period_months,
            renewal_requirement_id: t.renewal_requirement_id || null,
            renewal_training_name: renewalReq?.training_name || null,
            status: "assigned",
            assigned_by: user.email,
          });
          created.push(a);
        }
        // One notification per officer mentioning all trainings
      }

      const trainingNames = trainings.map(t => t.training_name).join(', ');
      await Promise.all(targetEmails.map(email =>
        base44.entities.Notification.create({
          recipient_email: email,
          type: 'training_assigned',
          priority: form.is_mandatory ? 'high' : 'normal',
          title: `New Training Assignment${trainings.length > 1 ? 's' : ''}: ${trainingNames}`,
          message: `You have been assigned ${trainings.length} training${trainings.length > 1 ? 's' : ''}: ${trainingNames}.${form.due_date ? ` Due: ${format(parseISO(form.due_date), 'MMM d, yyyy')}` : ''}`,
          is_read: false,
        }).catch(() => {})
      ));

      return created;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      setShowAssignDialog(false);
      setAssignForm(emptyAssignment);
      toast.success(`${data.length} assignment${data.length !== 1 ? 's' : ''} created`);
    },
  });

  // Review submission
  const reviewMutation = useMutation({
    mutationFn: async ({ submission, decision }) => {
      const now = new Date().toISOString();
      const adminName = `${user.first_name} ${user.last_name}`;

      // Merge admin-entered approval details into submission
      const finalExpiration = approvalDetails.expiration_date || submission.expiration_date || null;
      const finalCertNumber = approvalDetails.certificate_number || submission.certificate_number || null;
      const finalIssueDate = approvalDetails.issue_date || submission.issue_date || null;

      await trainingUpdate('TrainingSubmission', submission.id, {
        status: decision,
        reviewed_by: user.email,
        reviewed_by_name: adminName,
        reviewed_date: now,
        rejection_reason: decision === 'rejected' ? rejectionReason : null,
        admin_internal_notes: adminNotes,
        ...(decision === 'approved' && {
          expiration_date: finalExpiration,
          certificate_number: finalCertNumber,
          issue_date: finalIssueDate,
        }),
      });

      const newStatus = decision === 'approved' ? 'approved' : 'rejected';
      let updateData = { status: newStatus };

      if (decision === 'approved') {
        const assignment = assignments.find(a => a.id === submission.assignment_id);

        // Use admin-set renewal_due_date, or calculate from renewal_period_months
        if (approvalDetails.renewal_due_date) {
          updateData.renewal_due_date = approvalDetails.renewal_due_date;
        } else if (assignment?.renewal_period_months > 0) {
          const baseDate = finalExpiration ? new Date(finalExpiration) : new Date();
          updateData.renewal_due_date = addMonths(baseDate, assignment.renewal_period_months).toISOString().split('T')[0];
        }

        if (finalExpiration) updateData.expiration_date = finalExpiration;

        // Keep the officer certification profile and compliance records in sync.
        // This is the same source used by Officer Records, so an approved training
        // never disappears just because it originated from an assignment/submission.
        const matchedModule = trainingModules.find(m => String(m.title || '').trim().toLowerCase() === String(submission.training_name || '').trim().toLowerCase());
        await base44.functions.invoke('manageOfficerCertifications', {
          action: 'upsert',
          officer_email: submission.officer_email,
          cert: {
            course_id: matchedModule?.course_id || '',
            training_name: submission.training_name,
            category: matchedModule?.training_category === 'dcjs' ? 'dcjs' : (assignment?.category || 'company'),
            status: 'active',
            issue_date: finalIssueDate || new Date().toISOString().split('T')[0],
            expiration_date: finalExpiration || '',
            renewal_period_months: assignment?.renewal_period_months || matchedModule?.renewal_period_months || 0,
            certificate_number: finalCertNumber || '',
            notes: 'Synced from approved training submission',
            manually_verified: true,
          },
        });

        // Schedule 90-day renewal reminder if we have an expiration or renewal due date
        const reminderTarget = approvalDetails.renewal_due_date || finalExpiration;
        if (reminderTarget) {
          const targetDate = new Date(reminderTarget);
          const reminderDate = new Date(targetDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          if (reminderDate >= today) {
            const renewalReq = approvalDetails.renewal_requirement_id
              ? requirements.find(r => r.id === approvalDetails.renewal_requirement_id) : null;
            await base44.entities.Notification.create({
              recipient_email: submission.officer_email,
              type: 'training_renewal_reminder',
              priority: 'high',
              title: `Renewal Reminder: ${submission.training_name}`,
              message: `Your "${submission.training_name}" training ${finalExpiration ? 'expires' : 'is due for renewal'} on ${format(targetDate, 'MMM d, yyyy')}. ${renewalReq ? `Please complete "${renewalReq.training_name}" for renewal.` : 'Please complete your renewal training.'} (90-day advance notice)`,
              is_read: false,
              scheduled_send_date: reminderDate.toISOString().split('T')[0],
            }).catch(() => {});
          }
        }
      }

      await trainingUpdate('TrainingAssignment', submission.assignment_id, updateData);

      // Notify officer of approval/rejection
      const renewalReqName = approvalDetails.renewal_requirement_id
        ? requirements.find(r => r.id === approvalDetails.renewal_requirement_id)?.training_name : null;
      await base44.entities.Notification.create({
        recipient_email: submission.officer_email,
        type: decision === 'approved' ? 'training_approved' : 'training_rejected',
        priority: decision === 'rejected' ? 'high' : 'normal',
        title: `Training ${decision === 'approved' ? 'Approved' : 'Rejected'}: ${submission.training_name}`,
        message: decision === 'approved'
          ? `Your submission for "${submission.training_name}" has been approved.${approvalDetails.renewal_due_date ? ` Renewal due: ${format(new Date(approvalDetails.renewal_due_date), 'MMM d, yyyy')}.` : ''}${renewalReqName ? ` Renewal training: "${renewalReqName}".` : ''}`
          : `Your submission for "${submission.training_name}" was rejected. Reason: ${rejectionReason}`,
        is_read: false,
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingSubmissions'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      setReviewingSubmission(null);
      setRejectionReason("");
      setAdminNotes("");
      setApprovalDetails({ expiration_date: "", certificate_number: "", issue_date: "", renewal_due_date: "", renewal_requirement_id: "" });
      toast.success("Review saved");
    },
  });

  // Record existing (already-completed) training for an officer — supports multiple entries
  const recordTrainingMutation = useMutation({
    mutationFn: async (form) => {
      const officer = officerUsers.find(u => u.email === form.officer_email);
      const officerName = officer ? `${officer.first_name} ${officer.last_name}` : form.officer_email;

      for (const entry of form.entries) {
        let renewalDueDate = null;
        if (entry.renewal_period_months > 0) {
          const base = entry.expiration_date ? new Date(entry.expiration_date) : new Date(entry.completed_date);
          renewalDueDate = addMonths(base, entry.renewal_period_months).toISOString().split('T')[0];
        }
        const reminderTargetDate = entry.expiration_date || entry.due_date || null;
        const renewalReq = entry.renewal_requirement_id ? requirements.find(r => r.id === entry.renewal_requirement_id) : null;

        const assignment = await trainingCreate('TrainingAssignment', {
          training_name: entry.training_name,
          category: entry.category,
          officer_email: form.officer_email,
          officer_name: officerName,
          assigned_date: entry.completed_date,
          due_date: entry.due_date || null,
          status: "approved",
          is_mandatory: false,
          priority: "normal",
          renewal_period_months: entry.renewal_period_months || 0,
          renewal_due_date: renewalDueDate,
          renewal_requirement_id: entry.renewal_requirement_id || null,
          renewal_training_name: renewalReq?.training_name || null,
          assigned_by: user.email,
          admin_notes: entry.renewal_requirement_id
            ? `Manually recorded by admin. Renewal course: ${renewalReq?.training_name || entry.renewal_requirement_id}`
            : "Manually recorded by admin",
          requirement_id: entry.requirement_id || null,
        });

        await trainingCreate('TrainingSubmission', {
          assignment_id: assignment.id,
          training_name: entry.training_name,
          officer_email: form.officer_email,
          officer_name: officerName,
          submission_date: new Date(entry.completed_date).toISOString(),
          status: "approved",
          certificate_number: entry.certificate_number || null,
          issue_date: entry.completed_date,
          expiration_date: entry.expiration_date || null,
          officer_notes: entry.notes || null,
          reviewed_by: user.email,
          reviewed_by_name: `${user.first_name} ${user.last_name}`,
          reviewed_date: new Date().toISOString(),
          admin_internal_notes: "Manually recorded by admin",
          version: 1,
        });

        const matchedModule = trainingModules.find(m => String(m.title || '').trim().toLowerCase() === String(entry.training_name || '').trim().toLowerCase());
        await base44.functions.invoke('manageOfficerCertifications', {
          action: 'upsert',
          officer_email: form.officer_email,
          cert: {
            course_id: matchedModule?.course_id || '',
            training_name: entry.training_name,
            category: matchedModule?.training_category === 'dcjs' ? 'dcjs' : (entry.category || 'company'),
            status: 'active',
            issue_date: entry.completed_date,
            expiration_date: entry.expiration_date || '',
            renewal_period_months: entry.renewal_period_months || matchedModule?.renewal_period_months || 0,
            certificate_number: entry.certificate_number || '',
            notes: entry.notes || 'Manually recorded in Training Compliance',
            manually_verified: true,
          },
        });

        if (reminderTargetDate) {
          const targetDate = new Date(reminderTargetDate);
          const reminderDate = new Date(targetDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          if (reminderDate >= today) {
            await base44.entities.Notification.create({
              recipient_email: form.officer_email,
              type: 'training_renewal_reminder',
              priority: 'high',
              title: `In-Service Reminder: ${entry.training_name}`,
              message: `Your "${entry.training_name}" training ${entry.expiration_date ? 'expires' : 'is due'} on ${format(targetDate, 'MMM d, yyyy')}. Please complete your in-service renewal${renewalReq ? ` by completing the "${renewalReq.training_name}" course` : ''}.`,
              is_read: false,
              scheduled_send_date: reminderDate.toISOString().split('T')[0],
            }).catch(() => {});
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingSubmissions'] });
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      setShowRecordDialog(false);
      setRecordForm({ officer_email: "", entries: [{ ...emptyRecordEntry }] });
      toast.success(`${recordForm.entries.length} training${recordForm.entries.length !== 1 ? 's' : ''} recorded successfully`);
    },
  });

  // Update an existing approved record (expiration, cert#, etc.)
  const updateRecordMutation = useMutation({
    mutationFn: async ({ assignment, form }) => {
      // Compute renewal date: 90-day notice before expiration if set
      let renewalDueDate = assignment.renewal_due_date || null;
      if (form.expiration_date && assignment.renewal_period_months > 0) {
        renewalDueDate = addMonths(new Date(form.expiration_date), assignment.renewal_period_months).toISOString().split('T')[0];
      }
      await trainingUpdate('TrainingAssignment', assignment.id, {
        renewal_due_date: renewalDueDate,
        expiration_date: form.expiration_date || null,
      });
      // Update the linked approved submission — fetch fresh to avoid stale closure
      const freshSubs = await base44.entities.TrainingSubmission.filter({ assignment_id: assignment.id });
      const approvedSub = freshSubs.filter(s => s.status === 'approved')
        .sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date))[0];
      if (approvedSub) {
        await trainingUpdate('TrainingSubmission', approvedSub.id, {
          expiration_date: form.expiration_date || null,
          certificate_number: form.certificate_number || null,
          issue_date: form.completed_date || approvedSub.issue_date,
          officer_notes: form.notes || approvedSub.officer_notes,
        });
      }
      // Schedule 90-day in-service reminder when expiration updated
      if (form.expiration_date) {
        const expDate = new Date(form.expiration_date);
        const reminderDate = new Date(expDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (reminderDate >= today) {
          await base44.entities.Notification.create({
            recipient_email: assignment.officer_email,
            type: 'training_renewal_reminder',
            priority: 'high',
            title: `In-Service Reminder: ${assignment.training_name}`,
            message: `Your "${assignment.training_name}" training expires on ${format(expDate, 'MMM d, yyyy')}. Please complete your in-service renewal — this reminder was scheduled 90 days in advance.`,
            is_read: false,
            scheduled_send_date: reminderDate.toISOString().split('T')[0],
          }).catch(() => {});
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingSubmissions'] });
      queryClient.invalidateQueries({ queryKey: ['myTrainingAssignments'] });
      setShowUpdateDialog(false);
      setUpdatingAssignment(null);
      toast.success("Record updated");
    },
  });

  const addTrainingToAssign = (opt) => {
    const t = {
      requirement_id: opt.source === 'requirement' ? opt.id : null,
      training_name: opt.training_name,
      category: opt.category,
      description: opt.description || "",
      required_proof_type: opt.required_proof_type || "",
      requires_photos: opt.requires_photos !== false,
      requires_expiration_date: opt.requires_expiration_date || false,
      requires_certificate_number: opt.requires_certificate_number || false,
      renewal_period_months: opt.renewal_period_months || 0,
      renewal_requirement_id: opt.renewal_requirement_id || "",
    };
    setAssignForm(prev => {
      if (prev.trainings.find(x => x.training_name === t.training_name)) return prev;
      return { ...prev, trainings: [...prev.trainings, t] };
    });
  };

  // kept for backward compat (called from Templates tab)
  const prefillFromRequirement = (opt) => {
    setAssignForm(emptyAssignment);
    addTrainingToAssign(opt);
  };

  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printFilter, setPrintFilter] = useState("all");
  const [printOfficerFilter, setPrintOfficerFilter] = useState("all");

  const pendingSubmissions = submissions.filter(s => s.status === 'pending_review');
  const filteredAssignments = assignments.filter(a =>
    !searchTerm || a.officer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || a.training_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const executePrintReport = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter assignments by status
    let filtered = assignments;
    if (printOfficerFilter !== 'all') {
      filtered = filtered.filter(a => a.officer_email === printOfficerFilter);
    }
    if (printFilter === 'approved') {
      filtered = filtered.filter(a => a.status === 'approved');
    } else if (printFilter === 'pending') {
      filtered = filtered.filter(a => a.status === 'pending_review' || a.status === 'in_progress' || a.status === 'assigned');
    } else if (printFilter === 'expired') {
      filtered = filtered.filter(a => {
        const sub = submissions.filter(s => s.assignment_id === a.id && s.status === 'approved').sort((x, y) => new Date(y.submission_date) - new Date(x.submission_date))[0];
        if (sub?.expiration_date && new Date(sub.expiration_date) < today) return true;
        if (a.due_date && new Date(a.due_date) < today && a.status !== 'approved') return true;
        return false;
      });
    } else if (printFilter === 'overdue') {
      filtered = filtered.filter(a => a.due_date && new Date(a.due_date) < today && a.status !== 'approved');
    } else if (printFilter === 'rejected') {
      filtered = filtered.filter(a => a.status === 'rejected');
    }

    // Group by officer
    const grouped = {};
    filtered.forEach(a => {
      const key = a.officer_email;
      if (!grouped[key]) grouped[key] = { name: a.officer_name || a.officer_email, email: key, items: [] };
      grouped[key].items.push(a);
    });
    const sortedOfficers = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    const filterLabel = {
      all: 'All Trainings',
      approved: 'Approved / Completed',
      pending: 'Pending / In Progress',
      expired: 'Expired Certifications',
      overdue: 'Overdue Assignments',
      rejected: 'Rejected',
    }[printFilter] || 'All';

    const officerLabel = printOfficerFilter === 'all' ? 'All Officers' : (allUsers.find(u => u.email === printOfficerFilter)?.first_name + ' ' + allUsers.find(u => u.email === printOfficerFilter)?.last_name);

    // Build module completions map by officer
    const completionsByOfficer = {};
    trainingCompletions.forEach(tc => {
      if (!completionsByOfficer[tc.officer_email]) completionsByOfficer[tc.officer_email] = [];
      completionsByOfficer[tc.officer_email].push(tc);
    });

    const officerSections = sortedOfficers.map(o => {
      const userRecord = allUsers.find(u => u.email === o.email);
      const rankLine = [userRecord?.rank, userRecord?.division].filter(Boolean).join(' · ');
      const moduleCompletions = completionsByOfficer[o.email] || [];

      const rows = o.items.map(a => {
        const sub = submissions.filter(s => s.assignment_id === a.id && s.status === 'approved').sort((x, y) => new Date(y.submission_date) - new Date(x.submission_date))[0];
        const isExpired = sub?.expiration_date && new Date(sub.expiration_date) < today;
        const isOverdue = a.due_date && new Date(a.due_date) < today && a.status !== 'approved';
        const statusClass = a.status === 'approved' ? (isExpired ? 'status-expired' : 'status-approved') : isOverdue ? 'status-overdue' : a.status === 'rejected' ? 'status-rejected' : 'status-pending';
        const statusLabel = a.status === 'approved' ? (isExpired ? 'EXPIRED' : 'APPROVED') : isOverdue ? 'OVERDUE' : a.status?.replace(/_/g, ' ').toUpperCase();
        return `<tr>
          <td>${a.training_name}</td>
          <td>${(a.category || '').replace(/_/g, ' ')}</td>
          <td>${a.assigned_date ? format(parseISO(a.assigned_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${a.due_date ? format(parseISO(a.due_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${sub?.expiration_date ? format(parseISO(sub.expiration_date), 'MM/dd/yyyy') : '-'}</td>
          <td>${sub?.certificate_number || '-'}</td>
          <td class="${statusClass}">${statusLabel}</td>
          <td>${a.is_mandatory ? 'Yes' : '-'}</td>
          <td>${sub?.reviewed_date ? format(new Date(sub.reviewed_date), 'MM/dd/yyyy') : '-'}</td>
        </tr>`;
      }).join('');

      // Add module completions not already in assignments
      const assignedNames = new Set(o.items.map(a => a.training_name?.toLowerCase()));
      const extraRows = moduleCompletions
        .filter(tc => !assignedNames.has(tc.module_title?.toLowerCase()))
        .map(tc => `<tr class="module-row">
          <td>${tc.module_title || '-'} <span style="color:#6366f1;font-size:9px;">[Module]</span></td>
          <td>${(tc.module_category || '').replace(/_/g, ' ')}</td>
          <td>-</td><td>-</td><td>-</td>
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
            <tbody>${rows}${extraRows}</tbody>
          </table>
        </div>`;
    }).join('');

    const totalApproved = filtered.filter(a => a.status === 'approved').length;
    const totalOverdue = filtered.filter(a => a.due_date && new Date(a.due_date) < today && a.status !== 'approved').length;
    const totalPending = filtered.filter(a => a.status === 'pending_review').length;

    const win = window.open('', '', 'width=1000,height=800');
    win.document.write(`<!DOCTYPE html><html><head><title>Training Report</title>
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      @media print { .no-print { display:none; } @page { margin: 0.5in; size: landscape; } }
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; color: #111; background-color: #fff; }
      h1 { font-size: 20px; margin-bottom: 2px; color: #1e293b; }
      .meta { color: #555; margin-bottom: 4px; font-size: 11px; }
      .filter-tag { display:inline-block; background-color:#1e40af !important; color:white !important; padding:2px 8px; border-radius:4px; font-size:10px; margin-bottom:8px; }
      .stats-bar { display:flex; gap:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 14px; margin-bottom:16px; font-size:11px; }
      .stat-item { text-align:center; }
      .stat-val { font-size:16px; font-weight:bold; }
      .stat-label { color:#64748b; font-size:9px; text-transform:uppercase; }
      .officer-section { margin-bottom: 28px; page-break-inside: avoid; }
      .officer-header { background-color: #1e3a5f !important; color: white !important; padding: 7px 10px; font-size: 13px; font-weight: bold; border-radius: 4px 4px 0 0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .officer-rank { font-size: 10px; font-weight: normal; background:rgba(255,255,255,0.15); padding:1px 6px; border-radius:3px; }
      .officer-email { font-size: 10px; font-weight: normal; opacity: 0.7; margin-left:auto; }
      table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; }
      th { background-color: #1e40af !important; color: white !important; padding: 5px 7px; text-align: left; font-size: 10px; }
      td { padding: 4px 7px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
      tr:nth-child(even) td { background-color: #f9fafb !important; }
      .module-row td { background-color: #f5f3ff !important; }
      .status-approved { color: #16a34a !important; font-weight: bold; }
      .status-expired { color: #9333ea !important; font-weight: bold; }
      .status-overdue { color: #dc2626 !important; font-weight: bold; }
      .status-pending { color: #d97706 !important; font-weight: bold; }
      .status-rejected { color: #dc2626 !important; font-weight: bold; }
      .no-data { text-align:center; padding:30px; color:#999; font-style:italic; }
      .back-btn { margin-bottom: 12px; padding: 6px 14px; background-color:#1e40af !important; color:white !important; border:none; border-radius:4px; cursor:pointer; font-size:12px; }
      .logo { font-weight:bold; font-size:18px; color:#1e293b; margin-bottom:2px; }
    </style></head><body>
    <button class="no-print back-btn" onclick="window.close()">← Close</button>
    <div class="logo">Black Point Protection</div>
    <h1>Training & Compliance Report</h1>
    <div class="meta">Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}</div>
    <div class="meta">Officers: ${officerLabel} &nbsp;|&nbsp; Filter: <strong>${filterLabel}</strong></div>
    <div class="filter-tag">${filterLabel.toUpperCase()}</div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-val">${sortedOfficers.length}</div><div class="stat-label">Officers</div></div>
      <div class="stat-item"><div class="stat-val">${filtered.length}</div><div class="stat-label">Records</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#16a34a">${totalApproved}</div><div class="stat-label">Approved</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#d97706">${totalPending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-item"><div class="stat-val" style="color:#dc2626">${totalOverdue}</div><div class="stat-label">Overdue</div></div>
    </div>
    ${sortedOfficers.length === 0 ? '<div class="no-data">No records match the selected filter.</div>' : officerSections}
    <script>window.onload = () => setTimeout(() => window.print(), 400)</script>
    </body></html>`);
    win.document.close();
    setShowPrintDialog(false);
  };

  if (!hasTrainingAccess) {
    return <div className="p-8 text-center"><Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" /><h2 className="text-xl font-bold">Trainer Access Required</h2></div>;
  }

  return (
    <div className={embedded ? "w-full bg-transparent px-4 py-5 md:px-6 md:py-6" : "min-h-screen bg-slate-50 p-4 md:p-6"}>
      <div className={embedded ? "w-full space-y-5" : "max-w-7xl mx-auto space-y-6"}>
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-700 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Training & Compliance Management</h1>
              <p className="text-slate-500 text-sm">Assign training, review submissions, manage records</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowPrintDialog(true)}>
              <Printer className="w-4 h-4 mr-2" />Print Report
            </Button>
            <Button variant="outline" onClick={() => { setEditingRequirement(null); setRequirementForm(emptyRequirement); setShowRequirementDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />New Compliance Rule
            </Button>
            <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => setShowRecordDialog(true)}>
              <CheckCircle className="w-4 h-4 mr-2" />Add Historical Record
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-800" onClick={() => { setAssignForm(emptyAssignment); setShowAssignDialog(true); }}>
              <Users className="w-4 h-4 mr-2" />Assign Training
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Assignments", value: assignments.length, color: "text-blue-700" },
            { label: "Pending Review", value: pendingSubmissions.length, color: "text-orange-600" },
            { label: "Approved", value: assignments.filter(a => a.status === 'approved').length, color: "text-green-600" },
            { label: "Rejected", value: assignments.filter(a => a.status === 'rejected').length, color: "text-red-600" },
            { label: "Compliance Rules", value: requirements.length, color: "text-purple-600" },
          ].map(s => (
            <Card key={s.label} className="border-none shadow-sm">
              <CardContent className="p-4">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 gap-2 border border-slate-200 bg-white p-2 sm:grid-cols-3 xl:grid-cols-6">
            <TabsTrigger value="officer-records">Officer Records</TabsTrigger>
            <TabsTrigger value="review">
              Pending Review
              {pendingSubmissions.length > 0 && <Badge className="ml-2 bg-orange-500 text-white text-xs">{pendingSubmissions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="templates">Compliance Rules</TabsTrigger>
            <TabsTrigger value="overview">Overview & Reports</TabsTrigger>
            <TabsTrigger value="alerts">Certification Alerts</TabsTrigger>
          </TabsList>

          {/* Pending Review Tab */}
          <TabsContent value="review" className="space-y-3 mt-4">
            {pendingSubmissions.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-slate-500"><CheckCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No pending submissions</p></CardContent></Card>
            ) : pendingSubmissions.map(sub => {
              const assignment = assignments.find(a => a.id === sub.assignment_id);
              return (
                <Card key={sub.id} className="border border-orange-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-900">{sub.training_name}</h3>
                          <Badge className="bg-orange-100 text-orange-800">Pending Review</Badge>
                          {assignment?.is_mandatory && <Badge className="bg-red-100 text-red-800 text-xs">Mandatory</Badge>}
                        </div>
                        <p className="text-sm text-slate-600">Officer: <strong>{sub.officer_name}</strong> ({sub.officer_email})</p>
                        <p className="text-xs text-slate-500">Submitted: {format(new Date(sub.submission_date), 'MMM d, yyyy h:mm a')}</p>
                        {sub.version > 1 && <Badge variant="outline" className="mt-1 text-xs">Resubmission v{sub.version}</Badge>}
                        <div className="flex gap-2 mt-2 flex-wrap">
                                                {sub.photo_url_1 && <a href={sub.photo_url_1} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Photo 1</a>}
                                                {sub.photo_url_2 && <a href={sub.photo_url_2} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Photo 2</a>}
                                                {sub.document_url && <a href={sub.document_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Document</a>}
                                              </div>
                                              {assignment?.renewal_period_months > 0 && <span className="text-xs text-blue-600 mt-1 block">Renewal: {assignment?.renewal_training_name || 'Not set'}</span>}
                      </div>
                      <Button className="bg-blue-600 hover:bg-blue-700" size="sm" onClick={() => {
                        const assignment = assignments.find(a => a.id === sub.assignment_id);
                        const req = requirements.find(r => r.id === assignment?.requirement_id);
                        // Auto-calculate renewal_due_date from expiration + renewal_period_months
                        let autoRenewalDate = "";
                        const renewalMonths = req?.renewal_period_months || assignment?.renewal_period_months || 0;
                        const baseExpiry = sub.expiration_date;
                        if (renewalMonths > 0 && baseExpiry) {
                          autoRenewalDate = addMonths(new Date(baseExpiry), renewalMonths).toISOString().split('T')[0];
                        }
                        setReviewingSubmission(sub);
                        setRejectionReason("");
                        setAdminNotes("");
                        setApprovalDetails({
                          expiration_date: sub.expiration_date || "",
                          certificate_number: sub.certificate_number || "",
                          issue_date: sub.issue_date || "",
                          renewal_due_date: autoRenewalDate,
                          renewal_requirement_id: req?.id || assignment?.requirement_id || "",
                        });
                      }}>
                        <Eye className="w-4 h-4 mr-1" />Review
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Officer Records Tab — single source for profile certifications + pushed training */}
          <TabsContent value="officer-records" className="mt-4">
            <OfficerCertificationCenter />
          </TabsContent>

          {/* All Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4 mt-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search officer or training..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)}>
                <Download className="w-4 h-4 mr-1" />Export
              </Button>
            </div>
            <div className="space-y-2">
              {filteredAssignments.length === 0 ? (
                <Card><CardContent className="p-12 text-center text-slate-500">No assignments found</CardContent></Card>
              ) : filteredAssignments.map(a => (
                <Card key={a.id} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-slate-900">{a.officer_name || a.officer_email}</span>
                          <span className="text-slate-400">—</span>
                          <span className="text-sm text-slate-700">{a.training_name}</span>
                          <Badge className={`text-xs ${STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-800'}`}>{a.status?.replace(/_/g, ' ')}</Badge>
                          {a.is_mandatory && <Badge className="bg-red-100 text-red-800 text-xs">Mandatory</Badge>}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                          <span>Assigned: {a.assigned_date ? format(parseISO(a.assigned_date), 'MM/dd/yyyy') : '-'}</span>
                          {a.due_date && <span>Due: {format(parseISO(a.due_date), 'MM/dd/yyyy')}</span>}
                          {a.renewal_due_date && <span className="text-blue-600">Renewal: {format(parseISO(a.renewal_due_date), 'MM/dd/yyyy')}</span>}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => trainingDelete('TrainingAssignment', a.id).then(() => queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] }))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="overview" className="mt-4">
            <TrainingComplianceTracker embedded />
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <AdminCertificationAlerts embedded />
          </TabsContent>

          {/* Training Templates Tab */}
          <TabsContent value="templates" className="space-y-3 mt-4">
            {/* Training Types (from Requirements) */}
            {requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Compliance Rules</p>
                {requirements.map(req => (
                  <Card key={req.id} className={`border shadow-sm mb-2 overflow-hidden ${req.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                    <div className={`h-1.5 ${req.is_mandatory ? 'bg-gradient-to-r from-red-500 to-rose-600' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`} />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-semibold text-slate-900">{req.training_name}</h3>
                            <Badge className="bg-blue-100 text-blue-800 text-xs capitalize">{req.category?.replace(/_/g, ' ')}</Badge>
                            {req.is_mandatory && <Badge className="bg-red-100 text-red-800 text-xs">Mandatory</Badge>}
                            {!req.active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                            {req.renewal_period_months > 0 && <Badge className="bg-purple-100 text-purple-800 text-xs">Renews every {req.renewal_period_months}mo</Badge>}
                          </div>
                          {req.description && <p className="text-sm text-slate-600 line-clamp-2">{req.description}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                            {req.required_proof_type && <span>Proof: {req.required_proof_type}</span>}
                            {req.requires_photos && <span>📷 Photos required</span>}
                            {req.requires_expiration_date && <span>📅 Exp. date required</span>}
                            {req.requires_certificate_number && <span>🔢 Cert # required</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { prefillFromRequirement({ ...req, source: 'requirement' }); setShowAssignDialog(true); }}>
                            <Users className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingRequirement(req); setRequirementForm({ ...req }); setShowRequirementDialog(true); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm('Delete this training type?')) deleteRequirementMutation.mutate(req.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Training Modules (from AdminTraining) */}
            {trainingModules.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-4">Training Modules (Created in Training Creation)</p>
                {trainingModules.map(m => (
                  <Card key={m.id} className={`border shadow-sm mb-2 overflow-hidden ${m.active !== false ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                    <div className={`h-1.5 ${m.required ? 'bg-gradient-to-r from-red-500 to-pink-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'}`} />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {m.course_id && <Badge className="bg-slate-100 text-slate-700 text-xs font-mono">{m.course_id}</Badge>}
                            <h3 className="font-semibold text-slate-900">{m.title}</h3>
                            {m.training_category === 'dcjs' ? <Badge className="bg-blue-600 text-white text-xs">DCJS</Badge> : <Badge className="bg-purple-100 text-purple-800 text-xs">Company</Badge>}
                            {m.required && <Badge className="bg-red-100 text-red-800 text-xs">Required</Badge>}
                            {m.active === false && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                            {m.renewal_period_months > 0 && <Badge className="bg-purple-100 text-purple-800 text-xs">Renews every {m.renewal_period_months}mo</Badge>}
                          </div>
                          {m.description && <p className="text-sm text-slate-600 line-clamp-2">{m.description}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                            <span className="capitalize">{m.category?.replace(/_/g, ' ')}</span>
                            {m.duration_minutes && <span>⏱ {m.duration_minutes} min</span>}
                            {m.requires_expiration_tracking && <span>📅 Tracks expiration</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          prefillFromRequirement({
                            id: `module_${m.id}`, source: 'module',
                            training_name: m.title, category: m.category || 'other',
                            description: m.description || '', required_proof_type: m.requires_expiration_tracking ? 'Certificate' : '',
                            requires_photos: true, requires_expiration_date: m.requires_expiration_tracking || false,
                            requires_certificate_number: false, is_mandatory: m.required || false,
                            admin_notes: '', renewal_period_months: m.renewal_period_months || 0,
                          });
                          setShowAssignDialog(true);
                        }}>
                          <Users className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {requirements.length === 0 && trainingModules.length === 0 && (
              <Card><CardContent className="p-12 text-center text-slate-500"><GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No training types or modules created yet.</p></CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Requirement Dialog */}
      <Dialog open={showRequirementDialog} onOpenChange={setShowRequirementDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequirement ? 'Edit Compliance Rule' : 'New Compliance Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Requirement / Certification Name *</Label>
              <Input value={requirementForm.training_name} onChange={e => setRequirementForm(p => ({ ...p, training_name: e.target.value }))} placeholder="e.g., CPR, DCJS, Fire Watch" list="preset-trainings" />
              <datalist id="preset-trainings">{PRESET_TRAININGS.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={requirementForm.category} onValueChange={v => setRequirementForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description / Instructions</Label>
              <Textarea value={requirementForm.description} onChange={e => setRequirementForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Required Proof Type</Label>
              <Input value={requirementForm.required_proof_type} onChange={e => setRequirementForm(p => ({ ...p, required_proof_type: e.target.value }))} placeholder="e.g., CPR card, certificate, signed form" />
            </div>
            <div className="space-y-2">
              <Label>Renewal Period (months, 0 = no renewal)</Label>
              <Input type="number" min="0" value={requirementForm.renewal_period_months} onChange={e => setRequirementForm(p => ({ ...p, renewal_period_months: parseInt(e.target.value) || 0 }))} />
            </div>
            {requirementForm.renewal_period_months > 0 && (
              <div className="space-y-2">
                <Label>Renewal Training Course (what officer must take to renew)</Label>
                <Select value={requirementForm.renewal_requirement_id || ""} onValueChange={v => setRequirementForm(p => ({ ...p, renewal_requirement_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select renewal training..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {requirements.filter(r => r.id !== editingRequirement?.id && r.active).map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'requires_photos', label: 'Photos required' },
                { key: 'requires_expiration_date', label: 'Expiration date required' },
                { key: 'requires_certificate_number', label: 'Certificate # required' },
                { key: 'is_mandatory', label: 'Mandatory training' },
                { key: 'requires_approval', label: 'Admin approval required' },
                { key: 'active', label: 'Active' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox checked={requirementForm[key]} onCheckedChange={c => setRequirementForm(p => ({ ...p, [key]: !!c }))} />
                  <Label className="text-sm cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Default Admin Notes</Label>
              <Textarea value={requirementForm.admin_notes} onChange={e => setRequirementForm(p => ({ ...p, admin_notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowRequirementDialog(false)}>Cancel</Button>
              <Button className="flex-1 bg-blue-700" disabled={!requirementForm.training_name || saveRequirementMutation.isPending} onClick={() => saveRequirementMutation.mutate(requirementForm)}>
                {saveRequirementMutation.isPending ? 'Saving...' : editingRequirement ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Training to Officers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Training Selection — multi-select */}
            <div className="space-y-2">
              <Label>Trainings to Assign * <span className="text-xs font-normal text-slate-400">(you can add multiple)</span></Label>
              <Select value="" onValueChange={v => { const opt = allTrainingOptions.find(o => o.id === v); if (opt) addTrainingToAssign(opt); }}>
                <SelectTrigger><SelectValue placeholder="Add training from saved types..." /></SelectTrigger>
                <SelectContent>
                  {requirements.filter(r => r.active).length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Compliance Rules</div>
                      {requirements.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>)}
                    </>
                  )}
                  {trainingModules.filter(m => m.active !== false && !requirements.some(r => r.training_name.toLowerCase() === m.title.toLowerCase())).length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">Training Modules</div>
                      {trainingModules.filter(m => m.active !== false && !requirements.some(r => r.training_name.toLowerCase() === m.title.toLowerCase())).map(m => <SelectItem key={`module_${m.id}`} value={`module_${m.id}`}>{m.title}{m.course_id ? ` (${m.course_id})` : ''}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Assignments must come from Training Setup or a saved Compliance Rule so officer records, student training, compliance checks, and certification alerts stay linked to the same source.</p>
              {assignForm.trainings.length > 0 && (
                <div className="space-y-1 mt-1 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-semibold text-blue-800 mb-2">{assignForm.trainings.length} training{assignForm.trainings.length !== 1 ? 's' : ''} selected:</p>
                  {assignForm.trainings.map((t, idx) => {
                    const renewalReq = t.renewal_requirement_id ? requirements.find(r => r.id === t.renewal_requirement_id) : null;
                    return (
                      <div key={idx} className="space-y-1.5 bg-white rounded px-3 py-2 border border-blue-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-800">{t.training_name}</span>
                          <X className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-red-500" onClick={() => setAssignForm(p => ({ ...p, trainings: p.trainings.filter((_, i) => i !== idx) }))} />
                        </div>
                        {t.renewal_period_months > 0 && (
                          <div className="text-xs">
                            <Select value={t.renewal_requirement_id || ""} onValueChange={v => setAssignForm(p => {
                              const updated = [...p.trainings];
                              updated[idx] = { ...updated[idx], renewal_requirement_id: v === '__none__' ? '' : v };
                              return { ...p, trainings: updated };
                            })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select renewal course..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {requirements.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {renewalReq && <p className="text-slate-500 mt-0.5">Renewal: {renewalReq.training_name}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={assignForm.due_date} onChange={e => setAssignForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={assignForm.priority} onValueChange={v => setAssignForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes for Officers</Label>
              <Textarea value={assignForm.admin_notes} onChange={e => setAssignForm(p => ({ ...p, admin_notes: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'is_mandatory', label: 'Mandatory' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox checked={assignForm[key]} onCheckedChange={c => setAssignForm(p => ({ ...p, [key]: !!c }))} />
                  <Label className="text-sm cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>

            {/* Officer Selection */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={assignForm.assign_to_all} onCheckedChange={c => setAssignForm(p => ({ ...p, assign_to_all: !!c, officer_emails: [] }))} />
                <Label className="font-semibold cursor-pointer">Assign to ALL officers ({officerUsers.length})</Label>
              </div>
              {!assignForm.assign_to_all && (
                <div className="space-y-2">
                  <Label>Select Officers</Label>
                  <Select value="" onValueChange={v => { if (!assignForm.officer_emails.includes(v)) setAssignForm(p => ({ ...p, officer_emails: [...p.officer_emails, v] })); }}>
                    <SelectTrigger><SelectValue placeholder="Add officer..." /></SelectTrigger>
                    <SelectContent>
                      {officerUsers.filter(u => !assignForm.officer_emails.includes(u.email)).map(u => (
                        <SelectItem key={u.id} value={u.email}>{u.first_name} {u.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    {assignForm.officer_emails.map(email => {
                      const officer = officerUsers.find(u => u.email === email);
                      return (
                        <Badge key={email} className="bg-blue-100 text-blue-800 flex items-center gap-1">
                          {officer ? `${officer.first_name} ${officer.last_name}` : email}
                          <X className="w-3 h-3 cursor-pointer" onClick={() => setAssignForm(p => ({ ...p, officer_emails: p.officer_emails.filter(e => e !== email) }))} />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-blue-700"
                disabled={assignForm.trainings.length === 0 || (!assignForm.assign_to_all && assignForm.officer_emails.length === 0) || assignMutation.isPending}
                onClick={() => assignMutation.mutate(assignForm)}
              >
                <Users className="w-4 h-4 mr-2" />
                {assignMutation.isPending ? 'Assigning...' : `Assign ${assignForm.trainings.length} Training${assignForm.trainings.length !== 1 ? 's' : ''} to ${assignForm.assign_to_all ? 'All' : assignForm.officer_emails.length} Officer${assignForm.officer_emails.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Existing Training Dialog */}
      <Dialog open={showRecordDialog} onOpenChange={setShowRecordDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Existing Training</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">Log training an officer has already completed. All entries will be immediately marked as approved.</p>
          <div className="space-y-4">
            {/* Officer */}
            <div className="space-y-2">
              <Label>Officer *</Label>
              <Select value={recordForm.officer_email} onValueChange={v => setRecordForm(p => ({ ...p, officer_email: v }))}>
                <SelectTrigger><SelectValue placeholder="Select officer..." /></SelectTrigger>
                <SelectContent>
                  {officerUsers.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(u => (
                    <SelectItem key={u.id} value={u.email}>{u.first_name} {u.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Training Entries */}
            {recordForm.entries.map((entry, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50 relative">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Training #{idx + 1}</p>
                  {recordForm.entries.length > 1 && (
                    <button type="button" className="text-red-400 hover:text-red-600" onClick={() => setRecordForm(p => ({ ...p, entries: p.entries.filter((_, i) => i !== idx) }))}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Quick-fill from saved classes */}
                {allTrainingOptions.length > 0 && (
                  <Select value={entry.requirement_id || ""} onValueChange={v => {
                    const opt = allTrainingOptions.find(o => o.id === v);
                    if (!opt) return;
                    setRecordForm(p => {
                      const updated = [...p.entries];
                      updated[idx] = { ...updated[idx], requirement_id: opt.source === 'requirement' ? opt.id : null, training_name: opt.training_name, category: opt.category || "certification", renewal_period_months: opt.renewal_period_months || 0 };
                      return { ...p, entries: updated };
                    });
                  }}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select from saved classes..." /></SelectTrigger>
                    <SelectContent>
                      {requirements.filter(r => r.active).length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Compliance Rules</div>
                          {requirements.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>)}
                        </>
                      )}
                      {trainingModules.filter(m => m.active !== false && !requirements.some(r => r.training_name.toLowerCase() === m.title.toLowerCase())).length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">Training Modules</div>
                          {trainingModules.filter(m => m.active !== false).map(m => <SelectItem key={`module_${m.id}`} value={`module_${m.id}`}>{m.title}</SelectItem>)}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}

                {entry.renewal_period_months > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Renewal Training Course</Label>
                    <Select value={entry.renewal_requirement_id || ""} onValueChange={v => {
                      const nextRenewalId = v === '__none__' ? '' : v;
                      const renewalReq = nextRenewalId ? requirements.find(r => r.id === nextRenewalId) : null;
                      setRecordForm(p => { 
                        const u = [...p.entries]; 
                        u[idx] = { ...u[idx], renewal_requirement_id: nextRenewalId, renewal_training_name: renewalReq?.training_name || "" }; 
                        return { ...p, entries: u }; 
                      });
                    }}>
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Select renewal course..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {requirements.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Training Name *</Label>
                    <Input value={entry.training_name} onChange={e => setRecordForm(p => { const u = [...p.entries]; u[idx] = { ...u[idx], training_name: e.target.value }; return { ...p, entries: u }; })} placeholder="e.g., CPR, OC Spray" list="record-presets" className="bg-white" />
                    <datalist id="record-presets">{PRESET_TRAININGS.map(t => <option key={t} value={t} />)}</datalist>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={entry.category} onValueChange={v => setRecordForm(p => { const u = [...p.entries]; u[idx] = { ...u[idx], category: v }; return { ...p, entries: u }; })}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Completion Date *</Label>
                    <Input type="date" value={entry.completed_date} onChange={e => setRecordForm(p => { const u = [...p.entries]; u[idx] = { ...u[idx], completed_date: e.target.value }; return { ...p, entries: u }; })} className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expiration Date</Label>
                    <Input type="date" value={entry.expiration_date} onChange={e => {
                      const expDate = e.target.value;
                      setRecordForm(p => {
                        const u = [...p.entries];
                        const months = u[idx].renewal_period_months || 0;
                        const autoRenewal = months > 0 && expDate ? addMonths(new Date(expDate), months).toISOString().split('T')[0] : u[idx].due_date;
                        u[idx] = { ...u[idx], expiration_date: expDate, due_date: autoRenewal };
                        return { ...p, entries: u };
                      });
                    }} className="bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Certificate / Card #</Label>
                    <Input value={entry.certificate_number} onChange={e => setRecordForm(p => { const u = [...p.entries]; u[idx] = { ...u[idx], certificate_number: e.target.value }; return { ...p, entries: u }; })} placeholder="Optional" className="bg-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Renewal Period (months)</Label>
                    <Input type="number" min="0" value={entry.renewal_period_months} onChange={e => {
                      const months = parseInt(e.target.value) || 0;
                      setRecordForm(p => { const u = [...p.entries]; const autoRenewal = months > 0 && u[idx].expiration_date ? addMonths(new Date(u[idx].expiration_date), months).toISOString().split('T')[0] : u[idx].due_date; u[idx] = { ...u[idx], renewal_period_months: months, due_date: autoRenewal }; return { ...p, entries: u }; });
                    }} className="bg-white" />
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setRecordForm(p => ({ ...p, entries: [...p.entries, { ...emptyRecordEntry }] }))}>
              <Plus className="w-4 h-4 mr-2" />Add Another Training
            </Button>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRecordDialog(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!recordForm.officer_email || recordForm.entries.some(e => !e.training_name || !e.completed_date) || recordTrainingMutation.isPending}
                onClick={() => recordTrainingMutation.mutate(recordForm)}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {recordTrainingMutation.isPending ? 'Saving...' : `Record ${recordForm.entries.length} Training${recordForm.entries.length !== 1 ? 's' : ''} as Completed`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Record Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Training Record — {updatingAssignment?.training_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">Update certificate details for {updatingAssignment?.officer_name}.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Completion / Issue Date</Label>
                <Input type="date" value={updateForm.completed_date} onChange={e => setUpdateForm(p => ({ ...p, completed_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input type="date" value={updateForm.expiration_date} onChange={e => setUpdateForm(p => ({ ...p, expiration_date: e.target.value }))} />
              </div>
            </div>
            {updatingAssignment?.renewal_period_months > 0 && (
              <div className="space-y-2">
                <Label>Renewal Training Course</Label>
                <Select value={updatingAssignment?.renewal_requirement_id || ""} onValueChange={v => {
                  const nextRenewalId = v === '__none__' ? '' : v;
                  const renewalReq = nextRenewalId ? requirements.find(r => r.id === nextRenewalId) : null;
                  trainingUpdate('TrainingAssignment', updatingAssignment.id, {
                    renewal_requirement_id: nextRenewalId || null,
                    renewal_training_name: renewalReq?.training_name || null,
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
                    toast.success("Renewal course updated");
                  });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select renewal course..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {requirements.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {updateForm.expiration_date && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>90-day in-service reminder will be scheduled for {format(new Date(new Date(updateForm.expiration_date).getTime() - 90*24*60*60*1000), 'MMM d, yyyy')}.</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Certificate / Card #</Label>
              <Input value={updateForm.certificate_number} onChange={e => setUpdateForm(p => ({ ...p, certificate_number: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={updateForm.notes} onChange={e => setUpdateForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowUpdateDialog(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={updateRecordMutation.isPending}
                onClick={() => updateRecordMutation.mutate({ assignment: updatingAssignment, form: updateForm })}
              >
                {updateRecordMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Report Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Printer className="w-5 h-5" />Print Training Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Officer</Label>
              <Select value={printOfficerFilter} onValueChange={setPrintOfficerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Officers</SelectItem>
                  {officerUsers.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)).map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.first_name} {u.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status Filter</Label>
              <Select value={printFilter} onValueChange={setPrintFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="approved">Approved / Completed</SelectItem>
                  <SelectItem value="pending">Pending / In Progress</SelectItem>
                  <SelectItem value="expired">Expired Certifications</SelectItem>
                  <SelectItem value="overdue">Overdue Assignments</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
              The report will be <strong>grouped by officer</strong>, showing each officer's trainings in their own section with status, expiration dates, and certificate numbers.
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
              <Button className="flex-1 bg-blue-700 hover:bg-blue-800" onClick={executePrintReport}>
                <Printer className="w-4 h-4 mr-2" />Generate Report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewingSubmission} onOpenChange={() => setReviewingSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Submission — {reviewingSubmission?.training_name}</DialogTitle>
          </DialogHeader>
          {reviewingSubmission && (
            <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p><strong>Officer:</strong> {reviewingSubmission.officer_name} ({reviewingSubmission.officer_email})</p>
                <p><strong>Submitted:</strong> {format(new Date(reviewingSubmission.submission_date), 'MMM d, yyyy h:mm a')}</p>
                {reviewingSubmission.version > 1 && <p><strong>Resubmission:</strong> Version {reviewingSubmission.version}</p>}
                {assignments.find(a => a.id === reviewingSubmission.assignment_id)?.renewal_period_months > 0 && (
                  <p><strong>Renewal Period:</strong> {assignments.find(a => a.id === reviewingSubmission.assignment_id)?.renewal_period_months} months</p>
                )}
              </div>

              {/* Photos */}
              {(reviewingSubmission.photo_url_1 || reviewingSubmission.photo_url_2) && (
                <div>
                  <Label className="mb-2 block">Proof Photos</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {reviewingSubmission.photo_url_1 && (
                      <div>
                        <a href={reviewingSubmission.photo_url_1} target="_blank" rel="noreferrer">
                          <img src={reviewingSubmission.photo_url_1} alt="Photo 1" className="w-full h-48 object-cover rounded-lg border hover:opacity-90" />
                        </a>
                        <p className="text-xs text-center text-slate-500 mt-1">Photo 1 (click to enlarge)</p>
                      </div>
                    )}
                    {reviewingSubmission.photo_url_2 && (
                      <div>
                        <a href={reviewingSubmission.photo_url_2} target="_blank" rel="noreferrer">
                          <img src={reviewingSubmission.photo_url_2} alt="Photo 2" className="w-full h-48 object-cover rounded-lg border hover:opacity-90" />
                        </a>
                        <p className="text-xs text-center text-slate-500 mt-1">Photo 2 (click to enlarge)</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {reviewingSubmission.document_url && (
                <div>
                  <Label className="mb-2 block">Document</Label>
                  <a href={reviewingSubmission.document_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="text-sm text-blue-700">{reviewingSubmission.document_name || 'View Document'}</span>
                    <Download className="w-4 h-4 text-blue-500 ml-auto" />
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {reviewingSubmission.certificate_number && (
                  <div><Label className="text-xs">Certificate Number</Label><p className="font-medium">{reviewingSubmission.certificate_number}</p></div>
                )}
                {reviewingSubmission.issue_date && (
                  <div><Label className="text-xs">Issue Date</Label><p className="font-medium">{format(parseISO(reviewingSubmission.issue_date), 'MMM d, yyyy')}</p></div>
                )}
                {reviewingSubmission.expiration_date && (
                  <div><Label className="text-xs">Expiration Date</Label><p className="font-medium">{format(parseISO(reviewingSubmission.expiration_date), 'MMM d, yyyy')}</p></div>
                )}
              </div>

              {reviewingSubmission.officer_notes && (
                <div><Label className="text-xs">Officer Notes</Label><p className="text-sm bg-slate-50 p-2 rounded mt-1">{reviewingSubmission.officer_notes}</p></div>
              )}

              <div className="border-t pt-4 space-y-4">
                {/* Approval Details — set by admin when approving */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Approval Details (fill in when approving)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Issue / Completion Date</Label>
                      <Input type="date" value={approvalDetails.issue_date} onChange={e => setApprovalDetails(p => ({ ...p, issue_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Expiration Date</Label>
                      <Input type="date" value={approvalDetails.expiration_date} onChange={e => setApprovalDetails(p => ({ ...p, expiration_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Certificate / Card #</Label>
                      <Input value={approvalDetails.certificate_number} onChange={e => setApprovalDetails(p => ({ ...p, certificate_number: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Renewal Due Date</Label>
                      <Input type="date" value={approvalDetails.renewal_due_date} onChange={e => setApprovalDetails(p => ({ ...p, renewal_due_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Renewal Training Course <span className="text-slate-400 font-normal">(training officer must take at renewal)</span></Label>
                    <Select value={approvalDetails.renewal_requirement_id || ""} onValueChange={v => setApprovalDetails(p => ({ ...p, renewal_requirement_id: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select renewal training..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {requirements.filter(r => r.active).map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.training_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {approvalDetails.renewal_due_date && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Officer will receive a 90-day renewal reminder on {format(new Date(new Date(approvalDetails.renewal_due_date).getTime() - 90*24*60*60*1000), 'MMM d, yyyy')}.</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Internal Admin Notes (not visible to officer)</Label>
                  <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} placeholder="Optional internal notes..." />
                </div>
                <div className="space-y-2">
                  <Label>Rejection Reason (required if rejecting)</Label>
                  <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={2} placeholder="Explain why this submission is being rejected..." />
                </div>
                <div className="flex gap-3">
                  <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={!rejectionReason || reviewMutation.isPending} onClick={() => reviewMutation.mutate({ submission: reviewingSubmission, decision: 'rejected' })}>
                    <XCircle className="w-4 h-4 mr-2" />Reject
                  </Button>
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ submission: reviewingSubmission, decision: 'approved' })}>
                    <CheckCircle className="w-4 h-4 mr-2" />Approve
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminTrainingCompliance(props) {
  if (!props.embedded) return <Navigate to="/TrainerCenter?section=compliance" replace />;
  return <AdminTrainingComplianceContent {...props} />;
}