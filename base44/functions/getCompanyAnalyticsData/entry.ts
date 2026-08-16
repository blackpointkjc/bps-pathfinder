import { createClientFromRequest } from 'npm:@base44/sdk';

function rolesOf(user: any) {
  return new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const roles = rolesOf(me);
    if (!me || (me.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('accounting'))) {
      return Response.json({ error: 'Company analytics access required' }, { status: me ? 403 : 401 });
    }

    const errors: Record<string, string> = {};
    const list = async (entityName: string, sort?: string) => {
      try {
        const entity = (base44.asServiceRole.entities as any)[entityName];
        if (!entity?.list) throw new Error(`${entityName} service is unavailable`);
        return await entity.list(sort, 3000);
      } catch (error) {
        errors[entityName] = error?.message || 'Unable to read data';
        return [];
      }
    };

    const [users, divisions, timeEntries, schedules, trainingCompletions, trainingModules, incidentReports, callsForService, commendations, complaints] = await Promise.all([
      list('User', '-updated_date'),
      list('Division', 'name'),
      list('TimeEntry', '-clock_in'),
      list('Schedule', '-shift_date'),
      list('TrainingCompletion', '-completed_date'),
      list('TrainingModule', '-created_date'),
      list('IncidentReport', '-incident_date'),
      list('CallForService', '-call_time'),
      list('Commendation', '-commendation_date'),
      list('Complaint', '-complaint_date'),
    ]);

    return Response.json({
      success: true,
      users,
      divisions,
      timeEntries,
      schedules,
      trainingCompletions,
      trainingModules,
      incidentReports,
      callsForService,
      commendations,
      complaints,
      service_errors: errors,
    });
  } catch (error) {
    console.error('getCompanyAnalyticsData failed', error);
    return Response.json({ error: error?.message || 'Unable to load company analytics' }, { status: 500 });
  }
});
