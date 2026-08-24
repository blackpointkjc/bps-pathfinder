import { uploadInternalFile } from '@/lib/internalUpload';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trash2, Shield, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDirectoryLocations } from '@/lib/appDirectory';

export default function AdminDocuments() {
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other",
    locations: [],
    file: null,
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: documents } = useQuery({
    queryKey: ['trainingDocuments'],
    queryFn: () => base44.entities.TrainingDocument.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'adminDocuments'],
    queryFn: () => listDirectoryLocations('site_name', 1000),
    enabled: user?.role === 'admin',
    initialData: [],
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id) => base44.entities.TrainingDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingDocuments'] });
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.file) {
      alert('Please select a file');
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await uploadInternalFile(formData.file);

      await base44.entities.TrainingDocument.create({
        title: formData.title,
        description: formData.description,
        file_url: file_url,
        file_name: formData.file.name,
        category: formData.category,
        locations: formData.locations.length > 0 ? formData.locations : null,
        uploaded_date: new Date().toISOString(),
        uploaded_by: user?.email,
      });

      queryClient.invalidateQueries({ queryKey: ['trainingDocuments'] });
      setShowForm(false);
      setFormData({
        title: "",
        description: "",
        category: "other",
        locations: [],
        file: null,
      });
      alert('✅ Document uploaded successfully!');
    } catch (error) {
      alert('❌ Failed to upload document: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Training Documents</h1>
              <p className="text-slate-600">Manage site-specific training materials and documents</p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </div>

        {showForm && (
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
              <CardTitle>Upload New Document</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Document Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g., Emergency Procedures - Chippenham Place"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Brief description of the document..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})} required>
                    <SelectTrigger id="category" className="h-11 w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="site_procedures">Site Procedures</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="policies">Policies</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Applicable Locations (leave empty for all)</Label>
                  <div className="p-4 bg-slate-50 rounded-lg border max-h-48 overflow-y-auto space-y-2">
                    {locations?.map((loc) => (
                      <div key={loc.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`loc-${loc.id}`}
                          checked={formData.locations.includes(loc.site_name)}
                          onCheckedChange={(checked) => {
                            const newLocs = checked
                              ? [...formData.locations, loc.site_name]
                              : formData.locations.filter(l => l !== loc.site_name);
                            setFormData({...formData, locations: newLocs});
                          }}
                        />
                        <Label htmlFor={`loc-${loc.id}`} className="cursor-pointer text-sm">
                          {loc.site_name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">Upload File *</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={(e) => setFormData({...formData, file: e.target.files[0]})}
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Accepted formats: PDF, Word, PowerPoint, Excel, Images
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading} className="bg-blue-600 hover:bg-blue-700">
                    {uploading ? 'Uploading...' : 'Upload Document'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>All Documents ({documents?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {documents?.map((doc) => (
                <div key={doc.id} className="p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-slate-900">{doc.title}</h3>
                        <Badge variant="outline">{doc.category.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{doc.description}</p>
                      {doc.locations && doc.locations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {doc.locations.map((loc, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {loc}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-500">
                        Uploaded: {format(new Date(doc.created_date), 'MMM d, yyyy')} • {doc.file_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => window.open(doc.file_url, '_blank')}
                        variant="outline"
                        size="sm"
                      >
                        View
                      </Button>
                      <Button
                        onClick={async () => {
                          if (await confirmInApp('Delete this document?')) {
                            deleteDocMutation.mutate(doc.id);
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {documents?.length === 0 && (
                <p className="text-center text-slate-500 py-8">No documents uploaded yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}