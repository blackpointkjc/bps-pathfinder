import { confirmInApp } from '@/lib/inAppDialog';
import { useRef, useState } from "react";
import ExcelJS from 'exceljs';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Edit, Trash2, User, Search, AlertCircle, Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export default function AdminEquipment() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    equipment_type: "",
    product_name: "",
    model_number: "",
    serial_number: "",
    imei_number: "",
    date_issued: "",
    assigned_to: "",
    condition: "good",
    purchase_date: "",
    purchase_cost: "",
    warranty_expiration: "",
    notes: "",
    status: "available"
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: equipment, isLoading } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => base44.entities.Equipment.list(),
    initialData: [],
  });

  const { data: users } = useQuery({
    queryKey: ['officerDirectory', 'adminEquipment'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Equipment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Equipment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      alert('Failed to update equipment: ' + (error?.message || 'Unknown error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Equipment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  const resetForm = () => {
    setFormData({
      equipment_type: "",
      product_name: "",
      model_number: "",
      serial_number: "",
      imei_number: "",
      date_issued: "",
      assigned_to: "",
      condition: "good",
      purchase_date: "",
      purchase_cost: "",
      warranty_expiration: "",
      notes: "",
      status: "available"
    });
    setEditingEquipment(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.purchase_cost) data.purchase_cost = parseFloat(data.purchase_cost);
    if (!data.assigned_to) data.assigned_to = "";
    
    if (editingEquipment) {
      updateMutation.mutate({ id: editingEquipment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item) => {
    setEditingEquipment(item);
    setFormData({
      equipment_type: item.equipment_type || "",
      product_name: item.product_name || "",
      model_number: item.model_number || "",
      serial_number: item.serial_number || "",
      imei_number: item.imei_number || "",
      date_issued: item.date_issued || "",
      assigned_to: item.assigned_to || "",
      condition: item.condition || "good",
      purchase_date: item.purchase_date || "",
      purchase_cost: item.purchase_cost || "",
      warranty_expiration: item.warranty_expiration || "",
      notes: item.notes || "",
      status: item.status || "available"
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (await confirmInApp('Are you sure you want to delete this equipment?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredEquipment = equipment.filter(item => {
    const matchesSearch = item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.serial_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || item.equipment_type === filterType;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const activeOfficers = users.filter(isOperationalOfficer);

  const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const cellText = (value) => {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    let text = '';
    if (typeof value === 'object' && value.text) text = String(value.text).trim();
    else if (typeof value === 'object' && value.result != null) text = String(value.result).trim();
    else text = String(value).trim();
    return text === '-' ? '' : text;
  };
  const parseCsv = (text) => {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i], next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue; }
      if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some(value => String(value).trim())) rows.push(row);
        row = [];
        continue;
      }
      cell += ch;
    }
    row.push(cell);
    if (row.some(value => String(value).trim())) rows.push(row);
    return rows;
  };
  const resolveOfficerEmail = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const match = activeOfficers.find(officer => {
      const full = `${officer.first_name || ''} ${officer.last_name || ''}`.trim().toLowerCase();
      const rankLast = `${officer.rank || ''} ${officer.last_name || ''}`.trim().toLowerCase();
      return String(officer.email || '').toLowerCase() === lower || full === lower || rankLast === lower || String(officer.last_name || '').toLowerCase() === lower;
    });
    return match?.email || (raw.includes('@') ? raw.toLowerCase() : '');
  };
  const mapImportRow = (source) => {
    const row = Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeHeader(key), cellText(value)]));
    const pick = (...keys) => keys.map(normalizeHeader).map(key => row[key]).find(value => value !== undefined && value !== '') || '';
    const deviceType = pick('device_type', 'model_number', 'model');
    const typeRaw = pick('equipment_type', 'type', 'category').toLowerCase().replace(/\s+/g, '_');
    const allowedTypes = new Set(['computer','laptop','tablet','phone','radio','vehicle','firearm','uniform','badge','body_camera','taser','other']);
    const inferredType = /^tlk\s*\d+/i.test(deviceType) ? 'radio' : (allowedTypes.has(typeRaw) ? typeRaw : 'other');
    const conditionRaw = pick('condition').toLowerCase();
    const allowedConditions = new Set(['new','good','fair','poor','damaged']);
    const statusRaw = pick('status').toLowerCase();
    const assignedTo = resolveOfficerEmail(pick('assigned_to', 'assigned_officer', 'officer', 'officer_email'));
    const purchaseCost = Number(String(pick('purchase_cost', 'cost', 'price')).replace(/[$,]/g, ''));
    const sourceStatus = pick('status');
    const sourceConnected = pick('connected');
    const sourceSoftware = pick('software_version');
    const sourceTier = pick('tier_package');
    const sourceNotes = [
      sourceStatus ? `Source status: ${sourceStatus}` : '',
      sourceConnected ? `Connected: ${sourceConnected}` : '',
      sourceSoftware ? `Software: ${sourceSoftware}` : '',
      sourceTier ? `Tier: ${sourceTier}` : '',
      pick('notes', 'note', 'comments')
    ].filter(Boolean).join(' | ');
    return {
      equipment_type: inferredType,
      product_name: pick('product_name', 'name', 'equipment_name', 'item', 'display_name'),
      model_number: deviceType,
      serial_number: pick('serial_number', 'serial', 'asset_id', 'asset_number', 'inventory_number'),
      imei_number: pick('imei_number', 'imei'),
      date_issued: pick('date_issued', 'issued_date'),
      assigned_to: assignedTo,
      condition: allowedConditions.has(conditionRaw) ? conditionRaw : 'good',
      purchase_date: pick('purchase_date', 'purchased_date'),
      purchase_cost: Number.isFinite(purchaseCost) && purchaseCost >= 0 ? purchaseCost : undefined,
      warranty_expiration: pick('warranty_expiration', 'warranty_expires', 'warranty_date'),
      notes: sourceNotes,
      status: ['available','assigned','maintenance','retired'].includes(statusRaw) ? statusRaw : (assignedTo ? 'assigned' : 'available'),
    };
  };
  const handleEquipmentImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let rawRows = [];
      if (extension === 'csv') {
        rawRows = parseCsv(await file.text());
      } else if (extension === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('The workbook does not contain a worksheet.');
        sheet.eachRow({ includeEmpty: false }, row => rawRows.push(row.values.slice(1).map(cellText)));
      } else {
        throw new Error('Use an .xlsx or .csv equipment file.');
      }
      if (rawRows.length < 2) throw new Error('The file needs a header row and at least one equipment row.');
      const headers = rawRows[0].map(cellText);
      const imported = rawRows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]]))).map(mapImportRow);
      const valid = imported.filter(row => row.product_name && row.serial_number);
      const invalid = imported.length - valid.length;
      const existingBySerial = new Map((equipment || []).filter(item => item.serial_number).map(item => [String(item.serial_number).trim().toLowerCase(), item]));
      let created = 0, updated = 0, failed = 0;
      for (const row of valid) {
        try {
          const duplicate = existingBySerial.get(String(row.serial_number).trim().toLowerCase());
          const payload = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
          if (duplicate?.id) { await base44.entities.Equipment.update(duplicate.id, payload); updated += 1; }
          else { const createdRow = await base44.entities.Equipment.create(payload); created += 1; existingBySerial.set(String(row.serial_number).trim().toLowerCase(), createdRow); }
        } catch (error) {
          console.error('Equipment import row failed', row.serial_number, error);
          failed += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setImportResult({ file: file.name, total: imported.length, created, updated, invalid, failed });
    } catch (error) {
      setImportResult({ error: error?.message || 'Unable to import equipment file.' });
    } finally {
      setImporting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-green-600';
      case 'assigned': return 'bg-blue-600';
      case 'maintenance': return 'bg-amber-600';
      case 'retired': return 'bg-slate-600';
      default: return 'bg-slate-600';
    }
  };

  const formatLabel = (value) => {
    if (!value) return '';
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-600" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">Only administrators can access equipment management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6 rounded-2xl border border-slate-800 bg-[#09131f] p-5 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <Package className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Asset Control</div>
              <h1 className="text-3xl font-black">Equipment Management</h1>
              <p className="text-sm text-slate-400">Inventory, bulk import, assignments, condition and lifecycle tracking</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={importInputRef} type="file" accept=".xlsx,.csv" onChange={handleEquipmentImport} className="hidden" />
            <Button type="button" variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()} className="border-emerald-600/60 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40 hover:text-white">
              {importing ? <FileSpreadsheet className="mr-2 h-4 w-4 animate-pulse" /> : <Upload className="mr-2 h-4 w-4" />}
              {importing ? 'Importing…' : 'Import Excel / CSV'}
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setShowDialog(true);
              }}
              className="bg-blue-600 hover:bg-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Equipment
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          <span className="font-black text-slate-200">Bulk import columns:</span> equipment type, product/name, model, serial/asset ID, IMEI, assigned officer/email, condition, status, issue date, purchase date/cost, warranty expiration and notes. Existing matching serial numbers are updated instead of duplicated.
        </div>
        {importResult && <div className={`mt-3 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${importResult.error ? 'border-red-700/50 bg-red-950/30 text-red-200' : 'border-emerald-700/50 bg-emerald-950/25 text-emerald-200'}`}>
          {importResult.error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>{importResult.error ? importResult.error : <><strong>{importResult.file}</strong>: {importResult.created} created, {importResult.updated} updated, {importResult.invalid} skipped for missing name/serial, {importResult.failed} failed.</>}</div>
        </div>}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label>Search Equipment</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or serial number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Label>Filter by Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="computer">Computer</SelectItem>
                  <SelectItem value="laptop">Laptop</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="radio">Radio</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="firearm">Firearm</SelectItem>
                  <SelectItem value="uniform">Uniform</SelectItem>
                  <SelectItem value="badge">Badge</SelectItem>
                  <SelectItem value="body_camera">Body Camera</SelectItem>
                  <SelectItem value="taser">Taser</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Label>Filter by Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEquipment.map((item) => (
          <Card key={item.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">{item.product_name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={getStatusColor(item.status)}>
                      {formatLabel(item.status)}
                    </Badge>
                    <Badge variant="outline">{formatLabel(item.equipment_type)}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(item)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <span className="font-semibold text-slate-700">Serial #:</span>
                <p className="text-slate-900">{item.serial_number}</p>
              </div>
              {item.assigned_to && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-900">
                    {users.find(u => u.email === item.assigned_to)?.first_name} {users.find(u => u.email === item.assigned_to)?.last_name}
                  </span>
                </div>
              )}
              {item.date_issued && (
                <p className="text-xs text-slate-600">
                  Issued: {format(new Date(item.date_issued), 'MMM d, yyyy')}
                </p>
              )}
              {item.condition && (
                <p className="text-xs text-slate-600">
                  Condition: <span className="font-medium">{formatLabel(item.condition)}</span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredEquipment.length === 0 && !isLoading && (
        <Card className="p-12 text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No Equipment Found</h3>
          <p className="text-slate-500 mb-4">Get started by adding your first equipment item</p>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Equipment
          </Button>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { resetForm(); } setShowDialog(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEquipment ? 'Edit Equipment' : 'Add New Equipment'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Equipment Type *</Label>
                <Select
                  value={formData.equipment_type}
                  onValueChange={(val) => setFormData({ ...formData, equipment_type: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="computer">Computer</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="radio">Radio</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                    <SelectItem value="firearm">Firearm</SelectItem>
                    <SelectItem value="uniform">Uniform</SelectItem>
                    <SelectItem value="badge">Badge</SelectItem>
                    <SelectItem value="body_camera">Body Camera</SelectItem>
                    <SelectItem value="taser">Taser</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Name *</Label>
                <Input
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  placeholder="e.g., Dell Latitude 5520"
                  required
                />
              </div>
              <div>
                <Label>Model Number</Label>
                <Input
                  value={formData.model_number}
                  onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                  placeholder="e.g., 5520-XYZ"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Serial Number *</Label>
                <Input
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  placeholder="e.g., ABC123456789"
                  required
                />
              </div>
              <div>
                <Label>IMEI Number <span className="text-xs text-slate-400">(cellular devices)</span></Label>
                <Input
                  value={formData.imei_number}
                  onChange={(e) => setFormData({ ...formData, imei_number: e.target.value })}
                  placeholder="e.g., 352099001761481"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Condition</Label>
                <Select
                  value={formData.condition}
                  onValueChange={(val) => setFormData({ ...formData, condition: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned To</Label>
                <Select
                  value={formData.assigned_to}
                  onValueChange={(val) => { const next = val === '__none__' ? '' : val; setFormData({ ...formData, assigned_to: next, status: next ? 'assigned' : 'available' }); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not Assigned</SelectItem>
                    {activeOfficers.map(officer => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name} {officer.last_name} - {officer.rank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Date Issued</Label>
                <Input
                  type="date"
                  value={formData.date_issued}
                  onChange={(e) => setFormData({ ...formData, date_issued: e.target.value })}
                />
              </div>
              <div>
                <Label>Warranty Expires</Label>
                <Input
                  type="date"
                  value={formData.warranty_expiration}
                  onChange={(e) => setFormData({ ...formData, warranty_expiration: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Purchase Cost</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.purchase_cost}
                onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this equipment..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingEquipment ? 'Update' : 'Create'} Equipment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}