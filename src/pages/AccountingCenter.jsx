import { DollarSign, FileText, BarChart3, LayoutDashboard } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import AccountingPayroll from './AccountingPayroll';
import PayrollDates from './PayrollDates';
import AccountingInvoices from './AccountingInvoices';
import AccountingExpenses from './AccountingExpenses';
import AccountingProfit from './AccountingProfit';
import AccountingOverview from './AccountingOverview';

const SECTIONS = [
  { id: 'dashboard', label: 'Overview', description: 'Financial operations dashboard and priority workload', icon: LayoutDashboard },
  { id: 'payroll', label: 'Payroll', description: 'Payroll processing and payroll dates', icon: DollarSign },
  { id: 'billing', label: 'Billing & Expenses', description: 'Client invoices, bills, expenses and approvals', icon: FileText },
  { id: 'overview', label: 'Financial Overview', description: 'Company revenue, labor, expenses, and profit', icon: BarChart3 },
];

const TOOLS = {
  dashboard: [{ id: 'overview', label: 'Financial Dashboard', component: AccountingOverview }],
  payroll: [
    { id: 'payroll', label: 'Payroll Center', component: AccountingPayroll },
    { id: 'dates', label: 'Payroll Dates', component: PayrollDates },
  ],
  billing: [
    { id: 'invoices', label: 'Client Invoices', component: AccountingInvoices },
    { id: 'expenses', label: 'Bills, Expenses & Approvals', component: AccountingExpenses },
  ],
  overview: [
    { id: 'profit', label: 'Company Profit', component: AccountingProfit },
  ],
};

export default function AccountingCenter() {
  return (
    <UnifiedCenter eyebrow="Finance & Accounting" title="Accounting Center" description="One desktop workspace for payroll, billing, expenses, profitability, and tax tracking." sections={SECTIONS} defaultSection="dashboard">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
