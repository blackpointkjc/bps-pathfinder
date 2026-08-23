import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Plus, Edit, Power, Search, Printer, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { listDirectoryLocations } from '@/lib/appDirectory';

function generateUID() {
  return 'QR-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
}

export default function AdminQRCheckpoints() {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const [filterSite, setFilterSite] = useState("all");
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    property_site: "",
    active: true,
    effective_date: "",
    daily_activity_report_required: true,
    incident_report_required_for_property_calls: true,
    qr_required: false,
    qr_frequency_minutes: 60,
    qr_window_minutes: 30,
    qr_scans_per_shift: 0,
    require_all_required_checkpoints: true,
    required_checkpoint_ids: [],
    notes: "",
  });
  const [formData, setFormData] = useState({
    checkpoint_name: "",
    location_label: "",
    property_site: "",
    zone_or_building: "",
    description: "",
    is_required: true,
    is_active: true,
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: checkpoints = [], isFetching: checkpointsLoading } = useQuery({
    queryKey: ['qrCheckpoints'],
    queryFn: () => base44.entities.QRCheckpoint.list('-created_date', 1000),
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: dutyRules = [] } = useQuery({
    queryKey: ['jobDutyRules'],
    queryFn: () => base44.entities.JobDutyRule.list('property_site', 1000),
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      try {
        const direct = await base44.entities.Location.list('site_name', 1000);
        if (Array.isArray(direct) && direct.length) return direct.filter(l => l.active !== false);
      } catch (error) {
        console.warn('Direct Location list failed:', error?.message);
      }
      const all = await listDirectoryLocations('site_name');
      return (all || []).filter(l => l.active !== false);
    },
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingItem) {
        return await base44.entities.QRCheckpoint.update(editingItem.id, data);
      } else {
        const uid = generateUID();
        return await base44.entities.QRCheckpoint.create({
          ...data,
          qr_unique_id: uid,
          created_by_admin: user?.email,
          print_count: 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qrCheckpoints'] });
      toast.success(editingItem ? "Checkpoint updated" : "Checkpoint created");
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.QRCheckpoint.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qrCheckpoints'] }),
  });

  const saveRuleMutation = useMutation({
    mutationFn: async (data) => {
      const validSiteCheckpointIds = new Set(checkpoints.filter(cp => cp.property_site === data.property_site && cp.is_active !== false).map(cp => cp.id));
      const payload = { ...data, required_checkpoint_ids: (data.required_checkpoint_ids || []).filter(id => validSiteCheckpointIds.has(id)), updated_by: user?.email || '' };
      return editingRule
        ? base44.entities.JobDutyRule.update(editingRule.id, payload)
        : base44.entities.JobDutyRule.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobDutyRules'] });
      setShowRuleForm(false);
      setEditingRule(null);
      toast.success('Property job duty rules updated');
    },
  });

  const openRule = (site) => {
    const existing = dutyRules.find(rule => rule.property_site === site);
    setEditingRule(existing || null);
    setRuleForm({
      property_site: site,
      active: existing?.active !== false,
      effective_date: existing?.effective_date || '',
      daily_activity_report_required: existing?.daily_activity_report_required !== false,
      incident_report_required_for_property_calls: existing?.incident_report_required_for_property_calls !== false,
      qr_required: existing ? existing.qr_required === true : checkpoints.some(cp => cp.property_site === site && cp.is_active !== false && cp.is_required !== false),
      qr_frequency_minutes: Number(existing?.qr_frequency_minutes || 60),
      qr_window_minutes: Number(existing?.qr_window_minutes || 30),
      qr_scans_per_shift: Number(existing?.qr_scans_per_shift || 0),
      require_all_required_checkpoints: existing?.require_all_required_checkpoints !== false,
      required_checkpoint_ids: (existing?.required_checkpoint_ids || []).filter(id => checkpoints.some(cp => cp.id === id && cp.property_site === site && cp.is_active !== false)),
      notes: existing?.notes || '',
    });
    setShowRuleForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ checkpoint_name: "", location_label: "", property_site: "", zone_or_building: "", description: "", is_required: true, is_active: true });
  };

  const openEdit = (cp) => {
    setEditingItem(cp);
    setFormData({
      checkpoint_name: cp.checkpoint_name,
      location_label: cp.location_label,
      property_site: cp.property_site,
      zone_or_building: cp.zone_or_building || "",
      description: cp.description || "",
      is_required: cp.is_required !== false,
      is_active: cp.is_active !== false,
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.checkpoint_name || !formData.location_label || !formData.property_site) {
      toast.error("Please fill in required fields.");
      return;
    }
    saveMutation.mutate(formData);
  };

  const allSites = (locations || []).map(l => l.site_name);

  const filtered = (checkpoints || []).filter(cp => {
    const matchSearch = !search || cp.checkpoint_name.toLowerCase().includes(search.toLowerCase()) || cp.location_label.toLowerCase().includes(search.toLowerCase());
    const matchSite = filterSite === "all" || cp.property_site === filterSite;
    return matchSearch && matchSite;
  });

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-slate-500">Admin access required.</div>;
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto space-y-6 p-4 md:p-8 text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <QrCode className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">QR Checkpoint Management</h1>
            <p className="text-sm text-slate-400">{checkpoints?.length || 0} checkpoints total • existing checkpoint records are preserved</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={createPageUrl("AdminQRPrintManager")}>
              <Printer className="w-4 h-4 mr-2" /> Print Manager
            </Link>
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> New Checkpoint
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <Input placeholder="Search checkpoints..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {allSites.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-blue-900/60 bg-gradient-to-br from-blue-950 via-slate-950 to-blue-950 text-white shadow-lg">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-cyan-700" />
            <div>
              <p className="font-bold text-white">Property Duty Rules</p>
              <p className="text-xs text-slate-400">Configure report duties and QR requirements for each property using the same rules enforced in Officer and Company Analytics.</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {allSites.map(site => {
              const rule = dutyRules.find(item => item.property_site === site);
              return (
                <button key={site} type="button" onClick={() => openRule(site)} className="rounded-lg border border-blue-800/60 bg-blue-950/55 p-3 text-left transition hover:border-cyan-500 hover:bg-blue-900/70">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{site}</span>
                    <Badge className={rule?.effective_date ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-600'}>{rule?.effective_date ? `Effective ${rule.effective_date}` : rule ? 'Not scoring yet' : 'Not configured'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">DAR: {rule?.daily_activity_report_required === true ? 'Required' : 'Not required'} • Incident: {rule?.incident_report_required_for_property_calls === true ? 'Required' : 'Not required'}</p>
                  <p className="text-xs text-slate-300">QR: {rule ? (rule.qr_required ? `Required every ${rule.qr_frequency_minutes || 60} min • ${rule.required_checkpoint_ids?.length || checkpoints.filter(cp => cp.property_site === site && cp.is_required !== false && cp.is_active !== false).length} checkpoint(s)` : 'Disabled by property rule') : (checkpoints.some(cp => cp.property_site === site && cp.is_required !== false && cp.is_active !== false) ? `Required by existing checkpoint defaults • ${checkpoints.filter(cp => cp.property_site === site && cp.is_required !== false && cp.is_active !== false).length} checkpoint(s)` : 'No QR requirement configured')}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-700 bg-slate-900 text-white shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700 bg-slate-800">
                <tr>
                  <th className="text-center p-3 font-semibold text-slate-200">QR Code</th>
                  <th className="text-left p-3 font-semibold text-slate-200">Checkpoint</th>
                  <th className="text-left p-3 font-semibold text-slate-200 hidden md:table-cell">Location</th>
                  <th className="text-left p-3 font-semibold text-slate-200 hidden lg:table-cell">Site</th>
                  <th className="text-left p-3 font-semibold text-slate-200 hidden lg:table-cell">QR ID</th>
                  <th className="text-center p-3 font-semibold text-slate-200">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-200">Required</th>
                  <th className="text-right p-3 font-semibold text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(cp => (
                  <tr key={cp.id} className="hover:bg-slate-800/80">
                    <td className="p-3 text-center">
                      <button type="button" onClick={() => openEdit(cp)} className="inline-flex rounded-md bg-white p-1.5 shadow" aria-label={`Open ${cp.checkpoint_name} QR code`}>
                        <QRCodeSVG value={cp.qr_unique_id} size={56} />
                      </button>
                    </td>
                    <td className="p-3 font-medium text-white">{cp.checkpoint_name}</td>
                    <td className="p-3 text-slate-300 hidden md:table-cell">{cp.location_label}</td>
                    <td className="p-3 text-slate-300 hidden lg:table-cell">{cp.property_site}</td>
                    <td className="p-3 font-mono text-xs text-slate-400 hidden lg:table-cell">{cp.qr_unique_id}</td>
                    <td className="p-3 text-center">
                      <Badge className={cp.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}>
                        {cp.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={cp.is_required !== false ? 'text-blue-700 border-blue-300' : 'text-slate-500'}>
                        {cp.is_required !== false ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(cp)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cp.is_active !== false ? 'text-amber-600' : 'text-green-600'}
                          onClick={() => toggleMutation.mutate({ id: cp.id, is_active: !(cp.is_active !== false) })}
                        >
                          <Power className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">{checkpointsLoading ? 'Loading QR checkpoints…' : 'No checkpoints found.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRuleForm} onOpenChange={setShowRuleForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto border-slate-700 bg-slate-950 text-white">
          <DialogHeader><DialogTitle>Job Duty Rules — {ruleForm.property_site}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-3">
              <Label className="text-amber-200">Performance Effective Date</Label>
              <Input type="date" value={ruleForm.effective_date} onChange={e => setRuleForm(p => ({...p, effective_date: e.target.value}))} className="mt-2" />
              <p className="mt-2 text-xs text-amber-100/70">Nothing before this date is scored as a missed DAR, incident report, or QR duty. Leave blank while configuring/testing the property rule.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 p-3"><Label>Daily Activity Report required every worked shift</Label><Switch checked={ruleForm.daily_activity_report_required} onCheckedChange={v => setRuleForm(p => ({...p, daily_activity_report_required: v}))} /></div>
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 p-3"><Label>Incident Report required for property calls</Label><Switch checked={ruleForm.incident_report_required_for_property_calls} onCheckedChange={v => setRuleForm(p => ({...p, incident_report_required_for_property_calls: v}))} /></div>
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 p-3 sm:col-span-2"><Label>QR compliance required</Label><Switch checked={ruleForm.qr_required} onCheckedChange={v => setRuleForm(p => ({...p, qr_required: v}))} /></div>
            </div>

            {ruleForm.qr_required && (
              <div className="space-y-4 rounded-xl border border-cyan-900 bg-slate-900 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label>Frequency (minutes)</Label><Input type="number" min="1" value={ruleForm.qr_frequency_minutes} onChange={e => setRuleForm(p => ({...p, qr_frequency_minutes: Number(e.target.value || 60)}))} /></div>
                  <div><Label>Scan window (minutes)</Label><Input type="number" min="1" value={ruleForm.qr_window_minutes} onChange={e => setRuleForm(p => ({...p, qr_window_minutes: Number(e.target.value || 30)}))} /></div>
                  <div><Label>Minimum scans per shift</Label><Input type="number" min="0" value={ruleForm.qr_scans_per_shift} onChange={e => setRuleForm(p => ({...p, qr_scans_per_shift: Number(e.target.value || 0)}))} /></div>
                </div>
                <div>
                  <Label className="mb-2 block">Required QR codes for this property</Label>
                  <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    {checkpoints.filter(cp => cp.property_site === ruleForm.property_site && cp.is_active !== false).length === 0 ? (
                      <p className="text-sm text-slate-500">No active checkpoints exist for this property yet.</p>
                    ) : checkpoints.filter(cp => cp.property_site === ruleForm.property_site && cp.is_active !== false).map(cp => {
                      const checked = ruleForm.required_checkpoint_ids.includes(cp.id);
                      return (
                        <label key={cp.id} className="flex items-center gap-3 text-sm text-slate-200">
                          <input type="checkbox" checked={checked} onChange={e => setRuleForm(p => ({...p, required_checkpoint_ids: e.target.checked ? [...p.required_checkpoint_ids, cp.id] : p.required_checkpoint_ids.filter(id => id !== cp.id)}))} />
                          <span><strong>{cp.checkpoint_name}</strong> — {cp.location_label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">If no specific QR codes are selected, all checkpoints marked Required for this property are used.</p>
                </div>
              </div>
            )}

            <div><Label>Rule Notes</Label><Input value={ruleForm.notes} onChange={e => setRuleForm(p => ({...p, notes: e.target.value}))} placeholder="Optional instructions for this property" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowRuleForm(false)}>Cancel</Button><Button onClick={() => saveRuleMutation.mutate(ruleForm)} disabled={saveRuleMutation.isPending}>{saveRuleMutation.isPending ? 'Saving...' : 'Save Property Rules'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => !v && resetForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Checkpoint" : "New QR Checkpoint"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Checkpoint Name *</Label>
                <Input value={formData.checkpoint_name} onChange={e => setFormData(p => ({ ...p, checkpoint_name: e.target.value }))} placeholder="e.g. Front Gate" required />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Location Label *</Label>
                <Input value={formData.location_label} onChange={e => setFormData(p => ({ ...p, location_label: e.target.value }))} placeholder="e.g. Main Entrance – North Side" required />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Property/Site *</Label>
                <Select value={formData.property_site} onValueChange={v => setFormData(p => ({ ...p, property_site: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {locations?.map(l => <SelectItem key={l.id} value={l.site_name}>{l.site_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Zone / Building</Label>
                <Input value={formData.zone_or_building} onChange={e => setFormData(p => ({ ...p, zone_or_building: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formData.is_required} onCheckedChange={v => setFormData(p => ({ ...p, is_required: v }))} />
                <Label>Required checkpoint</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={formData.is_active} onCheckedChange={v => setFormData(p => ({ ...p, is_active: v }))} />
                <Label>Active</Label>
              </div>
            </div>
            {editingItem && (
              <div className="p-3 bg-slate-50 rounded-lg text-center">
                <p className="text-xs text-slate-500 mb-2">QR Code Preview</p>
                <QRCodeSVG value={editingItem.qr_unique_id} size={100} className="mx-auto" />
                <p className="text-xs font-mono text-slate-400 mt-1">{editingItem.qr_unique_id}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingItem ? "Update" : "Create Checkpoint"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}