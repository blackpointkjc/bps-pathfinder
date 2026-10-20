import { createClientFromRequest } from 'npm:@base44/sdk';

const ALLOWED_ENTITIES = new Set(['Invoice', 'PayrollEntry', 'PayrollConfig', 'W2Form']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (String(user.id) !== '6a72bbee2842d6338cbae513') {
      return Response.json({ error: 'Accounting access required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (body.action === 'update_invoice_payment') {
      const invoiceId=String(body.invoice_id || '');
      if (!invoiceId) return Response.json({error:'Invoice ID required'},{status:400});
      const current=await base44.asServiceRole.entities.Invoice.get(invoiceId).catch(()=>null);
      if (!current) return Response.json({error:'Invoice not found'},{status:404});
      const target=String(body.payment_status || '').toLowerCase();
      if (!['pending','partial','paid','overdue'].includes(target)) return Response.json({error:'Choose pending, partial, paid, or overdue'},{status:400});
      if(String(body.payment_status||'').toLowerCase()==='overdue'&&String(current.due_date||'')>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) return Response.json({error:`Invoice ${current.invoice_number} is not past due; payment due ${current.due_date}. Overdue status and 10% fee are assigned automatically after the due date.`},{status:409});
      if (current.status==='void') return Response.json({error:'Voided invoices cannot be paid'},{status:409});
      if (current.billing_review_required === true) return Response.json({error:'Verify the historical billing rates before recording payment'},{status:409});
      const total=Math.round(Number(current.total_amount || 0)*100)/100;
      if (!(total > 0)) return Response.json({error:'Invoice has no positive billable amount'},{status:400});
      const previousPaid=Math.max(0,Number(current.amount_paid || (current.status==='paid'?total:0)));
      const inputAmount=body.amount_paid===''||body.amount_paid===undefined||body.amount_paid===null ? previousPaid : Number(body.amount_paid);
      const paid=target==='paid' ? total : Math.round(inputAmount*100)/100;
      if (!Number.isFinite(paid) || paid<0 || paid>total) return Response.json({error:'Received payment must be from zero to the invoice total'},{status:400});
      if (paid + 0.005 < previousPaid) return Response.json({error:'Received payments cannot be reduced here. Use an audited refund/adjustment procedure.'},{status:409});
      if (target==='partial' && !(paid>0 && paid<total)) return Response.json({error:'Partial payment must be greater than zero but less than the balance'},{status:400});
      if (['pending','overdue'].includes(target) && paid >= total) return Response.json({error:'A fully paid invoice must be marked Paid'},{status:400});
      const now=new Date().toISOString();
      const paidDate=target==='paid'?String(body.paid_date || now.slice(0,10)):'';
      if (target==='paid' && !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return Response.json({error:'Valid payment date required'},{status:400});
      const updates={status:target,amount_paid:paid,paid_date:paidDate,
        payment_method:String(body.payment_method || current.payment_method || '').slice(0,120),
        payment_reference:String(body.payment_reference || current.payment_reference || '').slice(0,140),
        payment_notes:String(body.notes || current.payment_notes || '').slice(0,1000),
        payment_updated_by:String(user.email || user.id),payment_updated_at:now};
      const record=await base44.asServiceRole.entities.Invoice.update(invoiceId,updates);
      try {await base44.asServiceRole.entities.AuditLog.create({entity_type:'Invoice',entity_id:invoiceId,action:'status_change',actor_id:String(user.id),actor_name:String(user.email||''),before_value:JSON.stringify({status:current.status,amount_paid:previousPaid,paid_date:current.paid_date}),after_value:JSON.stringify(updates),timestamp:now,description:'Accounting invoice payment/status update'});} catch(e:any){console.error('Invoice updated but payment audit could not be saved:',e?.message);}
      return Response.json({success:true,record});
    }
    if (body.action === 'set_billing_contact') {
      const id=String(body.location_id || '');
      const email=String(body.contact_email || '').trim().toLowerCase();
      if (!id) return Response.json({error:'Location is required'},{status:400});
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({error:'Enter a valid client billing email address or leave blank for management fallback'},{status:400});
      const location=await base44.asServiceRole.entities.Location.get(id).catch(()=>null);
      if (!location) return Response.json({error:'Location not found'},{status:404});
      const record=await base44.asServiceRole.entities.Location.update(id,{billing_contact_email:email});
      return Response.json({success:true,record});
    }
    const entity = String(body.entity || '');
    const action = String(body.action || '');
    if (!ALLOWED_ENTITIES.has(entity)) return Response.json({ error: 'Unsupported accounting entity' }, { status: 400 });
    const api = (base44.asServiceRole.entities as any)[entity];
    if (!api) return Response.json({ error: 'Accounting entity unavailable' }, { status: 400 });

    if (action === 'create') {
      const record = await api.create(body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'bulkCreate') {
      const records = await api.bulkCreate(body.data || []);
      return Response.json({ success: true, records });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      const record = await api.update(body.id, body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      await api.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error:any) {
    console.error('manageAccountingRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to update accounting records' }, { status: 500 });
  }
});
