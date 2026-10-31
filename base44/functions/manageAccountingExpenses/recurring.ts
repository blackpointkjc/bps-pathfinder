const money=(n:any)=>Math.round(Number(n||0)*100)/100;
export function nextMonthlyDue(current:string,day:number){
  const [year,month]=current.slice(0,7).split('-').map(Number);
  const next=new Date(Date.UTC(year,month,1));
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(Math.max(1,day),last)).padStart(2,'0')}`;
}
export async function postRecurringBills(entities:any,today:string){
  const templates=await entities.RecurringCompanyBill.list('next_due_date',500);
  const results:any[]=[];
  for(const row of templates||[]){
    if(row.active===false || !row.next_due_date||row.next_due_date>today)continue;
    let next=String(row.next_due_date);
    // Cap backfills so a bad date cannot issue hundreds of invoices in one run.
    let count=0;
    while(next<=today&&count<24){
      const ref=`RECUR-${row.id}-${next}`;
      try{
        const existing=await entities.CompanyExpense.filter({reference_number:ref},'-created_date',2);
        if(!existing?.length)await entities.CompanyExpense.create({
          expense_date:next,due_date:next,paid_date:row.status_on_post==='paid'?next:'',
          vendor:row.vendor,category:row.category,description:row.description,amount:money(row.amount),site_name:row.site_name||'',
          reference_number:ref,status:row.status_on_post==='paid'?'paid':'unpaid',notes:`Monthly recurring bill ${row.id}. ${row.notes||''}`.trim(),
        });
        results.push({vendor:row.vendor,date:next,status:existing?.length?'already_posted':'posted'});
        const following=nextMonthlyDue(next,Number(row.day_of_month)||1);
        await entities.RecurringCompanyBill.update(row.id,{next_due_date:following,last_posted_date:next});
        next=following;
        count++;
      }catch(error:any){results.push({vendor:row.vendor,date:next,status:'failed',error:error?.message||'Unable to post'});break;}
    }
  }
  return {success:results.every(x=>x.status!=='failed'),posted:results.filter(x=>x.status==='posted').length,results};
}
