import { createClientFromRequest } from 'npm:@base44/sdk';

const categoryMap: Record<string,string> = {
  fuel: 'fuel', equipment: 'equipment', supplies: 'supplies', training: 'professional_services',
  travel: 'other', meals: 'other', parking: 'other', other: 'other'
};

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
      const updated = await base44.asServiceRole.entities.ExpenseReport.update(report.id, {
        status,
        reviewed_by: me.email,
        reviewed_date: new Date().toISOString(),
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
            amount: Number(report.amount || 0),
            site_name: report.location || '',
            reference_number: reference,
            status: 'unpaid',
            due_date: '',
            paid_date: '',
            notes: `Officer: ${report.officer_email || ''}${body.notes ? ` • Review: ${body.notes}` : ''}`,
          });
        }
      }
      return Response.json({ success: true, report: updated, ledger });
    }
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageAccountingExpenses failed', error);
    return Response.json({ error: error?.message || 'Unable to manage expenses' }, { status: 500 });
  }
});
