import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Plus, Upload, Calendar, FileText, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function ExpenseReports() {
  const [showDialog, setShowDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    category: "travel",
    amount: "",
    description: "",
    receipt_url: "",
    start_mileage: "",
    end_mileage: "",
    start_mileage_photo_url: "",
    end_mileage_photo_url: ""
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: expenses } = useQuery({
    queryKey: ['myExpenses', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.ExpenseReport.filter({ officer_email: user.email }, '-expense_date');
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const submitExpenseMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ExpenseReport.create({
        ...data,
        officer_email: user.email,
        officer_name: `${user.first_name} ${user.last_name}`,
        status: 'pending'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myExpenses'] });
      setShowDialog(false);
      resetForm();
      alert('Expense report submitted successfully!');
    },
  });

  const resetForm = () => {
    setFormData({
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      category: "travel",
      amount: "",
      description: "",
      receipt_url: "",
      start_mileage: "",
      end_mileage: "",
      start_mileage_photo_url: "",
      end_mileage_photo_url: ""
    });
  };

  const handleFileUpload = async (e, field, label) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, [field]: file_url }));
    } catch (error) {
      alert(`Failed to upload ${label}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleReceiptUpload = (e) => handleFileUpload(e, 'receipt_url', 'receipt');

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...formData, amount: Number(formData.amount) };
    if (formData.category === 'travel') {
      const start = Number(formData.start_mileage);
      const end = Number(formData.end_mileage);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        alert('Enter valid starting and ending mileage. Ending mileage cannot be less than starting mileage.');
        return;
      }
      if (!formData.start_mileage_photo_url || !formData.end_mileage_photo_url) {
        alert('Travel expenses require photos of both the starting and ending odometer readings.');
        return;
      }
      payload.start_mileage = start;
      payload.end_mileage = end;
      payload.travel_miles = end - start;
    } else {
      delete payload.start_mileage;
      delete payload.end_mileage;
      delete payload.travel_miles;
      delete payload.start_mileage_photo_url;
      delete payload.end_mileage_photo_url;
    }
    submitExpenseMutation.mutate(payload);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'reimbursed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const approvedExpenses = expenses.filter(e => e.status === 'approved');
  const reimbursedExpenses = expenses.filter(e => e.status === 'reimbursed');
  const totalPending = pendingExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalApproved = approvedExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Expense Reports</h1>
                <p className="text-slate-600 mt-1">Submit and track your expense reimbursements</p>
              </div>
            </div>
            <Button onClick={() => setShowDialog(true)} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg">
              <Plus className="w-5 h-5 mr-2" />
              New Expense
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-none shadow-xl bg-gradient-to-br from-yellow-400 to-orange-500 text-white">
            <CardContent className="p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-5xl font-bold mb-2">${totalPending.toFixed(2)}</p>
                  <p className="text-yellow-100 font-medium">Pending Approval</p>
                </div>
                <Clock className="w-16 h-16 text-white/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-gradient-to-br from-green-400 to-emerald-600 text-white">
            <CardContent className="p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-5xl font-bold mb-2">${totalApproved.toFixed(2)}</p>
                  <p className="text-green-100 font-medium">Approved</p>
                </div>
                <DollarSign className="w-16 h-16 text-white/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-gradient-to-br from-blue-400 to-indigo-600 text-white">
            <CardContent className="p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-5xl font-bold mb-2">{expenses.length}</p>
                  <p className="text-blue-100 font-medium">Total Submitted</p>
                </div>
                <FileText className="w-16 h-16 text-white/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>My Expense Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No expense reports submitted yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((expense) => (
                  <div key={expense.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">${expense.amount.toFixed(2)}</h3>
                          <p className="text-sm text-slate-600">{expense.category.replace(/_/g, ' ').toUpperCase()}</p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(expense.status)}>
                        {expense.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-slate-700 mb-2">{expense.description}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(expense.expense_date), 'MMM d, yyyy')}
                      </div>
                      {expense.receipt_url && (
                        <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          View Receipt
                        </a>
                      )}
                    </div>
                    {expense.reviewer_notes && (
                      <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm font-semibold text-slate-700">Reviewer Notes:</p>
                        <p className="text-sm text-slate-600">{expense.reviewer_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submit Expense Report</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expense Date *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="meals">Meals</SelectItem>
                    <SelectItem value="fuel">Fuel</SelectItem>
                    <SelectItem value="parking">Parking</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="supplies">Supplies</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                required
              />
            </div>

            {formData.category === 'travel' && (
              <div className="rounded-lg border border-blue-700 bg-blue-950/20 p-4 space-y-4">
                <div>
                  <p className="font-semibold text-slate-100">Travel Mileage Verification</p>
                  <p className="text-xs text-slate-400">Starting and ending odometer readings and both photos are required.</p>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Starting Mileage *</Label>
                    <Input type="number" min="0" step="1" value={formData.start_mileage} onChange={(e) => setFormData({...formData, start_mileage:e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Ending Mileage *</Label>
                    <Input type="number" min="0" step="1" value={formData.end_mileage} onChange={(e) => setFormData({...formData, end_mileage:e.target.value})} required />
                  </div>
                </div>
                {formData.start_mileage !== '' && formData.end_mileage !== '' && Number(formData.end_mileage) >= Number(formData.start_mileage) && (
                  <p className="text-sm font-semibold text-blue-300">Travel distance: {Number(formData.end_mileage) - Number(formData.start_mileage)} miles</p>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Starting Odometer Photo *</Label><Input type="file" accept="image/*" capture="environment" onChange={(e)=>handleFileUpload(e,'start_mileage_photo_url','starting odometer photo')} disabled={uploading}/>{formData.start_mileage_photo_url && <Badge className="bg-emerald-700">Start Photo Uploaded</Badge>}</div>
                  <div className="space-y-2"><Label>Ending Odometer Photo *</Label><Input type="file" accept="image/*" capture="environment" onChange={(e)=>handleFileUpload(e,'end_mileage_photo_url','ending odometer photo')} disabled={uploading}/>{formData.end_mileage_photo_url && <Badge className="bg-emerald-700">End Photo Uploaded</Badge>}</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Receipt Upload</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleReceiptUpload}
                  disabled={uploading}
                />
                {formData.receipt_url && <Badge className="bg-green-600">Uploaded</Badge>}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitExpenseMutation.isPending || uploading}>
                Submit Expense
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}