import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { officer_email } = await req.json();

    if (!officer_email) {
      return Response.json({ error: 'officer_email is required' }, { status: 400 });
    }

    // Authenticate caller and enforce authorization: admins may calculate PTO for
    // any officer; non-admins may only calculate for their own account.
    let caller;
    try {
      caller = await base44.auth.me();
    } catch (_e) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!caller) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    const isAdmin = caller.role === 'admin';
    if (!isAdmin && caller.email !== officer_email) {
      return Response.json({ error: 'Not authorized to calculate PTO for this officer' }, { status: 403 });
    }

    // Get the officer
    const users = await base44.asServiceRole.entities.User.list();
    const officer = users.find(u => u.email === officer_email);

    if (!officer) {
      return Response.json({ error: 'Officer not found' }, { status: 404 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const normalizedRank = String(officer.rank || '').trim().toLowerCase();
    const annualEntitlement = normalizedRank === 'colonel' || normalizedRank === 'lt colonel' || normalizedRank === 'lieutenant colonel' ? 180 : 40;

    // PTO is a calendar-year accrual. Bonus/grant records are tracked separately
    // from leave usage so an HR award adds to available PTO instead of being counted
    // as PTO that the officer used.
    const allRequests = await base44.asServiceRole.entities.TimeOffRequest.list();
    const isBonusRecord = (r: any) => /^PTO Bonus\b|^Admin PTO Grant\b/i.test(String(r.admin_notes || ''));
    const ownedCurrentYear = allRequests.filter(r => {
      const requestOwner = String(r.created_by || r.requested_by_email || '').trim().toLowerCase();
      const requestDate = new Date(r.start_date || r.created_date || 0);
      return requestOwner === String(officer_email).trim().toLowerCase() &&
        r.status === 'approved' &&
        r.request_type === 'paid' &&
        requestDate.getFullYear() === currentYear;
    });
    const approvedPaidRequests = ownedCurrentYear.filter(r => !isBonusRecord(r));
    const bonusRecords = ownedCurrentYear.filter(isBonusRecord);
    const bonusHours = bonusRecords.reduce((sum, req) => sum + Number(req.hours_requested || 0), 0);

    // Build list of date ranges where officer was actually on paid leave.
    const ptoDateRanges = approvedPaidRequests.map(req => ({
      start: new Date(req.start_date),
      end: new Date(req.end_date)
    }));

    // Get completed time entries from this calendar year only.
    const allEntries = await base44.asServiceRole.entities.TimeEntry.list();
    const officerEntries = allEntries.filter(e => {
      const clockIn = new Date(e.clock_in || 0);
      return String(e.officer_email || '').trim().toLowerCase() === String(officer_email).trim().toLowerCase() &&
        Boolean(e.clock_out) &&
        clockIn.getFullYear() === currentYear;
    });

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

    // Accrual is proportional to hours worked against a 2,040-hour work year.
    // Colonel/Lt Colonel accrue up to 180 hours/year; every other rank accrues
    // up to 40 hours/year.
    const accrualRate = annualEntitlement / 2040;
    const ptoAccruedFromWork = Math.min(annualEntitlement, totalHoursWorked * accrualRate);

    // Historical sick-leave conversion is preserved as a legacy credit, but the
    // calendar-year PTO total may never exceed the rank entitlement.
    let sickLeaveBonus = 0;
    const conversionDate = new Date('2025-01-03');
    if (now >= conversionDate && !officer.sick_leave_converted) {
      sickLeaveBonus = 15;
      await base44.asServiceRole.entities.User.update(officer.id, { sick_leave_converted: true });
    } else if (officer.sick_leave_converted) {
      sickLeaveBonus = 15;
    }

    const totalPtoAccrued = Math.min(annualEntitlement, ptoAccruedFromWork + sickLeaveBonus);

    // Calculate used PTO
    const ptoUsed = approvedPaidRequests.reduce((sum, req) => sum + (req.hours_requested || 0), 0);

    // Earned PTO is capped by rank entitlement; approved HR bonus/grant hours sit
    // on top of that entitlement and persist through future recalculations.
    const earnedAvailable = Math.max(0, Math.min(totalPtoAccrued, annualEntitlement));
    const ptoBalance = Math.max(0, earnedAvailable + bonusHours - ptoUsed);

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
      annual_entitlement: annualEntitlement,
      current_year: currentYear,
      bonus_hours: bonusHours,
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