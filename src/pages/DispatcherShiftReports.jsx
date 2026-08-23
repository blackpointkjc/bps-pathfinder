import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Plus, ArrowLeft, Printer, Edit, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import CallLinkCombobox from '@/components/reports/CallLinkCombobox';
import { listAllDispatchCallsForLinking, callDisplayNumber } from '@/lib/reportCallLinking';
import { cleanIncident } from '@/utils/callUtils';
import { listDirectoryUsers } from '@/lib/appDirectory';
import DispatchLogEntry from '@/components/dispatch/DispatchLogEntry';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { formatEasternDateTime } from '@/lib/easternTime';

const emptyForm = () => ({
  shift_date: format(new Date(), 'yyyy-MM-dd'),
  shift_start: '',
  shift_end: '',
  summary: '',
  dispatch_log: [],
});

export default function DispatcherShiftReports({ embedded = false }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm());

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const isAdmin = user?.role === 'admin';
  const isDispatcher =
    user?.role === 'dispatch' ||
    (user?.additional_roles || []).some((r) => String(r).toLowerCase() === 'dispatch') ||
    !!user?.dispatch_role ||
    isAdmin;

  const { data: calls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['allDispatchCallsForLinking'],
    queryFn: listAllDispatchCallsForLinking,
  });
  const { data: users = [] } = useQuery({ queryKey: ['directoryUsers'], queryFn: listDirectoryUsers });
  const { data: units = [] } = useQuery({ queryKey: ['unitsList'], queryFn: () => base44.entities.Unit.list(undefined, 500) });

  const { data: reports = [] } = useQuery({
    queryKey: ['dispatcherShiftReports', user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.DispatcherShiftReport.list('-created_date', 500);
      return base44.entities.DispatcherShiftReport.filter({ dispatcher_email: user.email }, '-created_date', 500);
    },
    enabled: !!user,
  });

  const resolveUnitLabel = (unitId) => {
    const unit = units.find((u) => u.id === unitId || u.user_id === unitId || String(u.unit_id) === String(unitId));
    if (unit) return unit.label || `UNIT-${unit.unit_number}` || unitId;
    const u = users.find((x) => x.id === unitId);
    if (u) return u.full_name || u.email;
    return unitId;
  };

  const handleAttachCall = async (callId) => {
    const call = calls.find((c) => c.id === callId);
    if (!call) return;
    if (formData.dispatch_log.some((e) => e.call_id === callId)) {
      toast.error('That call is already in the log.');
      return;
    }
    let assignedUnits = [];
    try {
      const assignments = await base44.entities.CallAssignment.filter({ call_id: callId }, '-assigned_at', 50);
      assignedUnits = (assignments || []).map((a) => ({
        unit_id: a.unit_id,
        label: resolveUnitLabel(a.unit_id),
        role: a.role || '',
        status: a.status || '',
        assigned_at: a.assigned_at || '',
      }));
    } catch {
      assignedUnits = [];
    }
    if (!assignedUnits.length && Array.isArray(call.assigned_units) && call.assigned_units.length) {
      assignedUnits = call.assigned_units.map((uid) => ({
        unit_id: uid,
        label: resolveUnitLabel(uid),
        role: '',
        status: '',
        assigned_at: '',
      }));
    }
    setFormData((prev) => ({
      ...prev,
      dispatch_log: [
        ...prev.dispatch_log,
        {
          call_id: callId,
          call_number: callDisplayNumber(call),
          incident_type: cleanIncident(call),
          location: call.location || '',
          time_received: call.time_received || '',
          call_status: call.status || '',
          assigned_units: assignedUnits,
          notes: '',
        },
      ],
    }));
    toast.success('Call added to dispatch log.');
  };

  const updateEntryNotes = (index, notes) =>
    setFormData((prev) => ({
      ...prev,
      dispatch_log: prev.dispatch_log.map((e, i) => (i === index ? { ...e, notes } : e)),
    }));

  const removeEntry = (index) =>
    setFormData((prev) => ({ ...prev, dispatch_log: prev.dispatch_log.filter((_, i) => i !== index) }));

  const saveMutation = useMutation({
    mutationFn: async ({ data, isDraft }) => {
      const payload = {
        dispatcher_email: user?.email || '',
        dispatcher_name: user?.full_name || user?.email || '',
        shift_date: data.shift_date,
        shift_start: data.shift_start,
        shift_end: data.shift_end,
        summary: data.summary,
        dispatch_log: data.dispatch_log,
        status: isDraft ? 'draft' : 'submitted',
        was_rejected: false,
        admin_notes: null,
      };
      if (editing) {
        return base44.entities.DispatcherShiftReport.update(editing.id, { ...payload, status: isDraft ? 'draft' : 'submitted' });
      }
      return base44.entities.DispatcherShiftReport.create(payload);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['dispatcherShiftReports'] });
      setSaving(false);
      toast.success(vars.isDraft ? 'Draft saved.' : 'Dispatcher shift log submitted.');
      setShowForm(false);
      setEditing(null);
      setFormData(emptyForm());
    },
    onError: (err) => {
      setSaving(false);
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save dispatch log.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.shift_date) {
      toast.error('Please select a shift date.');
      return;
    }
    setSaving(true);
    saveMutation.mutate({ data: formData, isDraft: false });
  };

  const handleDraft = () => {
    if (!formData.shift_date) {
      toast.error('Please select a shift date before saving as draft.');
      return;
    }
    setSaving(true);
    saveMutation.mutate({ data: formData, isDraft: true });
  };

  const startEdit = (report) => {
    if (report.status === 'approved') {
      toast.error('Approved logs cannot be edited.');
      return;
    }
    setEditing(report);
    setFormData({
      shift_date: report.shift_date || format(new Date(), 'yyyy-MM-dd'),
      shift_start: report.shift_start || '',
      shift_end: report.shift_end || '',
      summary: report.summary || '',
      dispatch_log: Array.isArray(report.dispatch_log) ? report.dispatch_log : [],
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditing(null);
    setFormData(emptyForm());
    setShowForm(true);
  };

  const printLog = (report) => {
    const w = window.open('', '', 'width=850,height=1100');
    const rows = (report.dispatch_log || []).map((e, i) => {
      const units = (e.assigned_units || []).map((u) => `${u.label || u.unit_id}${u.role ? ` (${u.role})` : ''}`).join(', ') || 'None';
      return `<tr><td style="padding:6px;border:1px solid #cbd5e1">${e.call_number || ''}</td>
        <td style="padding:6px;border:1px solid #cbd5e1">${e.incident_type || ''}</td>
        <td style="padding:6px;border:1px solid #cbd5e1">${e.location || ''}</td>
        <td style="padding:6px;border:1px solid #cbd5e1">${e.time_received ? formatEasternDateTime(e.time_received) : ''}</td>
        <td style="padding:6px;border:1px solid #cbd5e1">${units}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;white-space:pre-wrap">${e.notes || ''}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Dispatcher Shift Log</title>
      <style>@page{size:8.5in 11in;margin:.4in}body{font-family:'Segoe UI',Arial,sans-serif;font-size:9pt;color:#0f172a}
      h1{font-size:14pt;margin:0}h2{font-size:10pt;margin:14px 0 4px;border-bottom:2px solid #1e40af;padding-bottom:2px}
      table{width:100%;border-collapse:collapse;font-size:7.5pt}th{background:#1e40af;color:#fff;padding:6px;text-align:left}
      .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;font-size:8pt;color:#334155}
      .foot{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:6px;font-size:7pt;color:#475569}</style></head>
      <body><h1>BPS Pathfinder — Dispatcher Shift Log</h1>
      <div class="meta"><span><b>Dispatcher:</b> ${report.dispatcher_name || ''}</span>
      <span><b>Shift Date:</b> ${report.shift_date || ''}</span>
      <span><b>Hours:</b> ${report.shift_start || ''} – ${report.shift_end || ''}</span>
      <span><b>Status:</b> ${report.status || ''}</span></div>
      ${report.summary ? `<h2>Shift Summary</h2><p style="white-space:pre-wrap">${report.summary}</p>` : ''}
      <h2>Dispatch Log (${(report.dispatch_log || []).length} calls)</h2>
      <table><thead><tr><th>CAD #</th><th>Incident</th><th>Location</th><th>Received</th><th>Assigned / Dispatched</th><th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="padding:8px;text-align:center">No calls logged</td></tr>'}</tbody></table>
      <div class="foot">DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection — Confidential Document — For Official Use Only</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body></html>`);
    w.document.close();
    w.focus();
  };

  if (!isDispatcher) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md border-slate-700 bg-[#0d1825]">
          <CardContent className="p-6 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-100">Dispatcher access required</h2>
            <p className="mt-2 text-sm text-slate-400">The dispatcher shift log is available to dispatch-role users and administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const draftReports = reports.filter((r) => r.status === 'draft');
  const activeReports = reports.filter((r) => r.status !== 'draft');

  return (
    <div className={`min-h-full ${embedded ? '' : 'p-4 md:p-8'}`}>
      <div className="mx-auto max-w-5xl space-y-6">
        {!embedded && (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-slate-300 hover:text-white">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Dispatcher Shift Log</h1>
                <p className="text-sm text-slate-400">Log the calls you dispatched, who you assigned, and shift notes.</p>
              </div>
            </div>
            <Button onClick={startNew} className="w-full md:w-auto">
              <Plus className="mr-2 h-4 w-4" /> New Shift Log
            </Button>
          </div>
        )}

        {showForm ? (
          <Card className="border-slate-700 bg-[#0b1420]">
            <CardHeader className="bg-[#0d1825]">
              <CardTitle className="flex items-center gap-2 text-slate-100">
                {editing ? <Edit className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                {editing ? 'Edit Dispatcher Shift Log' : 'New Dispatcher Shift Log'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Shift Date *</Label>
                    <Input type="date" value={formData.shift_date} onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Shift Start</Label>
                    <Input type="time" value={formData.shift_start} onChange={(e) => setFormData({ ...formData, shift_start: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Shift End</Label>
                    <Input type="time" value={formData.shift_end} onChange={(e) => setFormData({ ...formData, shift_end: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Shift Summary</Label>
                  <Textarea rows={3} placeholder="Overall shift narrative, notable events, radio traffic, relief handoff…" value={formData.summary} onChange={(e) => setFormData({ ...formData, summary: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Add a Call to the Log</Label>
                  <CallLinkCombobox calls={calls} onSelect={handleAttachCall} isLoading={callsLoading} placeholder="Search CAD number, incident, or location to add a call…" />
                  <p className="text-xs text-slate-500">Search active or historical calls by any part of the CAD number or name. Selecting a call snapshots its assigned units.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Dispatch Log ({formData.dispatch_log.length} calls)</Label>
                  </div>
                  {formData.dispatch_log.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-[#0d1825] p-6 text-center text-sm text-slate-500">
                      No calls added yet. Use the search above to attach calls you dispatched this shift.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {formData.dispatch_log.map((entry, i) => (
                        <DispatchLogEntry key={entry.call_id || i} entry={entry} index={i} onNotesChange={updateEntryNotes} onRemove={removeEntry} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={handleDraft} disabled={saving || saveMutation.isPending} className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800">
                    {saving && saveMutation.isPending ? 'Saving…' : 'Save Draft'}
                  </Button>
                  <Button type="submit" disabled={saving || saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                    {saving && saveMutation.isPending ? 'Submitting…' : 'Submit Shift Log'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active" className="text-xs sm:text-sm">
                <FileText className="mr-2 h-4 w-4" /> Submitted ({activeReports.length})
              </TabsTrigger>
              <TabsTrigger value="drafts" className="text-xs sm:text-sm">
                <ClipboardList className="mr-2 h-4 w-4" /> Drafts ({draftReports.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <Card className="border-slate-700 bg-[#0b1420]">
                <CardHeader><CardTitle className="text-slate-100">Submitted Shift Logs</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activeReports.length === 0 && <p className="py-8 text-center text-slate-500">No submitted logs.</p>}
                    {activeReports.map((r) => (
                      <div key={r.id} className="rounded-lg border border-slate-700 bg-[#0d1825] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100">{r.shift_date ? format(new Date(r.shift_date), 'MMM d, yyyy') : '—'}</span>
                              <Badge variant="outline" className="border-slate-600 text-slate-300">{(r.dispatch_log || []).length} calls</Badge>
                              <StatusBadge status={r.status} />
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {r.dispatcher_name || 'Unknown'} · {r.shift_start || '—'} to {r.shift_end || '—'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {r.status !== 'approved' && (
                              <Button size="sm" variant="outline" onClick={() => startEdit(r)} className="border-slate-600 text-slate-200 hover:bg-slate-800">
                                <Edit className="mr-1 h-4 w-4" /> Edit
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => printLog(r)} className="border-slate-600 text-slate-200 hover:bg-slate-800">
                              <Printer className="mr-1 h-4 w-4" /> Print
                            </Button>
                          </div>
                        </div>
                        {r.summary && <p className="mt-3 line-clamp-2 text-sm text-slate-400">{r.summary}</p>}
                        {r.status === 'rejected' && r.admin_notes && (
                          <div className="mt-3 rounded-lg border border-red-700/60 bg-red-950/30 p-3">
                            <div className="text-xs font-bold uppercase tracking-wider text-red-300">Admin Feedback — needs revision</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-red-100">{r.admin_notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="drafts">
              <Card className="border-slate-700 bg-[#0b1420]">
                <CardHeader><CardTitle className="text-slate-100">Draft Shift Logs</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {draftReports.length === 0 && <p className="py-8 text-center text-slate-500">No draft logs.</p>}
                    {draftReports.map((r) => (
                      <div key={r.id} className="rounded-lg border border-amber-600/50 bg-amber-950/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <Badge className="mb-2 bg-amber-600 text-white">DRAFT</Badge>
                            <div className="font-bold text-slate-100">{r.shift_date ? format(new Date(r.shift_date), 'MMM d, yyyy') : '—'}</div>
                            <div className="text-xs text-slate-400">{(r.dispatch_log || []).length} calls attached</div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => startEdit(r)} className="bg-amber-600 hover:bg-amber-700">
                              <Edit className="mr-1 h-4 w-4" /> Continue
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}