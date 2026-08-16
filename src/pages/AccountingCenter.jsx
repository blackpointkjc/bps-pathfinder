import { DollarSign, FileText, BarChart3 } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import AccountingPayroll from './AccountingPayroll';
import PayrollDates from './PayrollDates';
import AccountingInvoices from './AccountingInvoices';
import AccountingExpenses from './AccountingExpenses';
import AccountingProfit from './AccountingProfit';

const SECTIONS = [
  { id: 'payroll', label: 'Payroll', description: 'Payroll processing and payroll dates', icon: DollarSign },
  { id: 'billing', label: 'Billing & Expenses', description: 'Client invoices, bills, expenses and approvals', icon: FileText },
  { id: 'overview', label: 'Financial Overview', description: 'Company profit and tax liability', icon: BarChart3 },
];

const TOOLS = {
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
    <UnifiedCenter eyebrow="Finance & Accounting" title="Accounting Center" description="One desktop workspace for payroll, billing, expenses, profitability, and tax tracking." sections={SECTIONS} defaultSection="payroll">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
