import { uploadInternalFile } from '@/lib/internalUpload';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Plus, Calendar, FileText, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const MILEAGE_RATE = 0.80;

export default function ExpenseReports() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
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
      const payload = {
        ...data,
        officer_email: user.email,
        officer_name: `${user.first_name} ${user.last_name}`,
        status: 'pending',
        reviewed_by: '',
        reviewed_date: null,
        reviewer_notes: '',
      };
      if (editingExpenseId) {
        const current = expenses.find(item => item.id === editingExpenseId);
        if (!current || current.status !== 'rejected') throw new Error('Only rejected expenses can be edited and resubmitted.');
        return await base44.entities.ExpenseReport.update(editingExpenseId, payload);
      }
      return await base44.entities.ExpenseReport.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myExpenses'] });
      setShowDialog(false);
      setEditingExpenseId(null);
      resetForm();
      alert(editingExpenseId ? 'Expense corrected and resubmitted for approval.' : 'Expense report submitted successfully!');
    },
  });

  const resetForm = () => {
    setEditingExpenseId(null);
    setFormData({
      expense_date: format(new Date(), 'yyyy-MM-dd'),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
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
      const { file_url } = await uploadInternalFile(file);
      setFormData(prev => ({ ...prev, [field]: file_url }));
    } catch (error) {
      alert(`Failed to upload ${label}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleReceiptUpload = (e) => handleFileUpload(e, 'receipt_url', 'receipt');

  const editRejectedExpense = (expense) => {
    if (expense.status !== 'rejected') return;
    setEditingExpenseId(expense.id);
    setFormData({
      expense_date: expense.expense_date || format(new Date(), 'yyyy-MM-dd'),
      linked_call_id: expense.linked_call_id || '',
      linked_call_number: expense.linked_call_number || '',
      linked_call_type: expense.linked_call_type || '',
      linked_call_location: expense.linked_call_location || '',
      category: expense.category || 'travel',
      amount: expense.amount ?? '',
      description: expense.description || '',
      receipt_url: expense.receipt_url || '',
      start_mileage: expense.start_mileage ?? '',
      end_mileage: expense.end_mileage ?? '',
      start_mileage_photo_url: expense.start_mileage_photo_url || '',
      end_mileage_photo_url: expense.end_mileage_photo_url || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...formData, amount: Number(formData.amount), tax_free: true };
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
      const travelMiles = end - start;
      const mileageReimbursement = Number((travelMiles * MILEAGE_RATE).toFixed(2));
      payload.start_mileage = start;
      payload.end_mileage = end;
      payload.travel_miles = travelMiles;
      payload.mileage_rate = MILEAGE_RATE;
      payload.mileage_reimbursement = mileageReimbursement;
      // Mileage reimbursement is calculated by policy and cannot be manually
      // overridden by the officer.
      payload.amount = mileageReimbursement;
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#0b2c27_0,_#07101c_42%,_#050a12_100%)] p-3 text-slate-100 sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#102c2b] via-[#0c1a26] to-[#07101c] p-5 shadow-2xl md:p-7">
          <div className="mobile-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 shadow-lg sm:h-14 sm:w-14">
                <DollarSign className="h-7 w-7 text-emerald-300" />
              </div>
              <div>
                <h1 className="break-words text-2xl font-black tracking-tight text-white sm:text-3xl">Expense Reports</h1>
                <p className="mt-1 break-words text-sm text-slate-400">Submit receipts, track approvals, and manage reimbursements.</p>
              </div>
            </div>
            <Button onClick={() => setShowDialog(true)} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg hover:from-green-700 hover:to-emerald-700 sm:w-auto">
              <Plus className="w-5 h-5 mr-2" />
              New Expense
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border border-amber-700/50 bg-gradient-to-br from-amber-950/55 to-[#0d1725] text-white shadow-xl">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-2 break-words text-3xl font-black sm:text-4xl">${totalPending.toFixed(2)}</p>
                  <p className="text-yellow-100 font-medium">Pending Approval</p>
                </div>
                <Clock className="h-10 w-10 shrink-0 text-white/25 sm:h-12 sm:w-12" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-emerald-700/50 bg-gradient-to-br from-emerald-950/55 to-[#0d1725] text-white shadow-xl">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-2 break-words text-3xl font-black sm:text-4xl">${totalApproved.toFixed(2)}</p>
                  <p className="text-green-100 font-medium">Approved</p>
                </div>
                <DollarSign className="h-10 w-10 shrink-0 text-white/25 sm:h-12 sm:w-12" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-blue-700/50 bg-gradient-to-br from-blue-950/55 to-[#0d1725] text-white shadow-xl">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-2 break-words text-3xl font-black sm:text-4xl">{expenses.length}</p>
                  <p className="text-blue-100 font-medium">Total Submitted</p>
                </div>
                <FileText className="h-10 w-10 shrink-0 text-white/25 sm:h-12 sm:w-12" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
          <CardHeader>
            <CardTitle>My Expense Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-10 text-center">
                <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No expense reports submitted yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((expense) => (
                  <div key={expense.id} className="rounded-xl border border-slate-700 bg-[#101b29] p-4 transition-all hover:border-emerald-600/50 hover:shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">${expense.amount.toFixed(2)}</h3>
                          <p className="text-sm text-slate-400">{expense.category.replace(/_/g, ' ').toUpperCase()}</p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(expense.status)}>
                        {expense.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-slate-300 mb-2">{expense.description}</p>
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
                        <p className="text-sm font-semibold text-slate-300">Reviewer Notes:</p>
                        <p className="text-sm text-slate-400">{expense.reviewer_notes}</p>
                      </div>
                    )}
                    {expense.status === 'rejected' && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-800">Correct the rejected expense and resend it to command for approval.</p>
                        <Button type="button" size="sm" onClick={() => editRejectedExpense(expense)}>Edit & Resubmit</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingExpenseId ? 'Correct & Resubmit Expense Report' : 'Submit Expense Report'}</DialogTitle>
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
              <Label>{formData.category === 'travel' ? 'Mileage Reimbursement ($0.80 per mile)' : 'Amount ($) *'}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.category === 'travel'
                  ? Math.max(0, Number(formData.end_mileage || 0) - Number(formData.start_mileage || 0)) * MILEAGE_RATE
                  : formData.amount}
                onChange={(e) => formData.category !== 'travel' && setFormData({...formData, amount: e.target.value})}
                readOnly={formData.category === 'travel'}
                required
              />
              <p className="text-xs text-emerald-700">Approved officer expenses are tax-free reimbursements and are not added to taxable wages.</p>
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
                  <p className="text-sm font-semibold text-blue-300">Travel distance: {Number(formData.end_mileage) - Number(formData.start_mileage)} miles · Reimbursement: ${((Number(formData.end_mileage) - Number(formData.start_mileage)) * MILEAGE_RATE).toFixed(2)} at $0.80/mile</p>
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
                {editingExpenseId ? 'Resubmit for Approval' : 'Submit Expense'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}