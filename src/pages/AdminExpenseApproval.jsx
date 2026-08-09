import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// Expense approvals were consolidated into Accounting → Bills, Expenses & Approvals.
// Keep this legacy route as a redirect so old bookmarks do not land on a duplicate page.
export default function AdminExpenseApproval() {
  return <Navigate to={createPageUrl('AccountingExpenses')} replace />;
}
