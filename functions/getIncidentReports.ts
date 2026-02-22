import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BRIDGE_URL = 'https://bpsc.base44.app/api/functions/linkedAppBridge';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Fetch all incident reports from linked app
        const res = await fetch(BRIDGE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': Deno.env.get('LINKED_APP_API_KEY')
            },
            body: JSON.stringify({ 
                action: 'search',
                entity: 'IncidentReport',
                filters: {}
            })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to fetch reports');

        return Response.json({ 
            success: true, 
            reports: result.results || [] 
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});