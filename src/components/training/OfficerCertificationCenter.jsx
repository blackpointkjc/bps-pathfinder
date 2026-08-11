import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { Search, Send, Save, ShieldCheck, UserRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { listTrainingUsers, invalidateTrainingUsers } from '@/lib/trainingDirectory';
import { trainingCreate } from '@/lib/trainingRecordsApi';
import OfficerCertificationsTab from '@/components/OfficerCertificationsTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';

function certStatus(cert) {
  if (!cert?.expiration_date) return cert?.status === 'pending' ? 'pending' : 'active';
  const exp = new Date(`${cert.expiration_date}T12:00:00`);
  const today = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 90);
  if (exp < today) return 'expired';
  if (exp <= soon) return 'expiring';
  return cert?.status === 'pending' ? 'pending' : 'active';
}

export default function OfficerCertificationCenter() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editFormData, setEditFormData] = useState({ officer_certifications: [] });
  const [pushOpen, setPushOpen] = useState(false);
  const [pushTrainingId, setPushTrainingId] = useState('');
  const [pushDueDate, setPushDueDate] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['trainingUsers'],
    queryFn: () => listTrainingUsers(true),
    staleTime: 15000,
  });
  const { data: requirements = [] } = useQuery({
    queryKey: ['trainingRequirements'],
    queryFn: () => base44.entities.TrainingRequirement.list('-created_date'),
    staleTime: 30000,
  });
  const { data: modules = [] } = useQuery({
    queryKey: ['trainingModules'],
    queryFn: () => base44.entities.TrainingModule.list('-created_date'),
    staleTime: 30000,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['allTrainingAssignments'],
    queryFn: () => base44.entities.TrainingAssignment.list('-assigned_date'),
    staleTime: 15000,
  });
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const officerUsers = useMemo(
    () => users.filter(u => hasOfficerAdditionalRole(u) && !u.termination_date && String(u.status || '').toLowerCase() !== 'terminated'),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return officerUsers.filter(u => {
      if (!q) return true;
      return [u.first_name, u.last_name, u.email, u.rank, u.unit_number, u.division]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [officerUsers, search]);

  const selectedUser = officerUsers.find(u => u.id === selectedId) || null;

  const openOfficer = (officer) => {
    setSelectedId(officer.id);
    setEditFormData({ officer_certifications: Array.isArray(officer.officer_certifications) ? officer.officer_certifications.map(c => ({ ...c })) : [] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('Select an officer first.');
      const result = await base44.functions.invoke('manageOfficerCertifications', {
        user_id: selectedUser.id,
        officer_certifications: editFormData.officer_certifications || [],
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.user;
    },
    onSuccess: async (updated) => {
      invalidateTrainingUsers();
      queryClient.invalidateQueries({ queryKey: ['trainingUsers'] });
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });
      queryClient.invalidateQueries({ queryKey: ['trainingCompliance'] });
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      if (updated) setEditFormData({ officer_certifications: updated.officer_certifications || [] });
      toast.success('Certification record saved and synced to compliance');
    },
    onError: (error) => toast.error(error.message),
  });

  const trainingOptions = useMemo(() => {
    const reqs = requirements.filter(r => r.active !== false).map(r => ({
      key: `req:${r.id}`,
      name: r.training_name,
      category: r.category || 'certification',
      requirement_id: r.id,
      mandatory: r.is_mandatory !== false,
      dueDays: 30,
      renewal_period_months: r.renewal_period_months || 0,
      description: r.description || '',
      requires_photos: r.requires_photos !== false,
      requires_expiration_date: !!r.requires_expiration_date,
      requires_certificate_number: !!r.requires_certificate_number,
      required_proof_type: r.required_proof_type || '',
    }));
    const existing = new Set(reqs.map(r => r.name.toLowerCase()));
    const mods = modules.filter(m => m.active !== false && !existing.has(String(m.title || '').toLowerCase())).map(m => ({
      key: `mod:${m.id}`,
      name: m.title,
      category: m.category || m.training_category || 'other',
      module_id: m.id,
      mandatory: !!m.required,
      dueDays: Number(m.due_after_days || 30),
      renewal_period_months: m.renewal_period_months || 0,
      description: m.description || '',
      requires_photos: false,
      requires_expiration_date: !!m.requires_expiration_tracking,
      requires_certificate_number: false,
      required_proof_type: '',
    }));
    return [...reqs, ...mods];
  }, [requirements, modules]);

  const selectedTraining = trainingOptions.find(t => t.key === pushTrainingId);

  const pushMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !selectedTraining) throw new Error('Select a training item.');
      const duplicate = assignments.find(a => a.officer_email === selectedUser.email && String(a.training_name).toLowerCase() === String(selectedTraining.name).toLowerCase() && !['approved','rejected'].includes(a.status));
      if (duplicate) throw new Error('This training is already active for this officer.');
      const due = pushDueDate || format(addDays(new Date(), selectedTraining.dueDays || 30), 'yyyy-MM-dd');
      const fullName = [selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || selectedUser.email;
      const assignment = await trainingCreate('TrainingAssignment', {
        officer_email: selectedUser.email,
        officer_name: fullName,
        training_name: selectedTraining.name,
        category: selectedTraining.category,
        requirement_id: selectedTraining.requirement_id || '',
        description: selectedTraining.description,
        assigned_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: due,
        status: 'assigned',
        is_mandatory: selectedTraining.mandatory,
        priority: selectedTraining.mandatory ? 'high' : 'normal',
        assigned_by: currentUser?.email || '',
        renewal_period_months: selectedTraining.renewal_period_months,
        requires_photos: selectedTraining.requires_photos,
        requires_expiration_date: selectedTraining.requires_expiration_date,
        requires_certificate_number: selectedTraining.requires_certificate_number,
        required_proof_type: selectedTraining.required_proof_type,
      });
      await base44.entities.Notification.create({
        recipient_email: selectedUser.email,
        type: 'training_assigned',
        priority: selectedTraining.mandatory ? 'high' : 'normal',
        title: `Training Assigned: ${selectedTraining.name}`,
        message: `You have been assigned ${selectedTraining.name}. Due ${format(parseISO(due), 'MMM d, yyyy')}.`,
        is_read: false,
      }).catch(() => null);
      return assignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTrainingAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['myTrainingAssignments'] });
      setPushOpen(false);
      setPushTrainingId('');
      setPushDueDate('');
      toast.success('Training pushed to officer');
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading certification records…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
        <div className="flex items-center gap-2 font-bold text-cyan-200"><ShieldCheck className="h-4 w-4" /> Training-only personnel view</div>
        <p className="mt-1 text-xs text-slate-400">Only name, rank/unit, division, training identifiers and certification records are available here. HR, emergency-contact, pay, SSN, address and other personnel fields are not exposed.</p>
      </div>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-w-0 border-slate-800 bg-slate-900/70">
          <CardContent className="p-3">
            <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search officers…" /></div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filteredUsers.map(officer => {
                const certs = officer.officer_certifications || [];
                const expired = certs.filter(c => certStatus(c) === 'expired').length;
                const expiring = certs.filter(c => certStatus(c) === 'expiring').length;
                return (
                  <button key={officer.id} type="button" onClick={() => openOfficer(officer)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === officer.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate font-bold text-white">{[officer.rank, officer.last_name].filter(Boolean).join(' ') || [officer.first_name, officer.last_name].filter(Boolean).join(' ') || officer.email}</div><div className="mt-0.5 truncate text-xs text-slate-500">{[officer.unit_number && `Unit ${officer.unit_number}`, officer.division].filter(Boolean).join(' · ') || officer.email}</div></div>
                      <Badge variant="outline" className="shrink-0 border-slate-700 text-slate-300">{certs.length}</Badge>
                    </div>
                    {(expired > 0 || expiring > 0) && <div className="mt-2 flex gap-2 text-[10px]">{expired > 0 && <span className="font-bold text-red-400">{expired} expired</span>}{expiring > 0 && <span className="font-bold text-amber-400">{expiring} expiring</span>}</div>}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-slate-800 bg-slate-900/70">
          <CardContent className="p-4 md:p-5">
            {!selectedUser ? (
              <div className="flex min-h-[500px] flex-col items-center justify-center text-center text-slate-500"><UserRound className="mb-3 h-12 w-12 opacity-40" /><p className="font-semibold text-slate-300">Select an officer to view training records</p><p className="mt-1 max-w-md text-xs">Certification records and training assignments are managed here without exposing the officer's HR record.</p></div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h2 className="truncate text-xl font-black text-white">{[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || selectedUser.email}</h2><p className="text-xs text-slate-400">{[selectedUser.rank, selectedUser.unit_number && `Unit ${selectedUser.unit_number}`, selectedUser.division].filter(Boolean).join(' · ')}</p>{selectedUser.dcjs_number && <p className="mt-1 text-xs text-slate-500">DCJS #{selectedUser.dcjs_number}</p>}</div>
                  <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPushOpen(true)}><Send className="mr-2 h-4 w-4" />Push Training</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? 'Saving…' : 'Save Certifications'}</Button></div>
                </div>
                <OfficerCertificationsTab editFormData={editFormData} setEditFormData={setEditFormData} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Push Training to Officer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><span className="font-bold">Officer:</span> {[selectedUser?.first_name, selectedUser?.last_name].filter(Boolean).join(' ') || selectedUser?.email}</div>
            <div className="space-y-2"><Label>Training *</Label><Select value={pushTrainingId} onValueChange={value => { setPushTrainingId(value); const option = trainingOptions.find(t => t.key === value); if (option) setPushDueDate(format(addDays(new Date(), option.dueDays || 30), 'yyyy-MM-dd')); }}><SelectTrigger><SelectValue placeholder="Select training…" /></SelectTrigger><SelectContent>{trainingOptions.map(option => <SelectItem key={option.key} value={option.key}>{option.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={pushDueDate} onChange={e => setPushDueDate(e.target.value)} /></div>
            {selectedTraining && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><div className="font-bold">{selectedTraining.name}</div><div className="mt-1">{selectedTraining.mandatory ? 'Mandatory' : 'Optional'} · {selectedTraining.category?.replace(/_/g, ' ')}</div></div>}
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setPushOpen(false)}>Cancel</Button><Button className="flex-1" disabled={!selectedTraining || pushMutation.isPending} onClick={() => pushMutation.mutate()}><Send className="mr-2 h-4 w-4" />{pushMutation.isPending ? 'Pushing…' : 'Push Training'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
