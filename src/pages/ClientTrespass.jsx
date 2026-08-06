import { getClientPortalUser } from '@/utils/clientPreview';
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserX, Calendar, AlertTriangle, Eye, Shield, Mail, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { openTrespassNoticePrint, resolvePoliceDepartment } from "@/utils/trespassNoticePrint";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

export default function ClientTrespass() {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(null);
  const [newExpiration, setNewExpiration] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getClientPortalUser,
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['clientTrespassLocations'],
    queryFn: () => base44.entities.Location.list('site_name'),
    initialData: [],
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  useEffect(() => {
    if (clientLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(clientLocations[0]);
    }
  }, [clientLocations, selectedLocation]);

  const effectiveLocation = selectedLocation || clientLocations[0];

  const getOfficerFullDisplay = (email) => {
    if (email === 'OPEN') return 'OPEN SHIFT';
    if (!email || !allUsers || allUsers.length === 0) return email || 'Officer';
    
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return email || 'Officer';

    const lastName = officer.last_name || '';
    const rank = officer.rank || '';
    
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    if (lastName) {
      return lastName;
    }
    if (rank) {
      return rank;
    }
    return email || 'Officer';
  };

  const getOfficerSignature = (email) => {
    if (email === 'OPEN') return 'OPEN SHIFT';
    if (!email || !allUsers || allUsers.length === 0) return email || 'Officer';
    
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return email || 'Officer';

    const lastName = officer.last_name || '';
    const rank = officer.rank || '';
    
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    if (lastName) {
      return lastName;
    }
    if (rank) {
      return rank;
    }
    return email || 'Officer';
  };

  const { data: notices } = useQuery({
    queryKey: ['clientTrespassNotices', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return [];
      const allNotices = await base44.entities.TrespassingNotice.list('-created_date');
      return allNotices.filter(n => n.location === effectiveLocation && n.status === 'approved');
    },
    enabled: !!effectiveLocation,
  });

  const updateExpirationMutation = useMutation({
    mutationFn: ({ id, expiration }) => {
      // The backend field is expiration_date, not duration
      return base44.entities.TrespassingNotice.update(id, { expiration_date: expiration });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientTrespassNotices'] });
      setShowEditDialog(null);
      setNewExpiration("");
    },
  });

  const requestNoticeMutation = useMutation({
    mutationFn: async (notice) => {
      const adminUsers = allUsers?.filter(u => u.role === 'admin') || [];

      for (const admin of adminUsers) {
        await base44.integrations.Core.SendEmail({
          from_name: "Black Point Portal Client Portal",
          to: admin.email,
          subject: `Trespass Notice Request from ${user?.full_name || user?.email}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">📧 Trespass Notice Request</h1>
              </div>
              
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 2px solid #e5e7eb;">
                <p style="font-size: 16px; margin-bottom: 20px;">A client has requested a copy of a trespass notice be emailed to them.</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #7c3aed; margin: 20px 0;">
                  <h3 style="color: #7c3aed; margin-top: 0;">Client Information</h3>
                  <p><strong>Name:</strong> ${user?.full_name || 'N/A'}</p>
                  <p><strong>Email:</strong> ${user?.email}</p>
                  <p><strong>Location:</strong> ${effectiveLocation}</p>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
                  <h3 style="color: #ef4444; margin-top: 0;">Trespass Notice Details</h3>
                  <p><strong>Subject:</strong> ${notice.subject_name}</p>
                  <p><strong>Date Issued:</strong> ${format(new Date(notice.notice_date), 'MMMM d, yyyy h:mm a')}</p>
                  <p><strong>Officer:</strong> ${getOfficerFullDisplay(notice.created_by)}</p>
                  <p><strong>Expiration:</strong> ${notice.expiration_date ? format(new Date(notice.expiration_date), 'MMMM d, yyyy') : 'Permanent'}</p>
                  <p><strong>Notice ID:</strong> ${notice.id}</p>
                </div>

                <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #1e40af; font-weight: bold;">📝 Action Required:</p>
                  <p style="margin: 5px 0 0 0; color: #1e3a8a;">
                    Please email the requested trespass notice to ${user?.email} at your earliest convenience.
                  </p>
                </div>
              </div>
            </div>
          `
        });
      }
    },
    onSuccess: () => {
      alert('Notice request sent to administrators. You will receive it via email shortly.');
    },
    onError: (error) => {
      alert('Failed to send request. Please try again.');
      console.error('Error requesting notice:', error);
    }
  });

  const handleViewNotice = (notice) => {
    setSelectedNotice(notice);
    setShowViewDialog(true);
  };

  const handleEditExpiration = (notice) => {
    setShowEditDialog(notice.id);
    // Format the existing expiration_date to 'YYYY-MM-DD' for date input
    setNewExpiration(notice.expiration_date ? format(new Date(notice.expiration_date), 'yyyy-MM-dd') : "");
  };

  const handleSaveExpiration = (noticeId) => {
    if (!newExpiration.trim()) {
      alert("Please select an expiration date"); // Updated alert message
      return;
    }
    updateExpirationMutation.mutate({ id: noticeId, expiration: newExpiration });
  };

  const isExpired = (notice) => {
    if (!notice.expiration_date) return false; // If no expiration date, it's permanent or indefinite
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(notice.expiration_date);
    expDate.setHours(0, 0, 0, 0);
    return today > expDate;
  };

  const printNotice = (notice) => {
    const issuerSignature = getOfficerSignature(notice.created_by);
    const site = locations.find(loc => loc.site_name === notice.location);
    openTrespassNoticePrint(notice, {
      jurisdiction: 'VA',
      locationRecord: site || { site_name: notice.location, division: 'Virginia' },
      propertyName: site?.site_name || notice.location,
      propertyAddress: site?.address || notice.location,
      senderName: 'Black Point Protection',
      senderAddress: site?.address || notice.location,
      officerName: getOfficerFullDisplay(notice.created_by),
      signatureName: '',
      policeDepartment: resolvePoliceDepartment(site || { site_name: notice.location, division: 'Virginia' }),
    });
    return;

    const printWindow = window.open('', '', 'width=800,height=600');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Trespass Notice - ${notice.subject_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.35in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 0; margin: 0; line-height: 1.15; color: #000; font-size: 9px; }
          .citation-border { border: 3px double #000; padding: 10px; }
          .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 5px; margin-bottom: 6px; page-break-inside: avoid; }
          .header-logo { width: 50px; height: 50px; object-fit: contain; margin: 0 auto 5px; display: block; }
          .header h1 { font-size: 15px; font-weight: bold; margin: 2px 0; letter-spacing: 1px; }
          .header h2 { font-size: 11px; font-weight: bold; margin: 2px 0; }
          .header .subtitle { font-size: 8px; margin: 2px 0; }
          .notice-number { text-align: right; font-weight: bold; font-size: 8px; margin-bottom: 6px; }
          .warning-banner { background: #fee2e2; border: 2px solid #dc2626; padding: 5px; text-align: center; font-weight: bold; font-size: 9px; margin-bottom: 6px; color: #991b1b; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 6px; }
          .info-item { padding: 3px; }
          .info-label { font-weight: bold; font-size: 7px; text-transform: uppercase; margin-bottom: 1px; }
          .info-value { font-size: 9px; font-weight: 600; }
          .section { margin: 5px 0; page-break-inside: avoid; }
          .section-title { font-weight: bold; font-size: 8px; margin-bottom: 2px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 1px; }
          .section-content { padding: 4px; border: 2px solid #000; white-space: pre-wrap; line-height: 1.25; font-size: 8px; min-height: 30px; }
          .notice-box { border: 2px solid #000; padding: 4px; margin: 4px 0; font-size: 7px; background: #fff8dc; }
          .notice-box h3 { margin: 0 0 2px 0; font-size: 8px; font-weight: bold; }
          .notice-box p { margin: 2px 0; line-height: 1.2; }
          .signature-section { margin-top: 8px; padding-top: 6px; border-top: 2px solid #000; }
          .signature-line { border-bottom: 2px solid #000; width: 200px; margin: 12px 0 4px 0; min-height: 20px; position: relative; }
          .signature-text { font-family: 'Brush Script MT', cursive; font-size: 18px; font-style: italic; color: #000; position: absolute; bottom: 2px; left: 0; }
          .signature-label { font-size: 7px; font-weight: bold; }
          .issuer-info { margin-top: 4px; font-size: 7px; }
          .footer { margin-top: 6px; padding-top: 4px; border-top: 2px solid #000; text-align: center; font-size: 6px; }
          @media print { body { margin: 0; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="citation-border">
          <div class="header">
            <img src="${LOGO_URL}" alt="Black Point Protection" class="header-logo" />
            <h1>TRESPASS NOTICE</h1>
            <h2>OFFICIAL WARNING</h2>
            <div class="subtitle"><strong>${notice.location}</strong></div>
            <div class="subtitle">${format(new Date(notice.notice_date), 'MMMM d, yyyy')}</div>
          </div>
          <div class="notice-number">NOTICE NO: ${notice.id.substring(0, 8).toUpperCase()}</div>
          <div class="warning-banner">OFFICIAL TRESPASS NOTICE - LEGAL DOCUMENT</div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Subject Name</div><div class="info-value">${notice.subject_name}</div></div>
            <div class="info-item"><div class="info-label">Date Issued</div><div class="info-value">${format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</div></div>
            ${notice.subject_id ? `<div class="info-item"><div class="info-label">ID Number</div><div class="info-value">${notice.subject_id}</div></div>` : ''}
            <div class="info-item"><div class="info-label">Expiration Date</div><div class="info-value">${notice.expiration_date ? format(new Date(notice.expiration_date), 'MMM d, yyyy') : 'Permanent'}</div></div>
            ${notice.police_report_number ? `<div class="info-item"><div class="info-label">Police Report #</div><div class="info-value">${notice.police_report_number}</div></div>` : ''}
          </div>
          ${notice.subject_description ? `<div class="section"><div class="section-title">Physical Description</div><div class="section-content">${notice.subject_description}</div></div>` : ''}
          <div class="section"><div class="section-title">Reason for Trespass Notice</div><div class="section-content">${notice.reason}</div></div>
          ${notice.vehicle_info ? `<div class="section"><div class="section-title">Vehicle Information</div><div class="section-content">${notice.vehicle_info}</div></div>` : ''}
          <div class="notice-box">
            <h3>LEGAL NOTICE</h3>
            <p><strong>You are hereby notified that you are not permitted on this property until ${notice.expiration_date ? format(new Date(notice.expiration_date), 'MMMM d, yyyy') : 'an indefinite time'}.</strong></p>
            <p>Violation may result in arrest under Virginia Code § 18.2-119.</p>
            ${notice.police_notified ? '<p style="font-weight: bold;">Police notified.</p>' : ''}
          </div>
          <div class="signature-section">
            <p class="signature-label">ISSUED BY:</p>
            <div class="signature-line"></div>
            <div class="issuer-info">
              <p><strong>Date Signed:</strong> ____________________</p>
              <p><strong>Agency:</strong> Black Point Protection</p>
              <p><strong>Location:</strong> ${notice.location}</p>
              <p><strong>Date:</strong> ${format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</p>
            </div>
          </div>
          <div class="footer">
            <p><strong>BLACK POINT PROTECTION</strong> | Richmond, VA | Printed ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection to assign a location to your account.</p>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Trespass Management</h1>
          <p className="text-slate-600">View and manage trespass notices for {effectiveLocation}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {notices?.map((notice) => (
            <Card key={notice.id} className={`border-l-4 ${isExpired(notice) ? 'border-l-gray-400' : 'border-l-red-600'}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg">{notice.subject_name}</span>
                  <Badge className={isExpired(notice) ? "bg-gray-600 text-white" : "bg-red-600 text-white"}>
                    {isExpired(notice) ? 'Expired' : 'Active'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="text-slate-600"><strong>Date Issued:</strong> {format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</p>
                  <p className="text-slate-600"><strong>Issuing Officer:</strong> <span className="italic text-slate-400">[Redacted]</span></p>
                  <p className="text-slate-600"><strong>Expiration:</strong> {notice.expiration_date ? format(new Date(notice.expiration_date), 'MMM d, yyyy') : 'Permanent'}</p>
                  {isExpired(notice) && (
                    <p className="text-red-600 font-semibold mt-2">⚠️ This notice has expired</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleViewNotice(notice)}>
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => requestNoticeMutation.mutate(notice)}
                    disabled={requestNoticeMutation.isPending}
                    className="text-purple-600 hover:bg-purple-50"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Request via Email
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditExpiration(notice)} className="text-blue-600 hover:bg-blue-50">
                    <Calendar className="w-4 h-4 mr-2" />
                    Update Date
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!notices?.length && (
            <Card className="border-none shadow-lg col-span-full">
              <CardContent className="p-12 text-center">
                <UserX className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No trespass notices found</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* View Dialog */}
      {selectedNotice && (
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <img src={LOGO_URL} alt="Black Point Protection" className="w-10 h-10" />
                TRESPASS NOTICE
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 p-6">
              <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-6 py-4 border-b-2 border-red-200">
                  <h3 className="text-xl font-bold text-red-900">{selectedNotice.subject_name}</h3>
                  <p className="text-sm text-red-700">{selectedNotice.location}</p>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-semibold text-slate-700">Date Issued:</span>
                      <p className="text-slate-900">{format(new Date(selectedNotice.notice_date), 'MMMM d, yyyy h:mm a')}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Expiration Date:</span>
                      <p className="text-slate-900">{selectedNotice.expiration_date ? format(new Date(selectedNotice.expiration_date), 'MMMM d, yyyy') : 'Permanent'}</p>
                    </div>
                  </div>
                  
                  <div>
                      <span className="font-semibold text-slate-700">Issuing Officer:</span>
                      <p className="text-slate-500 italic">[Redacted]</p>
                    </div>

                  {selectedNotice.subject_description && (
                    <div>
                      <span className="font-semibold text-slate-700">Physical Description:</span>
                      <p className="text-slate-900">{selectedNotice.subject_description}</p>
                    </div>
                  )}

                  {selectedNotice.subject_id && (
                    <div>
                      <span className="font-semibold text-slate-700">ID Number:</span>
                      <p className="text-slate-900">{selectedNotice.subject_id}</p>
                    </div>
                  )}

                  {selectedNotice.vehicle_info && (
                    <div>
                      <span className="font-semibold text-slate-700">Vehicle Information:</span>
                      <p className="text-slate-900">{selectedNotice.vehicle_info}</p>
                    </div>
                  )}

                  <div className="pt-4 border-t-2 border-slate-200">
                    <span className="font-semibold text-slate-700 block mb-2">Reason for Notice:</span>
                    <div className="bg-slate-50 p-4 rounded whitespace-pre-wrap text-slate-900">{selectedNotice.reason}</div>
                  </div>

                  {selectedNotice.photo_url && (
                    <div className="pt-4 border-t-2 border-slate-200">
                      <span className="font-semibold text-slate-700 block mb-2">Photo:</span>
                      <img src={selectedNotice.photo_url} alt="Subject" className="max-w-full rounded border-2 border-slate-200" />
                    </div>
                  )}

                  <div className="pt-4 border-t-2 border-slate-200 bg-yellow-50 p-4 rounded">
                    <p className="font-bold text-yellow-900 mb-2">LEGAL NOTICE</p>
                    <p className="text-sm text-yellow-900">
                      You are hereby notified that you are not permitted on this property until {selectedNotice.expiration_date ? format(new Date(selectedNotice.expiration_date), 'MMMM d, yyyy') : 'an indefinite time'}. 
                      Violation may result in arrest under Virginia Code § 18.2-119.
                    </p>
                    {selectedNotice.police_notified && (
                      <p className="text-sm font-bold text-red-700 mt-2">Police have been notified.</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowViewDialog(false)}>
                  Close
                </Button>
                <Button 
                  onClick={() => requestNoticeMutation.mutate(selectedNotice)} 
                  disabled={requestNoticeMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Request via Email
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Expiration Dialog */}
      <Dialog open={!!showEditDialog} onOpenChange={() => setShowEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Trespass Expiration Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expiration">Expiration Date *</Label>
              <Input
                id="expiration"
                type="date"
                value={newExpiration}
                onChange={(e) => setNewExpiration(e.target.value)}
              />
              <p className="text-xs text-slate-500">Select the date when this trespass notice should expire. Leave blank for permanent.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowEditDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleSaveExpiration(showEditDialog)}
                disabled={updateExpirationMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {updateExpirationMutation.isPending ? 'Saving...' : 'Save Expiration Date'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
