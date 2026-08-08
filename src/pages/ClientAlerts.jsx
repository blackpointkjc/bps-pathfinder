import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Shield, Activity, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ClientAlerts() {
  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  const { data: alerts } = useQuery({
    queryKey: ['securityAlerts', clientLocations],
    queryFn: async () => {
      const allAlerts = await base44.entities.SecurityAlert.list('-created_date');
      return allAlerts.filter(alert => clientLocations.includes(alert.location));
    },
    enabled: clientLocations.length > 0,
    refetchInterval: 10000,
  });

  const activeAlerts = alerts?.filter(a => a.status === 'active') || [];
  const resolvedAlerts = alerts?.filter(a => a.status === 'resolved') || [];

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white animate-pulse';
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'emergency': return <AlertTriangle className="w-6 h-6 text-red-600" />;
      case 'incident': return <Shield className="w-6 h-6 text-orange-600" />;
      default: return <Activity className="w-6 h-6 text-blue-600" />;
    }
  };

  return (
    <div className="client-alerts-page p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Security Alerts</h1>
            <p className="text-slate-600">Real-time security alerts for your locations</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="shadow-lg border-red-200">
            <CardHeader className="bg-red-50">
              <CardTitle className="text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-red-600">{activeAlerts.length}</div>
              <p className="text-sm text-slate-600">Requiring attention</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-green-200">
            <CardHeader className="bg-green-50">
              <CardTitle className="text-green-700 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Resolved Today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-green-600">
                {resolvedAlerts.filter(a => 
                  new Date(a.resolved_time).toDateString() === new Date().toDateString()
                ).length}
              </div>
              <p className="text-sm text-slate-600">Successfully handled</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-700 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Total Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-4xl font-bold text-blue-600">{alerts?.length || 0}</div>
              <p className="text-sm text-slate-600">Last 30 days</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Active Security Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {activeAlerts.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="text-slate-600 font-semibold">All Clear</p>
                  <p className="text-sm text-slate-500">No active security alerts at this time</p>
                </div>
              )}

              {activeAlerts.map((alert) => (
                <div key={alert.id} className="p-4 border-2 border-red-200 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      {getAlertIcon(alert.alert_type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-900">{alert.location}</h3>
                          <Badge className={getSeverityColor(alert.severity)}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">{alert.alert_type.replace('_', ' ').toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-slate-700 mb-2">{alert.description}</p>
                        <p className="text-xs text-slate-500">
                          Reported: {format(new Date(alert.created_date), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Recently Resolved
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {resolvedAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="p-4 border rounded-lg bg-green-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-slate-900">{alert.location}</h3>
                      <p className="text-sm text-slate-700">{alert.description}</p>
                    </div>
                    <Badge className="bg-green-600 text-white">RESOLVED</Badge>
                  </div>
                  {alert.resolution_notes && (
                    <div className="mt-2 p-2 bg-white rounded border border-green-200">
                      <p className="text-xs font-semibold text-green-900">Resolution:</p>
                      <p className="text-sm text-green-700">{alert.resolution_notes}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Resolved: {format(new Date(alert.resolved_time), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              ))}

              {resolvedAlerts.length === 0 && (
                <p className="text-center text-slate-500 py-8">No resolved alerts</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
