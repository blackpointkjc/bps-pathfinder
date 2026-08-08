import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DollarSign, Check, X, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

export default function AdminExpenseApproval() {
  const [viewingExpense, setViewingExpense] = useState(null);
  const [reviewerNotes, setReviewerNotes] = useState("");

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: expenses } = useQuery({
    queryKey: ['allExpenses'],
    queryFn: () => base44.entities.ExpenseReport.list('-created_date'),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('accounting'),
    initialData: [],
  });

  const reviewExpenseMutation = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      return await base44.entities.ExpenseReport.update(id, {
        status,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
        reviewer_notes: notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allExpenses'] });
      setViewingExpense(null);
      setReviewerNotes("");
    },
  });

  const handleReview = (expense, status) => {
    if (window.confirm(`Are you sure you want to ${status} this expense?`)) {
      reviewExpenseMutation.mutate({
        id: expense.id,
        status,
        notes: reviewerNotes
      });
    }
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

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('supervisor') && !user?.additional_roles?.includes('accounting')) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-slate-600 mt-2">Only admins, supervisors, and accounting personnel can access expense approval.</p>
      </div>
    );
  }

  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const approvedExpenses = expenses.filter(e => e.status === 'approved');
  const rejectedExpenses = expenses.filter(e => e.status === 'rejected');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Expense Approval</h1>
              <p className="text-slate-600 mt-1">Review and approve officer expense reports</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pendingExpenses.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedExpenses.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedExpenses.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingExpenses.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">No pending expense reports</p>
                </CardContent>
              </Card>
            ) : (
              pendingExpenses.map((expense) => (
                <Card key={expense.id} className="border-none shadow-lg hover:shadow-xl transition-all">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">{expense.officer_name}</CardTitle>
                        <p className="text-sm text-slate-600">{expense.officer_email}</p>
                      </div>
                      <Badge className={getStatusColor(expense.status)}>
                        {expense.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600">Amount</p>
                        <p className="text-2xl font-bold text-green-600">${expense.amount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Category</p>
                        <p className="font-semibold">{expense.category.replace(/_/g, ' ').toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Date</p>
                        <p className="font-semibold">{format(new Date(expense.expense_date), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Description</p>
                      <p className="text-slate-800">{expense.description}</p>
                    </div>
                    <div className="flex gap-3">
                      {expense.receipt_url && (
                        <Button variant="outline" size="sm" onClick={() => window.open(expense.receipt_url, '_blank')}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Receipt
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-600 text-green-700 hover:bg-green-50"
                        onClick={() => {
                          setViewingExpense(expense);
                          setReviewerNotes("");
                        }}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-600 text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm('Reject this expense? Please add notes explaining why.')) {
                            const notes = prompt('Reason for rejection:');
                            if (notes) {
                              reviewExpenseMutation.mutate({ id: expense.id, status: 'rejected', notes });
                            }
                          }
                        }}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4 mt-4">
            {approvedExpenses.map((expense) => (
              <Card key={expense.id} className="border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{expense.officer_name} - ${expense.amount.toFixed(2)}</p>
                      <p className="text-sm text-slate-600">{expense.category} • {format(new Date(expense.expense_date), 'MMM d, yyyy')}</p>
                    </div>
                    <Badge className="bg-green-600 text-white">APPROVED</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4 mt-4">
            {rejectedExpenses.map((expense) => (
              <Card key={expense.id} className="border-red-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{expense.officer_name} - ${expense.amount.toFixed(2)}</p>
                      <p className="text-sm text-slate-600">{expense.category} • {format(new Date(expense.expense_date), 'MMM d, yyyy')}</p>
                      {expense.reviewer_notes && (
                        <p className="text-sm text-red-600 mt-1">Reason: {expense.reviewer_notes}</p>
                      )}
                    </div>
                    <Badge className="bg-red-600 text-white">REJECTED</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!viewingExpense} onOpenChange={() => setViewingExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Expense</DialogTitle>
          </DialogHeader>
          {viewingExpense && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600">Officer</p>
                <p className="font-semibold">{viewingExpense.officer_name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Amount</p>
                <p className="text-2xl font-bold text-green-600">${viewingExpense.amount.toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any notes about this approval..."
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleReview(viewingExpense, 'approved')}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setViewingExpense(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}