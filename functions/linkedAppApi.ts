import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const LINKED_APP_ID = '69503da793f3e1140bbd4426';
const API_KEY = Deno.env.get('LINKED_APP_API_KEY');
const BASE_URL = `https://app.base44.com/api/apps/${LINKED_APP_ID}/entities`;

async function apiGet(entity, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/${entity}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
        headers: { 'api_key': API_KEY, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`GET ${entity} failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || data.items || [data]).filter(Boolean);
}

async function apiPut(entity, entityId, body) {
    const res = await fetch(`${BASE_URL}/${entity}/${entityId}`, {
        method: 'PUT',
        headers: { 'api_key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`PUT ${entity}/${entityId} failed: ${res.status} ${await res.text()}`);
    return await res.json();
}

async function apiPost(entity, body) {
    const res = await fetch(`${BASE_URL}/${entity}`, {
        method: 'POST',
        headers: { 'api_key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${entity} failed: ${res.status} ${await res.text()}`);
    return await res.json();
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { action, entity, entityId, data, query } = body;

        if (action === 'search') {
            // Search IncidentReport and TrespassingNotice by query string
            const [incidentReports, trespassingNotices] = await Promise.all([
                apiGet('IncidentReport').catch(() => []),
                apiGet('TrespassingNotice').catch(() => []),
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
            const result = await apiPut(entity, entityId, data);
            return Response.json({ success: true, result });
        }

        if (action === 'create') {
            if (!entity || !data) return Response.json({ error: 'Missing entity or data' }, { status: 400 });
            const result = await apiPost(entity, data);
            return Response.json({ success: true, result });
        }

        return Response.json({ error: 'Unknown action. Use: search, update, create' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});