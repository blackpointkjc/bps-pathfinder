import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const LINKED_APP_ID = '69503da793f3e1140bbd4426';
const API_KEY = Deno.env.has('LINKED_APP_API_KEY') ? Deno.env.get('LINKED_APP_API_KEY') : null;
const BASE_URL = `https://app.base44.com/api/apps/${LINKED_APP_ID}/entities`;

async function fetchEntity(entityName, query = '') {
    if (!API_KEY) throw new Error('LINKED_APP_API_KEY is not configured');
    const url = query
        ? `${BASE_URL}/${entityName}?search=${encodeURIComponent(query)}`
        : `${BASE_URL}/${entityName}`;
    const res = await fetch(url, {
        headers: { 'api_key': API_KEY, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || data.items || []);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { query = '', entities = ['IncidentReport', 'Vehicle', 'Person'] } = body;

        const [incidentReports, vehicles, persons] = await Promise.all([
            entities.includes('IncidentReport') ? fetchEntity('IncidentReport', query) : [],
            entities.includes('Vehicle') ? fetchEntity('Vehicle', query) : [],
            entities.includes('Person') ? fetchEntity('Person', query) : [],
        ]);

        return Response.json({ incidentReports, vehicles, persons });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});