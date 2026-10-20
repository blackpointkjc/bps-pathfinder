import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { previewDisplayName } from '@/utils/previewIdentity';
import { comparePersonnel } from '@/utils/rankPolicy';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserX, Clock, AlertTriangle, Plus, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { getCurrentDirectoryUser, listDirectoryLocations, listSupervisorDirectoryOfficers, listDirectoryUsers } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export default function SupervisorCallOuts() {
  const [callSearch,setCallSearch]=useState('');
  const [callType,setCallType]=useState('all');
  const [callStart,setCallStart]=useState('');
  const [callEnd,setCallEnd]=useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    officer_email: "",
    call_out_type: "called_out",
    call_out_date: format(new Date(), 'yyyy-MM-dd'),
    call_out_time: format(new Date(), 'HH:mm'),
    reason: "",
    location: "",
    original_location: "",
    shift_id: "",
    destination_location: "",
    destination_start_time: "",
    destination_end_time: "",
    exclude_original_incident_metric: false,
  });

  const calloutName = (email, saved) => {
    const person = allUsers.find(row => [row.email,...(row.email_aliases || [])].some(value => String(value || '').toLowerCase() === String(email || '').toLowerCase()));
    return person ? previewDisplayName(person) : 'Officer ' + (String(saved || '').trim().split(/\s+/).pop() || 'unavailable');
  };
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'supervisorCallOuts'],
    queryFn: async () => { const [all, scoped] = await Promise.all([listDirectoryUsers('last_name', 1500).catch(() => []), listSupervisorDirectoryOfficers('last_name', 1000).catch(() => [])]); const unique = new Map(); for (const row of [...all, ...scoped]) if (isOperationalOfficer(row)) unique.set(String(row.email).toLowerCase(), row); return [...unique.values()].sort(comparePersonnel); },
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'supervisorCallOuts'],
    queryFn: async () => {
      try {
        const direct = await base44.entities.Location.list('site_name', 1000);
        if (Array.isArray(direct) && direct.length) return direct.filter(loc => loc.active !== false);
      } catch (error) {
        console.warn('Direct location list failed:', error?.message);
      }
      const fallback = await listDirectoryLocations('site_name', 1000);
      return (fallback || []).filter(loc => loc.active !== false);
    },
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: scheduledShifts = [], isLoading: shiftsLoading, error: shiftsError } = useQuery({
    queryKey: ['calloutScheduledShifts', formData.officer_email, formData.call_out_date],
    queryFn: async () => { const rows = await base44.entities.Schedule.filter({officer_email:formData.officer_email,shift_date:formData.call_out_date},'start_time',250); return (rows || []).filter(shift => String(shift.officer_email || '').trim().toLowerCase() === String(formData.officer_email || '').trim().toLowerCase() && String(shift.shift_date || '').slice(0,10) === formData.call_out_date); },
    enabled: Boolean(formData.officer_email && formData.call_out_date),
    initialData: [],
  });
  const availableShifts = scheduledShifts.filter(shift => shift.archived !== true && !shift.is_open);
  const selectedShift = availableShifts.find(shift => shift.id === formData.shift_id);

  const { data: callOuts=[],error:callOutError,isPending:callOutLoading,refetch:refreshCallOuts } = useQuery({
    queryKey: ['callOuts'],
    queryFn: () => base44.entities.CallOut.list('-call_out_date'),
    initialData: [],
  });

  const createCallOutMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('recordSupervisorCallOut', data);
      const result = response?.data || response || {};
      if (!result.success) throw new Error(result.error || 'Call-out not saved');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callOuts'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['companyAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['officerAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['calloutScheduledShifts'] });
      queryClient.invalidateQueries({ queryKey: ['roleWorkQueue'] });
      queryClient.invalidateQueries({ queryKey: ['hr'] });
      setShowDialog(false);
      resetForm();
      alert('Call-out recorded on the scheduled shift and added to the officer performance record.');
    },
    onError: (error) => alert(error?.response?.data?.error || error?.message || 'Unable to record call-out'),
  });

  const resetForm = () => {
    setFormData({
      officer_email: "",
      call_out_type: "called_out",
      call_out_date: format(new Date(), 'yyyy-MM-dd'),
      call_out_time: format(new Date(), 'HH:mm'),
      reason: "",
      location: "",
      original_location: "",
      shift_id: "",
      destination_location: "",
    destination_start_time: "",
    destination_end_time: "",
      exclude_original_incident_metric: false,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.call_out_type === 'reassigned' && (!formData.original_location || !formData.destination_location || !formData.destination_start_time || !formData.destination_end_time)) {
      alert('Select both sites and the destination shift start/end times.');
      return;
    }
    if (!selectedShift) { alert('Select an actual scheduled shift for this officer and date.'); return; }
    createCallOutMutation.mutate({ ...formData, location: selectedShift.location });
  };

  const isSupervisorOrAdmin = hasSupervisorAccess(user);

  if (!isSupervisorOrAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
      </div>
    );
  }

  const officers = allUsers.filter(isOperationalOfficer);

  const recentCallOuts = callOuts.filter(row=>(callType==='all'||row.call_out_type===callType)&&(!callStart||row.call_out_date>=callStart)&&(!callEnd||row.call_out_date<=callEnd)&&[calloutName(row.officer_email,row.officer_name),row.location,row.original_location,row.destination_location,row.reason].join(' ').toLowerCase().includes(callSearch.toLowerCase()));

  return (
    <div className="p-4 md:p-6 min-h-full bg-[#080f1b] text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        <WorkspaceHeader eyebrow="Command / Attendance" title="Call-Out Management" description="Record missed shifts, early dismissals and reassignments against the officer’s scheduled post." metrics={[
          {label:'Records shown',value:recentCallOuts.length},{label:'Called out',value:recentCallOuts.filter(c=>c.call_out_type==='called_out').length},{label:'Reassignments',value:recentCallOuts.filter(c=>c.call_out_type==='reassigned').length}
        ]}><Button variant="outline" onClick={()=>refreshCallOuts()}>Refresh</Button><Button onClick={()=>setShowDialog(true)} className="bg-cyan-700 hover:bg-cyan-600"><Plus className="mr-2 h-4 w-4"/>Record attendance change</Button></WorkspaceHeader>
        <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-slate-400">Search records<Input aria-label="Search call-outs" value={callSearch} onChange={e=>setCallSearch(e.target.value)} placeholder="Officer, unit, property or reason" className="mt-1 bg-slate-950"/></label>
          <label className="text-xs text-slate-400">Attendance event<select aria-label="Call-out event type" value={callType} onChange={e=>setCallType(e.target.value)} className="mt-1 h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-sm"><option value="all">All events</option><option value="called_out">Called out</option><option value="sent_home">Sent home / early dismissal</option><option value="reassigned">Reassignment</option></select></label>
          <label className="text-xs text-slate-400">From<Input type="date" value={callStart} onChange={e=>setCallStart(e.target.value)} className="mt-1 bg-slate-950"/></label>
          <label className="text-xs text-slate-400">Through<Input type="date" min={callStart} value={callEnd} onChange={e=>setCallEnd(e.target.value)} className="mt-1 bg-slate-950"/></label>
        </div>
        {callOutError&&<p role="alert" className="rounded-xl border border-red-700 bg-red-950 p-4 text-red-200">Attendance records could not load: {callOutError.message}</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
          <table className="w-full text-left text-sm"><thead className="bg-slate-950 text-xs uppercase text-slate-400"><tr><th className="p-4">Officer / Date</th><th className="p-4">Event</th><th className="p-4">Shift / Property</th><th className="p-4">Reason / Recorded by</th></tr></thead><tbody className="divide-y divide-slate-700">{recentCallOuts.map(row=><tr key={row.id} className="align-top hover:bg-slate-800/60">
            <td className="p-4"><strong className="block text-white">{calloutName(row.officer_email,row.officer_name)}</strong><span className="mt-1 block text-xs text-slate-400">{String(row.call_out_date||'').slice(0,10)} · {row.call_out_time}</span></td>
            <td className="p-4"><span className={'inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs '+(row.call_out_type==='called_out'?'bg-red-950 text-red-200':row.call_out_type==='reassigned'?'bg-cyan-950 text-cyan-200':'bg-amber-950 text-amber-200')}>{row.call_out_type==='called_out'?'Called out':row.call_out_type==='reassigned'?'Reassigned':'Early dismissal'}</span>{row.affects_pto&&<p className="mt-2 text-xs text-slate-400">No PTO accrual</p>}</td>
            <td className="p-4 text-slate-300">{row.original_location||row.location||'Not recorded'}{row.destination_location&&<p className="mt-1 text-cyan-200">→ {row.destination_location}</p>}</td>
            <td className="max-w-lg p-4"><p className="text-slate-200">{row.reason||'Not recorded'}</p><p className="mt-2 text-xs text-slate-400">{calloutName(row.supervisor_email,row.supervisor_name)}</p>{row.call_out_type==='reassigned'&&<p className="mt-2 text-xs text-cyan-300">Original-site incident scoring excludes calls after reassignment.</p>}</td>
          </tr>)}</tbody></table>{!recentCallOuts.length&&<p role="status" className="p-10 text-center text-sm text-slate-400">{callOutLoading?'Loading attendance records…':callOutError?'Records unavailable. Retry refresh.':'No attendance changes match these filters.'}</p>}
        </div>

      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Document Call-Out</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Officer *</Label>
              <Select value={formData.officer_email} onValueChange={(value) => setFormData({...formData, officer_email: value, shift_id: ''})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select officer..." />
                </SelectTrigger>
                <SelectContent>
                  {officers.length === 0 ? (
                    <div className="p-2 text-sm text-slate-500">No officers found</div>
                  ) : (
                    officers.map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name} {officer.last_name} - {officer.rank || 'Officer'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={formData.call_out_type} onValueChange={(value) => setFormData({...formData, call_out_type: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="called_out">Called Out (Officer called to say they can't come in)</SelectItem>
                  <SelectItem value="sent_home">Sent Home (Officer was sent home early)</SelectItem>
                  <SelectItem value="reassigned">Reassigned / Called to Another Property</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.call_out_date}
                  onChange={(e) => setFormData({...formData, call_out_date: e.target.value, shift_id: ''})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={formData.call_out_time}
                  onChange={(e) => setFormData({...formData, call_out_time: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2"><Label>Scheduled Shift * (linked to scheduling and performance)</Label><Select value={formData.shift_id} onValueChange={value => setFormData({ ...formData, shift_id: value, location: availableShifts.find(shift => shift.id === value)?.location || '' })}><SelectTrigger><SelectValue placeholder="Select the affected scheduled shift..." /></SelectTrigger><SelectContent>{availableShifts.map(shift => <SelectItem key={shift.id} value={shift.id}>{shift.start_time}–{shift.end_time} · {shift.location} {shift.attendance_status && shift.attendance_status !== 'scheduled' ? `(${shift.attendance_status})` : ''}</SelectItem>)}</SelectContent></Select>{shiftsLoading && <p className="text-xs text-blue-700">Loading officer shifts…</p>}{shiftsError && <p className="text-xs text-red-700">Unable to load shifts: {shiftsError.message}</p>}{formData.officer_email && !shiftsLoading && !shiftsError && !availableShifts.length && <p className="text-xs text-red-700">No matching published shift found for this officer/date. Check the schedule and officer email.</p>}</div>
            {formData.call_out_type === 'reassigned' ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Original Property *</Label>
                  <Select value={formData.original_location} onValueChange={(value) => setFormData({...formData, original_location: value, location: value, exclude_original_incident_metric: true})}>
                    <SelectTrigger><SelectValue placeholder="Select original property..." /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={`origin-${loc.id}`} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination Property / Assignment *</Label>
                  <Select value={formData.destination_location} onValueChange={(value) => setFormData({...formData, destination_location: value})}>
                    <SelectTrigger><SelectValue placeholder="Select destination..." /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={`dest-${loc.id}`} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>New Shift Start *</Label><Input type="time" value={formData.destination_start_time} onChange={event => setFormData(current => ({...current,destination_start_time:event.target.value}))}/></div>
                <div><Label>New Shift End *</Label><Input type="time" value={formData.destination_end_time} onChange={event => setFormData(current => ({...current,destination_end_time:event.target.value}))}/></div>
                <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Incident-report requirements at the original property after this reassignment time will be excluded from the officer's Job Duty metric.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Location (Optional)</Label>
                <Select value={formData.location} onValueChange={(value) => setFormData({...formData, location: value})}>
                  <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => <SelectItem key={loc.id} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                placeholder="Reason for call-out or being sent home..."
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                rows={3}
                required
              />
            </div>

            <div className={`p-4 rounded-lg border ${formData.call_out_type === 'reassigned' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className={`text-sm ${formData.call_out_type === 'reassigned' ? 'text-blue-800' : 'text-amber-800'}`}>
                <strong>Important:</strong> {formData.call_out_type === 'reassigned'
                  ? 'A reassignment does not count as an attendance call-out. Property-call Incident Report requirements at the original location after the reassignment time will be excluded from Job Duty performance.'
                  : 'This records the attendance event against the selected schedule, updates call-out performance calculations, and adds an HR review task. PTO treatment must be handled separately under HR policy.'}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={createCallOutMutation.isPending}>
                Document Call-Out
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}