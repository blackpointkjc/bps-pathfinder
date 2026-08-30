import { uploadInternalFile } from '@/lib/internalUpload';
// Copy of TrespassingNotices.js renamed to VA Trespass Notices
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { completeReportTodo } from '@/lib/reportTodoApi';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserX, Plus, AlertTriangle, Printer, Eye, Search, Pencil, Camera } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IDScanner from "../components/IDScanner";
import SignaturePad from "../components/SignaturePad";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { openTrespassNoticePrint, resolvePoliceDepartment } from '@/utils/trespassNoticePrint';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';
import { formatReportDateTime, resolveReportTimeZone } from '@/lib/reportPrint';
import { createReportCallLink } from '@/lib/reportCallLinking';

export default function VATrespassNotices() {
  // Same implementation as TrespassingNotices.js but with VA-specific title
  const [showForm, setShowForm] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNotice, setEditingNotice] = useState(null);
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [formData, setFormData] = useState({
    notice_date: new Date().toISOString().slice(0, 16),
    location: "",
    subject_name: "",
    subject_first_name: "",
    subject_middle_name: "",
    subject_last_name: "",
    subject_description: "",
    subject_id: "",
    subject_id_state: "",
    subject_id_expiration: "",
    subject_dob: "",
    subject_race: "",
    subject_sex: "unknown",
    subject_height_ft: "",
    subject_height_in: "",
    subject_weight: "",
    subject_eyes: "",
    subject_hair: "",
    subject_phone: "",
    subject_address: "",
    subject_city: "",
    subject_state: "",
    subject_zip: "",
    vehicle_info: "",
    reason: "",
    duration: "Permanent",
    police_notified: false,
    police_report_number: "",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    photo_url: "",
    signature_url: "",
    officer_signature_url: "",
    officer_signed_at: "",
    witness_name: "",
    witness_signature_url: "",
    witness_signed_at: "",
    subject_signature_url: "",
    subject_signed_at: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIDScanner, setShowIDScanner] = useState(false);
  const [signaturePadType, setSignaturePadType] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const getOfficerSignature = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (!officer) return String(officerRef || 'Officer');
    return officer.last_name || officer.email || String(officerRef || 'Officer');
  };

  const getOfficerFullName = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (officer) {
      if (officer.first_name && officer.last_name) {
        return `${officer.first_name} ${officer.last_name}`;
      }
      if (officer.rank && officer.last_name) {
        return `${officer.rank} ${officer.last_name}`;
      }
    }
    return officer?.email || String(officerRef || 'Unknown Officer');
  };

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-clock_in',
        100
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  const { data: allNotices } = useQuery({
    queryKey: ['allTrespassingNotices'],
    queryFn: () => base44.entities.TrespassingNotice.list('-created_date'),
    initialData: [],
  });

  // Real-time sync across devices
  useEffect(() => {
    if (!user) return;
    const unsubscribe = base44.entities.TrespassingNotice.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['allTrespassingNotices'] });
    });
    return unsubscribe;
  }, [user, queryClient]);

  const noticesToDisplay = React.useMemo(() => {
    if (!allNotices) return { active: [], inactive: [] };

    let filtered = [];
    if (currentSiteName) {
      filtered = allNotices.filter(notice => notice.location === currentSiteName);
    } else if (isAdmin) {
      filtered = allNotices;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const active = [];
    const inactive = [];

    filtered.forEach(notice => {
      if (notice.expiration_date) {
        const expDate = new Date(notice.expiration_date);
        expDate.setHours(0, 0, 0, 0);

        if (now > expDate) {
          inactive.push(notice);
        } else {
          active.push(notice);
        }
      } else {
        active.push(notice);
      }
    });

    return { active, inactive };
  }, [allNotices, currentSiteName, isAdmin]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
    enabled: !!user,
    initialData: [],
  });

  const getOfficerIdentifier = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (officer?.last_name && officer?.unit_number) {
      return `${officer.last_name} - Unit ${officer.unit_number}`;
    }
    return officer?.email || String(officerRef || 'Unknown Officer');
  };

  useEffect(() => {
    if (!editingNotice && !isAdmin && activeEntry?.location) {
      const siteName = activeEntry.location.split(' - ')[0].trim();
      const matchingLocation = locations?.find(loc => loc.site_name === siteName);
      setFormData(prev => ({ ...prev, location: matchingLocation?.site_name || siteName }));
    }
  }, [activeEntry, locations, editingNotice, isAdmin]);

  const resetForm = () => {
    setShowForm(false);
    setEditingNotice(null);
    setEditingTodoId(null);
    setFormData({
      notice_date: new Date().toISOString().slice(0, 16),
      location: currentSiteName || "",
      subject_name: "",
      subject_first_name: "",
      subject_middle_name: "",
      subject_last_name: "",
      subject_description: "",
      subject_id: "",
      subject_id_state: "",
      subject_id_expiration: "",
      subject_dob: "",
      subject_race: "",
      subject_sex: "unknown",
      subject_height_ft: "",
      subject_height_in: "",
      subject_weight: "",
      subject_eyes: "",
      subject_hair: "",
      subject_phone: "",
      subject_address: "",
      subject_city: "",
      subject_state: "",
      subject_zip: "",
      vehicle_info: "",
      reason: "",
      duration: "Permanent",
      police_notified: false,
      police_report_number: "",
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
      photo_url: "",
      signature_url: "",
      officer_signature_url: "",
      officer_signed_at: "",
      witness_name: "",
      witness_signature_url: "",
      witness_signed_at: "",
      subject_signature_url: "",
      subject_signed_at: "",
    });
  };

  const canSubmit = isAdmin || !!activeEntry;

  const saveNoticeMutation = useMutation({
    mutationFn: async (variables) => {
      const { data, isDraft } = variables || {};
      if (!data) throw new Error('Trespass notice data is required');
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      let locationToSubmit = data.location;
      if (isAdmin && !data.location) {
        locationToSubmit = "Admin - Remote Submission";
      } else if (!isAdmin && !activeEntry?.location && !isDraft) {
        locationToSubmit = "Unknown Location";
      }

      if (editingNotice) {
        const updated = await base44.entities.TrespassingNotice.update(editingNotice.id, {
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active",
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress,
        });

        try {
          await createReportCallLink({
            callId: data.linked_call_id || '',
            callNumber: data.linked_call_number || '',
            reportType: 'TrespassingNotice',
            reportId: updated.id,
            reportNumber: updated.police_report_number || updated.id,
          });
        } catch (linkError) {
          console.error('Failed to synchronize trespass call link:', linkError);
        }

        if (!isDraft) {
          if (editingTodoId) {
            await completeReportTodo(editingTodoId);
          } else {
            const todos = await base44.entities.ReportTodo.filter({
              officer_email: user.email,
              report_type: 'trespass_notice',
              report_id: editingNotice.id,
              completed: false
            });
            for (const todo of todos) {
              await completeReportTodo(todo.id);
            }
          }
        }
        return updated;
      } else {
        const notice = await base44.entities.TrespassingNotice.create({
          ...data,
          location: locationToSubmit,
          status: isDraft ? "draft" : "active",
          officer_ip_address: ipAddress,
        });

        if (data.linked_call_id) {
          try {
            await createReportCallLink({
              callId: data.linked_call_id,
              callNumber: data.linked_call_number || '',
              reportType: 'TrespassingNotice',
              reportId: notice.id,
              reportNumber: notice.police_report_number || notice.id,
            });
          } catch (linkError) {
            console.error('Failed to persist trespass call link:', linkError);
          }
        }

        if (!isDraft) {
          const location = locations?.find(loc => loc.site_name === data.location);
          if (location?.assigned_client_email) {
            const officer = allUsers?.find(u => u.email === user?.email);
            const officerName = officer
              ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email
              : user?.email || 'Unknown Officer';
            const emailSubjectName = String(notice.subject_name || '')
              .replace(/^subject(?:\s+name)?\s*:\s*/i, '')
              .trim();
            const emailDuration = String(
              notice.expiration_date
                ? `Until ${format(new Date(notice.expiration_date), 'MMMM d, yyyy')}`
                : (notice.duration || 'Permanent')
            ).replace(/^duration\s*:\s*/i, '').trim();
            const emailReason = String(notice.reason || '')
              .replace(/^reason(?:\s+for\s+action)?\s*:\s*/i, '')
              .trim();

            try {
              await base44.integrations.Core.SendEmail({
                from_name: "Black Point Protection",
                to: location.assigned_client_email,
                subject: `🚫 New Trespass Notice - ${emailSubjectName} - ${location.site_name}`,
                body: `A new trespass notice has been issued for your location.\n\n` +
                     `Site: ${location.site_name}\n` +
                     `Date: ${format(new Date(notice.notice_date), 'MMMM d, yyyy h:mm a')}\n` +
                     `Officer: ${officerName}\n` +
                     `Subject: ${emailSubjectName}\n` +
                     `Duration: ${emailDuration}\n\n` +
                     `Reason for action:\n${emailReason}\n\n` +
                     `View and manage this notice in the Black Point Client Portal. ` +
                     `The expiration date can be updated from Trespass Management.`
              });
            } catch (error) {
              console.error('Error sending email to client:', error);
            }
          }
        }

        return notice;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['allTrespassingNotices'] });
      if (variables.isDraft) toast.success('Draft saved successfully.');
      resetForm();
      setSaving(false);
    },
    onError: (error) => {
      console.error('Error saving report:', error);
      setSaving(false);
      toast.error(error?.message || 'Failed to save report. Please try again.');
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadInternalFile(file);
      setFormData({ ...formData, photo_url: result.file_url });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
    setUploading(false);
  };

  const handleSignatureComplete = (fileUrl) => {
    const now = new Date().toISOString();
    setFormData(prev => {
      if (signaturePadType === 'officer') return { ...prev, officer_signature_url: fileUrl, signature_url: fileUrl, officer_signed_at: now };
      if (signaturePadType === 'witness') return { ...prev, witness_signature_url: fileUrl, witness_signed_at: now };
      if (signaturePadType === 'subject') return { ...prev, subject_signature_url: fileUrl, subject_signed_at: now };
      return prev;
    });
    setSignaturePadType(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const missingRequired = [
      ['First name', formData.subject_first_name],
      ['Last name', formData.subject_last_name],
      ['Street address', formData.subject_address],
      ['City', formData.subject_city],
      ['State', formData.subject_state],
      ['ZIP code', formData.subject_zip],
      ['Telephone number', formData.subject_phone],
      ['Property / site', formData.location],
      ['Reason for notice', formData.reason],
      ['Officer signature', formData.officer_signature_url],
    ].filter(([, value]) => !String(value || '').trim());
    if (missingRequired.length) {
      alert(`Complete the required Virginia notice fields before submitting: ${missingRequired.map(([label]) => label).join(', ')}.`);
      return;
    }

    if (formData.reason.includes('-') || (formData.subject_description && formData.subject_description.includes('-'))) {
      alert('Please do not use dashes (-) in your reports. Use bullets (•) or write in full sentences instead.');
      return;
    }

    setSaving(true);
    saveNoticeMutation.mutate({ data: formData, isDraft: false });
  };

  const viewNotice = (notice) => {
    setSelectedNotice(notice);
    setShowViewDialog(true);
  };

  const printNotice = (notice) => {
    const siteLocation = locations?.find(loc => loc.site_name === notice.location);
    const officer = allUsers?.find(u => String(u.id) === String(notice.created_by_id));
    const officerLastName = officer?.last_name || getOfficerSignature(notice.created_by_id) || 'Officer';
    openTrespassNoticePrint(notice, {
      jurisdiction: 'VA',
      locationRecord: siteLocation || { site_name: notice.location, division: 'Virginia' },
      propertyName: siteLocation?.site_name || notice.location,
      propertyAddress: siteLocation?.address || notice.location,
      senderName: 'Black Point Protection',
      senderAddress: siteLocation?.address || notice.location,
      officerName: officerLastName,
      signatureName: officerLastName,
      timeZone: siteLocation?.time_zone || 'America/New_York',
      policeDepartment: resolvePoliceDepartment(siteLocation || { site_name: notice.location, division: 'Virginia' }),
    });
    return;

    const printWindow = window.open('', '', 'width=850,height=1100');
    const displayLocation = siteLocation ? `${siteLocation.site_name}: ${siteLocation.address}` : notice.location;
    
    // Convert to Zulu time
    const toZulu = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
    };
    
    const noticeDateZulu = toZulu(notice.notice_date);
    const signedDateZulu = toZulu(notice.created_date);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>VA Trespass Notice - ${notice.subject_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 8.5pt; line-height: 1.2; color: #000; }
          
          .back-button {
            position: fixed;
            top: 10px;
            left: 10px;
            padding: 8px 16px;
            background: #1e40af;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover {
            background: #1e3a8a;
          }
          
          .notice-container { border: 4px double #000; padding: 20px; }
          .header { text-align: center; border-bottom: 4px double #000; padding-bottom: 12px; margin-bottom: 15px; }
          .title { font-size: 22pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
          .subtitle { font-size: 14pt; font-weight: bold; color: #d32f2f; }
          .section { margin: 12px 0; }
          .section-title { font-weight: bold; font-size: 12pt; margin-bottom: 5px; background: #f5f5f5; padding: 5px; border-left: 4px solid #000; }
          .field-row { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 5px 0; }
          .field-label { font-weight: bold; }
          .field-value { border-bottom: 1px dotted #000; padding: 2px 5px; min-height: 20px; }
          .warning-box { border: 3px solid #d32f2f; background: #ffebee; padding: 15px; margin: 15px 0; }
          .warning-title { font-size: 14pt; font-weight: bold; color: #d32f2f; margin-bottom: 8px; }
          .legal-text { font-size: 9pt; line-height: 1.4; margin: 10px 0; }
          .signature-section { margin-top: 20px; border-top: 2px solid #000; padding-top: 15px; }
          .sig-box { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .sig-line { border-bottom: 2px solid #000; min-height: 40px; margin: 8px 0; font-family: 'Brush Script MT', cursive; font-size: 18pt; padding: 5px; }
          .sig-label { font-size: 8pt; font-weight: bold; margin-bottom: 3px; }
          .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 2px solid #000; font-size: 8pt; font-weight: bold; }
          .photo-section { margin: 15px 0; border: 2px solid #000; padding: 10px; text-align: center; }
          .photo-section img { max-width: 100%; max-height: 300px; object-fit: contain; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="notice-container">
          <div class="header">
            <div class="title">TRESPASS NOTICE</div>
            <div class="subtitle">NO TRESPASSING WARNING</div>
          </div>
          
          <div class="section">
            <div class="section-title">NOTICE INFORMATION</div>
            <div class="field-row">
              <div class="field-label">Date Issued (Zulu):</div>
              <div class="field-value">${noticeDateZulu}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Location:</div>
              <div class="field-value">${displayLocation}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Duration:</div>
              <div class="field-value">${notice.duration}${notice.expiration_date ? ` (Expires: ${format(new Date(notice.expiration_date), 'MMM d, yyyy')})` : ''}</div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">SUBJECT INFORMATION</div>
            <div class="field-row">
              <div class="field-label">Name:</div>
              <div class="field-value">${notice.subject_name}</div>
            </div>
            <div class="field-row">
              <div class="field-label">Description:</div>
              <div class="field-value">${notice.subject_description || 'N/A'}</div>
            </div>
            ${notice.subject_id ? `
              <div class="field-row">
                <div class="field-label">ID Number:</div>
                <div class="field-value">${notice.subject_id}</div>
              </div>
            ` : ''}
            ${notice.vehicle_info ? `
              <div class="field-row">
                <div class="field-label">Vehicle:</div>
                <div class="field-value">${notice.vehicle_info}</div>
              </div>
            ` : ''}
          </div>
          
          <div class="section">
            <div class="section-title">REASON FOR TRESPASS NOTICE</div>
            <div style="border: 1px solid #000; padding: 10px; min-height: 80px; white-space: pre-wrap;">
              ${notice.reason}
            </div>
          </div>

          ${notice.photo_url ? `
            <div class="photo-section">
              <div class="section-title">SUBJECT PHOTO</div>
              <img src="${notice.photo_url}" alt="Subject photo" />
            </div>
          ` : ''}

          ${notice.police_notified ? `
            <div class="section">
              <div class="section-title">LAW ENFORCEMENT NOTIFICATION</div>
              <div class="field-row">
                <div class="field-label">Police Notified:</div>
                <div class="field-value">YES</div>
              </div>
              ${notice.police_report_number ? `
                <div class="field-row">
                  <div class="field-label">Report Number:</div>
                  <div class="field-value">${notice.police_report_number}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="warning-box">
            <div class="warning-title">⚠️ LEGAL WARNING</div>
            <div class="legal-text">
              <p><strong>YOU ARE HEREBY NOTIFIED</strong> that you are not permitted to enter or remain on the above-described property.</p>
              <p style="margin-top: 8px;">
                <strong>Virginia Code § 18.2-119</strong> - Any person who, after having been forbidden to do so, 
                goes upon or remains upon the lands, buildings, or premises of another, or any portion thereof, 
                shall be guilty of a Class 1 misdemeanor.
              </p>
              <p style="margin-top: 8px;">
                <strong>VIOLATION OF THIS NOTICE MAY RESULT IN:</strong>
              </p>
              <ul style="margin-left: 20px; margin-top: 5px;">
                <li>Arrest and criminal prosecution</li>
                <li>Up to 12 months in jail and/or $2,500 fine</li>
                <li>Civil liability for damages</li>
              </ul>
            </div>
          </div>
          
          <div class="signature-section">
            <div class="sig-box">
              <div>
                <div class="sig-label">SUBJECT ACKNOWLEDGMENT (if present):</div>
                <div class="sig-line"></div>
                <div style="font-size: 8pt; text-align: center;">Signature of Subject</div>
              </div>
              <div>
                <div class="sig-label">ISSUING OFFICER:</div>
                ${(notice.officer_signature_url || notice.signature_url)
                  ? `<div style="min-height: 40px; margin: 8px 0; padding: 5px;"><img src="${notice.officer_signature_url || notice.signature_url}" alt="Officer Signature" style="max-height: 60px; max-width: 100%;" /></div>`
                  : `<div class="sig-line"></div>`
                }
                ${(notice.officer_signature_url || notice.signature_url)
                  ? `<div style="font-size: 8pt; text-align: center;">${officerLastName}<br/>${notice.created_date ? `Signed (Zulu): ${signedDateZulu}` : ''}</div>`
                  : `<div style="font-size: 8pt; text-align: center;">Date: ____________________</div>`
                }
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin-top: 3px;">THIS IS AN OFFICIAL TRESPASS NOTICE - RETAIN FOR YOUR RECORDS</p>
          </div>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
  };

  const filteredActiveNotices = noticesToDisplay.active?.filter(notice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      notice.subject_name?.toLowerCase().includes(query) ||
      notice.location?.toLowerCase().includes(query) ||
      notice.subject_id?.toLowerCase().includes(query) ||
      notice.vehicle_info?.toLowerCase().includes(query) ||
      notice.police_report_number?.toLowerCase().includes(query) ||
      getOfficerIdentifier(notice.created_by_id).toLowerCase().includes(query)
    );
  }) || [];

  const filteredInactiveNotices = noticesToDisplay.inactive?.filter(notice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      notice.subject_name?.toLowerCase().includes(query) ||
      notice.location?.toLowerCase().includes(query) ||
      notice.subject_id?.toLowerCase().includes(query) ||
      notice.vehicle_info?.toLowerCase().includes(query) ||
      notice.police_report_number?.toLowerCase().includes(query) ||
      getOfficerIdentifier(notice.created_by_id).toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex-1">
            <h1 className="mb-2 text-2xl font-black text-white md:text-3xl">VA Trespass Notices</h1>
            <p className="text-sm md:text-base text-slate-600">Issue and track Virginia trespass notices</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-red-600 hover:bg-red-700"
            disabled={!canSubmit && !showForm}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Notice
          </Button>
        </div>

        {!canSubmit && !isAdmin && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must be clocked in to issue a trespass notice. Please clock in at your assigned location first.
            </AlertDescription>
          </Alert>
        )}

        {/* Form and list display - same as original */}
        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
              <CardTitle className="flex items-center gap-2">
                {editingNotice ? (
                  <>
                    <Pencil className="w-5 h-5 text-orange-600" />
                    Edit VA Trespassing Notice
                  </>
                ) : (
                  <>
                    <UserX className="w-5 h-5 text-orange-600" />
                    New VA Trespassing Notice
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {/* Same form as TrespassingNotices */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="notice_date">Date & Time *</Label>
                    <Input
                      id="notice_date"
                      type="datetime-local"
                      value={formData.notice_date.slice(0, 16)}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const newDate = new Date(dateValue);
                          if (!isNaN(newDate.getTime())) {
                            setFormData({...formData, notice_date: newDate.toISOString()});
                          }
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
                      required
                    >
                      <SelectTrigger id="location">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentSiteName && !locations?.some(loc => loc.site_name === currentSiteName) && (
                          <SelectItem value={currentSiteName}>{currentSiteName}</SelectItem>
                        )}
                        {locations?.map(loc => (
                          <SelectItem key={loc.id} value={loc.site_name}>
                            {loc.site_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {showIDScanner && (
                  <IDScanner
                    onDataExtracted={(data) => {
                      const updates = {};
                      if (data.first_name) updates.subject_first_name = data.first_name;
                      if (data.middle_name) updates.subject_middle_name = data.middle_name;
                      if (data.last_name) updates.subject_last_name = data.last_name;
                      if (data.full_name) updates.subject_name = data.full_name;
                      else if (data.first_name || data.last_name) updates.subject_name = [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ');
                      if (data.id_number) updates.subject_id = data.id_number;
                      if (data.state) updates.subject_id_state = data.state;
                      if (data.expiration_date) updates.subject_id_expiration = data.expiration_date;
                      if (data.date_of_birth) updates.subject_dob = data.date_of_birth;
                      if (data.race) updates.subject_race = data.race;
                      if (data.sex) updates.subject_sex = String(data.sex).toLowerCase();
                      if (data.weight) updates.subject_weight = String(data.weight).replace(/[^\d]/g, '');
                      if (data.eyes) updates.subject_eyes = data.eyes;
                      if (data.hair) updates.subject_hair = data.hair;
                      if (data.height) {
                        const heightMatch = String(data.height).match(/(\d+)['\-]?(\d+)?/);
                        if (heightMatch) { updates.subject_height_ft = heightMatch[1]; updates.subject_height_in = heightMatch[2] || ''; }
                      }
                      if (data.address) updates.subject_address = data.address;
                      if (data.city) updates.subject_city = data.city;
                      if (data.state) updates.subject_state = data.state;
                      if (data.zip_code) updates.subject_zip = data.zip_code;
                      updates.id_scanned_in_person = true;
                      updates.scan_type = data.scan_type || data.scan_source || 'id_scan';
                      updates.scan_raw = data.raw_scan || '';
                      updates.scan_parsed_json = JSON.stringify(data);
                      updates.scanned_at = data.scanned_at || new Date().toISOString();
                      updates.scanned_by = user?.email || '';
                      updates.device_id = data.device_id || navigator.userAgent;
                      if (data.id_photo) updates.id_photo = data.id_photo;
                      
                      // Build physical description from ID data
                      const descParts = [];
                      if (data.sex) descParts.push(`Sex: ${data.sex}`);
                      if (data.height) descParts.push(`Height: ${data.height}`);
                      if (data.weight) descParts.push(`Weight: ${data.weight} lbs`);
                      if (data.eyes) descParts.push(`Eyes: ${data.eyes}`);
                      if (data.hair) descParts.push(`Hair: ${data.hair}`);
                      if (data.race) descParts.push(`Race: ${data.race}`);
                      if (data.date_of_birth) descParts.push(`DOB: ${data.date_of_birth}`);
                      
                      if (descParts.length > 0) {
                        updates.subject_description = descParts.join(', ');
                      }
                      
                      if (data.address || data.city || data.state) {
                        const addrParts = [data.address, data.city, data.state, data.zip_code].filter(Boolean);
                        updates.subject_description = (updates.subject_description || '') + 
                          `\nAddress: ${addrParts.join(', ')}`;
                      }
                      
                      setFormData(prev => ({ ...prev, ...updates }));
                      setShowIDScanner(false);
                    }}
                    onClose={() => setShowIDScanner(false)}
                  />
                )}

                <Button
                  type="button"
                  onClick={() => setShowIDScanner(!showIDScanner)}
                  variant="outline"
                  className="w-full bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {showIDScanner ? 'Close ID Scanner' : 'Scan ID/Driver\'s License'}
                </Button>

                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 space-y-4">
                  <div><h3 className="font-semibold text-slate-900">Subject Information</h3><p className="text-xs text-slate-500">Enter the subject as individual identification fields, matching the VA complaint/summons workflow.</p></div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>First Name *</Label><Input value={formData.subject_first_name} onChange={(e) => { const v=e.target.value; setFormData({...formData,subject_first_name:v,subject_name:[v,formData.subject_middle_name,formData.subject_last_name].filter(Boolean).join(' ')}) }} required /></div>
                    <div className="space-y-2"><Label>Middle Name</Label><Input value={formData.subject_middle_name} onChange={(e) => { const v=e.target.value; setFormData({...formData,subject_middle_name:v,subject_name:[formData.subject_first_name,v,formData.subject_last_name].filter(Boolean).join(' ')}) }} /></div>
                    <div className="space-y-2"><Label>Last Name *</Label><Input value={formData.subject_last_name} onChange={(e) => { const v=e.target.value; setFormData({...formData,subject_last_name:v,subject_name:[formData.subject_first_name,formData.subject_middle_name,v].filter(Boolean).join(' ')}) }} required /></div>
                  </div>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={formData.subject_dob} onChange={(e)=>setFormData({...formData,subject_dob:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Race</Label><Input value={formData.subject_race} onChange={(e)=>setFormData({...formData,subject_race:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Sex</Label><Select value={formData.subject_sex || 'unknown'} onValueChange={(v)=>setFormData({...formData,subject_sex:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={formData.subject_phone} onChange={(e)=>setFormData({...formData,subject_phone:e.target.value})}/></div>
                  </div>
                  <div className="grid md:grid-cols-5 gap-4">
                    <div className="space-y-2"><Label>Height Ft</Label><Input type="number" value={formData.subject_height_ft} onChange={(e)=>setFormData({...formData,subject_height_ft:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Height In</Label><Input type="number" value={formData.subject_height_in} onChange={(e)=>setFormData({...formData,subject_height_in:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Weight</Label><Input type="number" value={formData.subject_weight} onChange={(e)=>setFormData({...formData,subject_weight:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Eyes</Label><Input value={formData.subject_eyes} onChange={(e)=>setFormData({...formData,subject_eyes:e.target.value})}/></div>
                    <div className="space-y-2"><Label>Hair</Label><Input value={formData.subject_hair} onChange={(e)=>setFormData({...formData,subject_hair:e.target.value})}/></div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>ID / Driver License #</Label><Input value={formData.subject_id} onChange={(e)=>setFormData({...formData,subject_id:e.target.value.toUpperCase()})}/></div>
                    <div className="space-y-2"><Label>ID State</Label><Input maxLength={2} value={formData.subject_id_state} onChange={(e)=>setFormData({...formData,subject_id_state:e.target.value.toUpperCase()})}/></div>
                    <div className="space-y-2"><Label>ID Expiration</Label><Input type="date" value={formData.subject_id_expiration} onChange={(e)=>setFormData({...formData,subject_id_expiration:e.target.value})}/></div>
                  </div>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2"><Label>Street Address</Label><Input value={formData.subject_address} onChange={(e)=>setFormData({...formData,subject_address:e.target.value})}/></div>
                    <div className="space-y-2"><Label>City</Label><Input value={formData.subject_city} onChange={(e)=>setFormData({...formData,subject_city:e.target.value})}/></div>
                    <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>State</Label><Input maxLength={2} value={formData.subject_state} onChange={(e)=>setFormData({...formData,subject_state:e.target.value.toUpperCase()})}/></div><div className="space-y-2"><Label>ZIP</Label><Input value={formData.subject_zip} onChange={(e)=>setFormData({...formData,subject_zip:e.target.value})}/></div></div>
                  </div>
                  <div className="space-y-2"><Label>Physical Description / Distinguishing Features</Label><Textarea value={formData.subject_description} onChange={(e)=>setFormData({...formData,subject_description:e.target.value})} rows={3}/></div>
                </div>
                <div className="space-y-2"><Label htmlFor="vehicle_info">Associated Vehicle</Label><Input id="vehicle_info" placeholder="Make, model, color, plate, state" value={formData.vehicle_info} onChange={(e)=>setFormData({...formData,vehicle_info:e.target.value})}/></div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Notice *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Why is this trespass notice being issued?"
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    required
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Ban Duration</Label>
                  <Input
                    id="duration"
                    placeholder="Permanent (default)"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  />
                  <p className="text-xs text-slate-500">Leave as "Permanent" or specify duration</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Photo of Subject (Optional)</Label>
                  <div className="flex gap-3">
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="flex-1"
                    />
                    {uploading && <span className="text-sm text-slate-500">Uploading...</span>}
                  </div>
                  {formData.photo_url && (
                    <img
                      src={formData.photo_url}
                      alt="Subject"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200 mt-2"
                    />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="police_notified"
                    checked={formData.police_notified}
                    onCheckedChange={(checked) => setFormData({...formData, police_notified: checked})}
                  />
                  <Label htmlFor="police_notified" className="cursor-pointer">
                    Police were notified
                  </Label>
                </div>

                {formData.police_notified && (
                  <div className="space-y-2">
                    <Label htmlFor="police_report_number">Police Report Number</Label>
                    <Input
                      id="police_report_number"
                      placeholder="Enter police department report number"
                      value={formData.police_report_number}
                      onChange={(e) => setFormData({...formData, police_report_number: e.target.value})}
                    />
                  </div>
                )}

                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
                  <div className="mb-3">
                    <h3 className="font-semibold text-slate-900">Signatures</h3>
                    <p className="text-xs text-slate-500">Capture each signature separately on this device. Subject and witness signatures are optional when the person is unavailable or declines to sign.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-sm font-semibold text-slate-900">Issuing Officer</div>
                      <div className="mt-1 text-xs text-slate-500">{getOfficerSignature(user?.email)}</div>
                      {formData.officer_signature_url && <img src={formData.officer_signature_url} alt="Officer signature" className="mt-2 h-16 w-full rounded border bg-white object-contain" />}
                      <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => setSignaturePadType('officer')}>{formData.officer_signature_url ? 'Replace Signature' : 'Officer Sign'}</Button>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-sm font-semibold text-slate-900">Witness</div>
                      <Input className="mt-2" placeholder="Witness name" value={formData.witness_name} onChange={(e) => setFormData({...formData, witness_name:e.target.value})} />
                      {formData.witness_signature_url && <img src={formData.witness_signature_url} alt="Witness signature" className="mt-2 h-16 w-full rounded border bg-white object-contain" />}
                      <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => setSignaturePadType('witness')}>{formData.witness_signature_url ? 'Replace Signature' : 'Witness Sign'}</Button>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="text-sm font-semibold text-slate-900">Subject</div>
                      <div className="mt-1 text-xs text-slate-500">{formData.subject_name || 'Subject acknowledgment'}</div>
                      {formData.subject_signature_url && <img src={formData.subject_signature_url} alt="Subject signature" className="mt-2 h-16 w-full rounded border bg-white object-contain" />}
                      <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => setSignaturePadType('subject')}>{formData.subject_signature_url ? 'Replace Signature' : 'Subject Sign'}</Button>
                    </div>
                  </div>
                  {signaturePadType && (
                    <div className="mt-4 max-w-full overflow-hidden">
                      <SignaturePad
                        officerName={signaturePadType === 'officer' ? getOfficerFullName(user?.email) : signaturePadType === 'witness' ? (formData.witness_name || 'Witness') : (formData.subject_name || 'Subject')}
                        onSignatureComplete={handleSignatureComplete}
                        onClose={() => setSignaturePadType(null)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <div className="w-full sm:w-auto sm:min-w-[260px]"><RequiredAIReportReview /></div>
                  <Button
                    type="submit"
                    disabled={saving || saveNoticeMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {editingNotice
                      ? (saving ? 'Updating...' : 'Update Notice')
                      : (saving ? 'Submitting...' : 'Issue Notice')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Display notices - same as original */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <span className="text-lg md:text-xl">
                {currentSiteName
                  ? `VA Trespass Notices at ${currentSiteName}`
                  : 'VA Trespass Notices (Clock in to view site notices)'}
              </span>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Search className="w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by name, ID, vehicle, report #"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentSiteName && !isAdmin ? (
              <div className="text-center py-12">
                <p className="text-slate-600 text-lg">Clock in to a site to view trespass notices</p>
                <p className="text-slate-500 text-sm mt-2">You'll see all notices issued at your current site</p>
              </div>
            ) : (
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="active" className="text-xs sm:text-sm">
                    Active ({filteredActiveNotices.length})
                  </TabsTrigger>
                  <TabsTrigger value="inactive" className="text-xs sm:text-sm">
                    Expired ({filteredInactiveNotices.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                  <div className="space-y-4">
                    {filteredActiveNotices?.map((notice) => {
                      const durationDisplay = notice.expiration_date
                        ? `Expires: ${format(new Date(notice.expiration_date), 'MMM d, yyyy')}`
                        : 'Duration: Permanent';

                      return (
                        <Card key={notice.id} className="border-l-4 border-l-red-600">
                          <CardHeader>
                            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
                              <span className="text-lg font-bold text-slate-900">{notice.subject_name}</span>
                              <div className="flex gap-2 flex-wrap items-center">
                                <Badge className="bg-red-600 text-white">Active</Badge>
                                {notice.police_notified && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                    Police Notified
                                  </Badge>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => viewNotice(notice)}
                                  className="bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => printNotice(notice)}
                                  className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                                >
                                  <Printer className="w-4 h-4 mr-2" />
                                  Print
                                </Button>
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 p-5 pt-0">
                            <div className="text-sm space-y-1">
                              <p className="text-slate-600"><strong>Date:</strong> {format(new Date(notice.notice_date), 'MMM d, yyyy h:mm a')}</p>
                              <p className="text-slate-600"><strong>Location:</strong> {notice.location}</p>
                              <p className="text-slate-600"><strong>{durationDisplay}</strong></p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 font-medium mb-1">Reason:</p>
                              <p className="text-sm text-slate-700">{notice.reason}</p>
                            </div>
                            {notice.subject_description && (
                              <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Description:</p>
                                <p className="text-sm text-slate-700">{notice.subject_description}</p>
                              </div>
                            )}
                            <div className="mt-4 pt-4 border-t-2 border-slate-300">
                              <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                              <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                                {getOfficerSignature(notice.created_by_id)}
                              </p>
                              {notice.officer_ip_address && notice.created_date && (
                                <p className="text-xs text-slate-400 mt-1">
                                  IP: {notice.officer_ip_address} | Signed: {formatReportDateTime(notice.created_date, resolveReportTimeZone(locations?.find(location => location.site_name === notice.location)))}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {filteredActiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No active trespass notices</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="inactive" className="mt-4">
                  <div className="space-y-4">
                    {filteredInactiveNotices?.map((notice) => (
                      <div key={notice.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-slate-400 opacity-60">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-2 mb-2">
                              <Badge variant="outline" className="bg-slate-200 text-slate-700">
                                EXPIRED
                              </Badge>
                            </div>
                            <p className="font-semibold text-slate-700 mb-1">{notice.subject_name}</p>
                            <p className="text-sm text-slate-600">Issued: {format(new Date(notice.notice_date), 'MMM d, yyyy')}</p>
                            <p className="text-sm text-slate-600">Location: {notice.location}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredInactiveNotices.length === 0 && (
                      <p className="text-center text-slate-500 py-8">No expired trespass notices</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-4xl overflow-x-hidden overflow-y-auto p-3 sm:p-6">
          <DialogHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>Official VA Trespass Notice</DialogTitle>
            {selectedNotice && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => printNotice(selectedNotice)}
                className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Notice
              </Button>
            )}
          </DialogHeader>
          {selectedNotice && (
            <div className="py-4">
              {/* Same view dialog content as original */}
              <div className="mx-auto max-w-[8.5in] rounded-sm border border-slate-400 bg-white p-4 text-black shadow-sm sm:p-7">
                <div className="mb-6 text-center text-2xl font-black underline sm:text-3xl">NOTICE OF NO TRESPASS</div>

                <div className="space-y-2 text-sm leading-6">
                  <div className="grid grid-cols-[150px_1fr] gap-2"><strong className="underline">TO BE SERVED ON:</strong><div className="border-b border-black px-2">{selectedNotice.subject_name}</div></div>
                  <div className="grid grid-cols-[150px_1fr] gap-2"><span/><div className="border-b border-black px-2">{selectedNotice.subject_address || ''}</div></div>
                  <div className="grid grid-cols-[150px_1fr] gap-2"><span/><div className="border-b border-black px-2">{[selectedNotice.subject_city, selectedNotice.subject_state, selectedNotice.subject_zip].filter(Boolean).join(', ')}</div></div>
                  <div className="grid grid-cols-[150px_1fr] gap-2"><span/><div className="border-b border-black px-2">{selectedNotice.subject_phone || ''}</div></div>
                </div>

                <p className="my-5 text-sm font-black italic underline">YOU ARE HEREBY NOTIFIED NOT TO CONTACT THE PETITIONER OF THIS NOTICE FOR ANY REASON OR TRESPASS UPON HIS/HER PROPERTY AT ANY TIME.</p>
                <p className="text-sm leading-6">If any person without authority of law goes upon or remains upon the lands, buildings or premises of another after having been forbidden to do so, whether orally or in writing, by the owner, lessee, custodian or other person lawfully in charge, such person may be subject to prosecution pursuant to § 18.2-119 Code of Virginia, as amended.</p>

                <div className="my-5 border border-black p-3 text-sm"><strong>REASON FOR NOTICE:</strong> {selectedNotice.reason || ''}{selectedNotice.linked_call_number && <><br/><strong>C A D:</strong> {selectedNotice.linked_call_number}</>}</div>

                <div className="mb-5 text-sm"><strong>PETITIONER / AUTHORIZED AGENT PRINTED NAME:</strong> <span className="inline-block min-w-40 border-b border-black px-2">{getOfficerSignature(selectedNotice.created_by_id)}</span></div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="text-center">
                    <div className="flex h-20 items-end justify-center border-b border-black bg-white p-1">{selectedNotice.witness_signature_url ? <img src={selectedNotice.witness_signature_url} alt="Witness digital signature" className="max-h-full max-w-full object-contain"/> : <span className="pb-2 text-xs text-slate-400">No witness signature captured</span>}</div>
                    <div className="mt-1 text-xs font-bold">WITNESS SIGNATURE</div>
                    <div className="mt-1 text-xs">{selectedNotice.witness_name || ''}</div>
                  </div>
                  <div className="text-center">
                    <div className="flex h-20 items-end justify-center border-b border-black bg-white p-1">{selectedNotice.subject_signature_url ? <img src={selectedNotice.subject_signature_url} alt="Subject digital signature" className="max-h-full max-w-full object-contain"/> : <span className="pb-2 text-xs text-slate-400">No subject signature captured / declined</span>}</div>
                    <div className="mt-1 text-xs font-bold">SUBJECT SIGNATURE / ACKNOWLEDGMENT</div>
                    <div className="mt-1 text-xs">{selectedNotice.subject_name}</div>
                  </div>
                  <div className="text-center">
                    <div className="flex h-20 items-end justify-center border-b border-black bg-white p-1">{(selectedNotice.officer_signature_url || selectedNotice.signature_url) ? <img src={selectedNotice.officer_signature_url || selectedNotice.signature_url} alt="Authorized agent digital signature" className="max-h-full max-w-full object-contain"/> : <span className="pb-2 text-xs text-slate-400">No authorized-agent signature captured</span>}</div>
                    <div className="mt-1 text-xs font-bold">AUTHORIZED AGENT SIGNATURE</div>
                    <div className="mt-1 text-xs">{getOfficerSignature(selectedNotice.created_by_id)}</div>
                  </div>
                </div>

                <div className="mt-5 border-t border-black pt-3 text-xs font-semibold">One recipient per notice. Witness and subject signature areas remain visible when a person declines or is unavailable to sign.</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}