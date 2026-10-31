import {postRecurringBills} from './recurring.ts';
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
    if (String(me.id) !== '6a72bbee2842d6338cbae513') return Response.json({ error: 'Accounting access required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if(action==='create_recurring'){
      const data=body.data||{};
      const amount=Number(data.amount);
      const due=String(data.start_date||'');
      if(!data.vendor||!data.description||!data.category||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(due))return Response.json({error:'Vendor, description, category, positive amount, and first due date are required'},{status:400});
      const day=Number(due.slice(8,10));
      const record=await base44.asServiceRole.entities.RecurringCompanyBill.create({
        vendor:String(data.vendor).trim(),description:String(data.description).trim(),category:data.category,amount:money(amount),
        site_name:String(data.site_name||''),start_date:due,next_due_date:due,day_of_month:day,status_on_post:data.status_on_post==='paid'?'paid':'unpaid',active:true,notes:String(data.notes||''),
      });
      return Response.json({success:true,record});
    }
    if(action==='set_recurring_active'){
      const record=await base44.asServiceRole.entities.RecurringCompanyBill.get(String(body.id||'')).catch(()=>null);
      if(!record)return Response.json({error:'Recurring bill not found'},{status:404});
      const saved=await base44.asServiceRole.entities.RecurringCompanyBill.update(record.id,{active:body.active===true});
      return Response.json({success:true,record:saved});
    }
    if(action==='post_due_recurring'){
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      return Response.json(await postRecurringBills(base44.asServiceRole.entities,today));
    }
    if (action === 'create_company') {
      const data = body.data || {};
      const amount = Number(data.amount);
      if (!data.vendor || !data.description || !data.expense_date || !Number.isFinite(amount) || amount <= 0 || !['paid','unpaid'].includes(String(data.status))) {
        return Response.json({error:'A valid vendor, date, description, positive amount, and paid/unpaid status are required.'},{status:400});
      }
      const record = await base44.asServiceRole.entities.CompanyExpense.create({...data,amount:money(amount),paid_date:data.status==='paid'?(data.paid_date||data.expense_date):''});
      return Response.json({ success: true, record });
    }
    if (action === 'update_company_status') {
      const id=String(body.id || '');
      const current=await base44.asServiceRole.entities.CompanyExpense.get(id).catch(()=>null);
      if(!current) return Response.json({error:'Bill not found'},{status:404});
      if(['OFFICER-EXP-','PAYROLL-'].some(prefix=>String(current.reference_number||'').startsWith(prefix))) return Response.json({error:'Payroll-linked reimbursements and wages must be updated in the payroll workflow.'},{status:409});
      const status=String(body.status || '').toLowerCase();
      if(!['paid','unpaid'].includes(status)) return Response.json({error:'Select Paid or Unpaid'},{status:400});
      const paidDate=String(body.paid_date || new Date().toISOString().slice(0,10));
      if(status==='paid'&&!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return Response.json({error:'A valid paid date is required'},{status:400});
      const record=await base44.asServiceRole.entities.CompanyExpense.update(id,{status,paid_date:status==='paid'?paidDate:'',notes:`${String(current.notes||'').trim()}\n${status==='paid'?'Marked paid':'Marked unpaid'} by ${me.email} on ${new Date().toISOString()}${body.reference?` · ${String(body.reference).slice(0,140)}`:''}`.trim()});
      try{await base44.asServiceRole.entities.AuditLog.create({entity_type:'CompanyExpense',entity_id:id,action:'status_change',actor_id:String(me.id),actor_name:String(me.email||''),before_value:JSON.stringify({status:current.status,paid_date:current.paid_date}),after_value:JSON.stringify({status,paid_date:record.paid_date}),timestamp:new Date().toISOString(),description:'Company bills / expenses payment status changed'});}catch(error:any){console.error('Bill status saved; audit write failed',error?.message);}
      return Response.json({success:true,record});
    }
    if (action === 'delete_company') {
      const existing = await base44.asServiceRole.entities.CompanyExpense.get(String(body.id || '')).catch(()=>null);
      if (!existing) return Response.json({error:'Expense not found'},{status:404});
      if (['OFFICER-EXP-','PAYROLL-'].some(prefix=>String(existing.reference_number||'').startsWith(prefix))) return Response.json({error:'Approved officer reimbursements and payroll expense records cannot be deleted from the company ledger.'},{status:409});
      await base44.asServiceRole.entities.CompanyExpense.delete(body.id);
      return Response.json({ success: true });
    }
    if (action === 'approve_report' || action === 'reject_report') {
      const report = await base44.asServiceRole.entities.ExpenseReport.get(String(body.id || '')).catch(()=>null);
      if (!report) return Response.json({ error: 'Expense report not found' }, { status: 404 });
      const alreadyApproved=action==='approve_report' && String(report.status || '').toLowerCase()==='approved';
      if (String(report.status || '').toLowerCase() !== 'pending' && !alreadyApproved) return Response.json({error:'This expense has already been reviewed. Refresh the approval queue.'},{status:409});
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
      const updated = alreadyApproved ? report : await base44.asServiceRole.entities.ExpenseReport.update(report.id, {
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
              total_payment_due: money(gross + reimbursementTotal - Number(payrollEntry.federal_tax || 0) - Number(payrollEntry.state_tax || 0) - Number(payrollEntry.social_security || 0) - Number(payrollEntry.medicare || 0) - Number(payrollEntry.other_deductions || 0)),
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
  } catch (error:any) {
    console.error('manageAccountingExpenses failed', error);
    return Response.json({ error: error?.message || 'Unable to manage expenses' }, { status: 500 });
  }
});
