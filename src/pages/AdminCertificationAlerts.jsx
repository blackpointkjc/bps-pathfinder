import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingCreate, trainingUpdate } from '@/lib/trainingRecordsApi';
import { listTrainingUsers } from '@/lib/trainingDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertTriangle, CheckCircle2, RefreshCw, Printer } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminCertificationAlerts({ embedded = false }) {
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [notes, setNotes] = useState("");
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const userRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasTrainingAccess = user?.role === 'admin' || userRoles.has('trainer') || userRoles.has('full_access');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['trainingUsers'],
    queryFn: () => listTrainingUsers(true),
    enabled: hasTrainingAccess,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: certificationAlerts = [] } = useQuery({
    queryKey: ['certificationAlerts'],
    queryFn: () => base44.entities.CertificationTodo.list('-days_until_expiration'),
    enabled: hasTrainingAccess,
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: ({ id, notes }) => trainingUpdate('CertificationTodo', id, {
      completed: true,
      notes: notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificationAlerts'] });
      setSelectedAlert(null);
      setNotes("");
    },
  });

  const manualCheckMutation = useMutation({
    mutationFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let newAlertsCreated = 0;
      let alertsUpdated = 0;
      
      for (const officer of allUsers.filter(hasOfficerAdditionalRole)) {
        // Skip terminated officers
        if (officer.status === 'terminated' || officer.termination_date) continue;
        
        // Skip users without certifications
        if (!officer.dcjs_expiration && !officer.firearm_expiration) continue;
        
        // Check DCJS expiration
        if (officer.dcjs_expiration) {
          const dcjsDate = parseISO(officer.dcjs_expiration);
          const daysUntil = differenceInDays(dcjsDate, today);
          
          if (daysUntil <= 60 && daysUntil >= 0) {
            // Check if alert already exists
            const existingAlert = certificationAlerts?.find(
              a => a.officer_email === officer.email && 
                   a.certification_type === 'dcjs' && 
                   !a.completed
            );
            
            if (existingAlert) {
              // Update existing alert
              await trainingUpdate('CertificationTodo', existingAlert.id, {
                days_until_expiration: daysUntil,
                last_alert_date: new Date().toISOString()
              });
              alertsUpdated++;
            } else {
              // Create new alert
              await trainingCreate('CertificationTodo', {
                officer_email: officer.email,
                officer_name: `${officer.first_name} ${officer.last_name}`,
                certification_type: 'dcjs',
                expiration_date: officer.dcjs_expiration,
                days_until_expiration: daysUntil,
                completed: false,
                last_alert_date: new Date().toISOString()
              });
              newAlertsCreated++;
            }
          }
        }
        
        // Check Firearm expiration
        if (officer.firearm_expiration) {
          const firearmDate = parseISO(officer.firearm_expiration);
          const daysUntil = differenceInDays(firearmDate, today);
          
          if (daysUntil <= 60 && daysUntil >= 0) {
            // Check if alert already exists
            const existingAlert = certificationAlerts?.find(
              a => a.officer_email === officer.email && 
                   a.certification_type === 'firearm' && 
                   !a.completed
            );
            
            if (existingAlert) {
              // Update existing alert
              await trainingUpdate('CertificationTodo', existingAlert.id, {
                days_until_expiration: daysUntil,
                last_alert_date: new Date().toISOString()
              });
              alertsUpdated++;
            } else {
              // Create new alert
              await trainingCreate('CertificationTodo', {
                officer_email: officer.email,
                officer_name: `${officer.first_name} ${officer.last_name}`,
                certification_type: 'firearm',
                expiration_date: officer.firearm_expiration,
                days_until_expiration: daysUntil,
                completed: false,
                last_alert_date: new Date().toISOString()
              });
              newAlertsCreated++;
            }
          }
        }
      }
      
      return { newAlertsCreated, alertsUpdated };
    },
    onSuccess: ({ newAlertsCreated, alertsUpdated }) => {
      queryClient.invalidateQueries({ queryKey: ['certificationAlerts'] });
      setIsRunningCheck(false);
      alert(`Certification check complete!\n\nNew alerts created: ${newAlertsCreated}\nExisting alerts updated: ${alertsUpdated}`);
    },
    onError: () => {
      setIsRunningCheck(false);
      alert('Error running certification check. Please try again.');
    },
  });

  const handleManualCheck = () => {
    if (confirm('This will check all officers for expiring certifications (DCJS and Firearm within 60 days). Continue?')) {
      setIsRunningCheck(true);
      manualCheckMutation.mutate();
    }
  };

  const handleAcknowledge = () => {
    if (selectedAlert) {
      acknowledgeAlertMutation.mutate({ id: selectedAlert.id, notes });
    }
  };

  const handlePrintAlerts = () => {
    const PRINT_LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

    const printWindow = window.open('', '_blank');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Certification Alerts Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #1e293b;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #dc2626;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #dc2626;
            margin: 0 0 10px 0;
            font-size: 28px;
          }
          .header p {
            color: #64748b;
            margin: 5px 0;
          }
          .alert-section {
            margin-bottom: 40px;
          }
          .section-title {
            background: #fef2f2;
            border-left: 4px solid #dc2626;
            padding: 12px 16px;
            font-size: 18px;
            font-weight: bold;
            color: #991b1b;
            margin-bottom: 20px;
          }
          .alert-item {
            border: 2px solid #fed7aa;
            background: #fff7ed;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            page-break-inside: avoid;
          }
          .alert-item.critical {
            border-color: #fca5a5;
            background: #fef2f2;
          }
          .alert-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .alert-name {
            font-size: 18px;
            font-weight: bold;
            color: #0f172a;
          }
          .alert-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
          }
          .alert-badge.critical {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
          }
          .alert-badge.warning {
            background: #fed7aa;
            color: #9a3412;
            border: 1px solid #fb923c;
          }
          .alert-details {
            margin-top: 8px;
          }
          .alert-row {
            margin: 6px 0;
            font-size: 14px;
            color: #475569;
          }
          .alert-row strong {
            color: #0f172a;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            color: #64748b;
            font-size: 12px;
          }
          @media print {
            body { margin: 20px; }
            .alert-item { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🛡️ CERTIFICATION ALERTS REPORT</h1>
          <p>Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
          <p>Total Active Alerts: ${activeAlerts.length}</p>
        </div>

        ${activeAlerts.length > 0 ? `
          <div class="alert-section">
            <div class="section-title">⚠️ ACTIVE CERTIFICATION ALERTS</div>
            ${activeAlerts.map(alert => `
              <div class="alert-item ${alert.days_until_expiration <= 30 ? 'critical' : ''}">
                <div class="alert-header">
                  <div class="alert-name">${alert.officer_name}</div>
                  <span class="alert-badge ${alert.days_until_expiration <= 30 ? 'critical' : 'warning'}">
                    ${alert.days_until_expiration} DAYS REMAINING
                  </span>
                </div>
                <div class="alert-details">
                  <div class="alert-row">
                    <strong>Certification Type:</strong> ${alert.certification_type.toUpperCase()}
                  </div>
                  <div class="alert-row">
                    <strong>Expiration Date:</strong> ${format(parseISO(alert.expiration_date), 'MMMM d, yyyy')}
                  </div>
                  <div class="alert-row">
                    <strong>Officer Email:</strong> ${alert.officer_email}
                  </div>
                  ${alert.last_alert_date ? `
                    <div class="alert-row">
                      <strong>Last Checked:</strong> ${format(parseISO(alert.last_alert_date), 'MMM d, yyyy h:mm a')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="alert-section">
            <div class="section-title">✅ NO ACTIVE ALERTS</div>
            <p style="text-align: center; color: #059669; padding: 20px;">
              All officer certifications are current or have been acknowledged.
            </p>
          </div>
        `}

        <div class="footer">
          <p>Confidential Document - Internal Use Only</p>
          <p>This report contains sensitive officer certification information</p>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (!hasTrainingAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Trainer Access Required</h2>
        <p className="text-slate-600">You need Trainer access to manage certification alerts.</p>
      </div>
    );
  }

  const officerEmails = new Set(allUsers.filter(hasOfficerAdditionalRole).map(officer => String(officer.email || '').toLowerCase()));
  const visibleAlerts = (certificationAlerts || []).filter(alert => officerEmails.has(String(alert.officer_email || '').toLowerCase()));
  const activeAlerts = visibleAlerts.filter(a => !a.completed);
  const completedAlerts = visibleAlerts.filter(a => a.completed);

  return (
    <div className={embedded ? "w-full" : "p-4 md:p-8 min-h-screen"}>
      <div className={embedded ? "w-full space-y-5" : "max-w-6xl mx-auto space-y-8"}>
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Certification Alerts</h1>
              <p className="text-slate-600">Monitor officer certifications expiring within 60 days</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handlePrintAlerts}
              variant="outline"
              className="border-slate-300"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
            <Button
              onClick={handleManualCheck}
              disabled={isRunningCheck}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRunningCheck ? 'animate-spin' : ''}`} />
              {isRunningCheck ? 'Checking...' : 'Run Manual Check'}
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Active Alerts ({activeAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {activeAlerts.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <p className="text-slate-600 text-lg">No active certification alerts</p>
                <p className="text-slate-500 text-sm mt-2">All officer certifications are current or have been acknowledged</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-5 rounded-lg border-2 cursor-pointer transition-all ${
                      alert.days_until_expiration <= 30
                        ? 'bg-red-50 border-red-300 hover:bg-red-100'
                        : 'bg-orange-50 border-orange-300 hover:bg-orange-100'
                    }`}
                    onClick={() => {
                      setSelectedAlert(alert);
                      setNotes(alert.notes || "");
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-lg text-slate-900">{alert.officer_name}</h3>
                          <Badge variant="outline" className={
                            alert.days_until_expiration <= 30
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-orange-100 text-orange-800 border-orange-300'
                          }>
                            {alert.days_until_expiration} days remaining
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mb-1">
                          <span className="font-semibold">{alert.certification_type.toUpperCase()}</span> expires on{' '}
                          {format(parseISO(alert.expiration_date), 'MMMM d, yyyy')}
                        </p>
                        <p className="text-xs text-slate-500">
                          Officer: {alert.officer_email}
                        </p>
                        {alert.last_alert_date && (
                          <p className="text-xs text-slate-500 mt-1">
                            Last checked: {format(parseISO(alert.last_alert_date), 'MMM d, yyyy h:mm a')}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAlert(alert);
                          setNotes(alert.notes || "");
                        }}
                        className="text-green-600 border-green-300 hover:bg-green-50"
                      >
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Acknowledged Alerts ({completedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {completedAlerts.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No acknowledged alerts yet</p>
            ) : (
              <div className="space-y-3">
                {completedAlerts.map((alert) => (
                  <div key={alert.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-900">{alert.officer_name}</h3>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                        Acknowledged
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {alert.certification_type.toUpperCase()} - Expired/Expiring {format(parseISO(alert.expiration_date), 'MMM d, yyyy')}
                    </p>
                    {alert.notes && (
                      <p className="text-xs text-slate-500 mt-2 bg-white p-2 rounded border border-slate-200">
                        <strong>Notes:</strong> {alert.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedAlert && (
        <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Acknowledge Certification Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="font-semibold">{selectedAlert.officer_name}</p>
                <p className="text-sm text-slate-600">
                  {selectedAlert.certification_type.toUpperCase()} certification expires on{' '}
                  {format(parseISO(selectedAlert.expiration_date), 'MMMM d, yyyy')}
                </p>
                <p className="text-sm text-slate-600">
                  Days remaining: <strong>{selectedAlert.days_until_expiration}</strong>
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Follow-up Notes</label>
                <Textarea
                  placeholder="Add notes about follow-up actions taken..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAcknowledge}
                  disabled={acknowledgeAlertMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {acknowledgeAlertMutation.isPending ? 'Acknowledging...' : 'Acknowledge Alert'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}