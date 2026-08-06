import { getClientPortalUser } from '@/utils/clientPreview';
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, AlertTriangle, UserX, Calendar, MapPin, ArrowRight, TrendingUp, Clock, Radio } from "lucide-react";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import QuickActionCard from "../components/dashboard/QuickActionCard";


const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/c29aab328_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

export default function ClientDashboard() {
  const [selectedLocation, setSelectedLocation] = useState("");
  
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getClientPortalUser,
  });

  const isClient = user?.additional_roles?.includes('client');
  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  useEffect(() => {
    if (clientLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(clientLocations[0]);
    }
  }, [clientLocations, selectedLocation]);

  const effectiveLocation = selectedLocation || clientLocations[0];

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: location } = useQuery({
    queryKey: ['clientLocation', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return null;
      const locations = await base44.entities.Location.list();
      return locations.find(loc => loc.site_name === effectiveLocation);
    },
    enabled: !!effectiveLocation,
  });

  const { data: reports } = useQuery({
    queryKey: ['clientReports', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return { shift: [], incident: [], trespass: [], parking: [], maintenance: [], opendoor: [], criminal: [] };
      
      const [shift, incident, trespass, parking, maintenance, opendoor, criminal] = await Promise.all([
        base44.entities.ShiftReport.list('-created_date'),
        base44.entities.IncidentReport.list('-created_date'),
        base44.entities.TrespassingNotice.list('-created_date'),
        base44.entities.ParkingViolation.list('-created_date'),
        base44.entities.MaintenanceReport.list('-created_date'),
        base44.entities.OpenDoorReport.list('-created_date'),
        base44.entities.CriminalComplaint.list('-created_date'),
      ]);

      return {
        shift: shift.filter(r => r.location === effectiveLocation && r.status === 'approved'),
        incident: incident.filter(r => r.location === effectiveLocation && r.status === 'approved'),
        trespass: trespass.filter(r => r.location === effectiveLocation && r.status === 'approved'),
        parking: parking.filter(r => r.location === effectiveLocation && r.status === 'approved'),
        maintenance: maintenance.filter(r => r.location === effectiveLocation),
        opendoor: opendoor.filter(r => r.location === effectiveLocation),
        criminal: criminal.filter(r => r.location === effectiveLocation && r.status === 'approved'),
      };
    },
    enabled: !!effectiveLocation,
  });

  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection to assign your account to a location.</p>
      </div>
    );
  }

  const totalReports = Object.values(reports || {}).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {clientLocations.length > 1 && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <MapPin className="w-8 h-8 text-purple-600" />
                <div className="flex-1">
                  <Label className="text-sm font-semibold text-purple-900 mb-2 block">
                    Select Location to View
                  </Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select a location to view..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locName) => (
                        <SelectItem key={locName} value={locName}>
                          {locName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome, {user?.first_name || 'Client'}!
          </h1>
          <div className="flex items-center gap-2 text-lg text-slate-600">
            <MapPin className="w-5 h-5" />
            {location?.site_name}
          </div>
          <p className="text-sm text-slate-500 mt-1">{location?.address}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-blue-900">Total Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-blue-900">{totalReports}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Incidents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{reports?.incident.length || 0}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserX className="w-4 h-4 text-orange-600" />
                Trespass
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{reports?.trespass.length || 0}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" /> {/* Changed from Car */}
                Shift Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{reports?.shift.length || 0}</p> {/* Changed from parking */}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to={createPageUrl("ClientCallHistory")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-slate-900 to-blue-950 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-amber-400" />
                  Calls for Service
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-600 text-sm">View active and archived police, fire, EMS, and BPS calls verified for your property</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientReports")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  View All Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-600 text-sm">Access all approved reports for your location</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientTrespass")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
                <CardTitle className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-orange-600" />
                  Trespass Management
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-600 text-sm">Update trespass notice expiration dates</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientLocation")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-600" />
                  Location Info
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-600 text-sm">View and update your location details</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
