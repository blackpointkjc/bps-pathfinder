import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const isAdminPreview = user.role === 'admin' || roles.has('full_access');
    const isClient = roles.has('client') || String(user.user_type || '').toLowerCase() === 'client';
    if (!isClient && !isAdminPreview) return Response.json({ error: 'Client access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    let target = user;

    // Admin/full-access preview can request a specific client account.
    if (isAdminPreview && body.client_id) {
      const users = await base44.asServiceRole.entities.User.list();
      const preview = (users || []).find((entry: any) => String(entry.id) === String(body.client_id));
      if (preview) target = preview;
    }

    const assigned = new Set([
      ...(Array.isArray(target.assigned_locations) ? target.assigned_locations : []),
      ...(Array.isArray(target.assigned_sites) ? target.assigned_sites : []),
      ...(target.assigned_location ? [target.assigned_location] : []),
    ].map((value: any) => String(value || '').trim()).filter(Boolean));

    const [entries, locations, invoices, users, schedules] = await Promise.all([
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000),
      base44.asServiceRole.entities.Location.list('site_name', 1000),
      base44.asServiceRole.entities.Invoice.list('-created_date', 1000),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.Schedule.list('-shift_date', 5000),
    ]);

    const siteOf = (value: any) => String(value || '').split(/\s*(?::|\s-\s)\s*/)[0].trim();
    const clientEmail = String(target.email || '').toLowerCase();
    const visibleInvoices = (invoices || []).filter((invoice: any) => String(invoice.client_email || '').toLowerCase() === clientEmail);
    // Keep inactive and previously assigned locations visible when they have client ownership,
    // invoice history, or time-entry history. Inactivation stops future scheduling; it must not
    // erase historical billing or the configured rate from the client portal.
    const assignedSites = new Set([
      ...[...assigned].map(siteOf),
      ...(locations || [])
        .filter((location: any) => String(location.assigned_client_email || '').toLowerCase() === clientEmail)
        .map((location: any) => siteOf(location.site_name)),
      ...visibleInvoices.map((invoice: any) => siteOf(invoice.site_name)),
    ].filter(Boolean));
    const visibleEntries = (entries || []).filter((entry: any) => assignedSites.has(siteOf(entry.location)));
    const entrySites = new Set(visibleEntries.map((entry: any) => siteOf(entry.location)));
    const visibleLocations = (locations || []).filter((location: any) =>
      assignedSites.has(siteOf(location.site_name)) || entrySites.has(siteOf(location.site_name))
    );
    const officerEmails = new Set(visibleEntries.map((entry: any) => String(entry.officer_email || '').toLowerCase()).filter(Boolean));
    const officers = (users || [])
      .filter((entry: any) => officerEmails.has(String(entry.email || '').toLowerCase()))
      .map((entry: any) => ({
        id: entry.id,
        email: entry.email,
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || '',
        unit_number: entry.unit_number || '',
      }));

    return Response.json({
      success: true,
      assigned_locations: [...assignedSites],
      time_entries: visibleEntries,
      locations: visibleLocations,
      officers,
      invoices: visibleInvoices,
      schedules: (schedules || []).filter((shift: any) => assignedSites.has(siteOf(shift.location))),
    });
  } catch (error) {
    console.error('getClientBillingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load client billing data' }, { status: 500 });
  }
});
