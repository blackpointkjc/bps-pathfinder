import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BRIDGE_URL = 'https://bpsc.base44.app/api/functions/linkedAppBridge';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { action, entity, entityId, data, query } = body;

        const linkedApp = getLinkedAppClient();

        if (action === 'search') {
            const [incidentReports, trespassingNotices] = await Promise.all([
                linkedApp.entities.IncidentReport.list().catch(() => []),
                linkedApp.entities.TrespassingNotice.list().catch(() => []),
            ]);

            const q = (query || '').toLowerCase();

            const filteredIR = q ? incidentReports.filter(r => {
                return [r.report_number, r.persons_involved, r.victims, r.witnesses,
                        r.suspect_description, r.location, r.description, r.call_number]
                    .some(f => f && String(f).toLowerCase().includes(q));
            }) : incidentReports;

            const filteredTN = q ? trespassingNotices.filter(n => {
                return [n.subject_name, n.subject_id, n.subject_dob, n.location, n.reason]
                    .some(f => f && String(f).toLowerCase().includes(q));
            }) : trespassingNotices;

            return Response.json({ incidentReports: filteredIR, trespassingNotices: filteredTN });
        }

        if (action === 'update') {
            if (!entity || !entityId || !data) return Response.json({ error: 'Missing entity, entityId, or data' }, { status: 400 });
            const result = await linkedApp.entities[entity].update(entityId, data);
            return Response.json({ success: true, result });
        }

        if (action === 'create') {
            if (!entity || !data) return Response.json({ error: 'Missing entity or data' }, { status: 400 });
            const result = await linkedApp.entities[entity].create(data);
            return Response.json({ success: true, result });
        }

        return Response.json({ error: 'Unknown action. Use: search, update, create' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});