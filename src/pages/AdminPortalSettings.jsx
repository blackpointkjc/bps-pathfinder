import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Settings, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function AdminPortalSettings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const [hiddenPortals, setHiddenPortals] = useState(user?.hidden_portals || []);

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      alert('✅ Portal visibility settings saved! Refresh the page to see changes.');
    },
  });

  const handleTogglePortal = (portal) => {
    const newHidden = hiddenPortals.includes(portal)
      ? hiddenPortals.filter(p => p !== portal)
      : [...hiddenPortals, portal];
    setHiddenPortals(newHidden);
  };

  const handleSave = () => {
    updateSettingsMutation.mutate({ hidden_portals: hiddenPortals });
  };

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.additional_roles?.includes('supervisor');
  const isHR = user?.additional_roles?.includes('hr');
  const isClient = user?.additional_roles?.includes('client');

  const portals = [];
  
  if (!isClient) {
    portals.push({ id: 'officer', name: 'Officer Tools', available: true });
  }
  
  if (isSupervisor) {
    portals.push({ id: 'supervisor', name: 'Supervisor Portal', available: true });
  }
  
  if (isAdmin && !isClient) {
    portals.push({ id: 'admin', name: 'Admin Portal', available: true });
  }
  
  if (isHR || isAdmin) {
    portals.push({ id: 'hr', name: 'Human Resources', available: true });
  }
  
  if (isClient) {
    portals.push({ id: 'client', name: 'Client Portal', available: true });
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            Portal Visibility Settings
          </h1>
          <p className="text-slate-600">Customize which portal sections appear in your navigation</p>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
            <CardTitle>Your Available Portals</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {portals.length === 0 && (
              <p className="text-slate-500 italic">No additional portals available</p>
            )}
            
            {portals.map(portal => (
              <div key={portal.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={portal.id}
                    checked={!hiddenPortals.includes(portal.id)}
                    onCheckedChange={() => handleTogglePortal(portal.id)}
                  />
                  <Label htmlFor={portal.id} className="cursor-pointer font-medium text-slate-900">
                    {portal.name}
                  </Label>
                </div>
                <Badge className={hiddenPortals.includes(portal.id) ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                  {hiddenPortals.includes(portal.id) ? (
                    <>
                      <EyeOff className="w-3 h-3 mr-1" />
                      Hidden
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 mr-1" />
                      Visible
                    </>
                  )}
                </Badge>
              </div>
            ))}

            <div className="mt-6 pt-6 border-t">
              <Button
                onClick={handleSave}
                disabled={updateSettingsMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {updateSettingsMutation.isPending ? 'Saving...' : 'Save Visibility Settings'}
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-amber-900">
                <strong>Note:</strong> After saving, refresh the page to see your changes. Hidden portals will not appear in your sidebar navigation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}