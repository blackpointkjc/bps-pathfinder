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
import { QrCode, Plus, Edit, Power, Search, Printer } from "lucide-react";
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

  const { data: checkpoints } = useQuery({
    queryKey: ['qrCheckpoints'],
    queryFn: () => base44.entities.QRCheckpoint.list('-created_date'),
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const all = await listDirectoryLocations('site_name');
      return all.filter(l => l.active);
    },
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
    <div className="p-4 md:p-8 min-h-screen bg-white max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <QrCode className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">QR Checkpoint Management</h1>
            <p className="text-sm text-slate-500">{checkpoints?.length || 0} checkpoints total</p>
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-700">Checkpoint</th>
                  <th className="text-left p-3 font-semibold text-slate-700 hidden md:table-cell">Location</th>
                  <th className="text-left p-3 font-semibold text-slate-700 hidden lg:table-cell">Site</th>
                  <th className="text-left p-3 font-semibold text-slate-700 hidden lg:table-cell">QR ID</th>
                  <th className="text-center p-3 font-semibold text-slate-700">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-700">Required</th>
                  <th className="text-right p-3 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(cp => (
                  <tr key={cp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-900">{cp.checkpoint_name}</td>
                    <td className="p-3 text-slate-600 hidden md:table-cell">{cp.location_label}</td>
                    <td className="p-3 text-slate-600 hidden lg:table-cell">{cp.property_site}</td>
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
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">No checkpoints found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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