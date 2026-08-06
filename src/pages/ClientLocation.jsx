import { getClientPortalUser } from '@/utils/clientPreview';
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Mail, Calendar, Shield, Edit, Save, X } from "lucide-react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/c29aab328_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

export default function ClientLocation() {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    address: "",
    site_email: "",
    notes: "",
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getClientPortalUser,
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  useEffect(() => {
    if (clientLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(clientLocations[0]);
    }
  }, [clientLocations, selectedLocation]);

  const effectiveLocation = selectedLocation || clientLocations[0];

  const { data: location } = useQuery({
    queryKey: ['clientLocation', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return null;
      const allLocations = await base44.entities.Location.list(); // Fetch all to find by site_name
      const loc = allLocations.find(l => l.site_name === effectiveLocation);
      if (loc) {
        setFormData({
          address: loc.address || "",
          site_email: loc.site_email || "",
          notes: loc.notes || "",
        });
      }
      return loc;
    },
    enabled: !!effectiveLocation,
  });

  const updateLocationMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.update(location.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientLocation', effectiveLocation] });
      // Invalidate allLocations as well, in case we update something that changes its filter criteria
      queryClient.invalidateQueries({ queryKey: ['allLocations'] });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    updateLocationMutation.mutate(formData);
  };

  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection.</p>
      </div>
    );
  }


  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Location Information</h1>
          <p className="text-slate-600">View and update your location details</p>
        </div>

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

        {location && ( // Only render the card if a location is loaded
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-green-600" />
                  {location?.site_name}
                </CardTitle>
                {!isEditing && (
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Information
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Address</Label>
                {isEditing ? (
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                ) : (
                  <p className="text-lg">{location?.address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Contact Email</Label>
                {isEditing ? (
                  <Input
                    type="email"
                    value={formData.site_email}
                    onChange={(e) => setFormData({ ...formData, site_email: e.target.value })}
                  />
                ) : (
                  <p className="text-lg">{location?.site_email || 'Not provided'}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                {isEditing ? (
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={4}
                  />
                ) : (
                  <p className="text-lg">{location?.notes || 'No additional notes'}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Division</Label>
                <p className="text-lg">{location?.division || 'Not assigned'}</p>
              </div>

              <div className="space-y-2">
                <Label>Contract Period</Label>
                <p className="text-lg">
                  {location?.contract_start_date || location?.contract_end_date
                    ? `${location.contract_start_date ? format(new Date(location.contract_start_date), 'PPP') : 'N/A'} to ${location.contract_end_date ? format(new Date(location.contract_end_date), 'PPP') : 'N/A'}`
                    : 'Not specified'}
                </p>
              </div>

              {isEditing && (
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => {
                    setIsEditing(false);
                    // Reset formData if editing is cancelled
                    setFormData({
                      address: location.address || "",
                      site_email: location.site_email || "",
                      notes: location.notes || "",
                    });
                  }}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={updateLocationMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
