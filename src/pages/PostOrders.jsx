import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, MapPin, Phone, Users, AlertTriangle, FileText, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function PostOrders() {
  const [selectedSite, setSelectedSite] = useState("");

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const locs = await listDirectoryLocations('site_name');
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
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const selectedPostOrder = postOrders?.find(po => po.site_name === selectedSite);

  const { data: siteLocation } = useQuery({
    queryKey: ['siteLocation', selectedSite],
    queryFn: async () => {
      if (!selectedSite) return null;
      const locs = await listDirectoryLocations();
      return locs.find(loc => loc.site_name === selectedSite);
    },
    enabled: !!selectedSite,
  });

  const { data: rosterEntries } = useQuery({
    queryKey: ['officerRoster'],
    queryFn: () => base44.entities.OfficerRoster.list(),
    initialData: [],
  });

  const { data: generalSections = [] } = useQuery({
    queryKey: ['generalPostOrders'],
    queryFn: () => base44.entities.GeneralPostOrder.list('sort_order'),
  });

  const getSupervisorNames = (postOrderSupervisors) => {
    // First try to get from location assignment
    const locationSupervisors = siteLocation?.assigned_supervisors;
    const supervisorsToUse = locationSupervisors && locationSupervisors.length > 0 
      ? locationSupervisors 
      : postOrderSupervisors;

    if (!supervisorsToUse || !Array.isArray(supervisorsToUse) || supervisorsToUse.length === 0) {
      return 'Not assigned';
    }
    
    const supervisorData = supervisorsToUse.map(email => {
      // First check officer roster
      const rosterEntry = rosterEntries?.find(r => r.email === email && r.status === 'active');
      if (rosterEntry) {
        return {
          email,
          rank: rosterEntry.rank || '',
          lastName: rosterEntry.last_name || '',
          firstName: rosterEntry.first_name || '',
          unitNumber: rosterEntry.unit_number || '',
        };
      }
      
      // Fall back to user entity
      const user = allUsers?.find(u => u.email === email);
      return {
        email,
        rank: user?.rank || '',
        lastName: user?.last_name || '',
        firstName: user?.first_name || '',
        unitNumber: user?.unit_number || '',
      };
    }).sort((a, b) => {
      const unitA = parseInt(a.unitNumber) || 999999;
      const unitB = parseInt(b.unitNumber) || 999999;
      return unitA - unitB;
    });

    return supervisorData.map(sup => {
      if (sup.rank && sup.lastName && sup.unitNumber) {
        return `${sup.rank} ${sup.lastName} Unit ${sup.unitNumber}`;
      }
      if (sup.rank && sup.lastName) {
        return `${sup.rank} ${sup.lastName}`;
      }
      if (sup.firstName && sup.lastName) {
        return `${sup.firstName} ${sup.lastName}`;
      }
      return sup.email;
    }).join(', ');
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-600" />
              Post Orders
            </h1>
            <p className="text-slate-600">Site-specific security protocols and procedures</p>
          </div>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
            <CardTitle>Select Your Site</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a site to view post orders..." />
              </SelectTrigger>
              <SelectContent>
                {locations?.map((location) => (
                  <SelectItem key={location.id} value={location.site_name}>
                    {location.site_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!selectedSite && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">Select a Site</h3>
              <p className="text-slate-600">Choose a site from the dropdown above to view its post orders and protocols.</p>
            </CardContent>
          </Card>
        )}

        {selectedSite && !selectedPostOrder && (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900">
              Post orders have not been configured for this site yet. Contact your supervisor or administrator.
            </AlertDescription>
          </Alert>
        )}

        {selectedSite && selectedPostOrder && (
          <div className="space-y-6">
            {/* Site Header */}
            <Card className="border-none shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Shield className="w-8 h-8" />
                  {selectedPostOrder.site_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span className="text-lg">{selectedPostOrder.site_address}</span>
                </div>
                <Badge className={`${
                  selectedPostOrder.post_type === 'armed' ? 'bg-red-600' :
                  selectedPostOrder.post_type === 'concealed_carry' ? 'bg-orange-600' :
                  'bg-green-600'
                } text-white text-lg px-4 py-1`}>
                  {selectedPostOrder.post_type === 'armed' ? 'ARMED POST' :
                   selectedPostOrder.post_type === 'concealed_carry' ? 'CONCEALED CARRY' :
                   'UNARMED POST - NO WEAPONS'}
                </Badge>
              </CardContent>
            </Card>

            {/* Contacts */}
            <Card className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  Contacts & Supervisors
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-green-700">Assigned Supervisors:</p>
                    <p className="text-slate-900 font-medium">{getSupervisorNames(selectedPostOrder.assigned_supervisors)}</p>
                  </div>
                  {selectedPostOrder.property_manager_name && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-700">Property Manager:</p>
                      <p className="text-slate-900">{selectedPostOrder.property_manager_name}</p>
                      {selectedPostOrder.property_manager_phone && (
                        <a href={`tel:${selectedPostOrder.property_manager_phone}`} className="text-green-600 hover:text-green-700 flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {selectedPostOrder.property_manager_phone}
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <Separator />
                {selectedPostOrder.maintenance_contact && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700">Maintenance Contact:</p>
                    <a href={`tel:${selectedPostOrder.maintenance_contact}`} className="text-green-600 hover:text-green-700 flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {selectedPostOrder.maintenance_contact}
                    </a>
                  </div>
                )}
                {selectedPostOrder.access_codes && (
                  <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                    <p className="text-sm font-semibold text-amber-900 mb-2">Access Codes:</p>
                    <p className="text-slate-900 font-mono">{selectedPostOrder.access_codes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Site Overview */}
            {selectedPostOrder.site_overview && (
              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Site Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-slate-700 whitespace-pre-wrap">{selectedPostOrder.site_overview}</p>
                </CardContent>
              </Card>
            )}

            {/* General Post Orders - ALWAYS SHOWN - pulled from DB */}
            <Card className="border-none shadow-xl border-4 border-slate-700">
              <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                <CardTitle className="text-xl flex items-center gap-2 text-white">
                  <Shield className="w-6 h-6" />
                  General Post Orders
                </CardTitle>
                <p className="text-sm text-slate-200 mt-2">General Security Post Orders – Black Point Protection</p>
                <p className="text-sm text-slate-200">
                  <strong className="text-white">Post Type:</strong> {selectedPostOrder.post_type === 'armed' ? 'Armed' : selectedPostOrder.post_type === 'concealed_carry' ? 'Concealed Carry' : 'Unarmed'}
                </p>
                <p className="text-sm text-slate-200">
                  <strong className="text-white">DCJS Compliance:</strong> All officers must maintain current certification and comply with Virginia Department of Criminal Justice Services (DCJS) regulations.
                </p>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {generalSections.filter(s => s.active).map((section, idx) => (
                  <div key={section.id}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 mb-3">{section.section_title}</h3>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{section.content}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Patrol Schedule */}
            {selectedPostOrder.patrol_schedule && (
              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-600" />
                    Patrol Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-slate-700 whitespace-pre-wrap">{selectedPostOrder.patrol_schedule}</p>
                  {selectedPostOrder.patrol_areas && (
                    <>
                      <Separator className="my-4" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">Patrol Areas:</p>
                        <p className="text-slate-700 whitespace-pre-wrap">{selectedPostOrder.patrol_areas}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Special Duties & Instructions */}
            {(selectedPostOrder.special_duties || selectedPostOrder.special_instructions) && (
              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-orange-600" />
                    Duties & Special Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {selectedPostOrder.special_duties && (
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">Special Duties:</p>
                      <p className="text-slate-700 whitespace-pre-wrap">{selectedPostOrder.special_duties}</p>
                    </div>
                  )}
                  {selectedPostOrder.special_instructions && (
                    <>
                      {selectedPostOrder.special_duties && <Separator />}
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                        <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Important Instructions:
                        </p>
                        <p className="text-slate-900 whitespace-pre-wrap">{selectedPostOrder.special_instructions}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Emergency Contacts */}
            <Card className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Emergency Contacts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-3 bg-red-50 rounded-lg border-2 border-red-300">
                    <p className="text-sm font-semibold text-red-900 mb-1">Emergency Police:</p>
                    <a href={`tel:${selectedPostOrder.emergency_police || '911'}`} className="text-2xl font-bold text-red-600">
                      {selectedPostOrder.emergency_police || '911'}
                    </a>
                  </div>
                  {selectedPostOrder.non_emergency_police && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm font-semibold text-blue-900 mb-1">Non-Emergency:</p>
                      <a href={`tel:${selectedPostOrder.non_emergency_police}`} className="text-xl font-bold text-blue-600">
                        {selectedPostOrder.non_emergency_police}
                      </a>
                    </div>
                  )}
                </div>
                {selectedPostOrder.police_precinct_address && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm font-semibold text-slate-700 mb-1">Police Precinct:</p>
                    <p className="text-slate-900">{selectedPostOrder.police_precinct_address}</p>
                  </div>
                )}
                {selectedPostOrder.additional_contacts && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm font-semibold text-purple-900 mb-1">Additional Contacts:</p>
                    <p className="text-slate-900 whitespace-pre-wrap">{selectedPostOrder.additional_contacts}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}