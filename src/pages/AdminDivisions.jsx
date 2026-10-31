import { confirmInApp } from '@/lib/inAppDialog';
import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Layers, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listDirectoryDivisions, listDirectoryLocations, listDirectoryUsers, invalidateAppDirectory } from '@/lib/appDirectory';
import { useAuth } from '@/lib/AuthContext';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { buildOrgTree, divisionLevel, indexDivisions, officerOrgContext } from '@/lib/orgStructure';
import DivisionStructureTree from '@/components/admin/DivisionStructureTree';

const LEVEL_LABEL = { region: 'Region', division: 'Division', substation: 'Substation' };
const LEVEL_HINT = {
  region: 'A primary region such as Virginia.',
  division: 'An operational division inside a region, such as Richmond or Tidewater.',
  substation: 'An area inside a division that sites and personnel belong to.',
};

const emptyForm = (level = 'region') => ({
  division_level: level,
  name: '',
  parent_region: '',
  parent_division: '',
  active: true,
  notes: '',
});

export default function AdminDivisions() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null);
  const [formData, setFormData] = useState(() => emptyForm('region'));
  const queryClient = useQueryClient();

  const { user, isLoadingAuth } = useAuth();

  const divisionRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasAccess = user?.role === 'admin' || divisionRoles.has('hr') || divisionRoles.has('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';

  const { data: divisions = [] } = useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      try {
        const rows = await listDirectoryDivisions('division_name', 1000);
        if (Array.isArray(rows) && rows.length) return rows;
      } catch {}
      return base44.entities.Division.list('division_name', 1000);
    },
    enabled: hasAccess,
    placeholderData: [],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['org-structure-locations'],
    queryFn: async () => {
      try {
        const rows = await listDirectoryLocations('site_name', 1000);
        if (Array.isArray(rows) && rows.length) return rows;
      } catch {}
      return base44.entities.Location.list('site_name', 500);
    },
    enabled: hasAccess,
    placeholderData: [],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['org-structure-users'],
    queryFn: () => listDirectoryUsers(undefined, 1000, true),
    enabled: hasAccess,
    placeholderData: [],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createDivisionMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('manageHRDivisions', { action: 'create', data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.division;
    },
    onSuccess: () => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      // Every assignment editor must see newly created, renamed, or activated
      // regions/divisions without waiting for the ten-minute directory TTL.
      for (const key of ['adminLocationDivisions', 'adminOfficerDivisions', 'activeDivisions', 'adminManagedLocations', 'officerDirectory', 'org-structure-locations', 'org-structure-users']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setShowDialog(false);
      setEditingDivision(null);
      setFormData(emptyForm('region'));
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
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      // Every assignment editor must see newly created, renamed, or activated
      // regions/divisions without waiting for the ten-minute directory TTL.
      for (const key of ['adminLocationDivisions', 'adminOfficerDivisions', 'activeDivisions', 'adminManagedLocations', 'officerDirectory', 'org-structure-locations', 'org-structure-users']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setShowDialog(false);
      setEditingDivision(null);
      setFormData(emptyForm('region'));
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
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      // Every assignment editor must see newly created, renamed, or activated
      // regions/divisions without waiting for the ten-minute directory TTL.
      for (const key of ['adminLocationDivisions', 'adminOfficerDivisions', 'activeDivisions', 'adminManagedLocations', 'officerDirectory', 'org-structure-locations', 'org-structure-users']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
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
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      // Every assignment editor must see newly created, renamed, or activated
      // regions/divisions without waiting for the ten-minute directory TTL.
      for (const key of ['adminLocationDivisions', 'adminOfficerDivisions', 'activeDivisions', 'adminManagedLocations', 'officerDirectory', 'org-structure-locations', 'org-structure-users']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  const divisionIndex = useMemo(() => indexDivisions(divisions), [divisions]);
  const tree = useMemo(() => buildOrgTree(divisions), [divisions]);

  // Membership counts come from real location and personnel records, so each
  // branch of the tree shows how much is actually assigned to it.
  const stats = useMemo(() => {
    const counters = {};
    const bump = (level, name, field) => {
      const key = `${level}:${name}`;
      if (!name) return;
      if (!counters[key]) counters[key] = { locations: 0, officers: 0 };
      counters[key][field] += 1;
    };

    (locations || []).forEach(location => {
      bump('region', location.division, 'locations');
      bump('division', location.subdivision, 'locations');
      bump('substation', location.substation, 'locations');
    });

    (directoryUsers || []).filter(isOperationalOfficer).forEach(officer => {
      const context = officerOrgContext(officer, locations || []);
      bump('region', context.division, 'officers');
      bump('division', context.subdivision, 'officers');
      bump('substation', context.substation, 'officers');
    });

    return counters;
  }, [locations, directoryUsers]);

  const openAdd = (level, { region = '', division = '' } = {}) => {
    setEditingDivision(null);
    setFormData({ ...emptyForm(level), parent_region: region, parent_division: division });
    setShowDialog(true);
  };

  const handleEdit = (record) => {
    if (!record?.id) return;
    const level = divisionLevel(record, divisionIndex);
    let parentRegion = '';
    let parentDivision = '';
    if (level === 'division') {
      parentRegion = record.parent_division || '';
    }
    if (level === 'substation') {
      parentDivision = record.parent_division || '';
      const parent = divisionIndex[String(parentDivision).trim().toLowerCase()];
      parentRegion = record.region || parent?.parent_division || '';
    }
    setEditingDivision(record);
    setFormData({
      division_level: level,
      name: record.subdivision || record.division_name || '',
      parent_region: parentRegion,
      parent_division: parentDivision,
      active: record.active !== false,
      notes: record.notes || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const level = formData.division_level;
    const name = formData.name.trim();
    if (!name) return;
    const payload = {
      division_name: name,
      subdivision: level === 'region' ? '' : name,
      is_subdivision: level !== 'region',
      division_level: level,
      parent_division: level === 'region' ? '' : (level === 'division' ? formData.parent_region : formData.parent_division),
      region: level === 'region' ? name : formData.parent_region,
      active: formData.active,
      notes: formData.notes,
    };
    if (editingDivision) {
      updateDivisionMutation.mutate({ id: editingDivision.id, data: payload });
    } else {
      createDivisionMutation.mutate(payload);
    }
  };

  const handleDelete = async (record) => {
    if (!record?.id) return;
    const level = divisionLevel(record, divisionIndex);
    const children = (divisions || []).filter(item => String(item.parent_division || '').trim() === String(record.subdivision || record.division_name || '').trim());
    if (children.length) {
      await confirmInApp(`Delete this ${LEVEL_LABEL[level].toLowerCase()}? It still has ${children.length} ${children.length === 1 ? 'child area' : 'child areas'} assigned to it. Move them first so nothing loses its organization.`);
      return;
    }
    if (await confirmInApp(`Delete this ${LEVEL_LABEL[level].toLowerCase()}? Sites and personnel assigned to it keep their records but lose this organization assignment.`)) {
      deleteDivisionMutation.mutate(record.id);
    }
  };

  const handleToggleActive = (record) => {
    if (!record?.id) return;
    toggleActiveMutation.mutate({ id: record.id, active: record.active === false });
  };

  const regionNames = tree.map(region => region.name);
  const divisionsInRegion = formData.parent_region
    ? (tree.find(region => region.name === formData.parent_region)?.divisions || []).map(division => division.name)
    : tree.flatMap(region => region.divisions.map(division => division.name));

  if (isLoadingAuth) return <div className="p-8 text-center text-slate-500">Loading division access…</div>;
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
    <div className="bps-command-page divisions-page min-h-screen bg-[#080d16] p-3 text-white sm:p-4 md:p-6">
      <div className="mx-auto w-full max-w-[1400px] min-w-0 space-y-6">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Shield className="h-8 w-8 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-black leading-tight text-white sm:text-3xl">Company Structure</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
                Three levels everywhere in Pathfinder: Region (Virginia) → Division (Richmond, Tidewater) → Substation. Sites and personnel carry their assignments, so filters and reports stay consistent.
              </p>
            </div>
          </div>
          <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:w-auto">
            <Button onClick={() => openAdd('region')} className="w-full justify-center bg-blue-600 hover:bg-blue-700 xl:w-auto">
              <Plus className="mr-2 h-4 w-4 shrink-0" /><span>Region</span>
            </Button>
            <Button onClick={() => openAdd('division')} variant="outline" className="w-full justify-center whitespace-normal border-cyan-800 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 xl:w-auto">
              <Plus className="mr-2 h-4 w-4 shrink-0" /><span>Division</span>
            </Button>
            <Button onClick={() => openAdd('substation')} variant="outline" className="w-full justify-center whitespace-normal border-amber-800 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 xl:w-auto">
              <Plus className="mr-2 h-4 w-4 shrink-0" /><span>Substation</span>
            </Button>
          </div>
        </div>

        <Card className="border border-slate-800 bg-slate-900/40 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Layers className="h-5 w-5 text-cyan-400" />
              Region, Division and Substation Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DivisionStructureTree
              regions={tree}
              stats={stats}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              onAddRegion={() => openAdd('region')}
              onAddDivision={record => openAdd('division', { region: record?.division_name || '' })}
              onAddSubstation={record => {
                const name = record?.subdivision || record?.division_name || '';
                const parent = divisionIndex[String(name).trim().toLowerCase()];
                openAdd('substation', { region: record?.region || parent?.parent_division || '', division: name });
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>
              {editingDivision ? `Edit ${LEVEL_LABEL[formData.division_level]}` : `Add ${LEVEL_LABEL[formData.division_level]}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>This record is a</Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
                {['region', 'division', 'substation'].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, division_level: level, parent_division: level === 'division' ? prev.parent_division : '' }))}
                    className={`rounded-md px-2 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                      formData.division_level === level ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">{LEVEL_HINT[formData.division_level]}</p>
            </div>

            {formData.division_level !== 'region' && (
              <div className="space-y-2">
                <Label htmlFor="parent_region">Region *</Label>
                <select
                  id="parent_region"
                  value={formData.parent_region}
                  onChange={event => setFormData(prev => ({ ...prev, parent_region: event.target.value }))}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  required
                >
                  <option value="">Select the region…</option>
                  {regionNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}

            {formData.division_level === 'substation' && (
              <div className="space-y-2">
                <Label htmlFor="parent_division">Division *</Label>
                <select
                  id="parent_division"
                  value={formData.parent_division}
                  onChange={event => setFormData(prev => ({ ...prev, parent_division: event.target.value }))}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  required
                >
                  <option value="">Select the division…</option>
                  {divisionsInRegion.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{LEVEL_LABEL[formData.division_level]} name *</Label>
              <Input
                id="name"
                placeholder={formData.division_level === 'region' ? 'e.g., Virginia' : formData.division_level === 'division' ? 'e.g., Richmond' : 'e.g., Midlothian'}
                value={formData.name}
                onChange={event => setFormData(prev => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional information…"
                value={formData.notes}
                onChange={event => setFormData(prev => ({ ...prev, notes: event.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={event => setFormData(prev => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="active" className="cursor-pointer">Active (visible in dropdowns and filters)</Label>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)} className="border-slate-700">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createDivisionMutation.isPending || updateDivisionMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createDivisionMutation.isPending || updateDivisionMutation.isPending
                  ? 'Saving…'
                  : editingDivision ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}