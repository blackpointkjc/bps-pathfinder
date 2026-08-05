import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Upload, Camera, Award, AlertTriangle, ClipboardCheck, Star, TrendingUp, Calendar, Shield, Phone, FileText, Package, Trash2, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fileToDataURL } from "../components/PhotoUploader";

const FIREARM_PREFIXES = ["07", "08", "09", "10"];

function computeDcjsExpiration(certs) {
  if (!certs || !certs.length) return "";
  const core = certs.find(c => c.course_id?.startsWith("01") && c.expiration_date);
  if (core) return core.expiration_date;
  const dcjsCerts = certs.filter(c => c.category === "dcjs" && c.expiration_date);
  if (dcjsCerts.length === 0) return "";
  return [...dcjsCerts].sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0].expiration_date;
}

function computeFirearmExpiration(certs) {
  if (!certs || !certs.length) return "";
  const firearmCerts = certs.filter(c =>
    FIREARM_PREFIXES.some(prefix => c.course_id?.startsWith(prefix)) && c.expiration_date
  );
  if (firearmCerts.length === 0) return "";
  return [...firearmCerts].sort((a, b) => new Date(b.expiration_date) - new Date(a.expiration_date))[0].expiration_date;
}

export default function OfficerProfile() {
  const [uploading, setUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 30000,
  });

  const { data: commendations } = useQuery({
    queryKey: ['myCommendations', user?.email],
    queryFn: () => base44.entities.Commendation.filter({ officer_email: user?.email }, '-commendation_date'),
    enabled: !!user?.email,
  });

  const { data: complaints } = useQuery({
    queryKey: ['myComplaints', user?.email],
    queryFn: () => base44.entities.Complaint.filter({ officer_email: user?.email }, '-complaint_date'),
    enabled: !!user?.email,
  });

  const { data: assignedEquipment } = useQuery({
    queryKey: ['myEquipment', user?.email],
    queryFn: () => base44.entities.Equipment.filter({ assigned_to: user?.email }),
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: performanceReviews } = useQuery({
    queryKey: ['myPerformanceReviews', user?.email],
    queryFn: () => base44.entities.PerformanceReview.filter({ officer_email: user?.email }, '-review_date'),
    enabled: !!user?.email,
    initialData: [],
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    try {
      await base44.auth.deleteMe();
    } catch (error) {
      alert("Failed to delete account. Please try again or contact support.");
      console.error("Delete account error:", error);
      return;
    }
    await base44.auth.logout();
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const dataURL = await fileToDataURL(file);
      await updateProfileMutation.mutateAsync({ profile_photo_url: dataURL });
      alert('Profile photo updated successfully!');
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo: " + (error.message || 'Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">My Profile</h1>
          <p className="text-slate-600">View and update your profile information</p>
        </div>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <User className="w-5 h-5 text-blue-600" />
              Profile Photo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="relative">
                {user?.profile_photo_url ? (
                  <img
                    src={user.profile_photo_url}
                    alt="Profile"
                    className="w-32 h-32 rounded-full object-cover border-4 border-blue-200"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-blue-200">
                    {user?.first_name?.charAt(0) || user?.full_name?.charAt(0) || 'U'}
                  </div>
                )}
                <label
                  htmlFor="photo-upload"
                  className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </label>
                <Input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-900">
                  {user?.first_name && user?.last_name 
                    ? `${user.first_name} ${user.last_name}`
                    : user?.full_name || 'Officer'}
                </h2>
                <p className="text-slate-600">{user?.email}</p>
                <div className="flex gap-2 mt-3 justify-center md:justify-start flex-wrap">
                  {user?.rank && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                      {user.rank}
                    </Badge>
                  )}
                  {user?.badge_number && (
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                      Badge #{user.badge_number}
                    </Badge>
                  )}
                  {user?.division && (
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                      {user.division}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => document.getElementById('photo-upload').click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Change Photo'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="border-b">
            <CardTitle className="text-slate-900">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label className="text-slate-600 text-sm">Email</Label>
                <p className="text-slate-900 font-medium">{user?.email}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Phone</Label>
                <p className="text-slate-900 font-medium">{user?.phone || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Unit Number</Label>
                <p className="text-slate-900 font-medium">{user?.unit_number || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Hire Date</Label>
                <p className="text-slate-900 font-medium">
                  {user?.hire_date ? new Date(user.hire_date).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">DCJS Expiration</Label>
                <p className="text-slate-900 font-medium">
                  {(() => {
                    const val = computeDcjsExpiration(user?.officer_certifications) || user?.dcjs_expiration;
                    return val ? new Date(val).toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Firearm Expiration</Label>
                <p className="text-slate-900 font-medium">
                  {(() => {
                    const val = computeFirearmExpiration(user?.officer_certifications) || user?.firearm_expiration;
                    return val ? new Date(val).toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Phone className="w-5 h-5 text-amber-600" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-600 text-sm">Contact Name</Label>
                <p className="text-slate-900 font-medium">{user?.emergency_contact_name || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Relationship</Label>
                <p className="text-slate-900 font-medium">{user?.emergency_contact_relationship || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Phone Number</Label>
                <p className="text-slate-900 font-medium">{user?.emergency_contact_phone || 'Not set'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Shield className="w-5 h-5 text-blue-600" />
              Certifications & Licenses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-4 pb-4 border-b">
              <div>
                <Label className="text-slate-600 text-sm">Driver's License #</Label>
                <p className="text-slate-900 font-medium">{user?.drivers_license_number || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">State</Label>
                <p className="text-slate-900 font-medium">{user?.drivers_license_state || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-slate-600 text-sm">Expiration</Label>
                <p className="text-slate-900 font-medium">
                  {user?.drivers_license_expiration ? format(new Date(user.drivers_license_expiration), 'MMM d, yyyy') : 'Not set'}
                </p>
              </div>
            </div>

            {user?.certifications && user.certifications.length > 0 ? (
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900">Additional Certifications</h4>
                {user.certifications.map((cert, idx) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-blue-900">{cert.name}</p>
                        <p className="text-sm text-slate-600">Issued by: {cert.issuer}</p>
                        {cert.certificate_number && (
                          <p className="text-xs text-slate-500">Certificate #: {cert.certificate_number}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-600">
                          {cert.expiration_date ? `Expires: ${format(new Date(cert.expiration_date), 'MMM d, yyyy')}` : 'No expiration'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm mb-3">No additional certifications on record</p>
              </div>
            )}

            <div className="pt-4 mt-4 border-t">
              <p className="text-sm text-slate-600 mb-3">
                📋 To view certification expiration status and alerts, visit your admin's <strong>Certification Alerts</strong> page or ask your admin to check the <strong>Admin Certification Alerts</strong> dashboard.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Package className="w-5 h-5 text-slate-600" />
              Assigned Equipment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {assignedEquipment && assignedEquipment.length > 0 ? (
              <div className="space-y-3">
                {assignedEquipment.map((equip) => (
                  <div key={equip.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{equip.product_name || equip.equipment_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                        <p className="text-sm text-slate-600">{equip.equipment_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                        {equip.serial_number && (
                          <p className="text-xs text-slate-500">Serial #: {equip.serial_number}</p>
                        )}
                        {equip.notes && (
                          <p className="text-xs text-slate-500 mt-1">{equip.notes}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge className={
                          equip.condition === 'new' ? 'bg-purple-600' :
                          equip.condition === 'good' ? 'bg-blue-600' :
                          equip.condition === 'fair' ? 'bg-yellow-600' :
                          equip.condition === 'poor' ? 'bg-orange-600' :
                          'bg-red-600'
                        }>
                          {equip.condition ? equip.condition.replace(/\b\w/g, c => c.toUpperCase()) : 'Good'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No equipment currently assigned</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-6 text-center">
              <Award className="w-10 h-10 text-green-600 mx-auto mb-2" />
              <p className="text-4xl font-bold text-green-600">{commendations?.length || 0}</p>
              <p className="text-sm text-slate-600">Commendations</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-100">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-2" />
              <p className="text-4xl font-bold text-red-600">{complaints?.length || 0}</p>
              <p className="text-sm text-slate-600">Complaints</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-violet-100">
            <CardContent className="p-6 text-center">
              <ClipboardCheck className="w-10 h-10 text-purple-600 mx-auto mb-2" />
              <p className="text-4xl font-bold text-purple-600">{performanceReviews?.length || 0}</p>
              <p className="text-sm text-slate-600">Performance Reviews</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Award className="w-5 h-5 text-green-600" />
              Commendations ({commendations?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {commendations && commendations.length > 0 ? (
              <div className="space-y-3">
                  {commendations.map((comm) => (
                    <div key={comm.id} className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-green-600 text-white">
                              {comm.commendation_type.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge variant="outline">
                              <Star className="w-3 h-3 mr-1 text-amber-500 fill-amber-500" />
                              {comm.points_awarded} Point{comm.points_awarded !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-900 font-semibold mb-1">{comm.description}</p>
                          <p className="text-xs text-slate-600">
                            Issued by: {comm.issued_by_name || comm.issued_by} • {format(parseISO(comm.commendation_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No commendations yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Complaints & Investigations ({complaints?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {complaints && complaints.length > 0 ? (
              <div className="space-y-3">
                  {complaints.map((comp) => (
                    <div key={comp.id} className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-red-600 text-white">
                              {comp.complaint_type.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge className={
                              comp.investigation_status === 'not_sustained' || comp.investigation_status === 'unfounded' || comp.investigation_status === 'exonerated' 
                                ? 'bg-green-600' 
                                : comp.investigation_status === 'sustained' 
                                ? 'bg-red-700' 
                                : 'bg-amber-600'
                            }>
                              {comp.investigation_status.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className={
                              comp.severity === 'critical' ? 'border-red-600 text-red-600' :
                              comp.severity === 'serious' ? 'border-orange-600 text-orange-600' :
                              comp.severity === 'moderate' ? 'border-amber-600 text-amber-600' :
                              'border-slate-400 text-slate-600'
                            }>
                              {comp.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-900 mb-1">{comp.description}</p>
                          <p className="text-xs text-slate-600">
                            Filed: {format(parseISO(comp.complaint_date), 'MMM d, yyyy')}
                            {comp.investigation_completed_date && ` • Closed: ${format(parseISO(comp.investigation_completed_date), 'MMM d, yyyy')}`}
                          </p>
                          {comp.investigation_notes && (
                            <div className="mt-2 p-2 bg-white rounded border border-red-100">
                              <p className="text-xs text-slate-700"><strong>Investigation:</strong> {comp.investigation_notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No complaints on record</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ClipboardCheck className="w-5 h-5 text-purple-600" />
              Performance Review History ({performanceReviews?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {performanceReviews && performanceReviews.length > 0 ? (
              <div className="space-y-4">
                  {performanceReviews.map((review) => {
                    const avgRating = [
                      review.punctuality_rating,
                      review.professionalism_rating,
                      review.report_quality_rating,
                      review.teamwork_rating,
                      review.initiative_rating
                    ].filter(r => r != null).reduce((a, b) => a + b, 0) / 5;

                    return (
                      <div key={review.id} className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-lg text-purple-900">
                              {format(parseISO(review.review_date), 'MMMM d, yyyy')}
                            </p>
                            <p className="text-xs text-slate-600">
                              Review Period: {format(parseISO(review.review_period_start), 'MMM d')} - {format(parseISO(review.review_period_end), 'MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-slate-600">Reviewer: {review.reviewer_name || review.reviewer_email}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-5 h-5 ${star <= review.overall_rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                                />
                              ))}
                            </div>
                            <p className="text-xs text-slate-600 mt-1">Overall: {review.overall_rating}/5</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                          <div className="text-center p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-slate-500">Punctuality</p>
                            <p className="text-lg font-bold text-purple-600">{review.punctuality_rating || '-'}/5</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-slate-500">Professional</p>
                            <p className="text-lg font-bold text-purple-600">{review.professionalism_rating || '-'}/5</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-slate-500">Reports</p>
                            <p className="text-lg font-bold text-purple-600">{review.report_quality_rating || '-'}/5</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-slate-500">Teamwork</p>
                            <p className="text-lg font-bold text-purple-600">{review.teamwork_rating || '-'}/5</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-slate-500">Initiative</p>
                            <p className="text-lg font-bold text-purple-600">{review.initiative_rating || '-'}/5</p>
                          </div>
                        </div>

                        {(review.commendations_count > 0 || review.complaints_count > 0) && (
                          <div className="flex gap-3 mb-3">
                            {review.commendations_count > 0 && (
                              <Badge className="bg-green-600 text-white">
                                <Award className="w-3 h-3 mr-1" />
                                {review.commendations_count} Commendation{review.commendations_count !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {review.complaints_count > 0 && (
                              <Badge className="bg-red-600 text-white">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {review.complaints_count} Complaint{review.complaints_count !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        )}

                        {review.strengths && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-green-700 mb-1">Strengths:</p>
                            <p className="text-sm text-slate-700 bg-white p-2 rounded border border-green-100">{review.strengths}</p>
                          </div>
                        )}

                        {review.areas_for_improvement && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-amber-700 mb-1">Areas for Improvement:</p>
                            <p className="text-sm text-slate-700 bg-white p-2 rounded border border-amber-100">{review.areas_for_improvement}</p>
                          </div>
                        )}

                        {review.goals_for_next_period && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-blue-700 mb-1">Goals:</p>
                            <p className="text-sm text-slate-700 bg-white p-2 rounded border border-blue-100">{review.goals_for_next_period}</p>
                          </div>
                        )}

                        {review.reviewer_comments && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-purple-700 mb-1">Reviewer Comments:</p>
                            <p className="text-sm text-slate-700 bg-white p-2 rounded border border-purple-100">{review.reviewer_comments}</p>
                          </div>
                        )}

                        {!review.officer_acknowledged && (
                          <Badge className="bg-amber-600 text-white mt-2">Pending Acknowledgment</Badge>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No performance reviews yet</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-2 border-red-300 shadow-lg bg-white">
          <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50 border-b">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Shield className="w-5 h-5" />
              Account Security
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Danger Zone
              </h3>
              <p className="text-sm text-red-800 mb-3">
                Deleting your account will permanently remove all your data and access. This action cannot be undone.
              </p>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="min-h-[44px]">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete My Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Permanently Delete Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all associated data. You will be logged out immediately. Type <strong>DELETE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="mt-2 min-h-[44px]"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }} className="min-h-[44px]">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE"}
              onClick={handleDeleteAccount}
              className="min-h-[44px]"
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}