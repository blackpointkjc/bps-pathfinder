import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Plus, Edit, Save, X, FileText, MapPin, BookOpen, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function AdminPostOrders() {
  const [editingId, setEditingId] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingGeneral, setEditingGeneral] = useState(null);
  const [showGeneralDialog, setShowGeneralDialog] = useState(false);
  const [generalForm, setGeneralForm] = useState({});

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: locations } = useQuery({
    queryKey: ['allLocations'],
    queryFn: async () => {
      const locs = await base44.entities.Location.list('site_name');
      return locs.filter(loc => loc.active);
    },
    initialData: [],
  });

  const { data: postOrders } = useQuery({
    queryKey: ['postOrders'],
    queryFn: () => base44.entities.PostOrder.list('site_name'),
    initialData: [],
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: generalSections = [] } = useQuery({
    queryKey: ['generalPostOrders'],
    queryFn: () => base44.entities.GeneralPostOrder.list('sort_order'),
  });

  const savePostOrderMutation = useMutation({
    mutationFn: async (data) => {
      if (editingId) {
        return await base44.entities.PostOrder.update(editingId, data);
      } else {
        return await base44.entities.PostOrder.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postOrders'] });
      setShowDialog(false);
      setEditingId(null);
      setFormData({});
      toast.success('Post orders saved successfully!');
    },
  });

  const saveGeneralMutation = useMutation({
    mutationFn: async (data) => {
      if (editingGeneral?.id) {
        return await base44.entities.GeneralPostOrder.update(editingGeneral.id, data);
      } else {
        return await base44.entities.GeneralPostOrder.create({ ...data, sort_order: generalSections.length + 1, active: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalPostOrders'] });
      setShowGeneralDialog(false);
      setEditingGeneral(null);
      setGeneralForm({});
      toast.success(editingGeneral?.id ? 'Section updated!' : 'Section added!');
    },
  });

  const deleteGeneralMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.GeneralPostOrder.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalPostOrders'] });
      toast.success('Section deleted.');
    },
  });

  const handleEdit = (postOrder) => {
    setEditingId(postOrder.id);
    setFormData(postOrder);
    setShowDialog(true);
  };

  const handleCreate = (siteName) => {
    const location = locations?.find(loc => loc.site_name === siteName);
    setEditingId(null);
    setFormData({
      site_name: siteName,
      site_address: location?.address || '',
      post_type: 'armed',
      emergency_police: '911',
      assigned_supervisors: location?.assigned_supervisors || [],
    });
    setShowDialog(true);
  };

  const handleEditGeneral = (section) => {
    setEditingGeneral(section);
    setGeneralForm({ section_title: section.section_title, content: section.content });
    setShowGeneralDialog(true);
  };

  const handleAddGeneral = () => {
    setEditingGeneral(null);
    setGeneralForm({ section_title: '', content: '' });
    setShowGeneralDialog(true);
  };

  const handleDeleteGeneral = (section) => {
    if (window.confirm(`Delete section "${section.section_title}"? This cannot be undone.`)) {
      deleteGeneralMutation.mutate(section.id);
    }
  };

  const getSupervisorName = (email) => {
    const sup = allUsers?.find(u => u.email === email);
    if (!sup) return email;
    if (sup.rank && sup.last_name && sup.unit_number) {
      return `${sup.rank} ${sup.last_name} Unit ${sup.unit_number}`;
    }
    if (sup.rank && sup.last_name) return `${sup.rank} ${sup.last_name}`;
    return `${sup.first_name || ''} ${sup.last_name || ''}`.trim() || email;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    savePostOrderMutation.mutate(formData);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-600" />
            Manage Post Orders
          </h1>
          <p className="text-slate-600">Configure site post orders and general post orders shown to all officers</p>
        </div>

        <Tabs defaultValue="sites">
          <TabsList className="bg-white border">
            <TabsTrigger value="sites" className="gap-2">
              <MapPin className="w-4 h-4" />
              Site Post Orders
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-2">
              <BookOpen className="w-4 h-4" />
              General Post Orders
            </TabsTrigger>
          </TabsList>

          {/* ---- SITE POST ORDERS TAB ---- */}
          <TabsContent value="sites" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {locations?.map((location) => {
                const existingPostOrder = postOrders?.find(po => po.site_name === location.site_name);
                return (
                  <Card key={location.id} className="border-none shadow-lg">
                    <CardHeader className={`${existingPostOrder ? 'bg-gradient-to-r from-green-50 to-blue-50' : 'bg-gradient-to-r from-slate-50 to-slate-100'}`}>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-blue-600" />
                          <div>
                            <span className="text-slate-900">{location.site_name}</span>
                            <p className="text-sm font-normal text-slate-600 mt-1">{location.address}</p>
                          </div>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {existingPostOrder ? (
                            <>
                              <Badge className="bg-green-600 text-white">
                                <FileText className="w-3 h-3 mr-1" />Configured
                              </Badge>
                              <Button size="sm" onClick={() => handleEdit(existingPostOrder)} className="bg-blue-600 hover:bg-blue-700">
                                <Edit className="w-4 h-4 mr-2" />Edit
                              </Button>
                            </>
                          ) : (
                            <>
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Not Configured</Badge>
                              <Button size="sm" onClick={() => handleCreate(location.site_name)} className="bg-green-600 hover:bg-green-700">
                                <Plus className="w-4 h-4 mr-2" />Create
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {existingPostOrder && (
                      <CardContent className="p-4">
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-600 font-semibold">Post Type:</p>
                            <Badge className={`${
                              existingPostOrder.post_type === 'armed' ? 'bg-red-600' :
                              existingPostOrder.post_type === 'concealed_carry' ? 'bg-orange-600' :
                              'bg-green-600'
                            } text-white`}>
                              {existingPostOrder.post_type?.toUpperCase()}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-slate-600 font-semibold">Property Manager:</p>
                            <p className="text-slate-900">{existingPostOrder.property_manager_name || 'Not set'}</p>
                          </div>
                          <div>
                            <p className="text-slate-600 font-semibold">Supervisors:</p>
                            <p className="text-slate-900">{existingPostOrder.assigned_supervisors?.length || 0} assigned</p>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ---- GENERAL POST ORDERS TAB ---- */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex-1 mr-4">
                <strong>Note:</strong> These sections appear on every officer's post orders view, regardless of site. Edit each section to update the content shown to all officers.
              </div>
              <Button onClick={handleAddGeneral} className="bg-green-600 hover:bg-green-700 shrink-0">
                <Plus className="w-4 h-4 mr-2" />Add Section
              </Button>
            </div>
            <div className="grid gap-4">
              {generalSections.map((section) => (
                <Card key={section.id} className="border border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-slate-500" />
                        {section.section_title}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditGeneral(section)}>
                          <Edit className="w-4 h-4 mr-1" />Edit
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => handleDeleteGeneral(section)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-3">{section.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Site Post Order Edit/Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-600" />
              {editingId ? 'Edit Post Orders' : 'Create Post Orders'} — {formData.site_name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
              <div className="space-y-2">
                <Label>Post Type</Label>
                <Select value={formData.post_type || 'armed'} onValueChange={(v) => setFormData({...formData, post_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="armed">Armed</SelectItem>
                    <SelectItem value="concealed_carry">Concealed Carry</SelectItem>
                    <SelectItem value="unarmed">Unarmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Property Manager Name</Label>
                  <Input value={formData.property_manager_name || ''} onChange={(e) => setFormData({...formData, property_manager_name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Property Manager Phone</Label>
                  <Input value={formData.property_manager_phone || ''} onChange={(e) => setFormData({...formData, property_manager_phone: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Maintenance Contact</Label>
                  <Input value={formData.maintenance_contact || ''} onChange={(e) => setFormData({...formData, maintenance_contact: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Access Codes</Label>
                  <Input value={formData.access_codes || ''} onChange={(e) => setFormData({...formData, access_codes: e.target.value})} placeholder="Building access codes or key info" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Supervisors (from Location Settings)</Label>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800 mb-2">Supervisors are managed in <strong>Manage Locations</strong> and automatically appear in post orders.</p>
                {(() => {
                  const loc = locations?.find(l => l.site_name === formData.site_name);
                  const sups = loc?.assigned_supervisors || [];
                  if (sups.length === 0) return <p className="text-sm text-slate-600 italic">No supervisors assigned to this location yet.</p>;
                  return <div className="space-y-1 mt-2">{sups.map(email => <div key={email} className="text-sm text-slate-900 font-medium">• {getSupervisorName(email)}</div>)}</div>;
                })()}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Site Information</h3>
              <div className="space-y-2">
                <Label>Site Overview</Label>
                <Textarea value={formData.site_overview || ''} onChange={(e) => setFormData({...formData, site_overview: e.target.value})} rows={4} placeholder="Describe the site, its layout, and general characteristics..." />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Patrol Requirements</h3>
              <div className="space-y-2">
                <Label>Patrol Schedule</Label>
                <Textarea value={formData.patrol_schedule || ''} onChange={(e) => setFormData({...formData, patrol_schedule: e.target.value})} rows={3} placeholder="Hourly patrols, start-of-shift walkthrough, etc..." />
              </div>
              <div className="space-y-2">
                <Label>Patrol Areas</Label>
                <Textarea value={formData.patrol_areas || ''} onChange={(e) => setFormData({...formData, patrol_areas: e.target.value})} rows={4} placeholder="List all areas to patrol: buildings, parking lots, stairwells, etc..." />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Special Duties & Instructions</h3>
              <div className="space-y-2">
                <Label>Special Duties</Label>
                <Textarea value={formData.special_duties || ''} onChange={(e) => setFormData({...formData, special_duties: e.target.value})} rows={4} placeholder="Site-specific duties and responsibilities..." />
              </div>
              <div className="space-y-2">
                <Label>Special Instructions</Label>
                <Textarea value={formData.special_instructions || ''} onChange={(e) => setFormData({...formData, special_instructions: e.target.value})} rows={4} placeholder="Important site-specific protocols..." />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Emergency Contacts</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emergency Police</Label>
                  <Input value={formData.emergency_police || '911'} onChange={(e) => setFormData({...formData, emergency_police: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Non-Emergency Police</Label>
                  <Input value={formData.non_emergency_police || ''} onChange={(e) => setFormData({...formData, non_emergency_police: e.target.value})} placeholder="(804) 646-5100" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Police Precinct Address</Label>
                  <Input value={formData.police_precinct_address || ''} onChange={(e) => setFormData({...formData, police_precinct_address: e.target.value})} placeholder="2501 Q St, Richmond, VA 23223" />
                </div>
                <div className="space-y-2">
                  <Label>Shelter Locations</Label>
                  <Textarea value={formData.shelter_locations || ''} onChange={(e) => setFormData({...formData, shelter_locations: e.target.value})} rows={2} placeholder="Primary and secondary shelter locations" />
                </div>
                <div className="space-y-2">
                  <Label>Additional Contacts</Label>
                  <Textarea value={formData.additional_contacts || ''} onChange={(e) => setFormData({...formData, additional_contacts: e.target.value})} rows={2} placeholder="Towing, elevator company, etc..." />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => { setShowDialog(false); setEditingId(null); setFormData({}); }}>
                <X className="w-4 h-4 mr-2" />Cancel
              </Button>
              <Button type="submit" disabled={savePostOrderMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                {savePostOrderMutation.isPending ? 'Saving...' : 'Save Post Orders'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* General Section Edit Dialog */}
      <Dialog open={showGeneralDialog} onOpenChange={setShowGeneralDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              {editingGeneral?.id ? 'Edit' : 'Add'} General Post Order Section
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Section Title</Label>
              <Input value={generalForm.section_title || ''} onChange={(e) => setGeneralForm({...generalForm, section_title: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={generalForm.content || ''}
                onChange={(e) => setGeneralForm({...generalForm, content: e.target.value})}
                rows={14}
                className="font-mono text-sm"
                placeholder="Enter section content..."
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => { setShowGeneralDialog(false); setEditingGeneral(null); setGeneralForm({}); }}>
                <X className="w-4 h-4 mr-2" />Cancel
              </Button>
              <Button
                disabled={saveGeneralMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                onClick={() => saveGeneralMutation.mutate(generalForm)}
              >
                <Save className="w-4 h-4 mr-2" />
                {saveGeneralMutation.isPending ? 'Saving...' : 'Save Section'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}