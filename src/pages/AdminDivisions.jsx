import { confirmInApp } from '@/lib/inAppDialog';
import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Layers, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listDirectoryDivisions } from '@/lib/appDirectory';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminDivisions() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null);
  const [formData, setFormData] = useState({
    division_name: "",
    subdivision: "",
    parent_division: "",
    is_subdivision: false,
    active: true,
    notes: ""
  });
  const [expandedDivisions, setExpandedDivisions] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const divisionRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasAccess = user?.role === 'admin' || divisionRoles.has('hr') || divisionRoles.has('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';

  const { data: divisions = [] } = useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      try {
        const direct = await base44.entities.Division.list('division_name', 1000);
        if (Array.isArray(direct) && direct.length) return direct;
      } catch (directError) {
        console.warn('Direct Division list failed, trying service role function:', directError?.message);
      }
      try {
        const result = await base44.functions.invoke('manageHRDivisions', { action: 'list' });
        const payload = result?.data || result || {};
        if (payload.error) throw new Error(payload.error);
        if (Array.isArray(payload.divisions) && payload.divisions.length) return payload.divisions;
      } catch (error) {
        console.warn('manageHRDivisions list failed:', error?.message);
      }
      return await listDirectoryDivisions('division_name', 1000);
    },
    enabled: hasAccess,
    initialData: [],
  });

  const createDivisionMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('manageHRDivisions', { action: 'create', data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.division;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      setShowDialog(false);
      setEditingDivision(null);
      resetForm();
    },
  });

  const updateDivisionMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const result = await base44.functions.invoke('manageHRDivisions', { action: 'update', id, data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.division;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      setShowDialog(false);
      setEditingDivision(null);
      resetForm();
    },
  });

  const deleteDivisionMutation = useMutation({
    mutationFn: async (id) => {
      const result = await base44.functions.invoke('manageHRDivisions', { action: 'delete', id });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }) => {
      const result = await base44.functions.invoke('manageHRDivisions', { action: 'update', id, data: { active } });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.division;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
    },
  });

  const resetForm = () => {
    setFormData({
      division_name: "",
      subdivision: "",
      parent_division: "",
      is_subdivision: false,
      active: true,
      notes: ""
    });
  };

  const handleEdit = (division) => {
    setEditingDivision(division);
    setFormData({
      division_name: division.division_name,
      subdivision: division.subdivision || "",
      parent_division: division.parent_division || "",
      is_subdivision: division.is_subdivision || false,
      active: division.active,
      notes: division.notes || ""
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingDivision) {
      updateDivisionMutation.mutate({ id: editingDivision.id, data: formData });
    } else {
      createDivisionMutation.mutate(formData);
    }
  };

  const handleDelete = (id) => {
    if (await confirmInApp('Are you sure you want to delete this division? This may affect officers and locations assigned to it.')) {
      deleteDivisionMutation.mutate(id);
    }
  };

  const handleToggleActive = (division) => {
    toggleActiveMutation.mutate({ id: division.id, active: !division.active });
  };

  const toggleDivisionExpanded = (divisionName) => {
    const newSet = new Set(expandedDivisions);
    if (newSet.has(divisionName)) {
      newSet.delete(divisionName);
    } else {
      newSet.add(divisionName);
    }
    setExpandedDivisions(newSet);
  };

  // Organize divisions hierarchically
  const { mainDivisions, subdivisionsByParent } = useMemo(() => {
    if (!divisions) return { mainDivisions: [], subdivisionsByParent: {} };

    const main = divisions.filter(d => !d.is_subdivision);
    const subs = {};
    
    divisions.filter(d => d.is_subdivision).forEach(d => {
      const parent = d.parent_division || 'Unassigned';
      if (!subs[parent]) subs[parent] = [];
      subs[parent].push(d);
    });

    return { mainDivisions: main, subdivisionsByParent: subs };
  }, [divisions]);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="divisions-page p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manage Divisions</h1>
              <p className="text-slate-600">Organize company by divisions and subdivisions</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setEditingDivision(null);
                setFormData({
                  division_name: "",
                  subdivision: "",
                  parent_division: "",
                  is_subdivision: true,
                  active: true,
                  notes: ""
                });
                setShowDialog(true);
              }}
              variant="outline"
              className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Subdivision
            </Button>
            <Button
              onClick={() => {
                setEditingDivision(null);
                resetForm();
                setShowDialog(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Division
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              All Divisions & Subdivisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mainDivisions?.map((division) => {
                const subs = subdivisionsByParent[division.division_name] || [];
                const isExpanded = expandedDivisions.has(division.division_name);

                return (
                  <div key={division.id}>
                    {/* Main Division */}
                    <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          {subs.length > 0 && (
                            <button
                              onClick={() => toggleDivisionExpanded(division.division_name)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5" />
                              ) : (
                                <ChevronRight className="w-5 h-5" />
                              )}
                            </button>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-blue-900 text-lg">{division.division_name}</h3>
                              <Badge variant="outline" className={
                                division.active
                                  ? 'bg-green-100 text-green-800 border-green-200'
                                  : 'bg-gray-100 text-gray-800 border-gray-200'
                              }>
                                {division.active ? 'Active' : 'Inactive'}
                              </Badge>
                              {subs.length > 0 && (
                                <Badge className="bg-blue-600 text-white">{subs.length} subdivision{subs.length !== 1 ? 's' : ''}</Badge>
                              )}
                            </div>
                            {division.notes && (
                              <p className="text-sm text-slate-600">{division.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(division)}
                            title={division.active ? "Deactivate" : "Activate"}
                          >
                            {division.active ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(division)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(division.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Subdivisions */}
                    {isExpanded && subs.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2">
                        {subs.map((sub) => (
                          <div key={sub.id} className="p-3 bg-purple-50 rounded-lg border border-purple-200 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-purple-900">{sub.subdivision || sub.division_name}</h4>
                                  <Badge variant="outline" className={
                                    sub.active
                                      ? 'bg-green-100 text-green-800 border-green-200'
                                      : 'bg-gray-100 text-gray-800 border-gray-200'
                                  }>
                                    {sub.active ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                {sub.notes && (
                                  <p className="text-xs text-slate-600">{sub.notes}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleActive(sub)}
                                  title={sub.active ? "Deactivate" : "Activate"}
                                >
                                  {sub.active ? (
                                    <ToggleRight className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <ToggleLeft className="w-4 h-4 text-gray-400" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(sub)}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(sub.id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!mainDivisions?.length && (
                <p className="text-center text-slate-500 py-8">No divisions yet. Add your first division.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> Divisions organize your company structure. Subdivisions are nested under main divisions. For example: Virginia → Richmond, NOVA, Tidewater.
          </p>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingDivision ? 'Edit Division' : (formData.is_subdivision ? 'Add New Subdivision' : 'Add New Division')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <input
                type="checkbox"
                id="is_subdivision"
                checked={formData.is_subdivision}
                onChange={(e) => setFormData({...formData, is_subdivision: e.target.checked, parent_division: e.target.checked ? formData.parent_division : ""})}
                className="w-4 h-4"
              />
              <Label htmlFor="is_subdivision" className="text-sm font-medium text-purple-900 cursor-pointer">
                This is a Subdivision
              </Label>
            </div>

            {formData.is_subdivision && (
              <div className="space-y-2">
                <Label htmlFor="parent_division">Parent Division *</Label>
                <select
                  id="parent_division"
                  value={formData.parent_division || ''}
                  onChange={(e) => setFormData(prev => ({...prev, parent_division: e.target.value}))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                  required
                >
                  <option value="">Select parent division...</option>
                  {mainDivisions?.filter(div => div.active !== false).map((div) => (
                    <option key={div.id} value={div.division_name}>{div.division_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="division_name">{formData.is_subdivision ? 'Subdivision Name' : 'Division Name'} *</Label>
              <Input
                id="division_name"
                placeholder={formData.is_subdivision ? "e.g., Richmond, NOVA, Tidewater" : "e.g., Virginia, Maryland"}
                value={formData.is_subdivision ? formData.subdivision : formData.division_name}
                onChange={(e) => {
                  if (formData.is_subdivision) {
                    setFormData({...formData, subdivision: e.target.value, division_name: e.target.value});
                  } else {
                    setFormData({...formData, division_name: e.target.value});
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional information..."
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({...formData, active: e.target.checked})}
                className="rounded"
              />
              <Label htmlFor="active" className="cursor-pointer">
                Active (visible in dropdowns)
              </Label>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createDivisionMutation.isPending || updateDivisionMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createDivisionMutation.isPending || updateDivisionMutation.isPending
                  ? 'Saving...'
                  : editingDivision
                  ? 'Update'
                  : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}