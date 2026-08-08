import { useState } from "react";
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
import { Package, Plus, Edit, Trash2, User, Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function AdminEquipment() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
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
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
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

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this equipment?')) {
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

  const activeOfficers = users.filter(u => !u.termination_date);

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Equipment Management</h1>
            <p className="text-slate-600">Track and assign equipment to officers</p>
          </div>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Equipment
        </Button>
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
                  onValueChange={(val) => setFormData({ ...formData, assigned_to: val, status: val ? 'assigned' : 'available' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Not Assigned</SelectItem>
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