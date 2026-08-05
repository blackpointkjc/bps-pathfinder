import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { officer_email } = await req.json();

    if (!officer_email) {
      return Response.json({ error: 'officer_email is required' }, { status: 400 });
    }

    // Get the officer
    const users = await base44.asServiceRole.entities.User.list();
    const officer = users.find(u => u.email === officer_email);

    if (!officer) {
      return Response.json({ error: 'Officer not found' }, { status: 404 });
    }

    // Get all approved PTO requests to identify PTO weeks
    const allRequests = await base44.asServiceRole.entities.TimeOffRequest.list();
    const approvedPaidRequests = allRequests.filter(r => 
      r.created_by === officer_email && 
      r.status === 'approved' && 
      r.request_type === 'paid'
    );

    // Build list of date ranges where officer was on PTO
    const ptoDateRanges = approvedPaidRequests.map(req => ({
      start: new Date(req.start_date),
      end: new Date(req.end_date)
    }));

    // Get all completed time entries
    const allEntries = await base44.asServiceRole.entities.TimeEntry.list();
    const officerEntries = allEntries.filter(e => 
      e.officer_email === officer_email && 
      e.clock_out
    );

    // Calculate total hours worked, excluding hours during PTO weeks
    let totalHoursWorked = 0;
    
    for (const entry of officerEntries) {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      
      // Check if this shift falls during a PTO week
      const isDuringPTO = ptoDateRanges.some(range => 
        clockIn >= range.start && clockIn <= range.end
      );
      
      // Only count hours if NOT during PTO
      if (!isDuringPTO) {
        const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
        totalHoursWorked += hoursWorked;
      }
    }

    // Calculate PTO accrued from work hours
    // Rate: 40 hours PTO for 2040 hours worked (40 hrs/week * 51 weeks)
    const accrualRate = 40 / 2040; // 0.0196 hours PTO per hour worked
    let ptoAccruedFromWork = totalHoursWorked * accrualRate;

    // Add one-time sick leave conversion on 1/3/25 (separate from the 40 hours)
    let sickLeaveBonus = 0;
    const conversionDate = new Date('2025-01-03');
    const today = new Date();
    
    if (today >= conversionDate && !officer.sick_leave_converted) {
      sickLeaveBonus = 15;
      await base44.asServiceRole.entities.User.update(officer.id, {
        sick_leave_converted: true
      });
    } else if (officer.sick_leave_converted) {
      sickLeaveBonus = 15;
    }

    // Total accrued = work PTO + sick leave bonus
    const totalPtoAccrued = ptoAccruedFromWork + sickLeaveBonus;

    // Calculate used PTO
    const ptoUsed = approvedPaidRequests.reduce((sum, req) => sum + (req.hours_requested || 0), 0);

    // Calculate balance with 40-hour carryover cap
    let ptoBalance = Math.max(0, totalPtoAccrued - ptoUsed);
    
    // Cap balance at 40 hours maximum (use it or lose it)
    ptoBalance = Math.min(ptoBalance, 40);

    // Update officer PTO fields
    await base44.asServiceRole.entities.User.update(officer.id, {
      pto_year_to_date_accrued: totalPtoAccrued,
      pto_year_to_date_used: ptoUsed,
      pto_balance_hours: ptoBalance
    });

    return Response.json({ 
      success: true,
      officer_email,
      total_hours_worked: totalHoursWorked,
      accrual_rate: accrualRate,
      pto_from_work: ptoAccruedFromWork,
      sick_leave_bonus: sickLeaveBonus,
      total_pto_accrued: totalPtoAccrued,
      pto_used: ptoUsed,
      pto_balance: ptoBalance
    });

  } catch (error) {
    console.error('PTO calculation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});