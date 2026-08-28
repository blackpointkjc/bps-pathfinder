import { createClientFromRequest } from 'npm:@base44/sdk';

const categoryMap: Record<string,string> = {
  fuel: 'fuel', equipment: 'equipment', supplies: 'supplies', training: 'professional_services',
  travel: 'other', meals: 'other', parking: 'other', other: 'other'
};
const MILEAGE_RATE = 0.80;
const money = (value: unknown) => Number(Number(value || 0).toFixed(2));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (me.role !== 'admin' && !roles.has('accounting') && !roles.has('full_access')) return Response.json({ error: 'Accounting access required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'create_company') {
      const record = await base44.asServiceRole.entities.CompanyExpense.create(body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'delete_company') {
      await base44.asServiceRole.entities.CompanyExpense.delete(body.id);
      return Response.json({ success: true });
    }
    if (action === 'approve_report' || action === 'reject_report') {
      const reports = await base44.asServiceRole.entities.ExpenseReport.filter({ id: body.id });
      const report = reports?.[0];
      if (!report) return Response.json({ error: 'Expense report not found' }, { status: 404 });
      const status = action === 'approve_report' ? 'approved' : 'rejected';
      const now = new Date().toISOString();
      // Travel reimbursement is policy-driven: ending odometer minus starting
      // odometer, reimbursed at exactly $0.80/mile. Recalculate on approval so a
      // client-side amount can never override the approved reimbursement.
      const travelMiles = String(report.category || '').toLowerCase() === 'travel'
        ? Math.max(0, Number(report.end_mileage || 0) - Number(report.start_mileage || 0))
        : 0;
      const approvedAmount = String(report.category || '').toLowerCase() === 'travel'
        ? money(travelMiles * MILEAGE_RATE)
        : money(report.amount);
      let payrollPeriod: any = null;
      let payrollEntry: any = null;
      if (status === 'approved') {
        const periods = await base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 500);
        payrollPeriod = (periods || []).find((period: any) =>
          report.expense_date && period.start_date <= report.expense_date && period.end_date >= report.expense_date
        ) || null;
      }
      const updated = await base44.asServiceRole.entities.ExpenseReport.update(report.id, {
        status,
        amount: approvedAmount,
        tax_free: true,
        ...(String(report.category || '').toLowerCase() === 'travel' ? {
          travel_miles: travelMiles,
          mileage_rate: MILEAGE_RATE,
          mileage_reimbursement: approvedAmount,
        } : {}),
        payroll_period_id: status === 'approved' ? (payrollPeriod?.id || '') : (report.payroll_period_id || ''),
        reviewed_by: me.email,
        reviewed_date: now,
        reviewer_notes: String(body.notes || ''),
      });
      let ledger = null;
      if (status === 'approved') {
        const reference = `OFFICER-EXP-${report.id}`;
        const existing = await base44.asServiceRole.entities.CompanyExpense.filter({ reference_number: reference });
        if (!existing?.length) {
          ledger = await base44.asServiceRole.entities.CompanyExpense.create({
            expense_date: report.expense_date,
            vendor: report.officer_name || report.officer_email || 'Officer reimbursement',
            category: categoryMap[String(report.category || '').toLowerCase()] || 'other',
            description: `Approved officer expense: ${report.description || ''}`,
            amount: approvedAmount,
            site_name: report.location || '',
            reference_number: reference,
            status: 'unpaid',
            due_date: '',
            paid_date: '',
            notes: `Tax-free officer reimbursement. Officer: ${report.officer_email || ''}${body.notes ? ` • Review: ${body.notes}` : ''}`,
          });
        }

        // If payroll for the expense date already exists, attach the reimbursement
        // immediately. Keep it outside gross wages/taxable pay. If the period has
        // not generated yet, payroll_period_id queues it for generateScheduledPayroll.
        if (payrollPeriod && report.officer_email) {
          const rows = await base44.asServiceRole.entities.PayrollEntry.filter({
            officer_email: String(report.officer_email).toLowerCase(),
            pay_period_start: payrollPeriod.start_date,
            pay_period_end: payrollPeriod.end_date,
          }, '-created_date', 5).catch(() => []);
          payrollEntry = rows?.[0] || null;
          if (payrollEntry) {
            let details: any[] = [];
            try { details = JSON.parse(payrollEntry.expense_reimbursement_detail || '[]'); } catch { details = []; }
            details = Array.isArray(details) ? details.filter(item => String(item.expense_id) !== String(report.id)) : [];
            details.push({
              expense_id: report.id,
              expense_date: report.expense_date,
              category: report.category,
              amount: approvedAmount,
              description: report.description || '',
              tax_free: true,
            });
            const reimbursementTotal = money(details.reduce((sum, item) => sum + Number(item.amount || 0), 0));
            const gross = money(payrollEntry.gross_pay || 0);
            payrollEntry = await base44.asServiceRole.entities.PayrollEntry.update(payrollEntry.id, {
              tax_free_reimbursements: reimbursementTotal,
              expense_reimbursement_detail: JSON.stringify(details),
              total_payment_due: money(gross + reimbursementTotal),
              net_pay: money(gross + reimbursementTotal - Number(payrollEntry.federal_tax || 0) - Number(payrollEntry.state_tax || 0) - Number(payrollEntry.social_security || 0) - Number(payrollEntry.medicare || 0) - Number(payrollEntry.other_deductions || 0)),
              notes: `${payrollEntry.notes || ''} Tax-free expense reimbursement attached from ${report.expense_date}.`.trim(),
            });
            await base44.asServiceRole.entities.ExpenseReport.update(report.id, {
              payroll_entry_id: payrollEntry.id,
              payroll_attached_at: now,
            });
          }
        }
      }
      return Response.json({ success: true, report: updated, ledger, payroll_period: payrollPeriod, payroll_entry: payrollEntry });
    }
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageAccountingExpenses failed', error);
    return Response.json({ error: error?.message || 'Unable to manage expenses' }, { status: 500 });
  }
});
